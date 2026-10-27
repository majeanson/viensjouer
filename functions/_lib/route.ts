// Handler plumbing: the one place that knows how a signed-in endpoint is wired.
// `authed()` makes the guard structural — a handler cannot get an `actor` without
// having passed auth — and adds the error boundary (a thrown D1 error is a clean 500
// with a server-side log, never a leaked stack).

import type { Env, Ctx } from './env'
import { currentParent } from './auth'
import { serverError, unauthorized } from './json'

export interface Actor {
  householdId: string
  email: string
  displayName: string
}

export type ActorHandler = (ctx: Ctx, actor: Actor) => Response | Promise<Response>

export function authed(handler: ActorHandler): PagesFunction<Env> {
  return async (ctx) => {
    try {
      const parent = await currentParent(ctx.env, ctx.request)
      if (!parent) return unauthorized()
      return await handler(ctx as unknown as Ctx, parent)
    } catch (err) {
      console.error(`[${ctx.request.method} ${new URL(ctx.request.url).pathname}]`, err)
      return serverError()
    }
  }
}
