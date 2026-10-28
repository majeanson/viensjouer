import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { freshLinkCode, newId, nowSec } from '../_lib/ids'
import { isKind, type EncounterRow, type Kind, type Reply } from '../_lib/encounters'
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
    const e = await ctx.env.DB.prepare('SELECT id, child_id, kind, title, starts_at, ends_at, place, address, note, status, series_id, here_at, details FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
      .bind(id, actor.householdId)
      .first<EncounterRow>()
    if (!e) return notFound()
    const now = nowSec()
    const [inv, msgs, rel, sou] = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`${INVITE_SELECT} WHERE i.encounter_id = ? ORDER BY i.created_at`).bind(id),
      ctx.env.DB.prepare('SELECT id, author_kind, author_label, text, created_at FROM encounter_messages WHERE encounter_id = ? ORDER BY created_at').bind(id),
      ctx.env.DB.prepare('SELECT r.invitation_id, r.nap, r.ate, r.mood, r.note, r.expires_at FROM relais r JOIN invitations i ON i.id = r.invitation_id WHERE i.encounter_id = ? AND r.expires_at > ?').bind(id, now),
      ctx.env.DB.prepare('SELECT id, author_kind, author_label, created_at FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at').bind(id),
    ])
    const { details, ...rest } = e
    return ok({
      encounter: { ...rest, details: parseDetails(details), hereOpen: hereAllowed(e, now) },
      invitations: inv.results as unknown as InviteRow[],
      messages: msgs.results,
      relais: rel.results,
      souvenirs: sou.results,
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
  endsAt?: number | null
  place?: string
  address?: string | null
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
  const seriesId = times.length > 1 ? newId() : null
  // Who is invited: the friend only (a paid birthday) or the whole family (a park). Defaults by kind.
  const scope: Scope = isScope(body?.scope) ? body.scope : defaultScope(body!.kind as Kind)
  const ts = nowSec()
  const invite = Array.isArray(body?.invite) ? body!.invite.filter((v) => typeof v === 'string').slice(0, 40) : []
  const ids: string[] = []
  for (const at of times) {
    const id = newId()
    ids.push(id)
    await ctx.env.DB.prepare(
      'INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, ends_at, place, address, note, series_id, details, default_scope, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, actor.householdId, childId, body!.kind, title, at, endsAt ? at + (endsAt - startsAt) : null, str(body?.place, 120), str(body?.address, 200), str(body?.note, 1000), seriesId, JSON.stringify(cleanDetails(body!.kind as Kind, body?.details)), scope, ts, ts)
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
  const status = body?.status
  if (status !== undefined && status !== 'proposed' && status !== 'confirmed' && status !== 'cancelled') return badRequest('Statut inconnu.')
  // « Annuler toute la série »: the same status on this occurrence and every later one.
  if (body?.series && own.series_id && status !== undefined) {
    await ctx.env.DB.prepare('UPDATE encounters SET status = ?, updated_at = ? WHERE series_id = ? AND household_id = ? AND starts_at >= ? AND deleted_at IS NULL')
      .bind(status, nowSec(), own.series_id, actor.householdId, own.starts_at)
      .run()
    return ok()
  }
  const startsAt = typeof body?.startsAt === 'number' && Number.isFinite(body.startsAt) ? Math.floor(body.startsAt) : null
  const endsAt = body?.endsAt === null ? null : typeof body?.endsAt === 'number' ? Math.floor(body.endsAt) : undefined
  await ctx.env.DB.prepare(
    `UPDATE encounters SET
       title = COALESCE(?, title), starts_at = COALESCE(?, starts_at),
       ends_at = CASE WHEN ? THEN ? ELSE ends_at END,
       place = CASE WHEN ? THEN ? ELSE place END,
       address = CASE WHEN ? THEN ? ELSE address END,
       note = CASE WHEN ? THEN ? ELSE note END,
       status = COALESCE(?, status), updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      str(body?.title, 120),
      startsAt,
      endsAt !== undefined ? 1 : 0,
      endsAt ?? null,
      body?.place !== undefined ? 1 : 0,
      str(body?.place, 120),
      body?.address !== undefined ? 1 : 0,
      str(body?.address, 200),
      body?.note !== undefined ? 1 : 0,
      str(body?.note, 1000),
      status ?? null,
      nowSec(),
      id,
    )
    .run()
  if (Array.isArray(body?.invite)) await mintInvitations(ctx.env.DB, actor.householdId, id, body!.invite.filter((v) => typeof v === 'string').slice(0, 40), isScope(body?.scope) ? body.scope : own.default_scope)
  return ok()
})

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
