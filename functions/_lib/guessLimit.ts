// The wrong-guess lockout for share-link codes. A code is two plain words (≈ 22 bits, words.ts): short
// enough to say, so the defence is not its size but how few WRONG tries an address gets. Every door that
// reads a code asks `lockedOut` first (an address with 12 misses this hour is refused before any lookup),
// and answers a miss through `lookupMiss`, which counts it. The per-minute rate limit still bounds the
// flood; this bounds the patient guesser the minute limit cannot see.
//
// The address is kept only as a salted hash, in a counter that is deleted after two hours (migration
// 0007): the table never holds a person. It fails OPEN — if the counter cannot be read, the page works —
// because a parent opening an invitation must never be locked out by our own bookkeeping.
import type { Env } from './env'
import { notFound } from './json'
import { nowSec, sha256Hex } from './ids'
import { clientIp } from './rateLimit'

export const MAX_MISSES_PER_HOUR = 12
const HOUR = 3600

async function who(env: Env, request: Request): Promise<string> {
  return sha256Hex(`${clientIp(request)}|${env.SESSION_SECRET ?? ''}`)
}

export async function lockedOut(env: Env, request: Request): Promise<boolean> {
  try {
    const row = await env.DB.prepare('SELECT n FROM code_misses WHERE ip_hash = ? AND bucket = ?')
      .bind(await who(env, request), Math.floor(nowSec() / HOUR))
      .first<{ n: number }>()
    return (row?.n ?? 0) >= MAX_MISSES_PER_HOUR
  } catch {
    return false
  }
}

export async function recordMiss(env: Env, request: Request): Promise<void> {
  try {
    const bucket = Math.floor(nowSec() / HOUR)
    await env.DB.batch([
      env.DB.prepare('INSERT INTO code_misses (ip_hash, bucket, n) VALUES (?, ?, 1) ON CONFLICT(ip_hash, bucket) DO UPDATE SET n = n + 1').bind(await who(env, request), bucket),
      env.DB.prepare('DELETE FROM code_misses WHERE bucket < ?').bind(bucket - 1),
    ])
  } catch {
    /* fail open: the bookkeeping must never break the page */
  }
}

// THE way a handler answers « no such code »: count the miss, then 404.
export async function lookupMiss(env: Env, request: Request, message = 'Ce lien ne mène nulle part.'): Promise<Response> {
  await recordMiss(env, request)
  return notFound(message)
}
