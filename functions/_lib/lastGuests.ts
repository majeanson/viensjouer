import type { Env } from './env'

// The friend families invited to this child's most recent rencontre that already happened (a cancelled one does not
// count), minus families since removed. Ids only: the new-rencontre form selects them. No reply, no count, no ranking.
export async function lastGuestIds(env: Env, householdId: string, childId: string, now: number): Promise<string[]> {
  const last = await env.DB.prepare(
    `SELECT id FROM encounters WHERE household_id = ? AND child_id = ? AND deleted_at IS NULL AND status != 'cancelled' AND starts_at < ?
      ORDER BY starts_at DESC LIMIT 1`,
  )
    .bind(householdId, childId, now)
    .first<{ id: string }>()
  if (!last) return []
  const { results } = await env.DB.prepare(
    `SELECT f.id FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id
      WHERE i.encounter_id = ? AND f.household_id = ? AND f.deleted_at IS NULL ORDER BY f.child_first_name`,
  )
    .bind(last.id, householdId)
    .all<{ id: string }>()
  return results.map((r) => r.id)
}
