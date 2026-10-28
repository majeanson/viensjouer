import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { addressFor, toIcs, type Reply, type Status } from '../../_lib/encounters'
import { normalizeLinkCode } from '../../_lib/ids'

// GET /api/r/<code>/ics → « Ajouter à mon calendrier », as a file or (?s=1, from a webcal:// link) as a
// subscription the calendar app refreshes by itself. Same capability as the card: the address is in the file
// only once the family said yes (it is on the page behind that yes). A cancelled rencontre stays in the feed
// as STATUS:CANCELLED so a subscribed calendar drops it instead of keeping a dead event.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const token = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!token) return lookupMiss(ctx.env, ctx.request)
  const e = await ctx.env.DB.prepare(
    'SELECT e.id, e.title, e.starts_at, e.ends_at, e.place, e.address, e.note, e.status, e.updated_at, i.reply FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE i.token = ? AND e.deleted_at IS NULL',
  )
    .bind(token)
    .first<{ id: string; title: string; starts_at: number; ends_at: number | null; place: string | null; address: string | null; note: string | null; status: Status; updated_at: number; reply: Reply | null }>()
  if (!e) return lookupMiss(ctx.env, ctx.request)
  const origin = new URL(ctx.request.url).origin
  const subscription = new URL(ctx.request.url).searchParams.get('s') === '1'
  const headers: Record<string, string> = { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' }
  if (!subscription) headers['content-disposition'] = 'attachment; filename="rencontre.ics"'
  return new Response(toIcs({ ...e, address: addressFor(e.reply, e.address) }, `${origin}/r/${token}`), { headers })
}
