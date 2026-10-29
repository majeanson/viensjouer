// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from './testDb'
import { inQuietHours, sendDueReminders } from './reminders'
import { nowSec } from './ids'

// The reminder query on real SQL: who is reached, and who must not be.
const ZONES = ['America/Toronto', 'Asia/Tokyo', 'Europe/Paris', 'Pacific/Auckland', 'Pacific/Honolulu', 'America/Vancouver']
const dayZone = () => ZONES.find((z) => !inQuietHours(nowSec(), z)) ?? 'America/Toronto'
const nightZone = () => ZONES.find((z) => inQuietHours(nowSec(), z))

afterEach(() => vi.unstubAllGlobals())

function seed(db: ReturnType<typeof realDb>['db'], tz: string) {
  const now = nowSec()
  db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', '${tz}', 1, 1)`)
  db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  db.prepare(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 't', ?, 1, 1)`).run(now + 3 * 3600)
  const fam = (id: string, email: string, del: number | null) =>
    db.prepare(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at, deleted_at) VALUES (?, 'h1', 'P', ?, ?, 1, 1, ?)`).run(id, id, email, del)
  fam('ok', 'ok@example.com', null)
  fam('gone', 'gone@example.com', 5)
  fam('no', 'no@example.com', null)
  const inv = (id: string, f: string, reply: string | null) =>
    db.prepare(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, reply, remind_at, created_at, updated_at) VALUES (?, 'e1', ?, ?, ?, ?, 1, 1)`).run(id, f, `tok-${id}`, reply, now - 10)
  inv('i-ok', 'ok', 'yes')
  inv('i-gone', 'gone', 'yes')
  inv('i-no', 'no', 'no')
}

describe('sendDueReminders', () => {
  it('reaches a family that said yes, not a removed one nor one that said no', async () => {
    const zone = dayZone()
    const { db, env } = realDb()
    seed(db, zone)
    const sent: string[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
      sent.push((JSON.parse(init.body) as { to: string[] }).to[0])
      return new Response('{"id":"x"}', { status: 200 })
    })
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env
    expect(await sendDueReminders(e, 'https://x.test')).toBe(1)
    expect(sent).toEqual(['ok@example.com'])
  })

  it('holds everything in the household’s quiet hours, unstamped, so it goes out later', async () => {
    const zone = nightZone()
    if (!zone) return // the clock is daytime in every zone listed (cannot happen across six zones)
    const { db, env } = realDb()
    seed(db, zone)
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env
    expect(await sendDueReminders(e, 'https://x.test')).toBe(0)
    const stamped = db.prepare('SELECT COUNT(*) AS n FROM invitations WHERE reminded_at IS NOT NULL').get() as { n: number }
    expect(Number(stamped.n)).toBe(0)
  })

  it('counts what it sends against the household’s daily budget', async () => {
    const { db, env } = realDb()
    seed(db, dayZone())
    vi.stubGlobal('fetch', async () => new Response('{"id":"x"}', { status: 200 }))
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env
    expect(await sendDueReminders(e, 'https://x.test')).toBe(1)
    const n = db.prepare("SELECT COUNT(*) AS n FROM mail_sends WHERE household_id = 'h1'").get() as { n: number }
    expect(Number(n.n)).toBe(1)
  })

  it('skips a household whose budget is used up, unstamped, so a later run can still send', async () => {
    const { db, env } = realDb()
    seed(db, dayZone())
    for (let k = 0; k < 60; k++) db.prepare("INSERT INTO mail_sends (id, household_id, created_at) VALUES (?, 'h1', ?)").run(`m${k}`, nowSec() - 60)
    const sent: string[] = []
    vi.stubGlobal('fetch', async () => (sent.push('x'), new Response('{}', { status: 200 })))
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env
    expect(await sendDueReminders(e, 'https://x.test')).toBe(0)
    expect(sent).toEqual([])
    const stamped = db.prepare('SELECT COUNT(*) AS n FROM invitations WHERE reminded_at IS NOT NULL').get() as { n: number }
    expect(Number(stamped.n)).toBe(0)
  })

  it('does not remind for a postponed rencontre', async () => {
    const { db, env } = realDb()
    seed(db, dayZone())
    db.exec("UPDATE encounters SET status = 'postponed'")
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }))
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env
    expect(await sendDueReminders(e, 'https://x.test')).toBe(0)
  })
})
