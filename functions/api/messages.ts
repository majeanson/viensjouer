import { badRequest, created, notFound, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId, nowSec } from '../_lib/ids'

// The host's side of a card's thread. POST { encounterId, text }. The invited side
// writes through its link (functions/api/r/[token].ts).
export const onRequestPost = authed(async (ctx, actor) => {
  const body = await readJson<{ encounterId?: string; text?: string }>(ctx.request)
  const encounterId = str(body?.encounterId, 20)
  const text = str(body?.text, 1000)
  if (!encounterId || !text) return badRequest('Un message vide, ça ne part pas.')
  const own = await ctx.env.DB.prepare('SELECT id FROM encounters WHERE id = ? AND household_id = ? AND deleted_at IS NULL').bind(encounterId, actor.householdId).first()
  if (!own) return notFound()
  const id = newId()
  await ctx.env.DB.prepare('INSERT INTO encounter_messages (id, encounter_id, author_kind, author_label, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, encounterId, 'host', actor.displayName, text, nowSec())
    .run()
  return created({ id })
})
