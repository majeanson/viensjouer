import { badRequest, created, forbidden, notFound, ok, readJson, serviceUnavailable, str, tooManyRequests } from '../_lib/json'
import { MAIL_CAP_MESSAGE, mailRoom, recordMail } from '../_lib/mailBudget'
import { authed } from '../_lib/route'
import { freshLinkCode, newId, nowSec, paperCode, whenLong } from '../_lib/ids'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { windowMail, withUnsubscribe } from '../_lib/mailCopy'
import { isDemoEmail } from '../_lib/demo'

// « Une fenêtre ouverte » — host side. An offer of time (we are free Sunday afternoon) to
// chosen families; each addressee gets a /w/<code> link and answers « on se voit ! » or
// not. The host then turns a yes into a real rencontre. It dies at ends_at.
//   GET    /api/windows                     → live + last week's, with each target's answer
//   POST   /api/windows                     → { childId, startsAt, endsAt, note?, families }
//   PUT    /api/windows { targetId }        → email that addressee's link (mail wired + address)
//   DELETE /api/windows { id }              → soft delete (the links die)

interface TargetRow {
  id: string
  window_id: string
  token: string
  reply: 'yes' | 'no' | null
  reply_note: string | null
  parent_name: string
  child_first_name: string
  email: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const since = nowSec() - 7 * 86_400
  const { results: windows } = await ctx.env.DB.prepare(
    'SELECT id, child_id, starts_at, ends_at, note FROM open_windows WHERE household_id = ? AND deleted_at IS NULL AND ends_at > ? ORDER BY starts_at',
  )
    .bind(actor.householdId, since)
    .all<{ id: string; child_id: string; starts_at: number; ends_at: number; note: string | null }>()
  const { results: targets } = await ctx.env.DB.prepare(
    `SELECT t.id, t.window_id, t.token, t.reply, t.reply_note, f.parent_name, f.child_first_name, f.email
       FROM window_targets t
       JOIN open_windows w ON w.id = t.window_id
       JOIN friend_families f ON f.id = t.friend_family_id
      WHERE w.household_id = ? AND w.deleted_at IS NULL AND w.ends_at > ?`,
  )
    .bind(actor.householdId, since)
    .all<TargetRow>()
  return ok({ windows: windows.map((w) => ({ ...w, targets: targets.filter((t) => t.window_id === w.id) })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ childId?: string; startsAt?: number; endsAt?: number; note?: string; families?: string[] }>(ctx.request)
  const childId = str(body?.childId, 20)
  const startsAt = typeof body?.startsAt === 'number' ? Math.floor(body.startsAt) : null
  const endsAt = typeof body?.endsAt === 'number' ? Math.floor(body.endsAt) : null
  if (!childId || !startsAt || !endsAt) return badRequest('Enfant et plage horaire requis.')
  if (endsAt <= startsAt) return badRequest('La fin doit venir après le début.')
  if (endsAt < nowSec()) return badRequest('Cette plage est déjà passée.')
  const child = await ctx.env.DB.prepare('SELECT id FROM children WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(childId, actor.householdId).first()
  if (!child) return badRequest('Enfant inconnu.')
  const wanted = (Array.isArray(body?.families) ? body!.families : []).filter((v): v is string => typeof v === 'string').slice(0, 100)
  if (!wanted.length) return badRequest('Choisis au moins une famille.')
  const { results: owned } = await ctx.env.DB.prepare(`SELECT id FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND id IN (${wanted.map(() => '?').join(',')})`)
    .bind(actor.householdId, ...wanted)
    .all<{ id: string }>()
  if (!owned.length) return badRequest('Aucune de ces familles n’est dans ton carnet.')
  const id = newId()
  const ts = nowSec()
  const codes: string[] = []
  for (let n = 0; n < owned.length; n++) codes.push(await freshLinkCode(ctx.env.DB, 'window_targets'))
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO open_windows (id, household_id, child_id, starts_at, ends_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, actor.householdId, childId, startsAt, endsAt, str(body?.note, 500), ts),
    ...owned.map((f, n) => ctx.env.DB.prepare('INSERT INTO window_targets (id, window_id, friend_family_id, token, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), id, f.id, codes[n], ts)),
  ])
  return created({ id })
})

export const onRequestPut = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas d’envoi en mode essai — copie le lien.')
  if (!mailEnabled(ctx.env)) return serviceUnavailable('L’envoi de courriels n’est pas branché. Copie le lien.')
  const body = await readJson<{ targetId?: string }>(ctx.request)
  const targetId = str(body?.targetId, 20)
  if (!targetId) return badRequest('targetId requis.')
  const row = await ctx.env.DB.prepare(
    `SELECT t.token, f.lang, f.email, f.mail_stopped_at, f.email_bounced_at, f.parent_name, f.child_first_name, w.starts_at, w.ends_at, w.note, c.first_name AS host_child, h.tz
       FROM window_targets t
       JOIN open_windows w ON w.id = t.window_id
       JOIN friend_families f ON f.id = t.friend_family_id
       JOIN children c ON c.id = w.child_id
       JOIN households h ON h.id = w.household_id
      WHERE t.id = ? AND w.household_id = ? AND w.deleted_at IS NULL`,
  )
    .bind(targetId, actor.householdId)
    .first<{ token: string; lang: string | null; email: string | null; mail_stopped_at: number | null; email_bounced_at: number | null; parent_name: string; child_first_name: string; starts_at: number; ends_at: number; note: string | null; host_child: string; tz: string }>()
  if (!row) return notFound()
  if (!row.email) return badRequest('Cette famille n’a pas de courriel — copie le lien.')
  if (row.mail_stopped_at) return badRequest('Cette famille ne veut plus de courriels de l’app — copie le lien.')
  if (row.email_bounced_at) return badRequest('Le dernier courriel à cette adresse n’est pas arrivé : vérifie l’adresse, ou copie le lien.')
  if ((await mailRoom(ctx.env, actor.householdId)) < 1) return tooManyRequests(MAIL_CAP_MESSAGE)
  const link = `${new URL(ctx.request.url).origin}/w/${paperCode(row.token)}`
  const lang = mailLang(row.lang, ctx.request)
  const when = whenLong(row.starts_at, lang, row.tz)
  await sendMail(ctx.env, { to: row.email, fromName: actor.displayName, replyTo: actor.email, ...withUnsubscribe(lang, new URL(ctx.request.url).origin, row.token, windowMail(lang, { parent: row.parent_name, host: actor.displayName, hostChild: row.host_child, child: row.child_first_name, when, note: row.note, link })) })
  await recordMail(ctx.env, actor.householdId)
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE open_windows SET deleted_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(nowSec(), id, actor.householdId).run()
  return res.meta.changes ? ok() : notFound()
})
