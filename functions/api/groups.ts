import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// Groups — « La garderie », « Les cousins ». A host's private shortcut to invite many
// families at once; the families never see that a group exists.
//   GET    /api/groups                       → [{ id, name, families: [ids] }]
//   POST   /api/groups { name, families }    → create
//   PATCH  /api/groups { id, name?, families? } → rename / replace the members
//   DELETE /api/groups { id }                → soft delete

async function ownedFamilyIds(db: D1Database, householdId: string, ids: unknown): Promise<string[]> {
  if (!Array.isArray(ids)) return []
  const wanted = ids.filter((v): v is string => typeof v === 'string').slice(0, 200)
  if (!wanted.length) return []
  const { results } = await db
    .prepare(`SELECT id FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND id IN (${wanted.map(() => '?').join(',')})`)
    .bind(householdId, ...wanted)
    .all<{ id: string }>()
  return results.map((r) => r.id)
}

export const onRequestGet = authed(async (ctx, actor) => {
  const { results: groups } = await ctx.env.DB.prepare('SELECT id, name FROM friend_groups WHERE household_id = ? AND deleted_at IS NULL ORDER BY name').bind(actor.householdId).all<{ id: string; name: string }>()
  const { results: members } = await ctx.env.DB.prepare(
    `SELECT m.group_id, m.friend_family_id FROM friend_group_members m JOIN friend_groups g ON g.id = m.group_id WHERE g.household_id = ? AND g.deleted_at IS NULL`,
  )
    .bind(actor.householdId)
    .all<{ group_id: string; friend_family_id: string }>()
  return ok({ groups: groups.map((g) => ({ ...g, families: members.filter((m) => m.group_id === g.id).map((m) => m.friend_family_id) })) })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ name?: string; families?: string[] }>(ctx.request)
  const name = str(body?.name, 60)
  if (!name) return badRequest('Un nom est requis.')
  const fams = await ownedFamilyIds(ctx.env.DB, actor.householdId, body?.families)
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO friend_groups (id, household_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, actor.householdId, name, ts, ts),
    ...fams.map((f) => ctx.env.DB.prepare('INSERT INTO friend_group_members (group_id, friend_family_id) VALUES (?, ?)').bind(id, f)),
  ])
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; name?: string; families?: string[] }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const own = await ctx.env.DB.prepare('SELECT id FROM friend_groups WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first()
  if (!own) return notFound()
  const stmts: D1PreparedStatement[] = [ctx.env.DB.prepare('UPDATE friend_groups SET name = COALESCE(?, name), updated_at = ? WHERE id = ?').bind(str(body?.name, 60), nowSec(), id)]
  if (Array.isArray(body?.families)) {
    const fams = await ownedFamilyIds(ctx.env.DB, actor.householdId, body.families)
    stmts.push(ctx.env.DB.prepare('DELETE FROM friend_group_members WHERE group_id = ?').bind(id))
    for (const f of fams) stmts.push(ctx.env.DB.prepare('INSERT INTO friend_group_members (group_id, friend_family_id) VALUES (?, ?)').bind(id, f))
  }
  await ctx.env.DB.batch(stmts)
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const res = await ctx.env.DB.prepare('UPDATE friend_groups SET deleted_at = ? WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(nowSec(), id, actor.householdId).run()
  return res.meta.changes ? ok() : notFound()
})
