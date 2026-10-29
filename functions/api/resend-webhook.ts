import type { Env } from '../_lib/env'
import { nowSec } from '../_lib/ids'
import { badRequest, ok, serviceUnavailable } from '../_lib/json'
import { verifySvix } from '../_lib/svix'

// Resend tells us when an email did not arrive (POST, signed with Svix: RESEND_WEBHOOK_SECRET). A bounce or a spam
// complaint stamps `email_bounced_at` on every friend family carrying that address, so the host sees « courriel non
// reçu » beside the family and can copy the link instead. Editing the address clears the mark. Nothing else is read
// from the payload and nothing is stored about the message.
//   POST /api/resend-webhook
const BAD = new Set(['email.bounced', 'email.complained'])

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const secret = ctx.env.RESEND_WEBHOOK_SECRET
  if (!secret) return serviceUnavailable('Webhook non configuré.')
  const raw = await ctx.request.text()
  if (raw.length > 100_000) return badRequest('Trop gros.')
  if (!(await verifySvix(secret, ctx.request.headers, raw, nowSec()))) return new Response(JSON.stringify({ error: 'Signature invalide.' }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } })
  let evt: { type?: string; data?: { to?: unknown } }
  try {
    evt = JSON.parse(raw)
  } catch {
    return badRequest('Corps invalide.')
  }
  if (!evt.type || !BAD.has(evt.type)) return ok()
  const to = Array.isArray(evt.data?.to) ? evt.data!.to.filter((v): v is string => typeof v === 'string').slice(0, 10) : []
  for (const addr of to) {
    // « Name <a@b.c> » or a bare address: only the address matters.
    const email = (addr.match(/<([^>]+)>/)?.[1] ?? addr).trim().toLowerCase()
    if (email) await ctx.env.DB.prepare('UPDATE friend_families SET email_bounced_at = ? WHERE lower(email) = ? AND deleted_at IS NULL').bind(nowSec(), email).run()
  }
  return ok()
}
