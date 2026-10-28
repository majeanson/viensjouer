import { badRequest, ok, readJson, str } from '../_lib/json'
import { authed } from '../_lib/route'

// « Mon nom » — the first name shown on the invitations I send. PATCH /api/profile { displayName }.
export const onRequestPatch = authed(async (ctx, actor) => {
  const body = await readJson<{ displayName?: string }>(ctx.request)
  const name = str(body?.displayName, 60)
  if (!name) return badRequest('Il faut un prénom.')
  await ctx.env.DB.prepare('UPDATE parents SET display_name = ? WHERE email = ?').bind(name, actor.email).run()
  return ok()
})
