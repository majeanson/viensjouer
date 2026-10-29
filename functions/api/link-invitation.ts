import type { Env } from '../_lib/env'
import { badRequest, conflict, forbidden, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { newId, normalizeLinkCode, nowSec } from '../_lib/ids'
import { notify, parentsOf } from '../_lib/notify'
import { NOTE } from '../_lib/notifyCopy'

// « Lier nos familles » — a parent who ALREADY has an account opens an invitation link while signed in and links the two
// households in one tap: the same bilateral link a new account gets from the reply page's « claim » (functions/api/r/claim.ts),
// for an existing account. After it, each family is in the other's circle, this rencontre is in the invited family's agenda and
// they can invite back. The code is the credential; nothing is linked without the signed-in parent pressing the button.
//   GET  /api/link-invitation?code=  → { state, hostName, hostChild, familyChild, children }
//        state: 'own' (my own rencontre), 'linked' (already linked to me), 'taken' (linked to another account), 'linkable'
//   POST /api/link-invitation { code, childId? } → link; childId says WHICH of my children this invitation is for

interface Found {
  invitation_id: string
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
  title: string
}

async function find(env: Env, raw: unknown): Promise<Found | null> {
  const code = normalizeLinkCode(typeof raw === 'string' ? raw : undefined)
  if (!code) return null
  return env.DB.prepare(
    `SELECT i.id AS invitation_id, f.id AS family_id, f.child_first_name AS family_child, f.child_birthdate AS family_birthdate, f.linked_household_id,
            e.household_id AS host_household, e.child_id AS host_child, c.first_name AS host_child_name, c.birthdate AS host_child_birthdate, e.title,
            (SELECT display_name FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_parent,
            (SELECT email FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_email
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN friend_families f ON f.id = i.friend_family_id JOIN children c ON c.id = e.child_id
      WHERE i.token = ? AND e.deleted_at IS NULL AND f.deleted_at IS NULL`,
  )
    .bind(code)
    .first<Found>()
}

const stateOf = (f: Found, me: string): 'own' | 'linked' | 'taken' | 'linkable' => (f.host_household === me ? 'own' : f.linked_household_id === me ? 'linked' : f.linked_household_id ? 'taken' : 'linkable')

export const onRequestGet = authed(async (ctx, actor) => {
  const f = await find(ctx.env, new URL(ctx.request.url).searchParams.get('code'))
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const { results: children } = await ctx.env.DB.prepare('SELECT id, first_name FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string; first_name: string }>()
  return ok({ state: stateOf(f, actor.householdId), hostName: f.host_parent, hostChild: f.host_child_name, familyChild: f.family_child, children })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas de liens en mode essai : crée d’abord ton compte.')
  const body = await readJson<{ code?: string; childId?: string }>(ctx.request)
  const f = await find(ctx.env, body?.code)
  if (!f) return notFound('Ce lien ne mène nulle part.')
  const state = stateOf(f, actor.householdId)
  if (state === 'own') return badRequest('C’est ta propre rencontre.')
  if (state === 'taken') return conflict('Cette famille est déjà liée à un autre compte.')
  if (state === 'linked') return ok({ state: 'linked' })

  // Which of MY children is this invitation for: the one named, my only one, or a new one made from the invitation.
  const { results: mine } = await ctx.env.DB.prepare('SELECT id, first_name FROM children WHERE household_id = ? AND deleted_at IS NULL ORDER BY position, created_at').bind(actor.householdId).all<{ id: string; first_name: string }>()
  const asked = str(body?.childId, 20)
  let childId: string | null = null
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []
  if (asked) {
    if (!mine.some((c) => c.id === asked)) return badRequest('Enfant inconnu.')
    childId = asked
  } else if (mine.length === 1) childId = mine[0].id
  else if (mine.length === 0) {
    childId = newId()
    stmts.push(ctx.env.DB.prepare('INSERT INTO children (id, household_id, first_name, birthdate, colour, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(childId, actor.householdId, f.family_child, f.family_birthdate, '#5b9a8b', ts, ts))
  } else return badRequest('Choisis lequel de tes enfants est invité.')

  const already = await ctx.env.DB.prepare('SELECT id FROM child_links WHERE revoked_at IS NULL AND ((household_a = ? AND child_a = ? AND household_b = ? AND child_b = ?) OR (household_a = ? AND child_a = ? AND household_b = ? AND child_b = ?))')
    .bind(f.host_household, f.host_child, actor.householdId, childId, actor.householdId, childId, f.host_household, f.host_child)
    .first()
  if (!already) stmts.push(ctx.env.DB.prepare('INSERT INTO child_links (id, household_a, child_a, household_b, child_b, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), f.host_household, f.host_child, actor.householdId, childId, ts))
  // The host's book learns who this family is on Viens jouer; my own book gets the host back, already linked, to invite back.
  stmts.push(ctx.env.DB.prepare('UPDATE friend_families SET linked_household_id = ?, linked_child_id = ?, updated_at = ? WHERE id = ?').bind(actor.householdId, childId, ts, f.family_id))
  const back = await ctx.env.DB.prepare('SELECT id FROM friend_families WHERE household_id = ? AND linked_household_id = ? AND linked_child_id = ? AND deleted_at IS NULL').bind(actor.householdId, f.host_household, f.host_child).first()
  if (!back)
    stmts.push(
      ctx.env.DB.prepare('INSERT INTO friend_families (id, household_id, parent_name, email, child_first_name, child_birthdate, linked_household_id, linked_child_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(newId(), actor.householdId, f.host_parent ?? 'Hôte', f.host_email, f.host_child_name, f.host_child_birthdate, f.host_household, f.host_child, ts, ts),
    )
  await ctx.env.DB.batch(stmts)
  // The host hears that this family is now on Viens jouer (in the app, and on a phone if they allowed it).
  await notify(ctx.env, await parentsOf(ctx.env, f.host_household), { kind: 'linked', url: '/amis', words: (lang) => NOTE.linked(lang, { name: actor.displayName, child: f.family_child }) })
  return ok({ state: 'linked', childId })
})
