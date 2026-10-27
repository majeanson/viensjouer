import type { Env } from '../../_lib/env'
import { notFound, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode, nowSec } from '../../_lib/ids'
import { souvenirsVisible } from '../../_lib/kinds'
import { serveSouvenir } from '../../_lib/photos'
import type { Reply, Status } from '../../_lib/encounters'

// GET /api/r/<code>/photo/<id> — a family that said yes sees the day's photos. The photo
// must belong to THE SAME rencontre as the code, so one code cannot walk into another
// rencontre's pictures.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (await overAuthLimit(ctx.env, ctx.request)) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  const id = ctx.params.id as string | undefined
  if (!code || !id) return notFound()
  const row = await ctx.env.DB.prepare(
    `SELECT e.starts_at, e.status, i.reply, s.media_key
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id JOIN souvenirs s ON s.encounter_id = e.id
      WHERE i.token = ? AND s.id = ? AND s.deleted_at IS NULL AND e.deleted_at IS NULL`,
  )
    .bind(code, id)
    .first<{ starts_at: number; status: Status; reply: Reply | null; media_key: string }>()
  if (!row || !souvenirsVisible(row, row.reply, nowSec())) return notFound()
  return serveSouvenir(ctx.env, row.media_key)
}
