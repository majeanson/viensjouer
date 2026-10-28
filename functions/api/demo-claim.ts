import { badRequest, conflict, forbidden, readJson, serverError, str, tooManyRequests, ACCOUNT_UNAVAILABLE } from '../_lib/json'
import { authed } from '../_lib/route'
import { overAuthLimit } from '../_lib/rateLimit'
import { signInAs, sessionCookies } from '../_lib/auth'
import { hashPassword } from '../_lib/password'
import { isDemoEmail } from '../_lib/demo'
import { nowSec } from '../_lib/ids'
import { EMAIL_RE } from './auth/signup'

// « Garder ma maisonnée » — POST /api/demo/claim { displayName, email, password }.
// A trial parent turns their sandbox into a REAL account IN PLACE: the parents row gets a
// real email and password, the household flips to kind 'real' (so the 24 h sweep stops
// matching it) and is renamed; the children, families, rencontres and photos they built
// all stay. Signed in again on the spot (the session carries the email, which just changed).
// Only a sandbox session may call it. Same validation as signup; no invite gate (signup is open).
export const onRequestPost = authed(async (ctx, actor) => {
  if (!isDemoEmail(actor.email)) return forbidden('Seul un compte d’essai peut être gardé.')
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ displayName?: string; email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email) || isDemoEmail(email)) return badRequest('Courriel invalide.')
  if ((body?.password ?? '').length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const displayName = str(body?.displayName, 60)
  if (!displayName) return badRequest('Ton prénom est requis.')
  if (await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(email).first()) return conflict(ACCOUNT_UNAVAILABLE)

  const ts = nowSec()
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare("UPDATE parents SET email = ?, display_name = ?, password_hash = ?, origin = 'trial', session_version = session_version + 1 WHERE email = ?").bind(email, displayName, await hashPassword(body!.password!), actor.email),
      ctx.env.DB.prepare("UPDATE households SET kind = 'real', name = ?, updated_at = ? WHERE id = ? AND kind = 'demo'").bind(`La famille de ${displayName}`, ts, actor.householdId),
    ])
  } catch {
    return conflict(ACCOUNT_UNAVAILABLE)
  }
  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
})
