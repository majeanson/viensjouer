import { badRequest, forbidden, notFound, ok, readJson, serviceUnavailable, str, tooManyRequests } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec, paperCode, whenLong } from '../_lib/ids'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { invitationMail } from '../_lib/mailCopy'
import { isDemoEmail } from '../_lib/demo'
import { isScope } from '../_lib/kinds'
import { MAIL_CAP_MESSAGE, mailRoom, recordMail } from '../_lib/mailBudget'

// A second send to the same family inside this window is refused: one tap, one mail.
const RESEND_COOLDOWN_SEC = 5 * 60

// Send (or re-send) one invitation by email: POST { id }. Needs mail wired AND an address
// on the family; otherwise the host copies the link. DELETE { id } withdraws an
// invitation (the link dies with the row).
export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas d’envoi en mode essai — copie le lien.')
  if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché. Copie le lien.')
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    `SELECT i.token, i.scope, i.sent_at, f.email, f.lang, f.parent_name, f.child_first_name, e.title, e.starts_at, c.first_name AS host_child, h.tz
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN children c ON c.id = e.child_id
       JOIN households h ON h.id = e.household_id
      WHERE i.id = ? AND e.household_id = ? AND e.deleted_at IS NULL`,
  )
    .bind(id, actor.householdId)
    .first<{ token: string; scope: string; sent_at: number | null; lang: string | null; email: string | null; parent_name: string; child_first_name: string; title: string; starts_at: number; host_child: string; tz: string }>()
  if (!row) return notFound()
  if (!row.email) return badRequest('Cette famille n’a pas de courriel — copie le lien.')
  if (row.sent_at && nowSec() - row.sent_at < RESEND_COOLDOWN_SEC) return tooManyRequests('Le courriel vient de partir. Attends quelques minutes avant de le renvoyer.')
  if ((await mailRoom(ctx.env, actor.householdId)) < 1) return tooManyRequests(MAIL_CAP_MESSAGE)

  const link = `${new URL(ctx.request.url).origin}/${paperCode(row.token)}`
  const lang = mailLang(row.lang, ctx.request)
  const when = whenLong(row.starts_at, lang, row.tz)
  const mail = invitationMail(lang, { parent: row.parent_name, host: actor.displayName, hostChild: row.host_child, child: row.child_first_name, title: row.title, when, friendOnly: row.scope === 'friend', link })
  await sendMail(ctx.env, { to: row.email, ...mail })
  await recordMail(ctx.env, actor.householdId)
  await ctx.env.DB.prepare('UPDATE invitations SET sent_at = ?, updated_at = ? WHERE id = ?').bind(nowSec(), nowSec(), id).run()
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare(
    'DELETE FROM invitations WHERE id = ? AND encounter_id IN (SELECT id FROM encounters WHERE household_id = ?)',
  )
    .bind(id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})

// PATCH { id, scope } — flip one family between « friend only » and « whole family » (the host
// can decide family by family; the other families are not told).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; scope?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id || !isScope(body?.scope)) return badRequest('id et portée requis.')
  const res = await ctx.env.DB.prepare('UPDATE invitations SET scope = ?, updated_at = ? WHERE id = ? AND encounter_id IN (SELECT id FROM encounters WHERE household_id = ?)')
    .bind(body.scope, nowSec(), id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})
