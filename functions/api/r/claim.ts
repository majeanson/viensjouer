import type { Env } from '../../_lib/env'
import { badRequest, conflict, readJson, serverError, str, tooManyRequests, notFound } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { newId, normalizeLinkCode, nowSec } from '../../_lib/ids'
import { EMAIL_RE } from '../auth/signup'

// THE reciprocity door. POST /api/r/<code>/claim { displayName, email, password } — the
// invited parent, from the reply page, becomes a household of their own:
//   · a household + a parent row (origin 'reply') signed in on the spot;
//   · their child (the host's `child_first_name` for them) as a real child row;
//   · a bilateral child_links row, host child ↔ their child;
//   · the host's book entry learns linked_household_id + linked_child_id;
//   · a reciprocal book entry on THEIR side (the host parent + child), already linked —
//     so the first thing they can do is invite back.
// No signup gate here: a person holding a live invitation was invited by someone who
// already has an account. CSRF-exempt like every r/ route (no session yet).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!code) return notFound('Ce lien ne mène nulle part.')
  const body = await readJson<{ displayName?: string; email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const displayName = str(body?.displayName, 60)
  if (!displayName) return badRequest('Ton prénom est requis.')

  const inv = await ctx.env.DB.prepare(
    `SELECT i.id AS invitation_id, f.id AS family_id, f.child_first_name, f.child_birthdate, f.linked_household_id,
            e.household_id AS host_household, e.child_id AS host_child, e.status,
            c.first_name AS host_child_name, c.birthdate AS host_child_birthdate, h.name AS host_household_name,
            (SELECT display_name FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_parent,
            (SELECT email FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS host_email
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN children c ON c.id = e.child_id
       JOIN households h ON h.id = e.household_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<{
      invitation_id: string
      family_id: string
      child_first_name: string
      child_birthdate: string | null
      linked_household_id: string | null
      host_household: string
      host_child: string
      status: string
      host_child_name: string
      host_child_birthdate: string | null
      host_household_name: string
      host_parent: string | null
      host_email: string | null
    }>()
  if (!inv) return notFound('Ce lien ne mène nulle part.')
  if (inv.linked_household_id) return conflict('Cette famille a déjà son compte — connecte-toi.')
  if (await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(email).first()) {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi, puis demande à l’hôte de te relier.')
  }

  const ts = nowSec()
  const householdId = newId()
  const childId = newId()
  const linkId = newId()
  const reciprocalId = newId()
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO households (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(householdId, `La famille de ${displayName}`, ts, ts),
      ctx.env.DB.prepare('INSERT INTO parents (email, household_id, display_name, password_hash, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        email,
        householdId,
        displayName,
        await hashPassword(password),
        'reply',
        ts,
      ),
      ctx.env.DB.prepare('INSERT INTO children (id, household_id, first_name, birthdate, colour, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(
        childId,
        householdId,
        inv.child_first_name,
        inv.child_birthdate,
        '#5b9a8b',
        ts,
        ts,
      ),
      ctx.env.DB.prepare('INSERT INTO child_links (id, household_a, child_a, household_b, child_b, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        linkId,
        inv.host_household,
        inv.host_child,
        householdId,
        childId,
        ts,
      ),
      ctx.env.DB.prepare('UPDATE friend_families SET linked_household_id = ?, linked_child_id = ?, parent_name = ?, email = ?, updated_at = ? WHERE id = ?').bind(
        householdId,
        childId,
        displayName,
        email,
        ts,
        inv.family_id,
      ),
      ctx.env.DB.prepare(
        'INSERT INTO friend_families (id, household_id, parent_name, email, child_first_name, child_birthdate, linked_household_id, linked_child_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(reciprocalId, householdId, inv.host_parent ?? inv.host_household_name, inv.host_email, inv.host_child_name, inv.host_child_birthdate, inv.host_household, inv.host_child, ts, ts),
    ])
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email, childId }), { status: 201, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
