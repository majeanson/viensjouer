import { badRequest, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { requestLang } from '../_lib/lang'

// « Mon profil » — PATCH /api/profile { displayName?, remindHost?, notifyAnswers? }: the first name shown on the invitations I send,
// and whether I want the one email the day before a rencontre I host (off unless asked for).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ displayName?: string; remindHost?: boolean; notifyAnswers?: boolean }>(ctx.request)
  const name = body?.displayName === undefined ? null : str(body.displayName, 60)
  if (body?.displayName !== undefined && !name) return badRequest('Il faut un prénom.')
  const remind = typeof body?.remindHost === 'boolean' ? (body.remindHost ? 1 : 0) : null
  const notify = typeof body?.notifyAnswers === 'boolean' ? (body.notifyAnswers ? 1 : 0) : null
  if (name === null && remind === null && notify === null) return badRequest('Rien à changer.')
  await ctx.env.DB.prepare('UPDATE parents SET display_name = COALESCE(?, display_name), remind_host = COALESCE(?, remind_host), notify_answers = COALESCE(?, notify_answers), lang = COALESCE(?, lang) WHERE email = ?')
    .bind(name, remind, notify, requestLang(ctx.request), actor.email)
    .run()
  return ok()
})
