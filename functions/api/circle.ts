import { badRequest, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// « Le cercle de l'enfant » — for each of my children, the LINKED friends (the other
// family has an account, the link is live) and the book-only friends (link-only so far).
//   GET    /api/circle            → { children: [{ child, linked: [...], book: [...] }] }
//   DELETE /api/circle { linkId } → cut a link (both sides stop seeing each other)
// Faces, names, the last and next rencontre dates — never a count of how often.

interface LinkRow {
  id: string
  my_child: string
  other_household: string
  other_child: string
  other_child_name: string | null
  other_child_birthdate: string | null
  other_household_name: string | null
  other_parent: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const { results: children } = await ctx.env.DB.prepare('SELECT id, first_name, birthdate, colour FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at')
    .bind(hh)
    .all<{ id: string; first_name: string; birthdate: string | null; colour: string }>()
  // Links where I am A or B, normalised to (my child, their side).
  const { results: links } = await ctx.env.DB.prepare(
    `SELECT l.id,
            CASE WHEN l.household_a = ?1 THEN l.child_a ELSE l.child_b END AS my_child,
            CASE WHEN l.household_a = ?1 THEN l.household_b ELSE l.household_a END AS other_household,
            CASE WHEN l.household_a = ?1 THEN l.child_b ELSE l.child_a END AS other_child,
            c.first_name AS other_child_name, c.birthdate AS other_child_birthdate,
            h.name AS other_household_name,
            (SELECT display_name FROM parents p WHERE p.household_id = h.id ORDER BY p.created_at LIMIT 1) AS other_parent
       FROM child_links l
       LEFT JOIN children c ON c.id = CASE WHEN l.household_a = ?1 THEN l.child_b ELSE l.child_a END
       LEFT JOIN households h ON h.id = CASE WHEN l.household_a = ?1 THEN l.household_b ELSE l.household_a END
      WHERE (l.household_a = ?1 OR l.household_b = ?1) AND l.revoked_at IS NULL`,
  )
    .bind(hh)
    .all<LinkRow>()
  const { results: book } = await ctx.env.DB.prepare(
    'SELECT id, parent_name, child_first_name, child_birthdate, linked_household_id FROM friend_families WHERE household_id = ? AND deleted_at IS NULL AND linked_household_id IS NULL ORDER BY child_first_name',
  )
    .bind(hh)
    .all<{ id: string; parent_name: string; child_first_name: string; child_birthdate: string | null }>()
  // Last and next rencontre per linked friend: the most recent past and the nearest future
  // card where that family is invited (hosted by me) or where I am invited (hosted by them).
  const now = nowSec()
  const { results: dates } = await ctx.env.DB.prepare(
    `SELECT f.linked_household_id AS other_household,
            MAX(CASE WHEN e.starts_at <= ?2 THEN e.starts_at END) AS last_at,
            MIN(CASE WHEN e.starts_at > ?2 THEN e.starts_at END) AS next_at
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id AND e.deleted_at IS NULL AND e.status != 'cancelled'
       JOIN friend_families f ON f.id = i.friend_family_id
      WHERE f.linked_household_id IS NOT NULL AND (e.household_id = ?1 OR f.linked_household_id = ?1)
      GROUP BY f.linked_household_id`,
  )
    .bind(hh, now)
    .all<{ other_household: string; last_at: number | null; next_at: number | null }>()
  const byHousehold = new Map(dates.map((d) => [d.other_household, d]))
  return ok({
    children: children.map((c) => ({
      child: c,
      linked: links
        .filter((l) => l.my_child === c.id)
        .map((l) => ({
          linkId: l.id,
          childName: l.other_child_name,
          childBirthdate: l.other_child_birthdate,
          parentName: l.other_parent,
          householdName: l.other_household_name,
          lastAt: byHousehold.get(l.other_household)?.last_at ?? null,
          nextAt: byHousehold.get(l.other_household)?.next_at ?? null,
        })),
    })),
    book,
  })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ linkId?: string }>(ctx.request)
  const linkId = str(body?.linkId, 20)
  if (!linkId) return badRequest('linkId requis.')
  const link = await ctx.env.DB.prepare('SELECT household_a, household_b FROM child_links WHERE id = ?2 AND revoked_at IS NULL AND (household_a = ?1 OR household_b = ?1)')
    .bind(actor.householdId, linkId)
    .first<{ household_a: string; household_b: string }>()
  if (!link) return notFound()
  const ts = nowSec()
  const other = link.household_a === actor.householdId ? link.household_b : link.household_a
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE child_links SET revoked_at = ?, revoked_by = ? WHERE id = ?').bind(ts, actor.householdId, linkId),
    // Both book entries forget the link; the entries themselves stay (a name and a phone
    // are still the host's own notes).
    ctx.env.DB.prepare('UPDATE friend_families SET linked_household_id = NULL, linked_child_id = NULL, updated_at = ? WHERE household_id = ? AND linked_household_id = ?').bind(ts, actor.householdId, other),
    ctx.env.DB.prepare('UPDATE friend_families SET linked_household_id = NULL, linked_child_id = NULL, updated_at = ? WHERE household_id = ? AND linked_household_id = ?').bind(ts, other, actor.householdId),
  ])
  return ok()
})
