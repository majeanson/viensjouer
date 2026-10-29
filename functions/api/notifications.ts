import { ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { nowSec } from '../_lib/ids'

// « Nouveau »: what the signed-in parent has been told and has not read yet. Same list for the page and for the phone.
//   GET  /api/notifications            → { notifications: [...], unread }    (unread, last 30 days, newest first, 20 at most)
//   GET  /api/notifications?push=1     → the ones not yet shown as a phone notification (the service worker calls this when
//                                        a push wakes it), and stamps them shown so they never show twice
//   POST /api/notifications { id }     → mark one read;  { readAll: true } → mark all read
const DAY = 86_400

export const onRequestGet = authed(async (ctx, actor) => {
  const now = nowSec()
  const push = new URL(ctx.request.url).searchParams.get('push') === '1'
  const { results } = await ctx.env.DB.prepare(
    push
      ? 'SELECT id, kind, title, body, url, created_at FROM notifications WHERE email = ? AND read_at IS NULL AND pushed_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 5'
      : 'SELECT id, kind, title, body, url, created_at FROM notifications WHERE email = ? AND read_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 20',
  )
    .bind(actor.email, now - (push ? 3600 : 30 * DAY))
    .all<{ id: string }>()
  if (push && results.length) await ctx.env.DB.prepare(`UPDATE notifications SET pushed_at = ? WHERE id IN (${results.map(() => '?').join(',')})`).bind(now, ...results.map((r) => r.id)).run()
  return ok({ notifications: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string; readAll?: boolean }>(ctx.request)
  const now = nowSec()
  if (body?.readAll === true) await ctx.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE email = ? AND read_at IS NULL').bind(now, actor.email).run()
  else {
    const id = str(body?.id, 30)
    if (id) await ctx.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND email = ? AND read_at IS NULL').bind(now, id, actor.email).run()
  }
  return ok()
})
