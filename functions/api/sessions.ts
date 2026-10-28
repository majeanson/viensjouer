import { serverError } from '../_lib/json'
import { authed } from '../_lib/route'
import { sessionCookies, signInAs } from '../_lib/auth'

// « Me déconnecter partout » — DELETE /api/sessions. Bumps session_version, which ends every session cookie ever
// issued for this parent (there is no sessions table: the version IS the revocation), then signs THIS device back
// in on a fresh cookie. An ordinary « Se déconnecter » only clears this device's cookie.
export const onRequestDelete = authed(async (ctx, actor) => {
  await ctx.env.DB.prepare('UPDATE parents SET session_version = session_version + 1 WHERE email = ?').bind(actor.email).run()
  try {
    const { session, csrf } = await signInAs(ctx.env, actor.email)
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    for (const c of sessionCookies(session, csrf)) headers.append('Set-Cookie', c)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  } catch {
    return serverError('Connexion impossible (SESSION_SECRET manquant ?).')
  }
})
