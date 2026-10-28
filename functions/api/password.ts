import { badRequest, readJson, serverError, tooManyRequests, unauthorized } from '../_lib/json'
import { authed } from '../_lib/route'
import { overAuthLimit } from '../_lib/rateLimit'
import { sessionCookies, signInAs } from '../_lib/auth'
import { hashPassword, verifyPassword } from '../_lib/password'

// « Changer mon mot de passe » — POST /api/password { current, next }. The current password is asked again (a
// stolen cookie alone cannot lock the owner out), the hash is replaced and session_version is bumped in the same
// statement, so every OTHER device is signed out; this one gets a fresh cookie.
export const onRequestPost = authed(async (ctx, actor) => {
  if (await overAuthLimit(ctx.env, ctx.request, `password:${actor.email}`)) return tooManyRequests()
  const body = await readJson<{ current?: string; next?: string }>(ctx.request)
  const next = body?.next ?? ''
  if (next.length < 8) return badRequest('Mot de passe trop court (8 caractères minimum).')
  const row = await ctx.env.DB.prepare('SELECT password_hash FROM parents WHERE email = ?').bind(actor.email).first<{ password_hash: string }>()
  if (!row || !(await verifyPassword(body?.current ?? '', row.password_hash))) return unauthorized('Le mot de passe actuel n’est pas bon.')
  await ctx.env.DB.prepare('UPDATE parents SET password_hash = ?, session_version = session_version + 1 WHERE email = ?').bind(await hashPassword(next), actor.email).run()
  try {
    const { session, csrf } = await signInAs(ctx.env, actor.email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
})
