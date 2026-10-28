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
import * as homeCard from '../functions/api/home-card'
import * as demo from '../functions/api/demo'
import * as demoClaim from '../functions/api/demo-claim'
import * as household from '../functions/api/household'
import * as exportData from '../functions/api/export'
import * as join from '../functions/api/join'
import * as parentInvite from '../functions/api/parent-invite'
import * as relais from '../functions/api/relais'
import * as avatar from '../functions/api/avatar'
import * as avatarImg from '../functions/api/avatar-img'
import * as replyAvatar from '../functions/api/r/avatar'
import * as profile from '../functions/api/profile'
import * as testMail from '../functions/api/test-mail'
import * as familyHistory from '../functions/api/family-history'
import * as bring from '../functions/api/bring'
import * as replyBring from '../functions/api/r/bring'
import * as feed from '../functions/api/feed'
import * as calLink from '../functions/api/cal-link'
import * as thanks from '../functions/api/thanks'
import * as places from '../functions/api/places'
import * as cover from '../functions/api/cover'
import * as coverImg from '../functions/api/cover-img'
import * as replyCover from '../functions/api/r/cover'
import * as souvenirs from '../functions/api/souvenirs'
import * as souvenirImg from '../functions/api/souvenir-img'
import * as replyPhoto from '../functions/api/r/photo'
import * as replyPhotoImg from '../functions/api/r/photo-img'

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
  ['home-card', homeCard],
  ['demo', demo],
  ['demo/claim', demoClaim],
  ['household', household],
  ['export', exportData],
  ['join', join],
  ['parent-invite', parentInvite],
  ['relais', relais],
  ['avatar', avatar],
  ['avatar/:kind/:id', avatarImg],
  ['profile', profile],
  ['test-mail', testMail],
  ['family-history', familyHistory],
  ['bring', bring],
  ['feed/:token', feed],
  ['cal-link', calLink],
  ['thanks', thanks],
  ['places', places],
  ['cover', cover],
  ['cover/:id', coverImg],
  ['souvenirs', souvenirs],
  ['souvenirs/:id', souvenirImg],
  ['r/:token/ics', replyIcs],
  ['r/:token/cover', replyCover],
  ['r/:token/avatar/:who', replyAvatar],
  ['r/:token/bring', replyBring],
  ['r/:token/photo/:id', replyPhotoImg],
  ['r/:token/photo', replyPhoto],
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
  return apiPath === 'auth/login' || apiPath === 'auth/signup' || apiPath === 'auth/forgot' || apiPath === 'demo' || apiPath === 'join' || apiPath === 'auth/reset' || apiPath.startsWith('r/') || apiPath.startsWith('w/')
}
