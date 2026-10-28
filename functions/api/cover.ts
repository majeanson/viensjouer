import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { storeCover } from '../_lib/photos'

// « Une image pour la rencontre » — the host's cover picture. Optional like every photo.
//   POST   /api/cover?encounter=<id>   → the image bytes as the body (JPEG/PNG/WebP, ≤ 3 MB); replaces the last
//   DELETE /api/cover { encounter }    → remove it (and its blob)
// The bytes are served by GET /api/cover/<encounterId> (cover-img.ts) and, to an invited family, by
// GET /api/r/<code>/cover (r/cover.ts).
async function own(db: D1Database, id: string | null, householdId: string) {
  if (!id) return null
  return db.prepare('SELECT id, cover_key FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, householdId).first<{ id: string; cover_key: string | null }>()
}

export const onRequestPost = authed(async (ctx, actor) => {
  const enc = new URL(ctx.request.url).searchParams.get('encounter')
  if (!(await own(ctx.env.DB, enc, actor.householdId))) return notFound()
  const r = await storeCover(ctx.env, ctx.request, enc!, nowSec())
  if (!r.ok) return new Response(JSON.stringify({ error: r.message }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  return created({ cover: r.id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ encounter?: string }>(ctx.request)
  const id = str(body?.encounter, 20)
  if (!id) return badRequest('encounter requis.')
  const row = await own(ctx.env.DB, id, actor.householdId)
  if (!row) return notFound()
  await ctx.env.DB.prepare('UPDATE encounters SET cover_key = NULL, updated_at = ? WHERE id = ?').bind(nowSec(), id).run()
  if (row.cover_key) await ctx.env.PHOTOS?.delete(row.cover_key).catch(() => {})
  return ok()
})
