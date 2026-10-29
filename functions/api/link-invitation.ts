import type { Env } from '../_lib/env'
import { badRequest, conflict, forbidden, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { newId, normalizeLinkCode, nowSec } from '../_lib/ids'
import { linkHouseholds } from '../_lib/linking'

// « Lier nos familles » — a parent who ALREADY has an account opens an invitation link while signed in and links the two households in
// one tap: the same bilateral link a new account gets from the reply page's « claim » (functions/api/r/claim.ts), for an existing
// account. The code is either a rencontre invitation's or a circle invitation's (« Inviter dans mon cercle », no rencontre): one door.
// After it, each family is in the other's circle, a rencontre is in the invited family's agenda and they can invite back. The code is
// the credential; nothing is linked without the signed-in parent pressing the button.
//   GET  /api/link-invitation?code=  → { state, hostName, hostChild, familyChild, children }
//        state: 'own' (my own), 'linked' (already linked to me), 'taken' (linked to another account), 'linkable'
//   POST /api/link-invitation { code, childId? } → link; childId says WHICH of my children this is for

export interface Found {
  family_id: string
  family_child: string
  family_birthdate: string | null
  linked_household_id: string | null
  host_household: string
  host_child: string
  host_child_name: string
  host_child_birthdate: string | null
  host_parent: string | null
  host_email: string | null
  circle_id: string | null
}

const HOST = `(SELECT display_name FROM parents p WHERE p.household_id = x.household_id ORDER BY p.created_at LIMIT 1) AS host_parent,
              (SELECT email FROM parents p WHERE p.household_id = x.household_id ORDER BY p.created_at LIMIT 1) AS host_email`

/** The family, host and child behind a code, whichever kind of code it is. A circle code that expired, was withdrawn or was used by someone else is gone. */
export async function findByCode(env: Env, raw: unknown): Promise<Found | null> {
  const code = normalizeLinkCode(typeof raw === 'string' ? raw : undefined)
  if (!code) return null
  const viaRencontre = await env.DB.prepare(
    `SELECT f.id AS family_id, f.child_first_name AS family_child, f.child_birthdate AS family_birthdate, f.linked_household_id,
            e.household_id AS host_household, e.child_id AS host_child, c.first_name AS host_child_name, c.birthdate AS host_child_birthdate, NULL AS circle_id,
            ${HOST.replaceAll('x.household_id', 'e.household_id')}
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN friend_families f ON f.id = i.friend_family_id JOIN children c ON c.id = e.child_id
      WHERE i.token = ? AND e.deleted_at IS NULL AND f.deleted_at IS NULL`,
  )
    .bind(code)
    .first<Found>()
  if (viaRencontre) return viaRencontre
  const now = nowSec()
  return env.DB.prepare(
    `SELECT f.id AS family_id, f.child_first_name AS family_child, f.child_birthdate AS family_birthdate, f.linked_household_id,
            x.household_id AS host_household, x.child_id AS host_child, c.first_name AS host_child_name, c.birthdate AS host_child_birthdate, x.id AS circle_id,
            ${HOST}
       FROM circle_invites x JOIN friend_families f ON f.id = x.friend_family_id JOIN children c ON c.id = x.child_id
      WHERE x.token = ? AND x.revoked_at IS NULL AND f.deleted_at IS NULL AND (x.expires_at > ? OR x.accepted_at IS NOT NULL)`,
  )
    .bind(code, now)
    .first<Found>()
}

const stateOf = (f: Found, me: string): 'own' | 'linked' | 'taken' | 'linkable' => (f.host_household === me ? 'own' : f.linked_household_id === me ? 'linked' : f.linked_household_id ? 'taken' : 'linkable')

export const onRequestGet = authed(async (ctx, actor) => {
  const f = await findByCode(ctx.env, new URL(ctx.request.url).searchParams.get('code'))
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const { results: children } = await ctx.env.DB.prepare('SELECT id, first_name FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string; first_name: string }>()
  return ok({ state: stateOf(f, actor.householdId), hostName: f.host_parent, hostChild: f.host_child_name, familyChild: f.family_child, children })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas de liens en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ code?: string; childId?: string }>(ctx.request)
  const f = await findByCode(ctx.env, body?.code)
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const state = stateOf(f, actor.householdId)
  if (state === 'own') return badRequest('C’est ta propre invitation.')
  if (state === 'taken') return conflict('Cette famille est déjà liée à un autre compte.')
  if (state === 'linked') return ok({ state: 'linked' })

  // Which of MY children is this for: the one named, my only one, or a new one made from the invitation.
  const { results: mine } = await ctx.env.DB.prepare('SELECT id FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string }>()
  const asked = str(body?.childId, 20)
  let childId: string
  let newChild: { firstName: string; birthdate: string | null } | undefined
  if (asked) {
    if (!mine.some((c) => c.id === asked)) return badRequest('Enfant inconnu.')
    childId = asked
  } else if (mine.length === 1) childId = mine[0].id
  else if (mine.length === 0) {
    childId = newId()
    newChild = { firstName: f.family_child, birthdate: f.family_birthdate }
  } else return badRequest('Choisis lequel de tes enfants est invité.')

  await linkHouseholds(ctx.env, {
    host: { householdId: f.host_household, childId: f.host_child, childName: f.host_child_name, childBirthdate: f.host_child_birthdate, parentName: f.host_parent, email: f.host_email },
    familyId: f.family_id,
    familyChild: f.family_child,
    me: { householdId: actor.householdId, displayName: actor.displayName },
    childId,
    newChild,
    circleInviteId: f.circle_id ?? undefined,
  })
  return ok({ state: 'linked', childId })
})
