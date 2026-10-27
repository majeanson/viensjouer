import type { Env } from '../../_lib/env'
import { created, notFound, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode, nowSec } from '../../_lib/ids'
import { souvenirsVisible } from '../../_lib/kinds'
import { storeSouvenir } from '../../_lib/photos'
import type { Reply, Status } from '../../_lib/encounters'

// POST /api/r/<code>/photo — a family that SAID YES adds a photo of the day (the image
// bytes as the body). The code is the credential; the answer must be yes and the
// rencontre under way or past (souvenirsVisible), within 60 days. No cookie, no CSRF.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!code) return notFound('Ce lien ne mène nulle part.')
  const row = await ctx.env.DB.prepare(
    `SELECT e.id, e.starts_at, e.status, i.reply, f.parent_name
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN friend_families f ON f.id = i.friend_family_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<{ id: string; starts_at: number; status: Status; reply: Reply | null; parent_name: string }>()
  const now = nowSec()
  if (!row || !souvenirsVisible(row, row.reply, now)) return notFound('Ce lien ne mène nulle part.')
  const r = await storeSouvenir(ctx.env, ctx.request, row.id, { kind: 'guest', label: row.parent_name }, now)
  if (!r.ok) return new Response(JSON.stringify({ error: r.message }), { status: r.status, headers: { 'content-type': 'application/json; charset=utf-8' } })
  return created({ id: r.id })
}
