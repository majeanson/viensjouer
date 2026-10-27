// Auth: one credential kind — the parent's session cookie (`vj_session`), HMAC-SHA-256,
// base64url(payload).base64url(sig), payload { e: email, v: sessionVersion, x: exp }.
// `v` is the parents row's session_version at mint time; a bumped version ends every
// other device's session without a sessions table. Plus the double-submit CSRF cookie
// (`vj_csrf`, NOT HttpOnly) the SPA echoes as `X-CSRF-Token`.
//
// A reply link is NOT a credential of this kind: it is a 32-char capability whose hash
// sits on the invitations row (functions/api/r/*), scoped to one card and one family.

import type { Env } from './env'
import { nowSec } from './ids'
import { timingSafeBytes } from './password'

const SESSION_COOKIE = 'vj_session'
const CSRF_COOKIE = 'vj_csrf'
const SESSION_TTL = 60 * 60 * 24 * 60 // 60 days — a parent hosts twice a month

class SessionSecretMisconfiguredError extends Error {}

// TextEncoder().encode(undefined) yields the bytes of "undefined" — a known HMAC key.
function requireSessionSecret(env: Env): string {
  const s = env.SESSION_SECRET
  if (!s || s.length < 32) throw new SessionSecretMisconfiguredError('SESSION_SECRET missing or < 32 chars')
  return s
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

async function signToken(env: Env, payload: object): Promise<string> {
  const secret = requireSessionSecret(env)
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${b64urlEncode(await hmac(secret, body))}`
}

// A malformed token resolves to null, never throws: this runs on the dispatch path.
async function verifyToken<T>(env: Env, token: string | null): Promise<T | null> {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const expected = await hmac(requireSessionSecret(env), body)
    if (!timingSafeBytes(b64urlDecode(sig), expected)) return null
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as { x?: number }
    if (typeof payload.x === 'number' && payload.x < nowSec()) return null
    return payload as T
  } catch {
    return null
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

// THE door for signing a parent in: reads the row's live session_version into the cookie.
export async function signInAs(env: Env, email: string): Promise<{ session: string; csrf: string }> {
  const row = await env.DB.prepare('SELECT session_version FROM parents WHERE email = ?').bind(email).first<{ session_version: number }>()
  const session = await signToken(env, { e: email, v: row?.session_version ?? 1, x: nowSec() + SESSION_TTL })
  const csrf = b64urlEncode(crypto.getRandomValues(new Uint8Array(18)))
  return { session, csrf }
}

export function sessionCookies(session: string, csrf: string): string[] {
  const base = `Path=/; Max-Age=${SESSION_TTL}; SameSite=Lax`
  return [`${SESSION_COOKIE}=${session}; HttpOnly; Secure; ${base}`, `${CSRF_COOKIE}=${csrf}; Secure; ${base}`]
}

export function clearSessionCookies(): string[] {
  const base = 'Path=/; Max-Age=0; SameSite=Lax'
  return [`${SESSION_COOKIE}=; HttpOnly; Secure; ${base}`, `${CSRF_COOKIE}=; Secure; ${base}`]
}

export interface CurrentParent {
  email: string
  householdId: string
  displayName: string
}

// Who is signed in, if the cookie is valid AND still current (session_version)? One read
// answers both. Null for no cookie, a bad signature, expiry, no row, or a moved version.
export async function currentParent(env: Env, request: Request): Promise<CurrentParent | null> {
  const payload = await verifyToken<{ e?: string; v?: number }>(env, readCookie(request, SESSION_COOKIE))
  if (!payload || typeof payload.e !== 'string') return null
  const row = await env.DB.prepare('SELECT household_id, display_name, session_version FROM parents WHERE email = ?')
    .bind(payload.e)
    .first<{ household_id: string; display_name: string; session_version: number }>()
  if (!row) return null
  if ((typeof payload.v === 'number' ? payload.v : 1) !== (row.session_version ?? 1)) return null
  return { email: payload.e, householdId: row.household_id, displayName: row.display_name }
}

export function verifyCsrf(request: Request): boolean {
  const cookie = readCookie(request, CSRF_COOKIE)
  const header = request.headers.get('X-CSRF-Token')
  return !!cookie && !!header && cookie === header
}
