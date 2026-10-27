// The deploy target. Non-/api/* → the built SPA from the ASSETS binding; /api/* →
// worker/routes.ts, with the CSRF gate and an error boundary inline. Handlers are
// Pages-Functions-shaped (ctx.request / env / params), adapted here.

import type { Env } from '../functions/_lib/env'
import { verifyCsrf } from '../functions/_lib/auth'
import { forbidden, notFound, serverError } from '../functions/_lib/json'
import { withSecurityHeaders } from '../functions/_lib/securityHeaders'
import { csrfExempt, matchRoute, type RouteMod } from './routes'

type WorkerEnv = Env & { ASSETS: Fetcher }

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const METHOD_EXPORT: Record<string, keyof RouteMod> = {
  GET: 'onRequestGet',
  HEAD: 'onRequestGet',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  PATCH: 'onRequestPatch',
  DELETE: 'onRequestDelete',
}

const app = {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

    // Force HTTPS in prod (a home-screen PWA added from a typed http:// address would
    // otherwise run in a non-secure context). ENVIRONMENT=development marks local dev,
    // where wrangler presents the prod host even locally.
    const isLocal = env.ENVIRONMENT === 'development' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol === 'http:' && !isLocal) {
      url.protocol = 'https:'
      return Response.redirect(url.toString(), 301)
    }

    const path = url.pathname.replace(/^\/+/, '')
    if (!path.startsWith('api/')) {
      const res = await env.ASSETS.fetch(request)
      // A hashed asset that is gone is a 404, never the SPA shell: a stale shell that gets
      // index.html under a .js URL boots blank forever.
      if (path.startsWith('assets/') && res.headers.get('content-type')?.includes('text/html')) {
        return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
      }
      return res
    }

    const apiPath = path.slice('api/'.length)
    if (!SAFE_METHODS.has(request.method) && !csrfExempt(apiPath) && !verifyCsrf(request)) {
      return forbidden('Jeton CSRF manquant ou invalide.')
    }

    const matched = matchRoute(apiPath)
    if (!matched) return notFound()
    const handler = matched.mod[METHOD_EXPORT[request.method] ?? 'onRequest'] ?? matched.mod.onRequest
    if (!handler) return new Response(JSON.stringify({ error: 'Méthode non permise.' }), { status: 405, headers: { 'content-type': 'application/json; charset=utf-8' } })

    const context: EventContext<Env, string, Record<string, never>> = {
      request,
      env,
      params: matched.params,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: ctx.passThroughOnException.bind(ctx),
      next: async () => notFound(),
      data: {},
      functionPath: '/' + path,
    }
    try {
      return await handler(context)
    } catch (err) {
      console.error(`[${request.method} /${path}]`, err)
      return serverError()
    }
  },
} satisfies ExportedHandler<WorkerEnv>

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return withSecurityHeaders(await app.fetch(request, env, ctx))
  },
} satisfies ExportedHandler<WorkerEnv>
