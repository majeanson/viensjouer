// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { realDb } from './testDb'
import { accountsOfFamily, notify, parentsOf, subscribeDevice } from './notify'
import { notifyAnswered, notifyChanged, notifyInvited } from './notifyEvents'
import { NOTE } from './notifyCopy'

afterEach(() => vi.unstubAllGlobals())

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
let vapid: Record<string, string>
beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  vapid = { VAPID_PUBLIC_KEY: b64u(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)), VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), VAPID_SUBJECT: 'mailto:me@example.org' }
})

// Two households: the host (h1, Marc) and a family with an account (h2, Julie, linked) plus a third account on a friend's email (h3).
function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'Host', 'America/Toronto', 1, 1), ('h2', 'Linked', 'America/Toronto', 1, 1), ('h3', 'ByEmail', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marc@x.org', 'h1', 'Marc', 'x', 'fr', 1), ('julie@x.org', 'h2', 'Julie', 'x', 'en', 1), ('paul@x.org', 'h3', 'Paul', 'x', 'fr', 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, linked_household_id, created_at, updated_at) VALUES ('fl', 'h1', 'Julie', 'Léa', 'other@x.org', 'h2', 1, 1), ('fe', 'h1', 'Paul', 'Max', 'Paul@X.org', NULL, 1, 1), ('fn', 'h1', 'Sam', 'Eli', 'nobody@x.org', NULL, 1, 1)`)
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 'Au parc', 5000000000, 1, 1)`)
  r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('il', 'e1', 'fl', 'linkd234', 1, 1), ('ie', 'e1', 'fe', 'email234', 1, 1), ('in', 'e1', 'fn', 'none2234', 1, 1)`)
  return r
}
const rows = (r: ReturnType<typeof seed>) => r.db.prepare('SELECT email, kind, title, body, url FROM notifications ORDER BY email, created_at').all() as { email: string; kind: string; title: string; body: string; url: string }[]

describe('who a family stands for', () => {
  it('is the household it is linked to AND any account on the same email (any case), never the host’s own household', async () => {
    const r = seed()
    expect((await accountsOfFamily(r.env, { linked_household_id: 'h2', email: 'other@x.org' }, 'h1')).map((x) => x.email)).toEqual(['julie@x.org'])
    expect((await accountsOfFamily(r.env, { linked_household_id: null, email: 'PAUL@x.org' }, 'h1')).map((x) => x.email)).toEqual(['paul@x.org'])
    expect(await accountsOfFamily(r.env, { linked_household_id: null, email: 'nobody@x.org' }, 'h1')).toEqual([])
    expect(await accountsOfFamily(r.env, { linked_household_id: 'h1', email: 'marc@x.org' }, 'h1')).toEqual([])
    expect((await parentsOf(r.env, 'h2')).map((x) => x.lang)).toEqual(['en'])
  })
})

describe('invited', () => {
  it('tells the linked account and the same-email account, each in its own language, with a link to its own page', async () => {
    const r = seed()
    await notifyInvited(r.env, { householdId: 'h1', displayName: 'Marc' }, { title: 'Au parc', startsAt: 5_000_000_000 }, [
      { familyId: 'fl', token: 'linkd234' },
      { familyId: 'fe', token: 'email234' },
      { familyId: 'fn', token: 'none2234' },
    ])
    const got = rows(r)
    expect(got.map((g) => [g.email, g.kind, g.url])).toEqual([
      ['julie@x.org', 'invited', '/link-d234'],
      ['paul@x.org', 'invited', '/emai-l234'],
    ])
    expect(got[0].title).toBe('Marc invites you')
    expect(got[1].title).toBe('Marc t’invite')
    expect(got[1].body).toContain('Au parc')
  })
})

describe('changed, cancelled, postponed', () => {
  const run = (statusChanged: boolean, status: string) => {
    const r = seed()
    r.db.exec("UPDATE invitations SET reply = 'no' WHERE id = 'ie'") // Paul said no: he is left alone
    return notifyChanged(r.env, { householdId: 'h1' }, { id: 'e1', title: 'Au parc', startsAt: 5_000_000_000, status, statusChanged, changes: [{ field: 'place', old: 'A', new: 'B' }, { field: 'status', old: 'proposed', new: status }] }).then(() => rows(r))
  }
  it('says what kind of news it is, and skips a family that said no', async () => {
    expect((await run(false, 'proposed')).map((g) => [g.email, g.kind])).toEqual([['julie@x.org', 'changed']])
    expect((await run(true, 'cancelled'))[0].kind).toBe('cancelled')
    expect((await run(true, 'postponed'))[0].kind).toBe('postponed')
    expect((await run(true, 'cancelled'))[0].title).toBe('Cancelled: Au parc')
  })
})

describe('answered', () => {
  it('goes to every parent of the hosting household, once per invitation per ten minutes', async () => {
    const r = seed()
    r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, lang, created_at) VALUES ('marie@x.org', 'h1', 'Marie', 'x', 'fr', 2)`)
    const a = { householdId: 'h1', invitationId: 'il', encounterId: 'e1', title: 'Au parc', reply: 'yes' as const, guestParent: 'Julie', guestChild: 'Léa' }
    await notifyAnswered(r.env, a)
    await notifyAnswered(r.env, a) // a double tap
    await notifyAnswered(r.env, { ...a, invitationId: 'ie', guestChild: 'Max' }) // someone else answering is another notice
    const got = rows(r)
    expect(got.filter((g) => g.email === 'marc@x.org').map((g) => g.title)).toEqual(['Léa : oui', 'Max : oui'])
    expect(got.filter((g) => g.email === 'marie@x.org')).toHaveLength(2)
  })
})

describe('notify', () => {
  const note = { kind: 'test' as const, url: '/x', words: NOTE.test }
  it('keeps 50 per parent, skips a sandbox, and never throws', async () => {
    const r = seed()
    for (let i = 0; i < 55; i++) await notify(r.env, [{ email: 'marc@x.org', lang: 'fr', householdId: 'h1' }], { ...note, url: `/x${i}` }, 1000 + i)
    expect((r.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE email = 'marc@x.org'").get() as { n: number }).n).toBe(50)
    await notify(r.env, [{ email: 'demo-abc@viensjouer.invalid', lang: 'fr', householdId: 'h1' }], note)
    expect((r.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE email LIKE 'demo-%'").get() as { n: number }).n).toBe(0)
    await expect(notify({ DB: null } as never, [{ email: 'a@b.c', lang: 'fr', householdId: 'h1' }], note)).resolves.toBeUndefined()
  })
  it('wakes every device of the parent with an empty push, forgets one the browser dropped, and does nothing when push is off', async () => {
    const r = seed()
    const env = { ...r.env, ...vapid } as typeof r.env
    await subscribeDevice(env, { email: 'marc@x.org', householdId: 'h1' }, 'https://push.example/alive')
    await subscribeDevice(env, { email: 'marc@x.org', householdId: 'h1' }, 'https://push.example/dead')
    await subscribeDevice(env, { email: 'julie@x.org', householdId: 'h2' }, 'https://push.example/other')
    const called: string[] = []
    vi.stubGlobal('fetch', async (u: string) => (called.push(u), new Response(null, { status: u.endsWith('/dead') ? 410 : 201 })))
    await notify(env, [{ email: 'marc@x.org', lang: 'fr', householdId: 'h1' }], note)
    expect(called.sort()).toEqual(['https://push.example/alive', 'https://push.example/dead'])
    expect((r.db.prepare('SELECT endpoint FROM push_subscriptions ORDER BY endpoint').all() as { endpoint: string }[]).map((x) => x.endpoint)).toEqual(['https://push.example/alive', 'https://push.example/other'])
    called.length = 0
    await notify(r.env, [{ email: 'marc@x.org', lang: 'fr', householdId: 'h1' }], { ...note, url: '/y' }) // no VAPID keys: in-app only
    expect(called).toEqual([])
  })
  it('keeps at most 8 devices per parent and one row per endpoint', async () => {
    const r = seed()
    for (let i = 0; i < 10; i++) await subscribeDevice(r.env, { email: 'marc@x.org', householdId: 'h1' }, `https://push.example/${i}`, 100 + i)
    await subscribeDevice(r.env, { email: 'marc@x.org', householdId: 'h1' }, 'https://push.example/9', 200)
    expect((r.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n).toBe(8)
  })
})
