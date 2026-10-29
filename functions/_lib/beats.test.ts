// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from './testDb'
import { beat, beatAge } from './beats'
import { warnIfMailNearFree } from './mailBudget'
import { onRequestGet as health } from '../api/health'
import { nowSec } from './ids'

afterEach(() => vi.unstubAllGlobals())

describe('cron heartbeat', () => {
  it('is null until the cron has run once, then counts seconds since', async () => {
    const { db, env } = realDb()
    expect(await beatAge(env, 'cron')).toBeNull()
    await beat(env, 'cron')
    expect(await beatAge(env, 'cron')).toBe(0)
    db.exec(`UPDATE cron_beats SET at = ${nowSec() - 7200}`)
    expect(await beatAge(env, 'cron')).toBeGreaterThanOrEqual(7200)
    await beat(env, 'cron') // overwrites, never a second row
    expect((db.prepare('SELECT COUNT(*) AS n FROM cron_beats').get() as { n: number }).n).toBe(1)
  })
  it('is on /api/health, for the nightly production check', async () => {
    const { env } = realDb()
    await beat(env, 'cron')
    const res = (await health({ env, request: new Request('https://x.test/api/health') } as never)) as Response
    expect(((await res.json()) as { cronAgeSec: number }).cronAgeSec).toBe(0)
  })
})

describe('the mail alert to the owner', () => {
  const full = (db: ReturnType<typeof realDb>['db']) => {
    db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
    for (let i = 0; i < 85; i++) db.prepare("INSERT INTO mail_sends (id, household_id, created_at) VALUES (?, 'h1', ?)").run(`m${i}`, nowSec() - 60)
  }
  it('emails ADMIN_EMAIL once a day when the last 24 h pass 80, and says nothing when it is not set', async () => {
    const { db, env } = realDb()
    full(db)
    const sent: string[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => (sent.push((JSON.parse(init.body) as { to: string[] }).to[0]), new Response('{"id":"x"}')))
    const e = { ...env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c', ADMIN_EMAIL: 'me@x.org' } as typeof env
    expect(await warnIfMailNearFree(e)).toBe(85)
    expect(await warnIfMailNearFree(e)).toBe(85) // the next hour: already told today
    expect(sent).toEqual(['me@x.org'])
    sent.length = 0
    const quiet = realDb()
    full(quiet.db)
    await warnIfMailNearFree({ ...quiet.env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof env)
    expect(sent).toEqual([])
  })
})
