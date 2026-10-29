import { badRequest, ok, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { lastGuestIds } from '../_lib/lastGuests'

// « Les mêmes familles que la dernière fois » — GET /api/last-guests?child=<id> → { familyIds }.
export const onRequestGet = authed(async (ctx, actor) => {
  const child = str(new URL(ctx.request.url).searchParams.get('child'), 20)
  if (!child) return badRequest('child requis.')
  return ok({ familyIds: await lastGuestIds(ctx.env, actor.householdId, child, nowSec()) })
})
