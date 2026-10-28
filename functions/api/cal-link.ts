import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { newId } from '../_lib/ids'
import { isDemoEmail } from '../_lib/demo'
import { forbidden } from '../_lib/json'

// « Mon calendrier » — the secret behind the host's feed (feed.ts).
//   GET    /api/cal-link → { token | null }
//   POST   /api/cal-link → make or ROTATE it (the old link stops working at once)
//   DELETE /api/cal-link → switch the feed off
export const onRequestGet = authed(async (ctx, actor) => {
  const row = await ctx.env.DB.prepare('SELECT cal_token FROM households WHERE id = ?').bind(actor.householdId).first<{ cal_token: string | null }>()
  return ok({ token: row?.cal_token ?? null })
})

export const onRequestPost = authed(async (ctx, actor) => {
  if (isDemoEmail(actor.email)) return forbidden('Pas dans l’essai : crée ton compte d’abord.')
  const token = newId(24)
  await ctx.env.DB.prepare('UPDATE households SET cal_token = ? WHERE id = ?').bind(token, actor.householdId).run()
  return ok({ token })
})

export const onRequestDelete = authed(async (ctx, actor) => {
  await ctx.env.DB.prepare('UPDATE households SET cal_token = NULL WHERE id = ?').bind(actor.householdId).run()
  return ok()
})
