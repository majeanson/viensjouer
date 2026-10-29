// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from './testDb'
import { turnstilePasses, turnstileSiteKey } from './turnstile'
import { onRequestPost as forgot } from '../api/auth/forgot'
import { onRequestPost as signup } from '../api/auth/signup'

const on = { TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET: 'sec' } as never
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('turnstilePasses', () => {
  it('is a pass, and invisible, when it is not configured', async () => {
    expect(turnstileSiteKey({} as never)).toBeNull()
    expect(turnstileSiteKey({ TURNSTILE_SITE_KEY: 'site' } as never)).toBeNull() // half a switch is off
    expect(await turnstilePasses({} as never, undefined, null)).toBe(true)
  })
  it('needs a token, and Cloudflare saying yes', async () => {
    expect(await turnstilePasses(on, undefined, null, reply({ success: true }))).toBe(false)
    expect(await turnstilePasses(on, '', null, reply({ success: true }))).toBe(false)
    expect(await turnstilePasses(on, 'tok', '1.2.3.4', reply({ success: true }))).toBe(true)
    expect(await turnstilePasses(on, 'tok', null, reply({ success: false }))).toBe(false)
    expect(await turnstilePasses(on, 'tok', null, reply({}, 500))).toBe(false)
  })
  it('sends the secret, the token and the address to Cloudflare, and fails closed when it cannot reach it', async () => {
    let seen = ''
    const spy = (async (_u: string, init: { body: URLSearchParams }) => ((seen = init.body.toString()), new Response('{"success":true}'))) as unknown as typeof fetch
    await turnstilePasses(on, 'tok', '1.2.3.4', spy)
    expect(seen).toBe('secret=sec&response=tok&remoteip=1.2.3.4')
    expect(await turnstilePasses(on, 'tok', null, (async () => { throw new Error('down') }) as unknown as typeof fetch)).toBe(false)
  })
})

describe('the two doors', () => {
  const post = (fn: typeof forgot, path: string, body: unknown, env: object) => {
    const r = realDb()
    return fn({ env: { ...r.env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c', ...env }, request: new Request(`https://x.test/api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '9.9.9.9' }, body: JSON.stringify(body) }) } as never) as Promise<Response>
  }
  it('refuse a request with no token when the check is on, before anything else happens', async () => {
    expect((await post(forgot, 'auth/forgot', { email: 'a@b.co' }, on as object)).status).toBe(400)
    expect((await post(signup, 'auth/signup', { email: 'a@b.co', password: 'longenough', displayName: 'A' }, on as object)).status).toBe(400)
  })
  it('behave as before when the check is off', async () => {
    expect((await post(forgot, 'auth/forgot', { email: 'a@b.co' }, {})).status).toBe(200)
  })
})
