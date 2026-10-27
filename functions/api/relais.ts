import { badRequest, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'
import { RELAIS_TTL_SEC, cleanRelais } from '../_lib/kinds'

// « Fiche de relais » — after a drop-off at a HOME rencontre, a few words back to that
// family: the nap, what they ate, a mood word, a line. One per invitation, optional,
// and it expires after a week: a message, not a record of a child.
//   POST   /api/relais { invitationId, nap?, ate?, mood?, note? } → create or replace
//   DELETE /api/relais { invitationId }
async function ownedHomeInvitation(db: D1Database, invitationId: string, householdId: string) {
  return db
    .prepare("SELECT i.id FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE i.id = ? AND e.household_id = ? AND e.kind = 'home' AND e.deleted_at IS NULL")
    .bind(invitationId, householdId)
    .first<{ id: string }>()
}

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<Record<string, unknown>>(ctx.request)
  const invitationId = str(body?.invitationId, 20)
  if (!invitationId) return badRequest('invitationId requis.')
  if (!(await ownedHomeInvitation(ctx.env.DB, invitationId, actor.householdId))) return notFound()
  const r = cleanRelais(body)
  if (!r) return badRequest('Écris au moins un mot.')
  const ts = nowSec()
  await ctx.env.DB.prepare(
    `INSERT INTO relais (id, invitation_id, nap, ate, mood, note, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(invitation_id) DO UPDATE SET nap = excluded.nap, ate = excluded.ate, mood = excluded.mood, note = excluded.note, created_at = excluded.created_at, expires_at = excluded.expires_at`,
  )
    .bind(newId(), invitationId, r.nap, r.ate, r.mood, r.note, ts, ts + RELAIS_TTL_SEC)
    .run()
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ invitationId?: string }>(ctx.request)
  const invitationId = str(body?.invitationId, 20)
  if (!invitationId) return badRequest('invitationId requis.')
  if (!(await ownedHomeInvitation(ctx.env.DB, invitationId, actor.householdId))) return notFound()
  await ctx.env.DB.prepare('DELETE FROM relais WHERE invitation_id = ?').bind(invitationId).run()
  return ok()
})
