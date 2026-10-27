import type { Env } from './env'

// The brute-force bound on the doors with no session: login, signup, and a reply link
// (a 32-char token is not guessable, but a flood still costs D1 reads). Two Workers
// rate-limit bindings — LIMIT_IP (30/min per address) and LIMIT_KEY (6/min per target).
// Per-colo and permissive by design: a bound, not an accounting system. Unset → allow
// (dev, unit tests); /api/health reports it so an unset binding is visible.

export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

async function overLimit(env: Env, scope: 'ip' | 'key', key: string): Promise<boolean> {
  const binding = scope === 'ip' ? env.LIMIT_IP : env.LIMIT_KEY
  if (!binding) return false
  try {
    const { success } = await binding.limit({ key: `${scope}:${key}` })
    return !success
  } catch {
    // The limiter's bad day must not lock the door.
    return false
  }
}

// True when THIS attempt is over either bound. Charge the address first so a flood from
// one address never reaches the per-target count.
export async function overAuthLimit(env: Env, request: Request, targetKey?: string | null): Promise<boolean> {
  if (await overLimit(env, 'ip', clientIp(request))) return true
  if (targetKey && (await overLimit(env, 'key', targetKey))) return true
  return false
}

export function rateLimitEnabled(env: Env): boolean {
  return !!env.LIMIT_IP && !!env.LIMIT_KEY
}
