import { notFound } from '../_lib/json'
import { authed } from '../_lib/route'
import { serveSouvenir } from '../_lib/photos'

// GET /api/cover/<encounterId> — the host's copy of the cover. Another household gets the same 404.
export const onRequestGet = authed(async (ctx, actor) => {
  const id = ctx.params.id as string | undefined
  if (!id) return notFound()
  const row = await ctx.env.DB.prepare('SELECT cover_key FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first<{ cover_key: string | null }>()
  if (!row?.cover_key) return notFound()
  return serveSouvenir(ctx.env, row.cover_key)
})
