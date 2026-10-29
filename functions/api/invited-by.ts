import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// « Ils t'ont invité » on Amis: the families that invited me (to a rencontre, or into their circle) and that are not in my circle yet,
// so a signed-in parent can add them in one tap (the same link as « Lier nos familles », POST /api/link-invitation with `token`).
// An invitation counts when the invited family is linked to my household or carries the email of one of my accounts. One line per
// host family: the most recent thing they invited me to.
//   GET /api/invited-by → { hosts: [{ hostName, hostChild, title, startsAt, token, kind: 'rencontre' | 'circle' }] }
const MINE = 'lower(f.email) IN (SELECT lower(email) FROM parents WHERE household_id = ?1)'
const NOT_YET = `NOT EXISTS (SELECT 1 FROM child_links l WHERE l.revoked_at IS NULL AND ((l.household_a = x.household_id AND l.household_b = ?1) OR (l.household_b = x.household_id AND l.household_a = ?1)))
          AND NOT EXISTS (SELECT 1 FROM friend_families m WHERE m.household_id = ?1 AND m.linked_household_id = x.household_id AND m.deleted_at IS NULL)`
const HOST = `(SELECT display_name FROM parents p WHERE p.household_id = x.household_id ORDER BY p.created_at LIMIT 1) AS host_name`

interface Row {
  host_household: string
  host_name: string | null
  host_child: string
  title: string | null
  starts_at: number | null
  token: string
  at: number
}

export const onRequestGet = authed(async (ctx, actor) => {
  const now = nowSec()
  const { results: rencontres } = await ctx.env.DB.prepare(
    `SELECT x.household_id AS host_household, ${HOST}, c.first_name AS host_child, x.title, x.starts_at, i.token, i.created_at AS at
       FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id JOIN encounters x ON x.id = i.encounter_id JOIN children c ON c.id = x.child_id
      WHERE x.household_id != ?1 AND x.deleted_at IS NULL AND x.status != 'cancelled' AND x.starts_at > ?2 AND f.deleted_at IS NULL
        AND (f.linked_household_id IS NULL OR f.linked_household_id = ?1) AND (f.linked_household_id = ?1 OR ${MINE})
        AND ${NOT_YET}
      ORDER BY x.starts_at DESC LIMIT 20`,
  )
    .bind(actor.householdId, now - 30 * 86_400)
    .all<Row>()
  const { results: circles } = await ctx.env.DB.prepare(
    `SELECT x.household_id AS host_household, ${HOST}, c.first_name AS host_child, NULL AS title, NULL AS starts_at, x.token, x.created_at AS at
       FROM circle_invites x JOIN friend_families f ON f.id = x.friend_family_id JOIN children c ON c.id = x.child_id
      WHERE x.household_id != ?1 AND x.accepted_at IS NULL AND x.revoked_at IS NULL AND x.expires_at > ?2 AND f.deleted_at IS NULL AND f.linked_household_id IS NULL AND ${MINE}
        AND ${NOT_YET}
      ORDER BY x.created_at DESC LIMIT 20`,
  )
    .bind(actor.householdId, now)
    .all<Row>()
  const seen = new Set<string>()
  const hosts = [...circles.map((r) => ({ ...r, kind: 'circle' as const })), ...rencontres.map((r) => ({ ...r, kind: 'rencontre' as const }))]
    .sort((a, b) => b.at - a.at)
    .filter((r) => (seen.has(r.host_household) ? false : (seen.add(r.host_household), true)))
    .slice(0, 5)
    .map((r) => ({ hostName: r.host_name, hostChild: r.host_child, title: r.title, startsAt: r.starts_at, token: r.token, kind: r.kind }))
  return ok({ hosts })
})
