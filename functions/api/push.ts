import { badRequest, forbidden, ok, readJson, serviceUnavailable, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { requestLang } from '../_lib/lang'
import { notify, parentsOf, subscribeDevice } from '../_lib/notify'
import { NOTE } from '../_lib/notifyCopy'
import { pushEnabled } from '../_lib/webpush'

// « Me prévenir sur cet appareil »: the phone's or browser's Web Push subscription, one per device.
//   GET    /api/push                  → { enabled, devices }   (enabled: the server has its push keys)
//   POST   /api/push { endpoint }     → remember this device
//   POST   /api/push { test: true }   → send myself a test notification (to every device I allowed, and the in-app list)
//   DELETE /api/push { endpoint }     → forget this device
export const onRequestGet = authed(async (ctx, actor) => {
  const row = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE email = ?').bind(actor.email).first<{ n: number }>()
  return ok({ enabled: pushEnabled(ctx.env), devices: row?.n ?? 0 })
})

const endpointOf = (v: unknown): string | null => {
  const e = str(v, 600)
  try {
    return e && new URL(e).protocol === 'https:' ? e : null
  } catch {
    return null
  }
}

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas de notifications en mode essai.')
  const body = await readJson<{ endpoint?: string; test?: boolean }>(ctx.request)
  if (body?.test === true) {
    const me = (await parentsOf(ctx.env, actor.householdId)).filter((p) => p.email === actor.email)
    const lang = requestLang(ctx.request) ?? me[0]?.lang ?? 'fr'
    await notify(ctx.env, [{ email: actor.email, lang, householdId: actor.householdId }], { kind: 'test', url: '/compte?tab=notifications', words: NOTE.test })
    return ok()
  }
  if (!pushEnabled(ctx.env)) return serviceUnavailable('Les notifications ne sont pas branchées.')
  const endpoint = endpointOf(body?.endpoint)
  if (!endpoint) return badRequest('Appareil invalide.')
  await subscribeDevice(ctx.env, actor, endpoint)
  return ok()
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ endpoint?: string }>(ctx.request)
  const endpoint = endpointOf(body?.endpoint)
  if (!endpoint) return badRequest('Appareil invalide.')
  await ctx.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND email = ?').bind(endpoint, actor.email).run()
  return ok()
})
