import type { Env } from '../_lib/env'
import { serverError, serviceUnavailable, tooManyRequests } from '../_lib/json'
import { overAuthLimit } from '../_lib/rateLimit'
import { signInAs, sessionCookies } from '../_lib/auth'
import { DEMO_CAP, mintDemo, sweepDemos } from '../_lib/demo'

// POST /api/demo — « Essayer sans compte ». Sweeps aged-out sandboxes first, refuses past
// the cap, otherwise mints a seeded household and signs the visitor in. CSRF-exempt (no
// session yet), rate-limited by address.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  try {
    await sweepDemos(ctx.env)
    const n = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM households WHERE kind = 'demo'").first<{ n: number }>()
    if ((n?.n ?? 0) >= DEMO_CAP) return serviceUnavailable('Beaucoup de visiteurs en ce moment — réessaie dans un moment.')
    const email = await mintDemo(ctx.env)
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers })
  } catch (err) {
    console.error('[demo]', err)
    return serverError()
  }
}
