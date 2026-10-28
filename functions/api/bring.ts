import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { MAX_BRING, cleanLabel } from '../_lib/bring'

// « À apporter » — the host's side.
//   POST   /api/bring { encounter, label } → add a line
//   DELETE /api/bring { id }               → remove a line (taken or not)
// The families take lines from their own page (r/bring.ts).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ encounter?: string; label?: string }>(ctx.request)
  const enc = str(body?.encounter, 20)
  const label = cleanLabel(body?.label)
  if (!enc || !label) return badRequest('Il faut une rencontre et un mot.')
  const own = await ctx.env.DB.prepare('SELECT id FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(enc, actor.householdId).first()
  if (!own) return notFound()
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM bring_items WHERE encounter_id = ?').bind(enc).first<{ n: number }>()
  if ((n?.n ?? 0) >= MAX_BRING) return conflict('Vingt lignes au plus.')
  const id = newId()
  await ctx.env.DB.prepare("INSERT INTO bring_items (id, encounter_id, label, added_by, created_at) VALUES (?, ?, ?, 'host', ?)").bind(id, enc, label, nowSec()).run()
  return created({ id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare('SELECT b.id FROM bring_items b JOIN encounters e ON e.id = b.encounter_id WHERE b.id = ? AND e.household_id = ?').bind(id, actor.householdId).first()
  if (!row) return notFound()
  await ctx.env.DB.prepare('DELETE FROM bring_items WHERE id = ?').bind(id).run()
  return ok()
})
