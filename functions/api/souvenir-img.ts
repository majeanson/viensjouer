import { notFound } from '../_lib/json'
import { authed } from '../_lib/route'
import { serveSouvenir } from '../_lib/photos'

// GET /api/souvenirs/<id> — the host's copy of a photo. The household must own the
// rencontre it belongs to; anyone else gets the same 404 as a missing photo.
export const onRequestGet = authed(async (ctx, actor) => {
  const id = ctx.params.id as string | undefined
  if (!id) return notFound()
  const row = await ctx.env.DB.prepare(
    'SELECT s.media_key FROM souvenirs s JOIN encounters e ON e.id = s.encounter_id WHERE s.id = ? AND e.household_id = ? AND s.deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string }>()
  if (!row) return notFound()
  return serveSouvenir(ctx.env, row.media_key)
})
