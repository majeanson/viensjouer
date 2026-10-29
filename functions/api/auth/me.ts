import type { Env } from '../../_lib/env'
import { ok } from '../../_lib/json'
import { currentParent } from '../../_lib/auth'
import { mailEnabled } from '../../_lib/mail'
import { isDemoEmail } from '../../_lib/demo'
import { coverId } from '../../_lib/encounters'

// Who am I? Drives the SPA's AuthProvider. Version-checked, so the shell and the API
// agree about a revoked session.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const me = await currentParent(ctx.env, ctx.request)
  if (!me) return ok({ signedIn: false })
  const h = await ctx.env.DB.prepare('SELECT id, name, tz FROM households WHERE id = ?').bind(me.householdId).first<{ id: string; name: string; tz: string }>()
  const p = await ctx.env.DB.prepare('SELECT photo_key, remind_host, notify_answers, weekly_digest FROM parents WHERE email = ?').bind(me.email).first<{ photo_key: string | null; remind_host: number; notify_answers: number; weekly_digest: number }>()
  // A household with one parent only: the front door to a lockout, so the app suggests inviting the other one.
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM parents WHERE household_id = ?').bind(me.householdId).first<{ n: number }>()
  return ok({ signedIn: true, soloHost: (n?.n ?? 0) === 1, photo: coverId(p?.photo_key), remindHost: p?.remind_host === 1, notifyAnswers: p?.notify_answers === 1, weeklyDigest: p?.weekly_digest === 1, email: me.email, displayName: me.displayName, household: h, mail: mailEnabled(ctx.env), demo: isDemoEmail(me.email) })
}
