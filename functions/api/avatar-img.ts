import { notFound } from '../_lib/json'
import { authed } from '../_lib/route'
import { serveSouvenir } from '../_lib/photos'

// GET /api/avatar/<child|parent>/<childId|me> — my own copy. Another household gets the same 404.
export const onRequestGet = authed(async (ctx, actor) => {
  const kind = ctx.params.kind as string | undefined
  const id = ctx.params.id as string | undefined
  let key: string | null | undefined
  if (kind === 'child' && id) {
    key = (await ctx.env.DB.prepare('SELECT photo_key FROM children WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first<{ photo_key: string | null }>())?.photo_key
  } else if (kind === 'parent') {
    key = (await ctx.env.DB.prepare('SELECT photo_key FROM parents WHERE email = ?').bind(actor.email).first<{ photo_key: string | null }>())?.photo_key
  }
  if (!key) return notFound()
  return serveSouvenir(ctx.env, key)
})
