// Linking two households: the ONE implementation behind « Lier nos familles » (an invitation to a rencontre) and « Inviter dans mon
// cercle » (a circle invitation). Each family ends up in the other's circle (a bilateral child_links row), the host's book entry
// learns who the family is on Viens jouer, and the family's own book gets the host back, already linked, so the first thing they can
// do is invite back. The host is told. Idempotent: pressing it twice, or after a link already exists, adds nothing.
import type { Env } from './env'
import { newId, nowSec } from './ids'
import { notify, parentsOf } from './notify'
import { NOTE } from './notifyCopy'

export interface Host {
  householdId: string
  childId: string
  childName: string
  childBirthdate: string | null
  parentName: string | null
  email: string | null
}

export interface Me {
  householdId: string
  displayName: string
}

/** `childId` is MY child to link; `newChild` makes one first (an account with no child yet). */
export async function linkHouseholds(
  env: Env,
  p: { host: Host; familyId: string; familyChild: string; me: Me; childId: string; newChild?: { firstName: string; birthdate: string | null }; circleInviteId?: string },
): Promise<void> {
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []
  if (p.newChild) stmts.push(env.DB.prepare('INSERT INTO children (id, household_id, first_name, birthdate, colour, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(p.childId, p.me.householdId, p.newChild.firstName, p.newChild.birthdate, '#5b9a8b', ts, ts))
  const already = await env.DB.prepare('SELECT id FROM child_links WHERE revoked_at IS NULL AND ((household_a = ? AND child_a = ? AND household_b = ? AND child_b = ?) OR (household_a = ? AND child_a = ? AND household_b = ? AND child_b = ?))')
    .bind(p.host.householdId, p.host.childId, p.me.householdId, p.childId, p.me.householdId, p.childId, p.host.householdId, p.host.childId)
    .first()
  if (!already) stmts.push(env.DB.prepare('INSERT INTO child_links (id, household_a, child_a, household_b, child_b, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), p.host.householdId, p.host.childId, p.me.householdId, p.childId, ts))
  stmts.push(env.DB.prepare('UPDATE friend_families SET linked_household_id = ?, linked_child_id = ?, updated_at = ? WHERE id = ?').bind(p.me.householdId, p.childId, ts, p.familyId))
  const back = await env.DB.prepare('SELECT id FROM friend_families WHERE household_id = ? AND linked_household_id = ? AND linked_child_id = ? AND deleted_at IS NULL').bind(p.me.householdId, p.host.householdId, p.host.childId).first()
  if (!back)
    stmts.push(
      env.DB.prepare('INSERT INTO friend_families (id, household_id, parent_name, email, child_first_name, child_birthdate, linked_household_id, linked_child_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newId(), p.me.householdId, p.host.parentName ?? 'Hôte', p.host.email, p.host.childName, p.host.childBirthdate, p.host.householdId, p.host.childId, ts, ts),
    )
  if (p.circleInviteId) stmts.push(env.DB.prepare('UPDATE circle_invites SET accepted_at = ?, accepted_household = ? WHERE id = ? AND accepted_at IS NULL').bind(ts, p.me.householdId, p.circleInviteId))
  await env.DB.batch(stmts)
  await notify(env, await parentsOf(env, p.host.householdId), { kind: 'linked', url: '/amis', words: (lang) => NOTE.linked(lang, { name: p.me.displayName, child: p.familyChild }) })
}
