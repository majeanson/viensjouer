import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { badRequest, ok, readJson, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode, nowSec } from '../../_lib/ids'
import { linkAlive, type Status } from '../../_lib/encounters'

// POST /api/r/<code>/slots { slot, on } — a family ticks (or un-ticks) a time that suits it. Only « can », never « cannot ».
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const code = normalizeLinkCode(ctx.params.token as string | undefined)
  if (!code) return lookupMiss(ctx.env, ctx.request)
  const row = await ctx.env.DB.prepare(
    `SELECT i.id AS inv_id, e.id AS enc_id, e.starts_at, e.ends_at, e.status
       FROM invitations i JOIN encounters e ON e.id = i.encounter_id WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<{ inv_id: string; enc_id: string; starts_at: number; ends_at: number | null; status: Status }>()
  if (!row) return lookupMiss(ctx.env, ctx.request)
  if (!linkAlive(row, nowSec())) return badRequest('Cette rencontre est passée ou annulée.')
  const body = await readJson<{ slot?: string; on?: boolean }>(ctx.request)
  const slot = str(body?.slot, 20)
  if (!slot || typeof body?.on !== 'boolean') return badRequest('Rien à faire.')
  const mine = await ctx.env.DB.prepare('SELECT id FROM encounter_slots WHERE id = ? AND encounter_id = ?').bind(slot, row.enc_id).first()
  if (!mine) return badRequest('Ce moment n’est plus proposé.')
  if (body.on) await ctx.env.DB.prepare('INSERT OR IGNORE INTO slot_votes (slot_id, invitation_id, created_at) VALUES (?, ?, ?)').bind(slot, row.inv_id, nowSec()).run()
  else await ctx.env.DB.prepare('DELETE FROM slot_votes WHERE slot_id = ? AND invitation_id = ?').bind(slot, row.inv_id).run()
  return ok()
}
