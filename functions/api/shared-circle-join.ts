import { badRequest, conflict, forbidden, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { newId, normalizeLinkCode, nowSec } from '../_lib/ids'
import { findSharedByCode, firstName, isMember, joinCircle, MAX_MEMBERS, type SharedFound } from '../_lib/sharedCircles'

// Joining a shared circle from its code, for someone ALREADY signed in (no account yet: POST /api/r/<code>/claim makes one and joins
// in the same step). Nothing happens without the parent pressing the button. Joining never links two families.
//   GET  /api/shared-circle-join?code= → { state, circleName, hostName, children }
//        state: 'member' (already in it), 'used' (the code was used by another family), 'full', 'joinable'
//   POST /api/shared-circle-join { code, childId? } → join; childId says WHICH of my children the circle is for

async function stateOf(env: Parameters<typeof isMember>[0], f: SharedFound, me: string): Promise<'member' | 'used' | 'full' | 'joinable'> {
  if (await isMember(env, f.circle_id, me)) return 'member'
  if (f.accepted_household && f.accepted_household !== me) return 'used'
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM shared_circle_members WHERE circle_id = ? AND left_at IS NULL').bind(f.circle_id).first<{ n: number }>()
  return (n?.n ?? 0) >= MAX_MEMBERS ? 'full' : 'joinable'
}

export const onRequestGet = authed(async (ctx, actor) => {
  const f = await findSharedByCode(ctx.env, normalizeLinkCode(new URL(ctx.request.url).searchParams.get('code') ?? undefined))
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const { results: children } = await ctx.env.DB.prepare('SELECT id, first_name FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string; first_name: string }>()
  return ok({ state: await stateOf(ctx.env, f, actor.householdId), circleName: f.circle_name, hostName: firstName(f.inviter_parent), children })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas de cercle partagé en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ code?: string; childId?: string }>(ctx.request)
  const f = await findSharedByCode(ctx.env, normalizeLinkCode(body?.code))
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const state = await stateOf(ctx.env, f, actor.householdId)
  if (state === 'member') return ok({ state })
  if (state === 'used') return conflict('Ce code a déjà servi à une autre famille.')
  if (state === 'full') return conflict('Ce cercle est complet.')

  // Which of MY children: the one named, my only one, or a new one made from the invitation (an account with no child yet).
  const { results: mine } = await ctx.env.DB.prepare('SELECT id FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string }>()
  const asked = str(body?.childId, 20)
  let childId: string
  if (asked) {
    if (!mine.some((c) => c.id === asked)) return badRequest('Enfant inconnu.')
    childId = asked
  } else if (mine.length === 1) childId = mine[0].id
  else if (mine.length === 0) {
    childId = newId()
    const ts = nowSec()
    await ctx.env.DB.prepare('INSERT INTO children (id, household_id, first_name, birthdate, colour, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(childId, actor.householdId, f.family_child, f.family_birthdate, '#5b9a8b', ts, ts).run()
  } else return badRequest('Choisis pour lequel de tes enfants.')

  const r = await joinCircle(ctx.env, { circleId: f.circle_id, circleName: f.circle_name, householdId: actor.householdId, childId, invitedBy: f.inviter_household, inviteId: f.invite_id })
  if (r === 'full') return conflict('Ce cercle est complet.')
  return ok({ state: 'member', circleId: f.circle_id })
})
