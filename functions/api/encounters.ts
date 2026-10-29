import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { FULL, roomFor } from '../_lib/ceilings'
import { authed } from '../_lib/route'
import { freshLinkCode, newId, nowSec, paperCode } from '../_lib/ids'
import { cleanMapUrl, coverId, isKind, type EncounterRow, type Kind, type Reply, type Status } from '../_lib/encounters'
import { changeLines, diffEncounter, type Change, type Snapshot } from '../_lib/changes'
import { REMIND_LEAD_SEC } from '../_lib/reminders'
import { mailEnabled, sendMail } from '../_lib/mail'
import { mailLang } from '../_lib/lang'
import { updateMail } from '../_lib/mailCopy'
import { isDemoEmail } from '../_lib/demo'
import { mailRoom, recordMail } from '../_lib/mailBudget'
import { cleanDetails, defaultScope, hereAllowed, isScope, parseDetails, type Scope } from '../_lib/kinds'

// The host side of a rencontre.
//   GET    /api/encounters            → upcoming + recent, with each invitation's reply
//   GET    /api/encounters?id=<id>    → one, with its invitations (+ links) and thread
//   POST   /api/encounters            → create + invite families (mints one link each)
//   PATCH  /api/encounters            → edit fields / status, or add families (`invite`)
//   DELETE /api/encounters            → soft delete
// A link is `${origin}/<code>` (also `/r/<code>`); the code is the capability
// (migration 0001, _lib/ids.ts newLinkCode — short enough to write on paper).

interface InviteRow {
  id: string
  friend_family_id: string
  token: string
  reply: Reply | null
  reply_note: string | null
  reply_at: number | null
  sent_at: number | null
  parent_name: string
  child_first_name: string
  email: string | null
  allergies: string | null
  adults: number | null
  kids: number | null
  scope: Scope
}

const INVITE_SELECT = `SELECT i.id, i.friend_family_id, i.token, i.reply, i.reply_note, i.reply_at, i.sent_at,
                              f.parent_name, f.child_first_name, f.email, f.allergies, i.adults, i.kids, i.scope
                         FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id`

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const id = url.searchParams.get('id')
  if (id) {
    const e = await ctx.env.DB.prepare('SELECT id, child_id, kind, title, starts_at, ends_at, place, address, map_url, note, status, series_id, here_at, details, cover_key, show_guests, thanked_at FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
      .bind(id, actor.householdId)
      .first<EncounterRow>()
    if (!e) return notFound()
    const now = nowSec()
    const [inv, msgs, rel, sou, chg, brg] = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`${INVITE_SELECT} WHERE i.encounter_id = ? ORDER BY i.created_at`).bind(id),
      ctx.env.DB.prepare('SELECT id, author_kind, author_label, text, created_at, pinned FROM encounter_messages WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at').bind(id),
      ctx.env.DB.prepare('SELECT r.invitation_id, r.nap, r.ate, r.mood, r.note, r.expires_at FROM relais r JOIN invitations i ON i.id = r.invitation_id WHERE i.encounter_id = ? AND r.expires_at > ?').bind(id, now),
      ctx.env.DB.prepare('SELECT id, author_kind, author_label, created_at FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at').bind(id),
      ctx.env.DB.prepare('SELECT field, old_value, new_value, created_at FROM encounter_changes WHERE encounter_id = ? ORDER BY created_at DESC LIMIT 30').bind(id),
      ctx.env.DB.prepare('SELECT id, label, claimed_label, added_by FROM bring_items WHERE encounter_id = ? ORDER BY created_at').bind(id),
    ])
    const { details, cover_key, show_guests, ...rest } = e
    return ok({
      encounter: { ...rest, details: parseDetails(details), hereOpen: hereAllowed(e, now), cover: coverId(cover_key), show_guests: show_guests !== 0 },
      invitations: inv.results as unknown as InviteRow[],
      messages: msgs.results,
      relais: rel.results,
      souvenirs: sou.results,
      changes: chg.results,
      bring: brg.results,
    })
  }
  // The list: everything not older than two weeks, soonest first. A hub later paginates.
  const since = nowSec() - 14 * 86_400
  const { results: encounters } = await ctx.env.DB.prepare(
    'SELECT id, child_id, kind, title, starts_at, ends_at, place, address, note, status, series_id FROM encounters WHERE household_id = ? AND deleted_at IS NULL AND starts_at > ? ORDER BY starts_at',
  )
    .bind(actor.householdId, since)
    .all<EncounterRow>()
  const { results: invitations } = await ctx.env.DB.prepare(
    `SELECT i.encounter_id, i.id, i.reply, f.parent_name, f.child_first_name FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id JOIN friend_families f ON f.id = i.friend_family_id
      WHERE e.household_id = ? AND e.deleted_at IS NULL AND e.starts_at > ?`,
  )
    .bind(actor.householdId, since)
    .all<{ encounter_id: string; id: string; reply: Reply | null; parent_name: string; child_first_name: string }>()
  return ok({ encounters, invitations })
})

type Body = {
  id?: string
  childId?: string
  kind?: string
  title?: string
  startsAt?: number
  // A weekly series: the FIRST occurrence is startsAt, the rest come from the browser (wall
  // time kept across DST); at most 12, ascending, within a year. Each is an ordinary rencontre.
  startsAtList?: number[]
  series?: boolean
  details?: unknown
  here?: boolean
  scope?: string
  notify?: boolean
  showGuests?: boolean
  endsAt?: number | null
  place?: string
  address?: string | null
  mapUrl?: string | null
  note?: string | null
  status?: string
  invite?: string[]
}

async function mintInvitations(db: D1Database, householdId: string, encounterId: string, familyIds: string[], scope: Scope): Promise<void> {
  if (!familyIds.length) return
  // Only families from THIS household's book, and not one already on the card.
  const { results: owned } = await db
    .prepare(`SELECT id FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND id IN (${familyIds.map(() => '?').join(',')})`)
    .bind(householdId, ...familyIds)
    .all<{ id: string }>()
  const { results: already } = await db.prepare('SELECT friend_family_id FROM invitations WHERE encounter_id = ?').bind(encounterId).all<{ friend_family_id: string }>()
  const skip = new Set(already.map((r) => r.friend_family_id))
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []
  for (const r of owned.filter((x) => !skip.has(x.id))) {
    const code = await freshLinkCode(db, 'invitations')
    stmts.push(
      db
        .prepare('INSERT INTO invitations (id, encounter_id, friend_family_id, token, scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(newId(), encounterId, r.id, code, scope, ts, ts),
    )
  }
  if (stmts.length) await db.batch(stmts)
}

// The occurrence times of a (possibly recurring) creation, or null when the list is not
// acceptable: ascending, the first equal to startsAt, at most 12, none more than a year out.
export function seriesTimes(startsAt: number, list: unknown): number[] | null {
  if (list === undefined) return [startsAt]
  if (!Array.isArray(list) || list.length < 1 || list.length > 12) return null
  const t = list.map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN))
  if (t.some(Number.isNaN) || t[0] !== startsAt) return null
  for (let i = 1; i < t.length; i++) if (t[i] <= t[i - 1]) return null
  if (t[t.length - 1] - t[0] > 366 * 86_400) return null
  return t
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const childId = str(body?.childId, 20)
  const title = str(body?.title, 120)
  const startsAt = typeof body?.startsAt === 'number' && Number.isFinite(body.startsAt) ? Math.floor(body.startsAt) : null
  if (!childId || !title || !startsAt) return badRequest('Enfant, titre et moment sont requis.')
  if (!isKind(body?.kind)) return badRequest('Genre inconnu.')
  const child = await ctx.env.DB.prepare('SELECT id FROM children WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(childId, actor.householdId).first()
  if (!child) return badRequest('Enfant inconnu.')
  const endsAt = typeof body?.endsAt === 'number' && body.endsAt > startsAt ? Math.floor(body.endsAt) : null
  const times = seriesTimes(startsAt, body?.startsAtList)
  if (!times) return badRequest('Série invalide (12 occurrences au plus, sur un an).')
  if ((await roomFor(ctx.env, 'encounters', actor.householdId)) < times.length) return conflict(FULL.encounters)
  const seriesId = times.length > 1 ? newId() : null
  // Who is invited: the friend only (a paid birthday) or the whole family (a park). Defaults by kind.
  const scope: Scope = isScope(body?.scope) ? body.scope : defaultScope(body!.kind as Kind)
  const ts = nowSec()
  const invite = Array.isArray(body?.invite) ? body!.invite.filter((v) => typeof v === 'string').slice(0, 40) : []
  const mapUrl = cleanMapUrl(body?.mapUrl)
  if (typeof body?.mapUrl === 'string' && body.mapUrl.trim() && !mapUrl) return badRequest('Lien de carte invalide.')
  const ids: string[] = []
  for (const at of times) {
    const id = newId()
    ids.push(id)
    await ctx.env.DB.prepare(
      'INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, ends_at, place, address, map_url, note, series_id, details, default_scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, actor.householdId, childId, body!.kind, title, at, endsAt ? at + (endsAt - startsAt) : null, str(body?.place, 120), str(body?.address, 200), mapUrl, str(body?.note, 1000), seriesId, JSON.stringify(cleanDetails(body!.kind as Kind, body?.details)), scope, ts, ts)
      .run()
    await mintInvitations(ctx.env.DB, actor.householdId, id, invite, scope)
  }
  return created({ id: ids[0], ids })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const own = await ctx.env.DB.prepare('SELECT starts_at, ends_at, status, series_id, default_scope FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first<{ starts_at: number; ends_at: number | null; status: 'proposed' | 'confirmed' | 'cancelled'; series_id: string | null; default_scope: Scope }>()
  if (!own) return notFound()
  // « On y est » / « On est partis »: only around the rencontre itself (hereAllowed).
  if (typeof body?.here === 'boolean') {
    if (body.here && !hereAllowed(own, nowSec())) return badRequest('Pas avant le jour même.')
    await ctx.env.DB.prepare('UPDATE encounters SET here_at = ?, updated_at = ? WHERE id = ?').bind(body.here ? nowSec() : null, nowSec(), id).run()
    return ok()
  }
  if (typeof body?.showGuests === 'boolean') await ctx.env.DB.prepare('UPDATE encounters SET show_guests = ?, updated_at = ? WHERE id = ?').bind(body.showGuests ? 1 : 0, nowSec(), id).run()
  const status = body?.status
  if (status !== undefined && status !== 'proposed' && status !== 'confirmed' && status !== 'cancelled') return badRequest('Statut inconnu.')
  // « Annuler toute la série »: the same status on this occurrence and every later one.
  if (body?.series && own.series_id && status !== undefined) {
    await ctx.env.DB.prepare('UPDATE encounters SET status = ?, updated_at = ? WHERE series_id = ? AND household_id = ? AND starts_at >= ? AND deleted_at IS NULL')
      .bind(status, nowSec(), own.series_id, actor.householdId, own.starts_at)
      .run()
    return ok()
  }
  // EDIT: work out what REALLY changes, write it together with the change log (so the invited families can
  // be shown what moved), and keep the day-before reminders honest if the start moved.
  const cur = await ctx.env.DB.prepare('SELECT title, starts_at, ends_at, place, address, map_url, note, details, status, kind FROM encounters WHERE id = ?')
    .bind(id)
    .first<{ title: string; starts_at: number; ends_at: number | null; place: string | null; address: string | null; map_url: string | null; note: string | null; details: string; status: Status; kind: Kind }>()
  if (!cur) return notFound()
  const before: Snapshot = { title: cur.title, starts_at: cur.starts_at, ends_at: cur.ends_at, place: cur.place, address: cur.address, map_url: cur.map_url, note: cur.note, planB: parseDetails(cur.details).planB ?? null, gift: parseDetails(cur.details).gift ?? null, status: cur.status }
  const after: Snapshot = { ...before }
  if (body?.title !== undefined) {
    const t = str(body.title, 120)
    if (!t) return badRequest('Le titre ne peut pas être vide.')
    after.title = t
  }
  if (typeof body?.startsAt === 'number' && Number.isFinite(body.startsAt)) after.starts_at = Math.floor(body.startsAt)
  if (body?.endsAt === null) after.ends_at = null
  else if (typeof body?.endsAt === 'number' && Number.isFinite(body.endsAt)) after.ends_at = Math.floor(body.endsAt)
  if (after.ends_at !== null && after.ends_at <= after.starts_at) return badRequest('La fin doit venir après le début.')
  if (body?.place !== undefined) after.place = str(body.place, 120)
  if (body?.address !== undefined) after.address = str(body.address, 200)
  if (body?.mapUrl !== undefined) {
    const m = cleanMapUrl(body.mapUrl)
    if (typeof body.mapUrl === 'string' && body.mapUrl.trim() && !m) return badRequest('Lien de carte invalide.')
    after.map_url = m
  }
  if (body?.note !== undefined) after.note = str(body.note, 1000)
  if (body?.details !== undefined) {
    const d = cleanDetails(cur.kind, body.details)
    after.planB = d.planB ?? null
    if (cur.kind === 'birthday') after.gift = d.gift ?? null
  }
  if (status !== undefined) after.status = status
  const changes = diffEncounter(before, after)
  const ts = nowSec()
  if (changes.length) {
    const DB = ctx.env.DB
    const details = cleanDetails(cur.kind, { gift: after.gift ?? '', planB: after.planB ?? '' })
    const stmts = [
      DB.prepare('UPDATE encounters SET title = ?, starts_at = ?, ends_at = ?, place = ?, address = ?, map_url = ?, note = ?, details = ?, status = ?, updated_at = ? WHERE id = ?').bind(after.title, after.starts_at, after.ends_at, after.place, after.address, after.map_url, after.note, JSON.stringify(details), after.status, ts, id),
      ...changes.map((c) => DB.prepare('INSERT INTO encounter_changes (id, encounter_id, field, old_value, new_value, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), id, c.field, c.old, c.new, ts)),
    ]
    // A day-before reminder follows the new start; one already sent for the old time is armed again.
    if (after.starts_at !== before.starts_at) stmts.push(DB.prepare('UPDATE invitations SET remind_at = MAX(?, ?), reminded_at = NULL, updated_at = ? WHERE encounter_id = ? AND remind_at IS NOT NULL').bind(after.starts_at - REMIND_LEAD_SEC, ts, ts, id))
    await DB.batch(stmts)
  }
  if (Array.isArray(body?.invite)) await mintInvitations(ctx.env.DB, actor.householdId, id, body!.invite.filter((v) => typeof v === 'string').slice(0, 40), isScope(body?.scope) ? body.scope : own.default_scope)
  // « Prévenir les familles »: one email to each family that has an address and did not say no.
  let notified = 0
  let notifiedSkipped = 0
  if (body?.notify === true && changes.length && mailEnabled(ctx.env) && !isDemoEmail(actor.email)) ({ sent: notified, skipped: notifiedSkipped } = await notifyChange(ctx.env, ctx.request, actor.householdId, new URL(ctx.request.url).origin, actor.displayName, id, after.title, changes))
  return ok({ changed: changes.length, notified, notifiedSkipped })
})

async function notifyChange(env: Parameters<typeof mailEnabled>[0], request: Request, householdId: string, origin: string, hostName: string, encounterId: string, title: string, changes: Change[]): Promise<{ sent: number; skipped: number }> {
  const { results } = await env.DB.prepare(
    `SELECT i.token, f.email, f.lang, f.parent_name, h.tz FROM invitations i
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN encounters e ON e.id = i.encounter_id
       JOIN households h ON h.id = e.household_id
      WHERE i.encounter_id = ? AND f.email IS NOT NULL AND (i.reply IS NULL OR i.reply != 'no') LIMIT 40`,
  )
    .bind(encounterId)
    .all<{ token: string; email: string; lang: string | null; parent_name: string; tz: string }>()
  let sent = 0
  const room = await mailRoom(env, householdId)
  for (const r of results.slice(0, room)) {
    const lang = mailLang(r.lang, request)
    const link = `${origin}/${paperCode(r.token)}`
    try {
      await sendMail(env, { to: r.email, ...updateMail(lang, { parent: r.parent_name, host: hostName, title, lines: changeLines(changes, r.tz, lang), link }) })
      sent++
    } catch (err) {
      console.error('[mail] change', err)
    }
  }
  await recordMail(env, householdId, sent)
  // Families left out because the day's budget ran out are counted, so the host is told and can copy the link.
  return { sent, skipped: Math.max(0, results.length - room) }
}

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE encounters SET deleted_at = ?, status = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(nowSec(), 'cancelled', id, actor.householdId)
    .run()
  if (!res.meta.changes) return notFound()
  // A deleted rencontre takes its photos with it: the blobs go, the rows are marked.
  const { results: photos } = await ctx.env.DB.prepare('SELECT media_key FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL').bind(id).all<{ media_key: string }>()
  if (photos.length) {
    await ctx.env.DB.prepare('UPDATE souvenirs SET deleted_at = ? WHERE encounter_id = ? AND deleted_at IS NULL').bind(nowSec(), id).run()
    await Promise.all(photos.map((p) => ctx.env.PHOTOS?.delete(p.media_key).catch(() => {})))
  }
  return ok()
})
