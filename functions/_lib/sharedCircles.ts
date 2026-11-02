// Shared circles (« Les amis du parc », migration 0025): three families or more who each chose to be in one named circle. Decided
// with Marc on 2026-11-02: any member can invite a family of their own book (the family accepts on its own), members see each other's
// FIRST NAMES only, a member can invite the whole circle to a rencontre, and a circle never links two families (child_links stays a
// one-to-one choice). Joining writes, in every member's book, a HIDDEN entry for every other member (friend_families.shared_circle_id),
// so the whole invitation machinery (links, answers, reminders, the agenda) works unchanged. Leaving soft-deletes those entries.
import type { Env } from './env'
import { newId, nowSec } from './ids'
import { notify, parentsOf } from './notify'
import { NOTE } from './notifyCopy'

export const MAX_MEMBERS = 15
export const MAX_CIRCLES = 10
export const SHARED_INVITE_TTL_SEC = 14 * 86_400

/** The account a book entry stands for: a linked family's household, or the member a hidden circle entry was made for. Needs `f`. */
export const FAMILY_ACCOUNT = 'COALESCE(f.linked_household_id, f.member_household_id)'
/** The same, also matching a family of the book whose typed email is an account's: used only to invite one account ONCE. Needs `f`. */
export const FAMILY_ACCOUNT_ANY = 'COALESCE(f.linked_household_id, f.member_household_id, (SELECT p.household_id FROM parents p WHERE f.email IS NOT NULL AND lower(p.email) = lower(f.email) LIMIT 1))'
/** Where a family's mail goes: the address the host typed, or, for a hidden circle entry, the member account's own address (looked up
 *  at send time, never stored in someone else's book). Needs `f`. */
export const FAMILY_EMAIL = 'COALESCE(f.email, (SELECT p.email FROM parents p WHERE p.household_id = f.member_household_id ORDER BY p.created_at LIMIT 1))'

/** A first name: the first word of a display name (« Marc Jeanson » → « Marc »). */
export const firstName = (s: string | null | undefined): string => s?.trim().split(/\s+/)[0] ?? ''

interface MemberRow {
  household_id: string
  child_id: string
  child_name: string
  parent_name: string | null
}

/** The live members of a circle, with the first names the others see. */
export async function membersOf(env: Env, circleId: string): Promise<MemberRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT m.household_id, m.child_id, c.first_name AS child_name,
            (SELECT display_name FROM parents p WHERE p.household_id = m.household_id ORDER BY p.created_at LIMIT 1) AS parent_name
       FROM shared_circle_members m JOIN children c ON c.id = m.child_id
      WHERE m.circle_id = ? AND m.left_at IS NULL ORDER BY m.joined_at`,
  )
    .bind(circleId)
    .all<MemberRow>()
  return results
}

export async function isMember(env: Env, circleId: string, householdId: string): Promise<{ child_id: string } | null> {
  return env.DB.prepare('SELECT m.child_id FROM shared_circle_members m JOIN shared_circles s ON s.id = m.circle_id WHERE m.circle_id = ? AND m.household_id = ? AND m.left_at IS NULL AND s.deleted_at IS NULL')
    .bind(circleId, householdId)
    .first<{ child_id: string }>()
}

const hiddenEntry = (env: Env, owner: string, circleId: string, m: MemberRow, ts: number) =>
  env.DB.prepare('INSERT INTO friend_families (id, household_id, parent_name, child_first_name, shared_circle_id, member_household_id, member_child_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
    newId(),
    owner,
    firstName(m.parent_name) || '…',
    m.child_name,
    circleId,
    m.household_id,
    m.child_id,
    ts,
    ts,
  )

/** Put a household in a circle: the membership row, then a hidden book entry each way with every member already there. The members
 *  are told. 'already' when it is a member; 'full' past MAX_MEMBERS. `inviteId` marks the code used, in the same batch. */
export async function joinCircle(
  env: Env,
  p: { circleId: string; circleName: string; householdId: string; childId: string; invitedBy: string | null; inviteId?: string },
): Promise<'joined' | 'already' | 'full'> {
  if (await isMember(env, p.circleId, p.householdId)) return 'already'
  const others = await membersOf(env, p.circleId)
  if (others.length >= MAX_MEMBERS) return 'full'
  const me = await env.DB.prepare(
    `SELECT c.first_name AS child_name, (SELECT display_name FROM parents p WHERE p.household_id = c.household_id ORDER BY p.created_at LIMIT 1) AS parent_name
       FROM children c WHERE c.id = ? AND c.household_id = ?`,
  )
    .bind(p.childId, p.householdId)
    .first<{ child_name: string; parent_name: string | null }>()
  if (!me) throw new Error('joinCircle: unknown child')
  const ts = nowSec()
  const mine: MemberRow = { household_id: p.householdId, child_id: p.childId, ...me }
  await env.DB.batch([
    env.DB.prepare('INSERT INTO shared_circle_members (id, circle_id, household_id, child_id, invited_by, joined_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), p.circleId, p.householdId, p.childId, p.invitedBy, ts),
    ...others.flatMap((o) => [hiddenEntry(env, p.householdId, p.circleId, o, ts), hiddenEntry(env, o.household_id, p.circleId, mine, ts)]),
    ...(p.inviteId ? [env.DB.prepare('UPDATE circle_invites SET accepted_at = ?, accepted_household = ? WHERE id = ? AND accepted_at IS NULL').bind(ts, p.householdId, p.inviteId)] : []),
  ])
  for (const o of others)
    await notify(env, await parentsOf(env, o.household_id), { kind: 'joinedCircle', url: '/amis', words: (lang) => NOTE.joinedCircle(lang, { name: firstName(me.parent_name), child: me.child_name, circle: p.circleName }) })
  return 'joined'
}

/** Take a household out of a circle: its membership ends, the hidden entries both ways go, its open codes for the circle die. The
 *  last one out closes the circle (and every code still open for it). Rencontres already sent keep their links. */
export async function leaveCircle(env: Env, circleId: string, householdId: string): Promise<boolean> {
  const ts = nowSec()
  const res = await env.DB.prepare('UPDATE shared_circle_members SET left_at = ? WHERE circle_id = ? AND household_id = ? AND left_at IS NULL').bind(ts, circleId, householdId).run()
  if (!res.meta.changes) return false
  await env.DB.batch([
    env.DB.prepare('UPDATE friend_families SET deleted_at = ?, updated_at = ? WHERE shared_circle_id = ? AND (household_id = ? OR member_household_id = ?) AND deleted_at IS NULL').bind(ts, ts, circleId, householdId, householdId),
    env.DB.prepare('UPDATE circle_invites SET revoked_at = ? WHERE shared_circle_id = ? AND household_id = ? AND accepted_at IS NULL AND revoked_at IS NULL').bind(ts, circleId, householdId),
  ])
  const left = await env.DB.prepare('SELECT 1 AS x FROM shared_circle_members WHERE circle_id = ? AND left_at IS NULL LIMIT 1').bind(circleId).first()
  if (!left)
    await env.DB.batch([
      env.DB.prepare('UPDATE shared_circles SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').bind(ts, ts, circleId),
      env.DB.prepare('UPDATE circle_invites SET revoked_at = ? WHERE shared_circle_id = ? AND accepted_at IS NULL AND revoked_at IS NULL').bind(ts, circleId),
    ])
  return true
}

export interface SharedFound {
  invite_id: string
  circle_id: string
  circle_name: string
  inviter_household: string
  inviter_parent: string | null
  family_child: string
  family_birthdate: string | null
  accepted_household: string | null
}

/** The shared circle behind a two-word code (already normalised), or null: unknown, withdrawn, expired (unless used), or closed. */
export async function findSharedByCode(env: Env, code: string | null | undefined): Promise<SharedFound | null> {
  if (!code) return null
  return env.DB.prepare(
    `SELECT x.id AS invite_id, s.id AS circle_id, s.name AS circle_name, x.household_id AS inviter_household,
            (SELECT display_name FROM parents p WHERE p.household_id = x.household_id ORDER BY p.created_at LIMIT 1) AS inviter_parent,
            f.child_first_name AS family_child, f.child_birthdate AS family_birthdate, x.accepted_household
       FROM circle_invites x JOIN shared_circles s ON s.id = x.shared_circle_id JOIN friend_families f ON f.id = x.friend_family_id
      WHERE x.token = ? AND x.revoked_at IS NULL AND s.deleted_at IS NULL AND (x.expires_at > ? OR x.accepted_at IS NOT NULL)`,
  )
    .bind(code, nowSec())
    .first<SharedFound>()
}
