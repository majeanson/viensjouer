import type { Env } from '../../_lib/env'
import { notFound, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { toIcs } from '../../_lib/encounters'

// GET /api/r/<token>/ics → « Ajouter à mon calendrier ». Same capability as the card;
// the address is deliberately NOT in the file (it lives on the page, behind a yes).
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const token = ctx.params.token as string | undefined
  if (!token) return notFound()
  const e = await ctx.env.DB.prepare(
    'SELECT e.id, e.title, e.starts_at, e.ends_at, e.place, e.note FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE i.token = ? AND e.deleted_at IS NULL AND e.status != ?',
  )
    .bind(token, 'cancelled')
    .first<{ id: string; title: string; starts_at: number; ends_at: number | null; place: string | null; note: string | null }>()
  if (!e) return notFound()
  const origin = new URL(ctx.request.url).origin
  return new Response(toIcs(e, `${origin}/r/${token}`), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="rencontre.ics"', 'cache-control': 'no-store' },
  })
}
