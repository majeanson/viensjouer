import { badRequest, conflict, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { MAX_SLOTS } from '../_lib/slots'

// « Proposer plusieurs moments » — the host's side.
//   POST   /api/slots { encounter, startsAt } → offer one more time
//   DELETE /api/slots { id }                  → take one time off
//   DELETE /api/slots { encounter }           → settle: every time goes (after the rencontre was moved to the chosen one)
// The families tick what suits them from their own page (r/slots.ts).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ encounter?: string; startsAt?: number }>(ctx.request)
  const enc = str(body?.encounter, 20)
  const at = typeof body?.startsAt === 'number' && Number.isFinite(body.startsAt) ? Math.floor(body.startsAt) : null
  if (!enc || !at || at <= nowSec()) return badRequest('Il faut une rencontre et un moment à venir.')
  const own = await ctx.env.DB.prepare('SELECT id FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(enc, actor.householdId).first()
  if (!own) return notFound()
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM encounter_slots WHERE encounter_id = ?').bind(enc).first<{ n: number }>()
  if ((n?.n ?? 0) >= MAX_SLOTS) return conflict('Quatre moments au plus.')
  const id = newId()
  await ctx.env.DB.prepare('INSERT INTO encounter_slots (id, encounter_id, starts_at, created_at) VALUES (?, ?, ?, ?)').bind(id, enc, at, nowSec()).run()
  return created({ id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; encounter?: string }>(ctx.request)
  const id = str(body?.id, 20)
  const enc = str(body?.encounter, 20)
  if (!id && !enc) return badRequest('id ou rencontre requis.')
  const DB = ctx.env.DB
  const slots = id
    ? (await DB.prepare('SELECT s.id FROM encounter_slots s JOIN encounters e ON e.id = s.encounter_id WHERE s.id = ? AND e.household_id = ?').bind(id, actor.householdId).all<{ id: string }>()).results
    : (await DB.prepare('SELECT s.id FROM encounter_slots s JOIN encounters e ON e.id = s.encounter_id WHERE s.encounter_id = ? AND e.household_id = ?').bind(enc, actor.householdId).all<{ id: string }>()).results
  if (id && slots.length === 0) return notFound()
  await DB.batch(slots.flatMap((s) => [DB.prepare('DELETE FROM slot_votes WHERE slot_id = ?').bind(s.id), DB.prepare('DELETE FROM encounter_slots WHERE id = ?').bind(s.id)]))
  return ok()
})
