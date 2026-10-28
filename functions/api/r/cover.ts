import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode } from '../../_lib/ids'
import { serveSouvenir } from '../../_lib/photos'

// GET /api/r/<code>/cover — the rencontre's cover picture, for any family holding a live code (it is the
// invitation's picture, not private). The picture must belong to THE SAME rencontre as the code.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!code) return lookupMiss(ctx.env, ctx.request)
  const row = await ctx.env.DB.prepare(
    'SELECT e.cover_key FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE i.token = ? AND e.deleted_at IS NULL',
  )
    .bind(code)
    .first<{ cover_key: string | null }>()
  if (!row) return lookupMiss(ctx.env, ctx.request)
  if (!row.cover_key) return new Response('Not found', { status: 404 })
  return serveSouvenir(ctx.env, row.cover_key)
}
