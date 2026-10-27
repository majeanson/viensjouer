import { forbidden, readJson, tooManyRequests } from '../_lib/json'
import { authed } from '../_lib/route'
import { overAuthLimit } from '../_lib/rateLimit'
import { clearSessionCookies } from '../_lib/auth'
import { verifyPassword } from '../_lib/password'
import { deleteHouseholds, isDemoEmail } from '../_lib/demo'

// « Tout effacer » — DELETE /api/household { password }. Removes the WHOLE household,
// immediately and for good: its parents' accounts, children, friend families, rencontres,
// invitations, messages, groups, windows, home card, relais, photo rows AND their blobs in R2.
// Linked families keep their own data and simply lose the link. Needs the password (a stolen
// session must not be able to erase a family); a trial sandbox needs none.
export const onRequestDelete = authed(async (ctx, actor) => {
  if (await overAuthLimit(ctx.env, ctx.request, `delete:${actor.email}`)) return tooManyRequests()
  if (!isDemoEmail(actor.email)) {
    const body = await readJson<{ password?: string }>(ctx.request)
    const row = await ctx.env.DB.prepare('SELECT password_hash FROM parents WHERE email = ?').bind(actor.email).first<{ password_hash: string }>()
    if (!row || !(await verifyPassword(body?.password ?? '', row.password_hash))) return forbidden('Mot de passe invalide.')
  }
  await deleteHouseholds(ctx.env, [actor.householdId])
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  for (const c of clearSessionCookies()) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
})
