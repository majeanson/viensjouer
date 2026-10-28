import type { Env } from '../_lib/env'
import { lockedOut, lookupMiss } from '../_lib/guessLimit'
import { tooManyRequests } from '../_lib/json'
import { overAuthLimit } from '../_lib/rateLimit'
import { icsCalendar, icsEvent, type IcsEvent } from '../_lib/encounters'
import { nowSec } from '../_lib/ids'

// GET /api/feed/<secret> — the host's calendar, every rencontre, for « S'abonner » in any calendar app. The
// secret in the URL is the whole credential (rotate it from « Mon compte »). The host's own address is in it:
// it is their own data, going to their own calendar.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const secret = String(ctx.params.token ?? '')
  if (!/^[A-Za-z0-9]{24}$/.test(secret)) return lookupMiss(ctx.env, ctx.request)
  const hh = await ctx.env.DB.prepare('SELECT id, name FROM households WHERE cal_token = ?').bind(secret).first<{ id: string; name: string }>()
  if (!hh) return lookupMiss(ctx.env, ctx.request)
  const now = nowSec()
  const { results } = await ctx.env.DB.prepare(
    'SELECT id, title, starts_at, ends_at, place, address, note, status, updated_at FROM encounters WHERE household_id = ? AND deleted_at IS NULL AND starts_at > ? AND starts_at < ? ORDER BY starts_at LIMIT 400',
  )
    .bind(hh.id, now - 30 * 86_400, now + 400 * 86_400)
    .all<IcsEvent>()
  const origin = new URL(ctx.request.url).origin
  const body = icsCalendar(`Viens jouer · ${hh.name}`, results.map((e) => icsEvent(e, `${origin}/rencontres/${e.id}`)))
  return new Response(body, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300' } })
}
