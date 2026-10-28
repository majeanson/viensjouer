import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { MAX_MESSAGES, MAX_PINNED } from '../_lib/board'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// The host's side of a card's thread. POST { encounterId, text }. The invited side
// writes through its link (functions/api/r/[token].ts).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ encounterId?: string; text?: string }>(ctx.request)
  const encounterId = str(body?.encounterId, 20)
  const text = str(body?.text, 1000)
  if (!encounterId || !text) return badRequest('Un message vide, ça ne part pas.')
  const own = await ctx.env.DB.prepare('SELECT id FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(encounterId, actor.householdId).first()
  if (!own) return notFound()
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM encounter_messages WHERE encounter_id = ? AND deleted_at IS NULL').bind(encounterId).first<{ n: number }>()
  if ((n?.n ?? 0) >= MAX_MESSAGES) return conflict('Le tableau est plein.')
  const id = newId()
  await ctx.env.DB.prepare('INSERT INTO encounter_messages (id, encounter_id, author_kind, author_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, encounterId, 'host', actor.displayName, text, nowSec())
    .run()
  return created({ id })
})

// PATCH { id, pinned } — keep a message at the top (three at most).
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; pinned?: boolean }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id || typeof body?.pinned !== 'boolean') return badRequest('id et pinned requis.')
  const m = await ctx.env.DB.prepare('SELECT m.id, m.encounter_id FROM encounter_messages m JOIN encounters e ON e.id = m.encounter_id WHERE m.id = ? AND e.household_id = ? AND m.deleted_at IS NULL').bind(id, actor.householdId).first<{ id: string; encounter_id: string }>()
  if (!m) return notFound()
  if (body.pinned) {
    const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM encounter_messages WHERE encounter_id = ? AND pinned = 1 AND deleted_at IS NULL').bind(m.encounter_id).first<{ n: number }>()
    if ((n?.n ?? 0) >= MAX_PINNED) return conflict('Trois messages épinglés au plus.')
  }
  await ctx.env.DB.prepare('UPDATE encounter_messages SET pinned = ? WHERE id = ?').bind(body.pinned ? 1 : 0, id).run()
  return ok()
})

// DELETE { id } — the host removes any message of their own rencontres.
export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const m = await ctx.env.DB.prepare('SELECT m.id FROM encounter_messages m JOIN encounters e ON e.id = m.encounter_id WHERE m.id = ? AND e.household_id = ? AND m.deleted_at IS NULL').bind(id, actor.householdId).first()
  if (!m) return notFound()
  await ctx.env.DB.prepare('UPDATE encounter_messages SET deleted_at = ?, pinned = 0 WHERE id = ?').bind(nowSec(), id).run()
  return ok()
})
