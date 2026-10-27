import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'
import { mailEnabled } from '../_lib/mail'
import { rateLimitEnabled } from '../_lib/rateLimit'
import { inviteRequired } from '../_lib/signupGate'

// Liveness + which optional bindings are wired, so the SPA hides a door honestly
// instead of discovering it by failing. Open to the unauthenticated signup page.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  return ok({
    ok: true,
    app: ctx.env.APP_NAME ?? 'Viens jouer',
    mail: mailEnabled(ctx.env),
    invite: inviteRequired(ctx.env),
    rateLimit: rateLimitEnabled(ctx.env),
    sessionSecret: !!ctx.env.SESSION_SECRET && ctx.env.SESSION_SECRET.length >= 32,
  })
}
