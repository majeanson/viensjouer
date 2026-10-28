import { badRequest, forbidden, notFound, ok, readJson, serviceUnavailable, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec, paperCode, whenLong } from '../_lib/ids'
import { escapeHtml, mailEnabled, sendMail } from '../_lib/mail'
import { isDemoEmail } from '../_lib/demo'
import { isScope } from '../_lib/kinds'

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
    `SELECT i.token, i.scope, f.email, f.parent_name, f.child_first_name, e.title, e.starts_at, c.first_name AS host_child, h.tz
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN children c ON c.id = e.child_id
       JOIN households h ON h.id = e.household_id
      WHERE i.id = ? AND e.household_id = ? AND e.deleted_at IS NULL`,
  )
    .bind(id, actor.householdId)
    .first<{ token: string; scope: string; email: string | null; parent_name: string; child_first_name: string; title: string; starts_at: number; host_child: string; tz: string }>()
  if (!row) return notFound()
  if (!row.email) return badRequest('Cette famille n’a pas de courriel — copie le lien.')

  const link = `${new URL(ctx.request.url).origin}/${paperCode(row.token)}`
  const when = whenLong(row.starts_at, 'fr', row.tz)
  const subject = `${row.host_child} invite ${row.child_first_name} — ${row.title}`
  const text = `Bonjour ${row.parent_name},\n\n${actor.displayName} propose une rencontre : ${row.title}, ${when}. ${row.scope === 'friend' ? `L’invitation est pour ${row.child_first_name} seulement.` : 'Toute la famille est la bienvenue, frères et sœurs inclus.'}\n\nRéponds ici (pas de compte à créer) :\n${link}\n\n— Viens jouer`
  const html = `<p>Bonjour ${escapeHtml(row.parent_name)},</p><p>${escapeHtml(actor.displayName)} propose une rencontre : <strong>${escapeHtml(row.title)}</strong>, ${escapeHtml(when)}. ${row.scope === 'friend' ? `L’invitation est pour ${escapeHtml(row.child_first_name)} seulement.` : 'Toute la famille est la bienvenue, frères et sœurs inclus.'}</p><p><a href="${link}">Répondre</a> — pas de compte à créer.</p><p>— Viens jouer</p>`
  await sendMail(ctx.env, { to: row.email, subject, text, html })
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
