// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from '../_lib/testDb'
import { nowSec } from '../_lib/ids'
import { signSvix, verifySvix } from '../_lib/svix'
import { onRequestPost } from './resend-webhook'

const SECRET = 'whsec_' + btoa('a-test-secret-of-some-length')

async function post(env: ReturnType<typeof realDb>['env'], payload: unknown, opts: { sign?: boolean; ts?: number; secret?: string | null } = {}) {
  const body = JSON.stringify(payload)
  const ts = String(opts.ts ?? nowSec())
  const headers = new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': ts })
  headers.set('svix-signature', `v1,${opts.sign === false ? 'AAAA' : await signSvix(SECRET, 'msg_1', ts, body)}`)
  const e = { ...env, RESEND_WEBHOOK_SECRET: opts.secret === null ? undefined : (opts.secret ?? SECRET) } as typeof env
  return onRequestPost({ env: e, request: new Request('https://x.test/api/resend-webhook', { method: 'POST', headers, body }) } as never) as Promise<Response>
}

function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
  const fam = (id: string, email: string, del: number | null = null) => r.db.prepare(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at, deleted_at) VALUES (?, 'h1', 'P', ?, ?, 1, 1, ?)`).run(id, id, email, del)
  fam('a', 'Julie@Example.com')
  fam('b', 'other@example.com')
  return r
}
const stamped = (r: ReturnType<typeof seed>) => (r.db.prepare('SELECT id FROM friend_families WHERE email_bounced_at IS NOT NULL ORDER BY id').all() as { id: string }[]).map((x) => x.id)

describe('svix signature', () => {
  it('accepts its own signature and refuses a wrong one, an old timestamp or no headers', async () => {
    const ts = String(nowSec())
    const h = (sig: string, t = ts) => new Headers({ 'svix-id': 'i', 'svix-timestamp': t, 'svix-signature': sig })
    const good = `v1,${await signSvix(SECRET, 'i', ts, 'body')}`
    expect(await verifySvix(SECRET, h(good), 'body', nowSec())).toBe(true)
    expect(await verifySvix(SECRET, h(`v1,bad ${good}`), 'body', nowSec())).toBe(true)
    expect(await verifySvix(SECRET, h(good), 'tampered', nowSec())).toBe(false)
    expect(await verifySvix(SECRET, h(good, String(nowSec() - 3600)), 'body', nowSec())).toBe(false)
    expect(await verifySvix(SECRET, new Headers(), 'body', nowSec())).toBe(false)
    expect(await verifySvix('whsec_%%%not-base64', h(good), 'body', nowSec())).toBe(false)
  })
})

describe('POST /api/resend-webhook', () => {
  it('marks every family with a bounced address, whatever its case or « Name <…> » wrapping', async () => {
    const r = seed()
    const res = await post(r.env, { type: 'email.bounced', data: { to: ['Julie <julie@example.com>'] } })
    expect(res.status).toBe(200)
    expect(stamped(r)).toEqual(['a'])
  })
  it('also marks a spam complaint, and ignores every other event', async () => {
    const r = seed()
    await post(r.env, { type: 'email.delivered', data: { to: ['other@example.com'] } })
    expect(stamped(r)).toEqual([])
    await post(r.env, { type: 'email.complained', data: { to: ['other@example.com'] } })
    expect(stamped(r)).toEqual(['b'])
  })
  it('refuses a bad signature (401) and answers 503 when no secret is configured', async () => {
    const r = seed()
    expect((await post(r.env, { type: 'email.bounced', data: { to: ['julie@example.com'] } }, { sign: false })).status).toBe(401)
    expect((await post(r.env, { type: 'email.bounced', data: { to: ['julie@example.com'] } }, { secret: null })).status).toBe(503)
    expect(stamped(r)).toEqual([])
  })
})
