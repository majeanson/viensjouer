import type { Env } from '../../_lib/env'
import { badRequest, readJson, serverError, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { sessionCookies, signInAs } from '../../_lib/auth'
import { hashPassword } from '../../_lib/password'
import { nowSec, sha256Hex } from '../../_lib/ids'

// POST /api/auth/reset { token, password } — the token hashed and matched against an
// unused, unexpired row; the hash replaced, the row spent and every OTHER device signed
// out (session_version) in ONE batch; then signed in here. A bad, spent or expired token
// is one answer. CSRF-exempt (no session yet).
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const body = await readJson<{ token?: string; password?: string }>(ctx.request)
  const token = body?.token?.trim() ?? ''
  const password = body?.password ?? ''
  if (!token) return badRequest('Lien invalide.')
  if (password.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')

  const now = nowSec()
  const row = await ctx.env.DB.prepare('SELECT id, email FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(await sha256Hex(token), now)
    .first<{ id: string; email: string }>()
  if (!row) return badRequest('Ce lien ne fonctionne plus.')
  if (!(await ctx.env.DB.prepare('SELECT email FROM parents WHERE email = ?').bind(row.email).first())) return badRequest('Ce lien ne fonctionne plus.')

  await ctx.env.DB.batch([
    ctx.env.DB.prepare('UPDATE parents SET password_hash = ?, session_version = session_version + 1 WHERE email = ?').bind(await hashPassword(password), row.email),
    ctx.env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').bind(now, row.id),
  ])
  try {
    const { session, csrf } = await signInAs(ctx.env, row.email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true, email: row.email }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
}
