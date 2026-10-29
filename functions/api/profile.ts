import { badRequest, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { requestLang } from '../_lib/lang'
import { cleanTz } from '../_lib/ids'

// « Mon profil » — PATCH /api/profile { displayName?, remindHost?, notifyAnswers? }: the first name shown on the invitations I send,
// and the household's time zone, and whether I want the one email the day before a rencontre I host (off unless asked for).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ displayName?: string; remindHost?: boolean; notifyAnswers?: boolean; weeklyDigest?: boolean; tz?: string }>(ctx.request)
  const name = body?.displayName === undefined ? null : str(body.displayName, 60)
  if (body?.displayName !== undefined && !name) return badRequest('Il faut un prénom.')
  const remind = typeof body?.remindHost === 'boolean' ? (body.remindHost ? 1 : 0) : null
  const notify = typeof body?.notifyAnswers === 'boolean' ? (body.notifyAnswers ? 1 : 0) : null
  const digest = typeof body?.weeklyDigest === 'boolean' ? (body.weeklyDigest ? 1 : 0) : null
  const tz = body?.tz === undefined ? null : cleanTz(body.tz)
  if (body?.tz !== undefined && !tz) return badRequest('Fuseau horaire inconnu.')
  if (name === null && remind === null && notify === null && digest === null && tz === null) return badRequest('Rien à changer.')
  // The zone belongs to the household (its emails, .ics and quiet hours), whichever parent sets it.
  if (tz) await ctx.env.DB.prepare('UPDATE households SET tz = ?, updated_at = ? WHERE id = ?').bind(tz, Math.floor(Date.now() / 1000), actor.householdId).run()
  await ctx.env.DB.prepare('UPDATE parents SET display_name = COALESCE(?, display_name), remind_host = COALESCE(?, remind_host), notify_answers = COALESCE(?, notify_answers), weekly_digest = COALESCE(?, weekly_digest), lang = COALESCE(?, lang) WHERE email = ?')
    .bind(name, remind, notify, digest, requestLang(ctx.request), actor.email)
    .run()
  return ok()
})
