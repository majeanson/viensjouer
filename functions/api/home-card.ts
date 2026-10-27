import { ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { cleanHomeCard, homeCardOrNull } from '../_lib/kinds'

// « Chez nous » — the home card, written ONCE per household and shown on every invitation
// to a home rencontre: dog, pool, screens, nut-free, a free line. It answers the question
// the other parent is too polite to ask.
//   GET /api/home-card → { card: HomeCard | null }
//   PUT /api/home-card → the whole card (validated to a fixed shape)
export const onRequestGet = authed(async (ctx, actor) => {
  const row = await ctx.env.DB.prepare('SELECT details FROM home_cards WHERE household_id = ?').bind(actor.householdId).first<{ details: string }>()
  return ok({ card: homeCardOrNull(row?.details) })
})

export const onRequestPut = authed(async (ctx, actor) => {
  const body = await readJson<unknown>(ctx.request)
  const card = cleanHomeCard(body)
  const ts = nowSec()
  await ctx.env.DB.prepare(
    'INSERT INTO home_cards (household_id, details, updated_at) VALUES (?, ?, ?) ON CONFLICT(household_id) DO UPDATE SET details = excluded.details, updated_at = excluded.updated_at',
  )
    .bind(actor.householdId, JSON.stringify(card), ts)
    .run()
  return ok({ card: homeCardOrNull(JSON.stringify(card)) })
})
