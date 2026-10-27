import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, tooManyRequests, unauthorized } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { signInAs, sessionCookies } from '../../_lib/auth'
import { verifyPassword } from '../../_lib/password'
import { EMAIL_RE } from './signup'

// An unknown email and a wrong password get the SAME answer: this door says nothing
// about which addresses exist. CSRF-exempt (no session yet).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ email?: string; password?: string }>(ctx.request)
  const email = body?.email?.trim().toLowerCase()
  if (!email || !EMAIL_RE.test(email)) return badRequest('Courriel invalide.')
  if (await overAuthLimit(ctx.env, ctx.request, `login:${email}`)) return tooManyRequests()

  const row = await ctx.env.DB.prepare('SELECT password_hash FROM parents WHERE email = ?').bind(email).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(body?.password ?? '', row.password_hash))) return unauthorized('Courriel ou mot de passe invalide.')

  try {
    const { session, csrf } = await signInAs(ctx.env, email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
