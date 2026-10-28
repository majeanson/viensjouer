import { badRequest, created, notFound, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'
import { storeAvatar } from '../_lib/photos'

// « Une photo pour chaque visage » — a child's, or mine. Optional like every photo.
//   POST   /api/avatar?kind=child&id=<childId>   the image bytes (a small square JPEG, ≤ 400 KB)
//   POST   /api/avatar?kind=parent               mine
//   DELETE /api/avatar { kind, id? }
// Served to me at GET /api/avatar/<kind>/<id|me>, and to a family holding a live code at
// GET /api/r/<code>/avatar/<child|parent> (the invitation shows who is inviting).
async function target(db: D1Database, kind: string | null, id: string | null, actor: { householdId: string; email: string }) {
  if (kind === 'child' && id) {
    const row = await db.prepare('SELECT photo_key FROM children WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(id, actor.householdId).first<{ photo_key: string | null }>()
    if (!row) return null
    return {
      old: row.photo_key,
      save: (key: string | null) => db.prepare('UPDATE children SET photo_key = ?, updated_at = ? WHERE id = ?').bind(key, nowSec(), id).run().then(() => undefined),
    }
  }
  if (kind === 'parent') {
    const row = await db.prepare('SELECT photo_key FROM parents WHERE email = ?').bind(actor.email).first<{ photo_key: string | null }>()
    if (!row) return null
    return {
      old: row.photo_key,
      save: (key: string | null) => db.prepare('UPDATE parents SET photo_key = ? WHERE email = ?').bind(key, actor.email).run().then(() => undefined),
    }
  }
  return null
}

export const onRequestPost = authed(async (ctx, actor) => {
  const q = new URL(ctx.request.url).searchParams
  const t = await target(ctx.env.DB, q.get('kind'), q.get('id'), actor)
  if (!t) return notFound()
  const r = await storeAvatar(ctx.env, ctx.request, actor.householdId, t.old, (key) => t.save(key))
  if (!r.ok) return new Response(JSON.stringify({ error: r.message }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  return created({ photo: r.id })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ kind?: string; id?: string }>(ctx.request)
  const kind = str(body?.kind, 10)
  if (!kind) return badRequest('kind requis.')
  const t = await target(ctx.env.DB, kind, str(body?.id, 20), actor)
  if (!t) return notFound()
  await t.save(null)
  if (t.old) await ctx.env.PHOTOS?.delete(t.old).catch(() => {})
  return ok()
})
