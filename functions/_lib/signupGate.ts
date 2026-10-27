import type { Env } from './env'
import { safeEqual } from './password'

// Who may create an account. SIGNUP_OPEN = "1" (a plain var in wrangler.toml — opening
// the gate is a commit someone can read) → no code asked. Otherwise INVITE_CODE, when
// set, is the code. Neither → open (local dev).
type GateEnv = Pick<Env, 'SIGNUP_OPEN' | 'INVITE_CODE'>

export function inviteRequired(env: GateEnv): boolean {
  // Exactly "1": a typo in the var fails toward the gate, never toward the public.
  return env.SIGNUP_OPEN !== '1' && !!env.INVITE_CODE
}

export function inviteAccepted(env: GateEnv, presented: unknown): boolean {
  if (!inviteRequired(env)) return true
  return typeof presented === 'string' && safeEqual(presented, env.INVITE_CODE!)
}
