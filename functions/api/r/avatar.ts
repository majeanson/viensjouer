import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode } from '../../_lib/ids'
import { serveSouvenir } from '../../_lib/photos'

// GET /api/r/<code>/avatar/<child|cochild|parent> — the faces of whoever invites: the host's child for this
// rencontre (and the second one when two children host), and the household's first parent. Same capability as the card, nothing else.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  const who = ctx.params.who as string | undefined
  if (!code || (who !== 'child' && who !== 'cochild' && who !== 'parent')) return lookupMiss(ctx.env, ctx.request)
  const row = await ctx.env.DB.prepare(
    `SELECT c.photo_key AS child_key, (SELECT photo_key FROM children WHERE id = e.co_child_id) AS co_key,
            (SELECT photo_key FROM parents p WHERE p.household_id = e.household_id ORDER BY p.created_at LIMIT 1) AS parent_key
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN children c ON c.id = e.child_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<{ child_key: string | null; co_key: string | null; parent_key: string | null }>()
  if (!row) return lookupMiss(ctx.env, ctx.request)
  const key = who === 'child' ? row.child_key : who === 'cochild' ? row.co_key : row.parent_key
  if (!key) return new Response('Not found', { status: 404 })
  return serveSouvenir(ctx.env, key)
}
