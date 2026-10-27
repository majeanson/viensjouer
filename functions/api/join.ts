import type { Env } from '../_lib/env'
import { badRequest, conflict, notFound, ok, readJson, serverError, str, tooManyRequests } from '../_lib/json'
import { overAuthLimit } from '../_lib/rateLimit'
import { signInAs, sessionCookies } from '../_lib/auth'
import { hashPassword } from '../_lib/password'
import { nowSec } from '../_lib/ids'
import { EMAIL_RE } from './auth/signup'

// The other parent redeems an invitation link (/rejoindre?t=<token>). No session yet, so
// CSRF-exempt; the token IS the credential, single-use, seven days.
//   GET  /api/join?t=<token> → { household } so the page can say whose family this is
//   POST /api/join { token, displayName, email, password } → creates the parent in THAT
//                                household, spends the token, signs in
async function live(env: Env, token: string | null) {
  if (!token || token.length < 20 || token.length > 40) return null
  return env.DB.prepare(
    `SELECT p.id, p.household_id, h.name,
            (SELECT display_name FROM parents x WHERE x.email = p.created_by) AS inviter
       FROM parent_invites p JOIN households h ON h.id = p.household_id
      WHERE p.token = ? AND p.used_at IS NULL AND p.expires_at > ? AND h.kind = 'real'`,
  )
    .bind(token, nowSec())
    .first<{ id: string; household_id: string; name: string; inviter: string | null }>()
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const inv = await live(ctx.env, new URL(ctx.request.url).searchParams.get('t'))
  if (!inv) return notFound('Ce lien ne fonctionne plus.')
  return ok({ household: inv.name, inviter: inv.inviter })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ token?: string; displayName?: string; email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return badRequest('Courriel invalide.')
  if ((body?.password ?? '').length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const displayName = str(body?.displayName, 60)
  if (!displayName) return badRequest('Ton prénom est requis.')
  const inv = await live(ctx.env, body?.token ?? null)
  if (!inv) return notFound('Ce lien ne fonctionne plus.')
  if (await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(email).first()) return conflict('Un compte existe déjà pour ce courriel — connecte-toi.')
  const ts = nowSec()
  try {
    // Spend the token and add the parent in ONE batch; `used_at IS NULL` in the UPDATE plus
    // the parents primary key mean two racing redemptions cannot both land.
    const [spent] = await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE parent_invites SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(ts, inv.id),
      ctx.env.DB.prepare('INSERT INTO parents (email, household_id, display_name, password_hash, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(email, inv.household_id, displayName, await hashPassword(body!.password!), 'invite', ts),
    ])
    if (!spent.meta.changes) return notFound('Ce lien ne fonctionne plus.')
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
