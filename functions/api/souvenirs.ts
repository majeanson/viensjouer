import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { storeSouvenir } from '../_lib/photos'

// « Souvenirs » — the host's side. A photo of the day, back to the families who said yes.
//   GET    /api/souvenirs?encounter=<id>  → [{ id, author_label, created_at }]
//   POST   /api/souvenirs?encounter=<id>  → the image bytes as the body (JPEG/PNG/WebP, ≤ 3 MB)
//   DELETE /api/souvenirs { id }          → remove one (and its blob)
// The bytes are served by GET /api/souvenirs/<id> (souvenir-img.ts).
async function ownEncounter(db: D1Database, id: string | null, householdId: string) {
  if (!id) return null
  return db.prepare('SELECT id FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, householdId).first<{ id: string }>()
}

export const onRequestGet = authed(async (ctx, actor) => {
  const enc = new URL(ctx.request.url).searchParams.get('encounter')
  if (!(await ownEncounter(ctx.env.DB, enc, actor.householdId))) return notFound()
  const { results } = await ctx.env.DB.prepare('SELECT id, author_kind, author_label, created_at FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL ORDER BY created_at').bind(enc).all()
  return ok({ souvenirs: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const enc = new URL(ctx.request.url).searchParams.get('encounter')
  if (!(await ownEncounter(ctx.env.DB, enc, actor.householdId))) return notFound()
  const r = await storeSouvenir(ctx.env, ctx.request, enc!, { kind: 'host', label: actor.displayName }, nowSec())
  if (!r.ok) return new Response(JSON.stringify({ error: r.message }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  return created({ id: r.id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  const id = str(body?.id, 20)
  if (!id) return badRequest('id requis.')
  const row = await ctx.env.DB.prepare(
    'SELECT s.media_key FROM souvenirs s JOIN encounters e ON e.id = s.encounter_id WHERE s.id = ? AND e.household_id = ? AND s.deleted_at IS NULL',
  )
    .bind(id, actor.householdId)
    .first<{ media_key: string }>()
  if (!row) return notFound()
  await ctx.env.DB.prepare('UPDATE souvenirs SET deleted_at = ? WHERE id = ?').bind(nowSec(), id).run()
  await ctx.env.PHOTOS?.delete(row.media_key).catch(() => {})
  return ok()
})
