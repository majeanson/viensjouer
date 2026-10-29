import type { Env } from '../_lib/env'
import { ok } from '../_lib/json'
import { mailEnabled } from '../_lib/mail'
import { rateLimitEnabled } from '../_lib/rateLimit'
import { inviteRequired } from '../_lib/signupGate'
import { photosEnabled } from '../_lib/photos'
import { turnstileSiteKey } from '../_lib/turnstile'
import { beatAge } from '../_lib/beats'

// Liveness + which optional bindings are wired, so the SPA hides a door honestly
// instead of discovering it by failing. Open to the unauthenticated signup page.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  // How long since the hourly cron last ran (null: never, or the table is not there yet). The nightly production check
  // fails above three hours.
  const cronAgeSec = await beatAge(ctx.env, 'cron').catch(() => null)
  return ok({
    ok: true,
    cronAgeSec,
    app: ctx.env.APP_NAME ?? 'Viens jouer',
    mail: mailEnabled(ctx.env),
    photos: photosEnabled(ctx.env),
    invite: inviteRequired(ctx.env),
    rateLimit: rateLimitEnabled(ctx.env),
    turnstile: turnstileSiteKey(ctx.env),
    sessionSecret: !!ctx.env.SESSION_SECRET && ctx.env.SESSION_SECRET.length >= 32,
  })
}
