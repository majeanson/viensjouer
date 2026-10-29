// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from '../_lib/testDb'
import { sessionCookies, signInAs } from '../_lib/auth'
import { nowSec } from '../_lib/ids'
import * as circle from './circle-invite'
import * as invitedBy from './invited-by'
import * as link from './link-invitation'
import * as notifications from './notifications'
import * as reply from './r/[token]'
import * as claim from './r/claim'

afterEach(() => vi.unstubAllGlobals())

// Marc (host, h1, one child) wants Julie's family in his circle. Marc_ (h2) is another account of the same person as Julie's email.
function seed(opts: { childrenOfHost?: number; julieEmail?: string | null } = {}) {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'Host', 'America/Toronto', 1, 1), ('h2', 'Julie', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marc@x.org', 'h1', 'Marc Jeanson', 'x', 'fr', 1), ('julie@x.org', 'h2', 'Julie', 'x', 'fr', 1)`)
  for (let i = 0; i < (opts.childrenOfHost ?? 1); i++) r.db.exec(`INSERT INTO children (id, household_id, first_name, position, created_at, updated_at) VALUES ('c${i}', 'h1', 'Noé${i}', ${i}, 1, 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('k0', 'h2', 'Léa', 1, 1)`)
  const email = opts.julieEmail === undefined ? "'julie@x.org'" : opts.julieEmail ? `'${opts.julieEmail}'` : 'NULL'
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('fj', 'h1', 'Julie', 'Léa', ${email}, 1, 1)`)
  return { ...r, env: { ...r.env, SESSION_SECRET: 'a-test-secret-of-at-least-32-characters-long' } as typeof r.env }
}
type S = ReturnType<typeof seed>
async function as(s: S, email: string) {
  const { session, csrf } = await signInAs(s.env, email)
  return sessionCookies(session, csrf).map((c) => c.split(';')[0]).join('; ')
}
const call = (mod: object, method: 'Get' | 'Post' | 'Delete', s: S, cookie: string, path: string, body?: unknown, params: Record<string, string> = {}) =>
  (mod[`onRequest${method}` as keyof typeof mod] as unknown as (c: unknown) => Promise<Response>)({ env: s.env, request: new Request(`https://x.test/api/${path}`, { method: method.toUpperCase(), headers: { cookie, 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' }, body: body === undefined ? undefined : JSON.stringify(body) }), params, waitUntil: () => {} })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>
const rows = (s: S, sql: string) => s.db.prepare(sql).all() as Record<string, unknown>[]
const make = async (s: S, body: Record<string, unknown> = { familyId: 'fj' }) => json(await call(circle, 'Post', s, await as(s, 'marc@x.org'), 'circle-invite', body))

describe('POST /api/circle-invite (the host makes the code)', () => {
  it('makes ONE open code per family and child, returns the same one again, and lists it', async () => {
    const s = seed()
    const a = await make(s)
    const b = await make(s)
    expect(a.token).toMatch(/^[a-z]+-[a-z]+$/)
    expect(b.token).toBe(a.token)
    const list = (await json(await call(circle, 'Get', s, await as(s, 'marc@x.org'), 'circle-invite'))).invites as { familyId: string; token: string }[]
    expect(list.map((i) => [i.familyId, i.token])).toEqual([['fj', a.token]])
    expect(rows(s, 'SELECT expires_at - created_at AS ttl FROM circle_invites')).toEqual([{ ttl: 14 * 86_400 }])
  })
  it('asks which child when the host has several, refuses a family already linked, a stranger’s family, a sandbox and a visitor', async () => {
    const s = seed({ childrenOfHost: 2 })
    const marc = await as(s, 'marc@x.org')
    expect((await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj' })).status).toBe(400)
    expect((await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj', childId: 'nope' })).status).toBe(400)
    expect((await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj', childId: 'c1' })).status).toBe(200)
    expect((await call(circle, 'Post', s, await as(s, 'julie@x.org'), 'circle-invite', { familyId: 'fj' })).status).toBe(404) // not their book
    s.db.exec("UPDATE friend_families SET linked_household_id = 'h2'")
    expect((await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj', childId: 'c0' })).status).toBe(409)
    s.db.exec("INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('demo-abc@viensjouer.invalid', 'h1', 'Demo', 'x', 1)")
    expect((await call(circle, 'Post', s, await as(s, 'demo-abc@viensjouer.invalid'), 'circle-invite', { familyId: 'fj' })).status).toBe(403)
    expect((await call(circle, 'Post', s, '', 'circle-invite', { familyId: 'fj' })).status).toBe(401)
  })
  it('keeps at most twenty open, and withdrawing one frees the code (it stops opening anything)', async () => {
    const s = seed()
    for (let i = 0; i < 20; i++) s.db.exec(`INSERT INTO circle_invites (id, household_id, child_id, friend_family_id, token, created_at, expires_at) VALUES ('x${i}', 'h1', 'c0', 'other${i}', 'tok-${i}', 1, ${nowSec() + 1000})`)
    expect((await call(circle, 'Post', s, await as(s, 'marc@x.org'), 'circle-invite', { familyId: 'fj' })).status).toBe(409)
    const s2 = seed()
    const a = await make(s2)
    expect((await call(circle, 'Delete', s2, await as(s2, 'julie@x.org'), 'circle-invite', { id: a.id })).status).toBe(404) // not theirs
    expect((await call(circle, 'Delete', s2, await as(s2, 'marc@x.org'), 'circle-invite', { id: a.id })).status).toBe(200)
    expect((await call(reply, 'Get', s2, '', `r/${a.token}`, undefined, { token: String(a.token) })).status).toBe(404)
    expect(((await json(await call(circle, 'Get', s2, await as(s2, 'marc@x.org'), 'circle-invite'))).invites as unknown[]).length).toBe(0)
  })
})

describe('emailing the code', () => {
  const withMail = (s: S) => ({ ...s, env: { ...s.env, RESEND_API_KEY: 'k', MAIL_FROM: 'Viens jouer <noreply@x.test>' } as typeof s.env })
  it('sends one mail from the host with the code, the unsubscribe link and a cooldown; never to a family that stopped, bounced or has no address', async () => {
    const s = withMail(seed())
    const sent: { to: string[]; from: string; reply_to: string[]; text: string; headers: Record<string, string> }[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => (sent.push(JSON.parse(init.body)), new Response('{"id":"x"}')))
    const marc = await as(s, 'marc@x.org')
    const first = await json(await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj', send: true }))
    expect(first.sent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toEqual(['julie@x.org'])
    expect(sent[0].from).toBe('Marc Jeanson via Viens jouer <noreply@x.test>')
    expect(sent[0].reply_to).toEqual(['marc@x.org'])
    expect(sent[0].text).toContain(String(first.token).replace('-', '-'))
    expect(sent[0].text).toContain('/stop/')
    expect(sent[0].headers['List-Unsubscribe']).toBeTruthy()
    expect((await call(circle, 'Post', s, marc, 'circle-invite', { familyId: 'fj', send: true })).status).toBe(429) // the next tap
    expect((await s.db.prepare('SELECT COUNT(*) AS n FROM mail_sends').get() as { n: number }).n).toBe(1)
    for (const sql of ["UPDATE friend_families SET mail_stopped_at = 5", "UPDATE friend_families SET mail_stopped_at = NULL, email_bounced_at = 5", "UPDATE friend_families SET email_bounced_at = NULL, email = NULL"]) {
      const t = withMail(seed())
      t.db.exec(sql)
      expect((await call(circle, 'Post', t, await as(t, 'marc@x.org'), 'circle-invite', { familyId: 'fj', send: true })).status).toBe(400)
    }
  })
})

describe('the code opens a circle page, then links', () => {
  it('shows who invites (first names only) and nothing else; an expired or unknown code is a plain 404', async () => {
    const s = seed()
    const a = await make(s)
    const res = await call(reply, 'Get', s, '', `r/${a.token}`, undefined, { token: String(a.token) })
    expect(await json(res)).toEqual({ circle: { hostName: 'Marc', hostChild: 'Noé0', familyChild: 'Léa', used: false } })
    s.db.exec('UPDATE circle_invites SET expires_at = 1')
    expect((await call(reply, 'Get', s, '', `r/${a.token}`, undefined, { token: String(a.token) })).status).toBe(404)
    expect((await call(reply, 'Get', s, '', 'r/zzzz-zzzz', undefined, { token: 'zzzz-zzzz' })).status).toBe(404)
  })
  it('a visitor with no account makes one from the code: signed in, linked both ways, the code used, the host told', async () => {
    const s = seed()
    const a = await make(s)
    const res = await call(claim, 'Post', s, '', `r/${a.token}/claim`, { displayName: 'Julie', email: 'new@x.org', password: 'long-enough-pass' }, { token: String(a.token) })
    expect(res.status).toBe(201)
    expect(res.headers.get('set-cookie')).toContain('=')
    expect(rows(s, "SELECT household_a, child_a, child_b FROM child_links")).toEqual([{ household_a: 'h1', child_a: 'c0', child_b: expect.any(String) }])
    expect(rows(s, "SELECT linked_household_id IS NOT NULL AS l, email FROM friend_families WHERE id = 'fj'")).toEqual([{ l: 1, email: 'new@x.org' }])
    expect(rows(s, 'SELECT accepted_at IS NOT NULL AS used FROM circle_invites')).toEqual([{ used: 1 }])
    const host = (await json(await call(notifications, 'Get', s, await as(s, 'marc@x.org'), 'notifications'))).notifications as { kind: string }[]
    expect(host.map((n) => n.kind)).toEqual(['linked'])
    // the same code again: the family is taken
    expect((await call(claim, 'Post', s, '', `r/${a.token}/claim`, { displayName: 'X', email: 'other@x.org', password: 'long-enough-pass' }, { token: String(a.token) })).status).toBe(409)
    expect(((await json(await call(reply, 'Get', s, '', `r/${a.token}`, undefined, { token: String(a.token) }))).circle as { used: boolean }).used).toBe(true)
  })
  it('someone already signed in with their own account links with one tap, and the host’s family appears in their book', async () => {
    const s = seed()
    const a = await make(s)
    const julie = await as(s, 'julie@x.org')
    expect(await json(await call(link, 'Get', s, julie, `link-invitation?code=${a.token}`))).toMatchObject({ state: 'linkable', hostName: 'Marc Jeanson', hostChild: 'Noé0', familyChild: 'Léa' })
    expect((await call(link, 'Post', s, julie, 'link-invitation', { code: a.token })).status).toBe(200)
    expect(rows(s, "SELECT linked_household_id, linked_child_id FROM friend_families WHERE id = 'fj'")).toEqual([{ linked_household_id: 'h2', linked_child_id: 'k0' }])
    expect(rows(s, "SELECT parent_name, child_first_name, linked_household_id FROM friend_families WHERE household_id = 'h2'")).toEqual([{ parent_name: 'Marc Jeanson', child_first_name: 'Noé0', linked_household_id: 'h1' }])
    expect(rows(s, 'SELECT accepted_at IS NOT NULL AS used, accepted_household FROM circle_invites')).toEqual([{ used: 1, accepted_household: 'h2' }])
  })
})

describe('GET /api/invited-by (« Ils t’ont invité »)', () => {
  const list = async (s: S, who = 'julie@x.org') => ((await json(await call(invitedBy, 'Get', s, await as(s, who), 'invited-by'))).hosts as { hostName: string; kind: string; title: string | null; token: string }[])
  const rencontre = (s: S) => {
    s.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c0', 'park', 'Au parc', ${nowSec() + 86_400}, 1, 1)`)
    s.db.exec("INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('i1', 'e1', 'fj', 'banquet-liseron', 1, 1)")
  }
  it('lists a host who invited me to a rencontre (by my email), once, and nobody else sees it', async () => {
    const s = seed()
    rencontre(s)
    expect(await list(s)).toEqual([{ hostName: 'Marc Jeanson', hostChild: 'Noé0', title: 'Au parc', startsAt: expect.any(Number), token: 'banquet-liseron', kind: 'rencontre' }])
    expect(await list(s, 'marc@x.org')).toEqual([]) // the host does not see themselves
  })
  it('lists a circle invitation too, and keeps one line per host (the newest)', async () => {
    const s = seed()
    rencontre(s)
    const a = await make(s)
    const hosts = await list(s)
    expect(hosts).toHaveLength(1)
    expect(hosts[0]).toMatchObject({ kind: 'circle', token: a.token })
  })
  it('is empty once we are linked, when the family has another account, and when nothing was addressed to me', async () => {
    const s = seed()
    rencontre(s)
    s.db.exec("UPDATE friend_families SET linked_household_id = 'h2'")
    s.db.exec("INSERT INTO child_links (id, household_a, child_a, household_b, child_b, created_at) VALUES ('l1', 'h1', 'c0', 'h2', 'k0', 1)")
    expect(await list(s)).toEqual([])
    const t = seed()
    rencontre(t)
    t.db.exec("UPDATE friend_families SET linked_household_id = 'h9'")
    expect(await list(t)).toEqual([])
    const u = seed({ julieEmail: null })
    rencontre(u)
    expect(await list(u)).toEqual([])
  })
})
