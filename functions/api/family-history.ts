import { badRequest, ok, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// « Déjà ensemble » — GET /api/family-history?id=<friend family>: the last few rencontres this family said yes to
// and that already happened, newest first. Titles and dates only; never a count, a rank or an address.
export const onRequestGet = authed(async (ctx, actor) => {
  const id = str(new URL(ctx.request.url).searchParams.get('id'), 20)
  if (!id) return badRequest('id requis.')
  const { results } = await ctx.env.DB.prepare(
    `SELECT e.id, e.title, e.kind, e.starts_at AS startsAt, e.place
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
      WHERE i.friend_family_id = ? AND f.household_id = ? AND e.household_id = ?
        AND i.reply = 'yes' AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at < ?
      ORDER BY e.starts_at DESC
      LIMIT 5`,
  )
    .bind(id, actor.householdId, actor.householdId, nowSec())
    .all()
  return ok({ past: results })
})
