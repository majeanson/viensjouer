import { badRequest, conflict, created, forbidden, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { newId, nowSec } from '../_lib/ids'
import { FAMILY_ACCOUNT_ANY, MAX_CIRCLES, firstName, isMember, joinCircle, leaveCircle } from '../_lib/sharedCircles'

// « Les cercles partagés » (migration 0025, _lib/sharedCircles.ts): named circles of three families or more.
//   GET    /api/shared-circles               → { circles: [{ id, name, myChildId, members: [{ key, me, parentName, childName, familyId }],
//                                                invites: [{ id, familyId, token, expiresAt }] }] }
//          familyId is the entry of MY book to invite that member with (my own linked entry when we are friends too, else the hidden
//          circle entry), so a member in two of my circles is one family in the picker. invites are MY open codes for that circle.
//   POST   /api/shared-circles { name, childId? } → start one, with me in it
//   PATCH  /api/shared-circles { id, name }       → rename (any member)
//   DELETE /api/shared-circles { id }             → leave it (the last one out closes it)
// First names only: no face, no email, no phone of another member ever leaves this endpoint.

interface MemberRow {
  id: string
  circle_id: string
  household_id: string
  child_name: string
  parent_name: string | null
}

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const now = nowSec()
  const [circles, members, entries, invites] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `SELECT s.id, s.name, m.child_id AS my_child FROM shared_circle_members m JOIN shared_circles s ON s.id = m.circle_id
        WHERE m.household_id = ? AND m.left_at IS NULL AND s.deleted_at IS NULL ORDER BY s.name`,
    ).bind(hh),
    ctx.env.DB.prepare(
      `SELECT o.id, o.circle_id, o.household_id, c.first_name AS child_name,
              (SELECT display_name FROM parents p WHERE p.household_id = o.household_id ORDER BY p.created_at LIMIT 1) AS parent_name
         FROM shared_circle_members o JOIN children c ON c.id = o.child_id
        WHERE o.left_at IS NULL AND o.circle_id IN (SELECT circle_id FROM shared_circle_members WHERE household_id = ? AND left_at IS NULL)
        ORDER BY o.joined_at`,
    ).bind(hh),
    ctx.env.DB.prepare(
      `SELECT * FROM (SELECT f.id, f.shared_circle_id, ${FAMILY_ACCOUNT_ANY} AS account, f.created_at FROM friend_families f WHERE f.household_id = ? AND f.deleted_at IS NULL)
        WHERE account IS NOT NULL ORDER BY (shared_circle_id IS NOT NULL), created_at`,
    ).bind(hh),
    ctx.env.DB.prepare(
      `SELECT id, shared_circle_id, friend_family_id AS familyId, token, expires_at AS expiresAt FROM circle_invites
        WHERE household_id = ? AND shared_circle_id IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`,
    ).bind(hh, now),
  ])
  // One entry per member household: my own book's (linked, or on their email) first, since it carries what I know; else the oldest hidden one.
  const ent = entries.results as { id: string; account: string }[]
  const entryFor = (other: string) => ent.find((e) => e.account === other)?.id ?? null
  const inv = invites.results as { id: string; shared_circle_id: string; familyId: string; token: string; expiresAt: number }[]
  return ok({
    circles: (circles.results as { id: string; name: string; my_child: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
      myChildId: c.my_child,
      members: (members.results as MemberRow[])
        .filter((m) => m.circle_id === c.id)
        .map((m) => ({ key: m.id, me: m.household_id === hh, parentName: firstName(m.parent_name), childName: m.child_name, familyId: m.household_id === hh ? null : entryFor(m.household_id) })),
      invites: inv.filter((i) => i.shared_circle_id === c.id).map(({ shared_circle_id: _, ...i }) => i),
    })),
  })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas de cercle partagé en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ name?: string; childId?: string }>(ctx.request)
  const name = str(body?.name, 60)
  if (!name) return badRequest('Un nom est requis.')
  const { results: kids } = await ctx.env.DB.prepare('SELECT id FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string }>()
  const asked = str(body?.childId, 20)
  const child = asked ? kids.find((k) => k.id === asked) : kids.length === 1 ? kids[0] : undefined
  if (!child) return badRequest(kids.length === 0 ? 'Ajoute d’abord ton enfant.' : 'Choisis pour lequel de tes enfants.')
  const n = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM shared_circle_members m JOIN shared_circles s ON s.id = m.circle_id WHERE m.household_id = ? AND m.left_at IS NULL AND s.deleted_at IS NULL').bind(actor.householdId).first<{ n: number }>()
  if ((n?.n ?? 0) >= MAX_CIRCLES) return conflict('Dix cercles partagés au plus : quittes-en un d’abord.')
  const id = newId()
  const ts = nowSec()
  await ctx.env.DB.prepare('INSERT INTO shared_circles (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, actor.householdId, ts, ts).run()
  await joinCircle(ctx.env, { circleId: id, circleName: name, householdId: actor.householdId, childId: child.id, invitedBy: null })
  return created({ id })
})

export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; name?: string }>(ctx.request)
  const id = str(body?.id, 20)
  const name = str(body?.name, 60)
  if (!id || !name) return badRequest('id et nom requis.')
  if (!(await isMember(ctx.env, id, actor.householdId))) return notFound()
  await ctx.env.DB.prepare('UPDATE shared_circles SET name = ?, updated_at = ? WHERE id = ?').bind(name, nowSec(), id).run()
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  return (await leaveCircle(ctx.env, id, actor.householdId)) ? ok() : notFound()
})
