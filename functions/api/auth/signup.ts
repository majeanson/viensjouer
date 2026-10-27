import type { Env } from '../../_lib/env'
import { badRequest, conflict, forbidden, readJson, serverError, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { inviteAccepted } from '../../_lib/signupGate'
import { newId, nowSec } from '../../_lib/ids'

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// A parent creates their family's household + their own account in one step and lands
// signed in. Who may: _lib/signupGate.ts. CSRF-exempt (no session yet).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ email?: string; password?: string; displayName?: string; householdName?: string; invite?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return badRequest('Courriel invalide.')
  const password = body?.password ?? ''
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const displayName = str(body?.displayName, 60)
  if (!displayName) return badRequest('Ton prénom est requis.')
  const householdName = str(body?.householdName, 60) ?? `La famille de ${displayName}`
  if (!inviteAccepted(ctx.env, body?.invite)) return forbidden('Code d’invitation invalide.')

  const existing = await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(email).first()
  if (existing) return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')

  const householdId = newId()
  const ts = nowSec()
  try {
    // One batch: parents.email is the primary key, so two racing signups cannot both land.
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO households (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(householdId, householdName, ts, ts),
      ctx.env.DB.prepare('INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').bind(
        email,
        householdId,
        displayName,
        await hashPassword(password),
        ts,
      ),
    ])
  } catch {
    return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  }

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 201, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
