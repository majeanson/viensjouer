import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { isKind, type EncounterRow, type Reply } from '../_lib/encounters'

// The host side of a rencontre.
//   GET    /api/encounters            → upcoming + recent, with each invitation's reply
//   GET    /api/encounters?id=<id>    → one, with its invitations (+ links) and thread
//   POST   /api/encounters            → create + invite families (mints one link each)
//   PATCH  /api/encounters            → edit fields / status, or add families (`invite`)
//   DELETE /api/encounters            → soft delete
// A link is `${origin}/r/<token>`; the token is the capability (migration 0001).

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
}

const INVITE_SELECT = `SELECT i.id, i.friend_family_id, i.token, i.reply, i.reply_note, i.reply_at, i.sent_at,
                              f.parent_name, f.child_first_name, f.email
                         FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id`

export const onRequestGet = authed(async (ctx, actor) => {
  const url = new URL(ctx.request.url)
  const id = url.searchParams.get('id')
  if (id) {
    const e = await ctx.env.DB.prepare('SELECT id, child_id, kind, title, starts_at, ends_at, place, address, note, status FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
      .bind(id, actor.householdId)
      .first<EncounterRow>()
    if (!e) return notFound()
    const [inv, msgs] = await ctx.env.DB.batch<InviteRow>([
      ctx.env.DB.prepare(`${INVITE_SELECT} WHERE i.encounter_id = ? ORDER BY i.created_at`).bind(id),
      ctx.env.DB.prepare('SELECT id, author_kind, author_label, text, created_at FROM encounter_messages WHERE encounter_id = ? ORDER BY created_at').bind(id),
    ])
    return ok({ encounter: e, invitations: inv.results, messages: msgs.results })
  }
  // The list: everything not older than two weeks, soonest first. A hub later paginates.
  const since = nowSec() - 14 * 86_400
  const { results: encounters } = await ctx.env.DB.prepare(
    'SELECT id, child_id, kind, title, starts_at, ends_at, place, address, note, status FROM encounters WHERE household_id = ? AND deleted_at IS NULL AND starts_at > ? ORDER BY starts_at',
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
  endsAt?: number | null
  place?: string
  address?: string | null
  note?: string | null
  status?: string
  invite?: string[]
}

async function mintInvitations(db: D1Database, householdId: string, encounterId: string, familyIds: string[]): Promise<void> {
  if (!familyIds.length) return
  // Only families from THIS household's book, and not one already on the card.
  const { results: owned } = await db
    .prepare(`SELECT id FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND id IN (${familyIds.map(() => '?').join(',')})`)
    .bind(householdId, ...familyIds)
    .all<{ id: string }>()
  const { results: already } = await db.prepare('SELECT friend_family_id FROM invitations WHERE encounter_id = ?').bind(encounterId).all<{ friend_family_id: string }>()
  const skip = new Set(already.map((r) => r.friend_family_id))
  const ts = nowSec()
  const stmts = owned
    .filter((r) => !skip.has(r.id))
    .map((r) =>
      db
        .prepare('INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId(), encounterId, r.id, newId(32), ts, ts),
    )
  if (stmts.length) await db.batch(stmts)
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
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, ends_at, place, address, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, actor.householdId, childId, body!.kind, title, startsAt, endsAt, str(body?.place, 120), str(body?.address, 200), str(body?.note, 1000), ts, ts)
    .run()
  await mintInvitations(ctx.env.DB, actor.householdId, id, Array.isArray(body?.invite) ? body!.invite.filter((v) => typeof v === 'string').slice(0, 40) : [])
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<Body>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const own = await ctx.env.DB.prepare('SELECT starts_at FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first<{ starts_at: number }>()
  if (!own) return notFound()
  const status = body?.status
  if (status !== undefined && status !== 'proposed' && status !== 'confirmed' && status !== 'cancelled') return badRequest('Statut inconnu.')
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
  if (Array.isArray(body?.invite)) await mintInvitations(ctx.env.DB, actor.householdId, id, body!.invite.filter((v) => typeof v === 'string').slice(0, 40))
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE encounters SET deleted_at = ?, status = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL')
    .bind(nowSec(), 'cancelled', id, actor.householdId)
    .run()
  return res.meta.changes ? ok() : notFound()
})
