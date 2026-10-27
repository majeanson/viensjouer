import { forbidden, ok, readJson } from '../_lib/json'
import { authed } from '../_lib/route'
import { isDemoEmail } from '../_lib/demo'
import { newId, nowSec } from '../_lib/ids'

// « Inviter l'autre parent » — host side. A one-use, seven-day link that adds a second
// parent to THIS household (they get their own email and password; both see the same
// children, families and rencontres).
//   GET    /api/parent-invite → { invites: [{ id, token, expires_at }] } (the open ones)
//   POST   /api/parent-invite → mint (at most 3 open at once)
//   DELETE /api/parent-invite { id } → withdraw
export const INVITE_TTL_SEC = 7 * 24 * 3600
const MAX_OPEN = 3

export const onRequestGet = authed(async (ctx, actor) => {
  const { results } = await ctx.env.DB.prepare('SELECT id, token, expires_at FROM parent_invites WHERE household_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at').bind(actor.householdId, nowSec()).all()
  return ok({ invites: results })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas d’invitation en mode essai.')
  const now = nowSec()
  const open = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM parent_invites WHERE household_id = ? AND used_at IS NULL AND expires_at > ?').bind(actor.householdId, now).first<{ n: number }>()
  if ((open?.n ?? 0) >= MAX_OPEN) return forbidden('Trois liens ouverts au plus — retire-en un d’abord.')
  const token = newId(32)
  await ctx.env.DB.prepare('INSERT INTO parent_invites (id, household_id, token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), actor.householdId, token, actor.email, now, now + INVITE_TTL_SEC).run()
  return ok({ token })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  const body = await readJson<{ id?: string }>(ctx.request)
  if (typeof body?.id === 'string') await ctx.env.DB.prepare('DELETE FROM parent_invites WHERE id = ? AND household_id = ?').bind(body.id, actor.householdId).run()
  return ok()
})
