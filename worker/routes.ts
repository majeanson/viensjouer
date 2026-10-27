// The route table: path after "api/" → handler module. A Worker has one fetch handler, so
// file paths are not routing — adding an endpoint needs the handler file AND a row here.
// A `:name` segment captures into ctx.params; rows are tried in order, so put the more
// specific pattern (r/:token/ics) before the general one (r/:token).

import type { Env } from '../functions/_lib/env'
import * as health from '../functions/api/health'
import * as authSignup from '../functions/api/auth/signup'
import * as authLogin from '../functions/api/auth/login'
import * as authLogout from '../functions/api/auth/logout'
import * as authMe from '../functions/api/auth/me'
import * as children from '../functions/api/children'
import * as families from '../functions/api/families'
import * as encounters from '../functions/api/encounters'
import * as messages from '../functions/api/messages'
import * as invitations from '../functions/api/invitations'
import * as replyCard from '../functions/api/r/[token]'
import * as replyIcs from '../functions/api/r/ics'
import * as replyClaim from '../functions/api/r/claim'
import * as authForgot from '../functions/api/auth/forgot'
import * as authReset from '../functions/api/auth/reset'
import * as circle from '../functions/api/circle'
import * as groups from '../functions/api/groups'
import * as windows from '../functions/api/windows'
import * as calendar from '../functions/api/calendar'
import * as windowReply from '../functions/api/w/[token]'

export type RouteMod = Partial<Record<'onRequest' | 'onRequestGet' | 'onRequestPost' | 'onRequestPatch' | 'onRequestPut' | 'onRequestDelete', PagesFunction<Env>>>

const TABLE: ReadonlyArray<readonly [pattern: string, mod: RouteMod]> = [
  ['health', health],
  ['auth/signup', authSignup],
  ['auth/login', authLogin],
  ['auth/logout', authLogout],
  ['auth/me', authMe],
  ['children', children],
  ['families', families],
  ['encounters', encounters],
  ['messages', messages],
  ['invitations', invitations],
  ['auth/forgot', authForgot],
  ['auth/reset', authReset],
  ['circle', circle],
  ['groups', groups],
  ['windows', windows],
  ['calendar', calendar],
  ['w/:token', windowReply],
  ['r/:token/ics', replyIcs],
  ['r/:token/claim', replyClaim],
  ['r/:token', replyCard],
]

export function matchRoute(apiPath: string): { mod: RouteMod; params: Record<string, string> } | null {
  const segs = apiPath.replace(/\/+$/, '').split('/')
  for (const [pattern, mod] of TABLE) {
    const parts = pattern.split('/')
    if (parts.length !== segs.length) continue
    const params: Record<string, string> = {}
    let okMatch = true
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i])
      else if (parts[i] !== segs[i]) {
        okMatch = false
        break
      }
    }
    if (okMatch) return { mod, params }
  }
  return null
}

// State-changing endpoints with no cookie to double-submit: the two sign-in doors, and
// every reply-link write (the token in the path is the credential, and the invited
// parent has no session by design).
export function csrfExempt(apiPath: string): boolean {
  return apiPath === 'auth/login' || apiPath === 'auth/signup' || apiPath === 'auth/forgot' || apiPath === 'auth/reset' || apiPath.startsWith('r/') || apiPath.startsWith('w/')
}
