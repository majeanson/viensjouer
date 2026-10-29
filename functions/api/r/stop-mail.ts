import type { Env } from '../../_lib/env'
import { lockedOut, lookupMiss } from '../../_lib/guessLimit'
import { ok, readJson, tooManyRequests } from '../../_lib/json'
import { overAuthLimit } from '../../_lib/rateLimit'
import { normalizeLinkCode, nowSec } from '../../_lib/ids'

// « Ne plus recevoir de courriels » (CASL). The link in every email to a friend family opens /stop/<code>; that page reads
// the state here and confirms with a POST. The same POST is the one-click `List-Unsubscribe` target mail apps use, so a body
// of `List-Unsubscribe=One-Click` (not JSON) means stop. The code is the credential: an invitation's or a window's.
//   GET  /api/r/<code>/stop-mail → { stopped }
//   POST /api/r/<code>/stop-mail → { stop?: boolean }  (default true; false takes it back)
async function familyOf(env: Env, raw: string | undefined): Promise<{ id: string; stopped: boolean } | null> {
  const code = normalizeLinkCode(raw)
  if (!code) return null
  const row =
    (await env.DB.prepare('SELECT f.id, f.mail_stopped_at AS s FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.token = ? AND f.deleted_at IS NULL').bind(code).first<{ id: string; s: number | null }>()) ??
    (await env.DB.prepare('SELECT f.id, f.mail_stopped_at AS s FROM window_targets t JOIN friend_families f ON f.id = t.friend_family_id WHERE t.token = ? AND f.deleted_at IS NULL').bind(code).first<{ id: string; s: number | null }>())
  return row ? { id: row.id, stopped: row.s !== null } : null
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const f = await familyOf(ctx.env, ctx.params.token as string | undefined)
  if (!f) return lookupMiss(ctx.env, ctx.request)
  return ok({ stopped: f.stopped })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if ((await overAuthLimit(ctx.env, ctx.request)) || (await lockedOut(ctx.env, ctx.request))) return tooManyRequests()
  const f = await familyOf(ctx.env, ctx.params.token as string | undefined)
  if (!f) return lookupMiss(ctx.env, ctx.request)
  const body = (ctx.request.headers.get('content-type') ?? '').includes('json') ? await readJson<{ stop?: boolean }>(ctx.request) : null
  const stop = body?.stop !== false
  await ctx.env.DB.prepare('UPDATE friend_families SET mail_stopped_at = ?, updated_at = ? WHERE id = ?').bind(stop ? nowSec() : null, nowSec(), f.id).run()
  return ok({ stopped: stop })
}
