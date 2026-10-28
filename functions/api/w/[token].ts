import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { badRequest, ok, readJson, str, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode, nowSec } from '../../_lib/ids'

// The install-free side of « une fenêtre ouverte ». The code in the path is the whole
// credential (one window, one family); no cookie, no CSRF (worker/routes.ts exempts `w/`).
//   GET  /api/w/<code>  → the offer, and this family's current answer
//   POST /api/w/<code>  → { reply: 'yes' | 'no', note? } — « on se voit ! » or not this time
interface Row {
  id: string
  starts_at: number
  ends_at: number
  note: string | null
  reply: 'yes' | 'no' | null
  reply_note: string | null
  host_child: string
  host_parent: string | null
  household_name: string
  child_first_name: string
  parent_name: string
  tz: string
}

async function resolve(env: Env, raw: string | undefined): Promise<Row | null> {
  const code = normalizeLinkCode(raw)
  if (!code) return null
  return env.DB.prepare(
    `SELECT t.id, w.starts_at, w.ends_at, w.note, t.reply, t.reply_note,
            c.first_name AS host_child, h.name AS household_name, h.tz,
            (SELECT display_name FROM parents p WHERE p.household_id = w.household_id ORDER BY p.created_at LIMIT 1) AS host_parent,
            f.child_first_name, f.parent_name
       FROM window_targets t
       JOIN open_windows w ON w.id = t.window_id
       JOIN friend_families f ON f.id = t.friend_family_id
       JOIN children c ON c.id = w.child_id
       JOIN households h ON h.id = w.household_id
      WHERE t.token = ? AND w.deleted_at IS NULL`,
  )
    .bind(code)
    .first<Row>()
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return lookupMiss(ctx.env, ctx.request)
  return ok({
    alive: r.ends_at > nowSec(),
    window: { starts_at: r.starts_at, ends_at: r.ends_at, note: r.note },
    host: { child_first_name: r.host_child, parent_name: r.host_parent ?? '', household_name: r.household_name, tz: r.tz },
    you: { child_first_name: r.child_first_name, parent_name: r.parent_name, reply: r.reply, replyNote: r.reply_note },
  })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const r = await resolve(ctx.env, ctx.params.token as string | undefined)
  if (!r) return lookupMiss(ctx.env, ctx.request)
  if (r.ends_at <= nowSec()) return badRequest('Cette fenêtre est passée.')
  const body = await readJson<{ reply?: string; note?: string | null }>(ctx.request)
  if (body?.reply !== 'yes' && body?.reply !== 'no') return badRequest('Réponse inconnue.')
  await ctx.env.DB.prepare('UPDATE window_targets SET reply = ?, reply_note = ?, reply_at = ? WHERE id = ?').bind(body.reply, str(body.note, 500), nowSec(), r.id).run()
  return ok()
}
