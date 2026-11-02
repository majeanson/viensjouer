// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from '../_lib/testDb'
import { sessionCookies, signInAs } from '../_lib/auth'
import { nowSec } from '../_lib/ids'
import { deleteHouseholds } from '../_lib/demo'
import * as circles from './shared-circles'
import * as invite from './shared-circle-invite'
import * as join from './shared-circle-join'
import * as encounters from './encounters'
import * as invitations from './invitations'
import * as families from './families'
import * as calendar from './calendar'
import * as reply from './r/[token]'
import * as claim from './r/claim'
import * as link from './link-invitation'

afterEach(() => vi.unstubAllGlobals())

// Marc (h1, Noé) starts « Les amis du parc ». Julie (h2, Léa) has an account and is in Marc's book by email (fj). Paul has no account
// yet and is in JULIE's book (fp). Any member invites; nobody is ever linked by a circle.
function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'Marc', 'America/Toronto', 1, 1), ('h2', 'Julie', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marc@x.org', 'h1', 'Marc Jeanson', 'x', 'fr', 1), ('julie@x.org', 'h2', 'Julie Roy', 'x', 'fr', 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1), ('c2', 'h2', 'Léa', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, phone, created_at, updated_at) VALUES ('fj', 'h1', 'Julie', 'Léa', 'julie@x.org', '555-1234', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('fp', 'h2', 'Paul', 'Max', 'paul@x.org', 1, 1)`)
  return { ...r, env: { ...r.env, SESSION_SECRET: 'a-test-secret-of-at-least-32-characters-long' } as typeof r.env }
}
type S = ReturnType<typeof seed>
async function as(s: S, email: string) {
  const { session, csrf } = await signInAs(s.env, email)
  return sessionCookies(session, csrf).map((c) => c.split(';')[0]).join('; ')
}
type Method = 'Get' | 'Post' | 'Patch' | 'Delete'
const call = (mod: object, method: Method, s: S, cookie: string, path: string, body?: unknown, params: Record<string, string> = {}) =>
  (mod[`onRequest${method}` as keyof typeof mod] as unknown as (c: unknown) => Promise<Response>)({ env: s.env, request: new Request(`https://x.test/api/${path}`, { method: method.toUpperCase(), headers: { cookie, 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' }, body: body === undefined ? undefined : JSON.stringify(body) }), params, waitUntil: () => {} })
const json = async (r: Response) => (await r.json()) as Record<string, unknown>
const rows = (s: S, sql: string) => s.db.prepare(sql).all() as Record<string, unknown>[]

interface Circle {
  id: string
  name: string
  members: { me: boolean; parentName: string; childName: string; familyId: string | null }[]
  invites: { id: string; familyId: string; token: string }[]
}
const list = async (s: S, email: string) => (await json(await call(circles, 'Get', s, await as(s, email), 'shared-circles'))).circles as Circle[]

/** Marc starts the circle, invites Julie from his book, Julie joins with her account. */
async function marcAndJulie(s: S) {
  const marc = await as(s, 'marc@x.org')
  const { id } = await json(await call(circles, 'Post', s, marc, 'shared-circles', { name: 'Les amis du parc' }))
  const code = await json(await call(invite, 'Post', s, marc, 'shared-circle-invite', { circleId: id, familyId: 'fj' }))
  const julie = await as(s, 'julie@x.org')
  const joined = await call(join, 'Post', s, julie, 'shared-circle-join', { code: code.token })
  expect(joined.status).toBe(200)
  return { id: id as string, marc, julie, code: code.token as string }
}

describe('a shared circle, start to finish', () => {
  it('Marc starts it, Julie joins with her account: hidden entries both ways, first names only, no link, Marc is told', async () => {
    const s = seed()
    const { id } = await marcAndJulie(s)
    const mine = await list(s, 'marc@x.org')
    expect(mine).toHaveLength(1)
    expect(mine[0].name).toBe('Les amis du parc')
    expect(mine[0].members.map((m) => [m.me, m.parentName, m.childName])).toEqual([[true, 'Marc', 'Noé'], [false, 'Julie', 'Léa']])
    // First names only: nothing that reaches a person crosses this endpoint.
    expect(JSON.stringify(mine)).not.toMatch(/julie@x\.org|555-1234|Roy/)
    // Marc's own book entry for Julie (on her email) is the one to invite her with, not the hidden one.
    expect(mine[0].members[1].familyId).toBe('fj')
    expect(rows(s, `SELECT household_id, parent_name, child_first_name, member_household_id, email FROM friend_families WHERE shared_circle_id = '${id}' ORDER BY household_id`)).toEqual([
      { household_id: 'h1', parent_name: 'Julie', child_first_name: 'Léa', member_household_id: 'h2', email: null },
      { household_id: 'h2', parent_name: 'Marc', child_first_name: 'Noé', member_household_id: 'h1', email: null },
    ])
    expect(rows(s, 'SELECT * FROM child_links')).toEqual([])
    expect(rows(s, "SELECT kind, title FROM notifications WHERE email = 'marc@x.org'")).toEqual([{ kind: 'joinedCircle', title: 'Julie est dans « Les amis du parc »' }])
    // The hidden entries never show in « Amis », for either of them.
    const book = (await json(await call(families, 'Get', s, await as(s, 'julie@x.org'), 'families'))).families as { id: string }[]
    expect(book.map((f) => f.id)).toEqual(['fp'])
  })

  it('any member invites: Julie brings Paul, who has no account; the claim makes one, joins, and links nobody', async () => {
    const s = seed()
    const { id, julie } = await marcAndJulie(s)
    const code = await json(await call(invite, 'Post', s, julie, 'shared-circle-invite', { circleId: id, familyId: 'fp' }))
    const door = await json(await call(reply, 'Get', s, '', `r/${code.token}`, undefined, { token: String(code.token) }))
    expect(door.circle).toEqual({ hostName: 'Julie', hostChild: '', familyChild: 'Max', used: false, circleName: 'Les amis du parc' })
    const made = await call(claim, 'Post', s, '', `r/${code.token}/claim`, { displayName: 'Paul', email: 'paul@x.org', password: 'longenough' }, { token: String(code.token) })
    expect(made.status).toBe(201)
    const paul = await list(s, 'paul@x.org')
    expect(paul[0].members.map((m) => m.childName)).toEqual(['Noé', 'Léa', 'Max'])
    expect(paul[0].members.filter((m) => !m.me).every((m) => m.familyId)).toBe(true)
    expect(rows(s, 'SELECT * FROM child_links')).toEqual([])
    // The code is spent: a second claim, or someone else joining with it, is refused.
    expect((await call(claim, 'Post', s, '', `r/${code.token}/claim`, { displayName: 'X', email: 'x@x.org', password: 'longenough' }, { token: String(code.token) })).status).toBe(409)
    expect((await call(join, 'Post', s, await as(s, 'marc@x.org'), 'shared-circle-join', { code: code.token })).status).toBe(200) // Marc is already in: no-op
  })

  it('refuses a stranger, a hidden entry passed on, a family already in, a sandbox, and a code that was withdrawn', async () => {
    const s = seed()
    const { id, marc, julie, code } = await marcAndJulie(s)
    s.db.exec("INSERT INTO households (id, name, created_at, updated_at) VALUES ('h3', 'Z', 1, 1)")
    s.db.exec("INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('z@x.org', 'h3', 'Zed', 'x', 1)")
    const zed = await as(s, 'z@x.org')
    expect((await call(circles, 'Patch', s, zed, 'shared-circles', { id, name: 'Mine now' })).status).toBe(404)
    expect((await call(invite, 'Post', s, zed, 'shared-circle-invite', { circleId: id, familyId: 'fp' })).status).toBe(404)
    // Marc cannot pass on Julie's hidden entry for himself... nor invite with an entry of someone else's book.
    const hidden = rows(s, "SELECT id FROM friend_families WHERE household_id = 'h2' AND shared_circle_id IS NOT NULL")[0].id
    expect((await call(invite, 'Post', s, julie, 'shared-circle-invite', { circleId: id, familyId: hidden })).status).toBe(404)
    expect((await call(invite, 'Post', s, marc, 'shared-circle-invite', { circleId: id, familyId: 'fp' })).status).toBe(404)
    // The code was used by Julie: Zed cannot use it.
    expect((await json(await call(join, 'Get', s, zed, `shared-circle-join?code=${code}`))).state).toBe('used')
    expect((await call(join, 'Post', s, zed, 'shared-circle-join', { code })).status).toBe(409)
    s.db.exec("INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('demo-abc@viensjouer.invalid', 'h3', 'Demo', 'x', 1)")
    expect((await call(circles, 'Post', s, await as(s, 'demo-abc@viensjouer.invalid'), 'shared-circles', { name: 'x' })).status).toBe(403)
    const p = await json(await call(invite, 'Post', s, julie, 'shared-circle-invite', { circleId: id, familyId: 'fp' }))
    expect((await call(invite, 'Delete', s, julie, 'shared-circle-invite', { id: p.id })).status).toBe(200)
    expect((await call(reply, 'Get', s, '', `r/${p.token}`, undefined, { token: String(p.token) })).status).toBe(404)
  })

  it('leaving takes the hidden entries both ways; the last one out closes the circle and its open codes', async () => {
    const s = seed()
    const { id, marc, julie } = await marcAndJulie(s)
    const open = await json(await call(invite, 'Post', s, julie, 'shared-circle-invite', { circleId: id, familyId: 'fp' }))
    expect((await call(circles, 'Delete', s, julie, 'shared-circles', { id })).status).toBe(200)
    expect(rows(s, `SELECT COUNT(*) AS n FROM friend_families WHERE shared_circle_id = '${id}' AND deleted_at IS NULL`)).toEqual([{ n: 0 }])
    expect((await list(s, 'marc@x.org'))[0].members.map((m) => m.childName)).toEqual(['Noé'])
    expect((await call(reply, 'Get', s, '', `r/${open.token}`, undefined, { token: String(open.token) })).status).toBe(404)
    expect((await call(circles, 'Delete', s, marc, 'shared-circles', { id })).status).toBe(200)
    expect(rows(s, `SELECT deleted_at IS NOT NULL AS closed FROM shared_circles WHERE id = '${id}'`)).toEqual([{ closed: 1 }])
    expect(await list(s, 'marc@x.org')).toEqual([])
  })
})

describe('inviting the circle to a rencontre', () => {
  const withMail = (s: S) => ({ ...s, env: { ...s.env, RESEND_API_KEY: 'k', MAIL_FROM: 'Viens jouer <noreply@x.test>' } as typeof s.env })

  it('invites each account once, puts it in the member’s agenda, and mails a member with no Reply-To and no address shown', async () => {
    const s = withMail(seed())
    const { id, julie } = await marcAndJulie(s)
    const p = await json(await call(invite, 'Post', s, julie, 'shared-circle-invite', { circleId: id, familyId: 'fp' }))
    await call(claim, 'Post', s, '', `r/${p.token}/claim`, { displayName: 'Paul', email: 'paul@x.org', password: 'longenough' }, { token: String(p.token) })
    const marc = await as(s, 'marc@x.org')
    const ids = (await list(s, 'marc@x.org'))[0].members.filter((m) => !m.me).map((m) => m.familyId!)
    // Julie picked twice (Marc's own entry AND her hidden one): one invitation, through Marc's own entry.
    const hiddenJulie = rows(s, "SELECT id FROM friend_families WHERE household_id = 'h1' AND member_household_id = 'h2'")[0].id as string
    const at = nowSec() + 3 * 86_400
    const made = await json(await call(encounters, 'Post', s, marc, 'encounters', { childId: 'c1', kind: 'park', title: 'Au parc', startsAt: at, invite: [...ids, hiddenJulie] }))
    const inv = rows(s, `SELECT i.id, i.friend_family_id FROM invitations i WHERE i.encounter_id = '${made.id}' ORDER BY i.friend_family_id`)
    expect(inv).toHaveLength(2)
    expect(inv.map((i) => i.friend_family_id)).toContain('fj')
    const paulRow = inv.find((i) => i.friend_family_id !== 'fj')!
    // The host card says it can be emailed, without the address.
    const card = await json(await call(encounters, 'Get', s, marc, `encounters?id=${made.id}`))
    const paulCard = (card.invitations as { id: string; email: string | null; via_circle: number }[]).find((i) => i.id === paulRow.id)!
    expect([paulCard.email, paulCard.via_circle]).toEqual([null, 1])
    // Paul sees it in his agenda, and was told in the app.
    const agenda = (await json(await call(calendar, 'Get', s, await as(s, 'paul@x.org'), 'calendar'))).items as { type: string; title: string }[]
    expect(agenda).toEqual([expect.objectContaining({ type: 'invited', title: 'Au parc' })])
    expect(rows(s, "SELECT kind FROM notifications WHERE email = 'paul@x.org'")).toEqual([{ kind: 'invited' }])
    // « Envoyer »: to Paul's own address, from Marc's name, with no Reply-To (Marc's address stays Marc's).
    const sent: { to: string[]; reply_to?: string[] }[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => (sent.push(JSON.parse(init.body)), new Response('{"id":"x"}')))
    expect((await call(invitations, 'Post', s, marc, 'invitations', { id: paulRow.id })).status).toBe(200)
    expect(sent).toEqual([expect.objectContaining({ to: ['paul@x.org'] })])
    expect(sent[0].reply_to).toBeUndefined()
    // Paul's invitation page offers no « Ajouter à mes amis »: a circle never links two families.
    const token = rows(s, `SELECT token FROM invitations WHERE id = '${paulRow.id}'`)[0].token as string
    expect((await json(await call(link, 'Get', s, await as(s, 'paul@x.org'), `link-invitation?code=${token}`))).state).toBe('taken')
  })

  it('a member who deletes their account disappears from the others’ circle and picker', async () => {
    const s = seed()
    const { id } = await marcAndJulie(s)
    await deleteHouseholds(s.env, ['h2'])
    expect((await list(s, 'marc@x.org'))[0].members.map((m) => m.childName)).toEqual(['Noé'])
    expect(rows(s, `SELECT COUNT(*) AS n FROM friend_families WHERE member_household_id = 'h2' AND deleted_at IS NULL`)).toEqual([{ n: 0 }])
    expect(rows(s, `SELECT COUNT(*) AS n FROM shared_circles WHERE id = '${id}'`)).toEqual([{ n: 1 }])
  })
})
