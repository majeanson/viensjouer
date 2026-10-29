// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from './testDb'
import { isDigestTime, sendWeeklyDigests } from './digest'

// 2030-01-07 is a Monday. 14:00 UTC is 9:00 in Toronto, 15:00 in Paris.
const MON_9_TORONTO = Date.UTC(2030, 0, 7, 14, 0, 0) / 1000
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('isDigestTime', () => {
  it('is Monday between 7 h and 11 h in the household’s own zone, nothing else', () => {
    expect(isDigestTime(MON_9_TORONTO, 'America/Toronto')).toBe(true)
    expect(isDigestTime(MON_9_TORONTO, 'Europe/Paris')).toBe(false) // 15 h there
    expect(isDigestTime(MON_9_TORONTO - 3 * 3600, 'America/Toronto')).toBe(false) // 6 h
    expect(isDigestTime(MON_9_TORONTO + 86_400, 'America/Toronto')).toBe(false) // Tuesday
    expect(isDigestTime(MON_9_TORONTO, 'Mars/Olympus')).toBe(false)
  })
})

function seed(digest = 1) {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, weekly_digest, created_at) VALUES ('m@x.org', 'h1', 'Marc', 'x', ${digest}, 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, created_at, updated_at) VALUES ('f1', 'h1', 'J', 'Léa', 1, 1), ('f2', 'h1', 'P', 'Max', 1, 1)`)
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 'Au parc', ${MON_9_TORONTO + 2 * 86_400}, 1, 1)`)
  r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, reply, created_at, updated_at) VALUES ('i1', 'e1', 'f1', 'aaaa2222', 'yes', 1, 1), ('i2', 'e1', 'f2', 'bbbb3333', NULL, 1, 1)`)
  return r
}
const sendWith = async (r: ReturnType<typeof seed>) => {
  const bodies: { subject: string; text: string }[] = []
  vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => (bodies.push(JSON.parse(init.body)), new Response('{"id":"x"}', { status: 200 })))
  const n = await sendWeeklyDigests({ ...r.env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof r.env, 'https://x.test')
  return { n, bodies }
}

describe('sendWeeklyDigests', () => {
  it('sends the week with who said what, once, and counts it in the mail budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MON_9_TORONTO * 1000)
    const r = seed()
    const { n, bodies } = await sendWith(r)
    expect(n).toBe(1)
    expect(bodies[0].subject).toBe('Ta semaine : 1 rencontre')
    expect(bodies[0].text).toContain('Au parc (1 oui, 0 peut-être, 1 sans réponse)')
    expect((r.db.prepare("SELECT COUNT(*) AS n FROM mail_sends WHERE household_id = 'h1'").get() as { n: number }).n).toBe(1)
    expect((await sendWith(r)).n).toBe(0) // the same Monday: already stamped
  })
  it('sends nothing to someone who did not ask, nothing on another day, nothing when the week is empty', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(MON_9_TORONTO * 1000)
    expect((await sendWith(seed(0))).n).toBe(0)
    vi.setSystemTime((MON_9_TORONTO + 86_400) * 1000)
    expect((await sendWith(seed())).n).toBe(0)
    vi.setSystemTime(MON_9_TORONTO * 1000)
    const empty = seed()
    empty.db.exec("UPDATE encounters SET status = 'cancelled'")
    expect((await sendWith(empty)).n).toBe(0)
  })
})
