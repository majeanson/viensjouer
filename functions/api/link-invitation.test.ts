// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from '../_lib/testDb'
import { sessionCookies, signInAs } from '../_lib/auth'
import { nowSec } from '../_lib/ids'
import * as link from './link-invitation'
import * as calendar from './calendar'
import * as notifications from './notifications'

// Marc (host, h1) invited a family whose email is the one of ANOTHER account of the same person (Marc_, h2). Also a stranger (h3).
function seed(children2 = 1) {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'Host', 'America/Toronto', 1, 1), ('h2', 'Marc_', 'America/Toronto', 1, 1), ('h3', 'Other', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marc.jeanson92@gmail.com', 'h1', 'Marc', 'x', 'fr', 1), ('marc_jeanson@example.org', 'h2', 'Marc_', 'x', 'fr', 1), ('stranger@x.org', 'h3', 'Sam', 'x', 'fr', 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  for (let i = 0; i < children2; i++) r.db.exec(`INSERT INTO children (id, household_id, first_name, position, created_at, updated_at) VALUES ('k${i}', 'h2', 'Kid${i}', ${i}, 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('fl', 'h1', 'Marc_', 'Léa', 'Marc_Jeanson@example.org', 1, 1)`)
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 'Au parc', ${nowSec() + 86_400}, 1, 1)`)
  r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('i1', 'e1', 'fl', 'banquet-liseron', 1, 1)`)
  return { ...r, env: { ...r.env, SESSION_SECRET: 'a-test-secret-of-at-least-32-characters-long' } as typeof r.env }
}
type S = ReturnType<typeof seed>
async function as(s: S, email: string) {
  const { session, csrf } = await signInAs(s.env, email)
  return sessionCookies(session, csrf).map((c) => c.split(';')[0]).join('; ')
}
const call = (mod: object, method: 'Get' | 'Post', s: S, cookie: string, path: string, body?: unknown) =>
  (mod[`onRequest${method}` as keyof typeof mod] as unknown as (c: unknown) => Promise<Response>)({ env: s.env, request: new Request(`https://x.test/api/${path}`, { method: method.toUpperCase(), headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), params: {}, waitUntil: () => {} })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>
const agenda = async (s: S, who: string) => ((await json(await call(calendar, 'Get', s, await as(s, who), 'calendar'))).items as { type: string; id: string; token?: string }[]).filter((i) => i.type === 'invited')

describe('an invitation to an address that belongs to an account shows in that account’s agenda, with no link and no email', () => {
  it('your example: invite your other account and it appears there; a stranger sees nothing', async () => {
    const s = seed()
    expect((await agenda(s, 'marc_jeanson@example.org')).map((i) => [i.id, i.token])).toEqual([['e1', 'banquet-liseron']])
    expect(await agenda(s, 'stranger@x.org')).toEqual([])
    expect(await agenda(s, 'marc.jeanson92@gmail.com')).toEqual([]) // the host's own rencontre is « mine », not « invited »
  })
  it('a removed family or a cancelled rencontre disappears from it', async () => {
    const s = seed()
    s.db.exec("UPDATE friend_families SET deleted_at = 5")
    expect(await agenda(s, 'marc_jeanson@example.org')).toEqual([])
    const s2 = seed()
    s2.db.exec("UPDATE encounters SET status = 'cancelled'")
    expect(await agenda(s2, 'marc_jeanson@example.org')).toEqual([])
  })
})

describe('GET /api/link-invitation', () => {
  it('says what the signed-in parent can do with this invitation', async () => {
    const s = seed(2)
    const get = async (who: string) => json(await call(link, 'Get', s, await as(s, who), 'link-invitation?code=banquet-liseron'))
    expect(await get('marc_jeanson@example.org')).toMatchObject({ state: 'linkable', hostName: 'Marc', hostChild: 'Noé', familyChild: 'Léa', children: [{ id: 'k0' }, { id: 'k1' }] })
    expect((await get('marc.jeanson92@gmail.com')).state).toBe('own')
    s.db.exec("UPDATE friend_families SET linked_household_id = 'h3'")
    expect((await get('marc_jeanson@example.org')).state).toBe('taken')
    expect((await call(link, 'Get', s, await as(s, 'stranger@x.org'), 'link-invitation?code=nope-nope')).status).toBe(404)
  })
})

describe('POST /api/link-invitation (« Lier nos familles »)', () => {
  const rows = (s: S, sql: string) => s.db.prepare(sql).all() as Record<string, unknown>[]
  it('links the two households both ways, once, and tells the host', async () => {
    const s = seed()
    const marc2 = await as(s, 'marc_jeanson@example.org')
    const res = await call(link, 'Post', s, marc2, 'link-invitation', { code: 'banquet-liseron' })
    expect(res.status).toBe(200)
    expect(rows(s, 'SELECT household_a, child_a, household_b, child_b FROM child_links')).toEqual([{ household_a: 'h1', child_a: 'c1', household_b: 'h2', child_b: 'k0' }])
    expect(rows(s, "SELECT linked_household_id, linked_child_id FROM friend_families WHERE id = 'fl'")).toEqual([{ linked_household_id: 'h2', linked_child_id: 'k0' }])
    // my own book now holds the host, already linked: the first thing I can do is invite back
    expect(rows(s, "SELECT parent_name, child_first_name, linked_household_id, linked_child_id FROM friend_families WHERE household_id = 'h2'")).toEqual([{ parent_name: 'Marc', child_first_name: 'Noé', linked_household_id: 'h1', linked_child_id: 'c1' }])
    // the host is told, in the app
    const host = (await json(await call(notifications, 'Get', s, await as(s, 'marc.jeanson92@gmail.com'), 'notifications'))).notifications as { kind: string; title: string }[]
    expect(host.map((n) => [n.kind, n.title])).toEqual([['linked', 'Marc_ est sur Viens jouer']])
    // pressing it again changes nothing
    expect(await json(await call(link, 'Post', s, marc2, 'link-invitation', { code: 'banquet-liseron' }))).toMatchObject({ state: 'linked' })
    expect(rows(s, 'SELECT id FROM child_links')).toHaveLength(1)
    expect(rows(s, "SELECT id FROM friend_families WHERE household_id = 'h2'")).toHaveLength(1)
    // and the link now carries the agenda too (it would still show by email, but a link survives a changed address)
    expect(await agenda(s, 'marc_jeanson@example.org')).toHaveLength(1)
  })
  it('asks which child when there are several, refuses a child that is not mine, and makes one when there is none', async () => {
    const s = seed(2)
    const marc2 = await as(s, 'marc_jeanson@example.org')
    expect((await call(link, 'Post', s, marc2, 'link-invitation', { code: 'banquet-liseron' })).status).toBe(400)
    expect((await call(link, 'Post', s, marc2, 'link-invitation', { code: 'banquet-liseron', childId: 'c1' })).status).toBe(400) // the host's child
    expect((await call(link, 'Post', s, marc2, 'link-invitation', { code: 'banquet-liseron', childId: 'k1' })).status).toBe(200)
    expect(rows(s, 'SELECT child_b FROM child_links')).toEqual([{ child_b: 'k1' }])
    const none = seed(0)
    expect((await call(link, 'Post', none, await as(none, 'marc_jeanson@example.org'), 'link-invitation', { code: 'banquet-liseron' })).status).toBe(200)
    expect(rows(none, "SELECT first_name FROM children WHERE household_id = 'h2'")).toEqual([{ first_name: 'Léa' }])
  })
  it('refuses the host’s own rencontre, a family already taken by another account, a bad code and a sandbox', async () => {
    const s = seed()
    expect((await call(link, 'Post', s, await as(s, 'marc.jeanson92@gmail.com'), 'link-invitation', { code: 'banquet-liseron' })).status).toBe(400)
    s.db.exec("UPDATE friend_families SET linked_household_id = 'h3'")
    expect((await call(link, 'Post', s, await as(s, 'marc_jeanson@example.org'), 'link-invitation', { code: 'banquet-liseron' })).status).toBe(409)
    expect((await call(link, 'Post', s, await as(s, 'marc_jeanson@example.org'), 'link-invitation', { code: 'zzzz-zzzz' })).status).toBe(404)
    s.db.exec("INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('demo-abc@viensjouer.invalid', 'h3', 'Demo', 'x', 1)")
    expect((await call(link, 'Post', s, await as(s, 'demo-abc@viensjouer.invalid'), 'link-invitation', { code: 'banquet-liseron' })).status).toBe(403)
    expect(rows(s, 'SELECT id FROM child_links')).toEqual([])
  })
  it('refuses a request with no session', async () => {
    const s = seed()
    expect((await call(link, 'Post', s, '', 'link-invitation', { code: 'banquet-liseron' })).status).toBe(401)
  })
})
