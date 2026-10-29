// Cloudflare Turnstile, the bot check in front of the two doors a stranger can knock on: signup and « mot de passe oublié ».
// OPTIONAL like mail: both vars unset → no check, no widget (local dev, tests). `TURNSTILE_SITE_KEY` is public (wrangler.toml
// [vars]); `TURNSTILE_SECRET` is a secret (`wrangler secret put TURNSTILE_SECRET`). The token the widget produces is checked
// server-side against Cloudflare's siteverify; a missing or refused token refuses the request, and so does one whose action
// or hostname is not the one expected (the widget is rendered with data-action `signup` or `forgot`). A token is single-use.
import type { Env } from './env'

const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileSiteKey(env: Env): string | null {
  return env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : null
}

/** What a passing token must also say: the action of the surface it was solved on and the hostname of the page. */
export interface Expect {
  action: 'signup' | 'forgot'
  hostname: string
}

export async function turnstilePasses(env: Env, token: unknown, ip: string | null, expect: Expect, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!turnstileSiteKey(env)) return true
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET!, response: token })
    if (ip) form.set('remoteip', ip)
    const res = await fetchImpl(VERIFY, { method: 'POST', body: form })
    if (!res.ok) return false
    const r = (await res.json()) as { success?: boolean; action?: string; hostname?: string }
    // A token solved for another surface (a signup token used to ask for a reset) or on another site is refused.
    const hosts = (env.TURNSTILE_HOSTNAMES ?? expect.hostname).split(',').map((h) => h.trim()).filter(Boolean)
    return r.success === true && r.action === expect.action && !!r.hostname && hosts.includes(r.hostname)
  } catch {
    return false // fail closed: a check that cannot be made is not a pass
  }
}

export const TURNSTILE_MESSAGE = 'La vérification anti-robot n’a pas passé : recharge la page et réessaie.'
