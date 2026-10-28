import { ok } from '../_lib/json'
import { authed } from '../_lib/route'

// GET /api/places — where this household has met before, most used first, each with the map link and
// address it used last. « Où » then completes itself; picking one fills the map link in. Nothing here
// leaves the household.
interface Row {
  place: string
  map_url: string | null
  address: string | null
  kind: string
}
export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare(
    "SELECT place, map_url, address, kind FROM encounters WHERE household_id = ? AND deleted_at IS NULL AND place IS NOT NULL AND place != '' ORDER BY starts_at DESC LIMIT 300",
  )
    .bind(actor.householdId)
    .all<Row>()
  const byName = new Map<string, { place: string; map_url: string | null; address: string | null; kind: string; n: number }>()
  for (const r of results) {
    const k = r.place.trim().toLowerCase()
    const cur = byName.get(k)
    if (!cur) byName.set(k, { place: r.place.trim(), map_url: r.map_url, address: r.address, kind: r.kind, n: 1 })
    else {
      cur.n++
      // rows come newest first: keep the newest, fill the gaps from older ones
      cur.map_url ??= r.map_url
      cur.address ??= r.address
    }
  }
  const places = [...byName.values()].sort((a, b) => b.n - a.n).slice(0, 15).map(({ n: _n, ...p }) => p)
  return ok({ places })
})
