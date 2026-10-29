// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { realDb } from '../_lib/testDb'
import { sessionCookies, signInAs } from '../_lib/auth'
import { nowSec } from '../_lib/ids'
import * as notifications from './notifications'
import * as push from './push'
import * as encounters from './encounters'

afterEach(() => vi.unstubAllGlobals())

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let vapid: Record<string, string>
beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  vapid = { VAPID_PUBLIC_KEY: b64u(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)), VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), VAPID_SUBJECT: 'mailto:me@example.org' }
})

// Marc (host, h1) and Julie (a family with her own account, h2, linked from Marc's book).
function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'Host', 'America/Toronto', 1, 1), ('h2', 'Julie', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marc@x.org', 'h1', 'Marc', 'x', 'fr', 1), ('julie@x.org', 'h2', 'Julie', 'x', 'fr', 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('fj', 'h1', 'Julie', 'Léa', 'julie@x.org', 1, 1)`)
  return { ...r, env: { ...r.env, SESSION_SECRET: 'a-test-secret-of-at-least-32-characters-long' } as typeof r.env }
}
async function as(env: ReturnType<typeof seed>['env'], email: string) {
  const { session, csrf } = await signInAs(env, email)
  return sessionCookies(session, csrf).map((c) => c.split(';')[0]).join('; ')
}
const call = (mod: { onRequestGet?: unknown; onRequestPost?: unknown; onRequestDelete?: unknown }, method: 'Get' | 'Post' | 'Delete', env: ReturnType<typeof seed>['env'], cookie: string, path: string, body?: unknown) => {
  const fn = mod[`onRequest${method}` as 'onRequestGet'] as (c: unknown) => Promise<Response>
  return fn({ env, request: new Request(`https://x.test/api/${path}`, { method: method.toUpperCase(), headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), params: {}, waitUntil: () => {} })
}

describe('the account that is invited hears about it without any email being sent', () => {
  it('a rencontre created inviting a family whose email is a registered account puts « Marc t’invite » in that account’s Nouveau', async () => {
    const s = seed()
    const marc = await as(s.env, 'marc@x.org')
    const julie = await as(s.env, 'julie@x.org')
    const starts = nowSec() + 2 * 86_400
    const res = await call(encounters, 'Post', s.env, marc, 'encounters', { childId: 'c1', kind: 'park', title: 'Au parc', startsAt: starts, invite: ['fj'] })
    expect(res.status).toBe(201)
    const list = (await (await call(notifications, 'Get', s.env, julie, 'notifications')).json()) as { notifications: { id: string; kind: string; title: string; url: string }[] }
    expect(list.notifications.map((n) => [n.kind, n.title])).toEqual([['invited', 'Marc t’invite']])
    expect(list.notifications[0].url).toMatch(/^\/[a-z]+-[a-z]+$/)
    // and the host is not told about their own invitation
    expect(((await (await call(notifications, 'Get', s.env, marc, 'notifications')).json()) as { notifications: unknown[] }).notifications).toEqual([])
  })
})

describe('GET and POST /api/notifications', () => {
  it('lists my unread, marks one or all read, never another parent’s, and the phone gets each only once', async () => {
    const s = seed()
    const ins = (id: string, email: string, at: number) => s.db.exec(`INSERT INTO notifications (id, email, household_id, kind, title, created_at) VALUES ('${id}', '${email}', 'h1', 'test', 'T${id}', ${at})`)
    const now = nowSec()
    ins('n1', 'marc@x.org', now - 10)
    ins('n2', 'marc@x.org', now - 5)
    ins('n3', 'julie@x.org', now - 5)
    const marc = await as(s.env, 'marc@x.org')
    const titles = async (path = 'notifications') => ((await (await call(notifications, 'Get', s.env, marc, path)).json()) as { notifications: { title: string }[] }).notifications.map((n) => n.title)
    expect(await titles()).toEqual(['Tn2', 'Tn1'])
    expect(await titles('notifications?push=1')).toEqual(['Tn2', 'Tn1']) // the phone takes them...
    expect(await titles('notifications?push=1')).toEqual([]) // ...once
    expect(await titles()).toEqual(['Tn2', 'Tn1']) // the page still lists them until read
    await call(notifications, 'Post', s.env, marc, 'notifications', { id: 'n3' }) // not mine: ignored
    expect(((await (await call(notifications, 'Get', s.env, await as(s.env, 'julie@x.org'), 'notifications')).json()) as { notifications: unknown[] }).notifications).toHaveLength(1)
    await call(notifications, 'Post', s.env, marc, 'notifications', { id: 'n1' })
    expect(await titles()).toEqual(['Tn2'])
    await call(notifications, 'Post', s.env, marc, 'notifications', { readAll: true })
    expect(await titles()).toEqual([])
  })
  it('refuses a request with no session', async () => {
    const s = seed()
    expect((await call(notifications, 'Get', s.env, '', 'notifications')).status).toBe(401)
    expect((await call(push, 'Get', s.env, '', 'push')).status).toBe(401)
  })
})

describe('/api/push', () => {
  it('says whether push is switched on, remembers and forgets a device, refuses a bad endpoint', async () => {
    const s = seed()
    const marc = await as(s.env, 'marc@x.org')
    expect(((await (await call(push, 'Get', s.env, marc, 'push')).json()) as { enabled: boolean }).enabled).toBe(false)
    expect((await call(push, 'Post', s.env, marc, 'push', { endpoint: 'https://push.example/a' })).status).toBe(503) // not configured
    const on = { ...s.env, ...vapid } as typeof s.env
    expect((await call(push, 'Post', on, marc, 'push', { endpoint: 'http://insecure.example/a' })).status).toBe(400)
    expect((await call(push, 'Post', on, marc, 'push', { endpoint: 'nope' })).status).toBe(400)
    expect((await call(push, 'Post', on, marc, 'push', { endpoint: 'https://push.example/a' })).status).toBe(200)
    expect(((await (await call(push, 'Get', on, marc, 'push')).json()) as { enabled: boolean; devices: number }).devices).toBe(1)
    // another parent cannot remove it
    await call(push, 'Delete', on, await as(s.env, 'julie@x.org'), 'push', { endpoint: 'https://push.example/a' })
    expect(((await (await call(push, 'Get', on, marc, 'push')).json()) as { devices: number }).devices).toBe(1)
    await call(push, 'Delete', on, marc, 'push', { endpoint: 'https://push.example/a' })
    expect(((await (await call(push, 'Get', on, marc, 'push')).json()) as { devices: number }).devices).toBe(0)
  })
  it('« notification d’essai » reaches the in-app list even with push off, and wakes my devices when it is on', async () => {
    const s = seed()
    const marc = await as(s.env, 'marc@x.org')
    expect((await call(push, 'Post', s.env, marc, 'push', { test: true })).status).toBe(200)
    expect(((await (await call(notifications, 'Get', s.env, marc, 'notifications')).json()) as { notifications: { kind: string }[] }).notifications.map((n) => n.kind)).toEqual(['test'])
    const on = { ...s.env, ...vapid } as typeof s.env
    await call(push, 'Post', on, marc, 'push', { endpoint: 'https://push.example/phone' })
    const woken: string[] = []
    vi.stubGlobal('fetch', async (u: string) => (woken.push(u), new Response(null, { status: 201 })))
    s.db.exec("DELETE FROM notifications") // the ten-minute duplicate guard
    await call(push, 'Post', on, marc, 'push', { test: true })
    expect(woken).toEqual(['https://push.example/phone'])
  })
})
