// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { pushEnabled, pushTickle, vapidAuthorization } from './webpush'

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

let env: Parameters<typeof pushTickle>[0]
let publicKey: CryptoKey
beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  publicKey = pair.publicKey
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  env = { VAPID_PUBLIC_KEY: b64u(raw), VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', pair.privateKey)), VAPID_SUBJECT: 'mailto:me@example.org' } as never
})

describe('VAPID', () => {
  it('is on only when the three values are there', () => {
    expect(pushEnabled(env)).toBe(true)
    expect(pushEnabled({ ...env, VAPID_SUBJECT: undefined } as never)).toBe(false)
    expect(pushEnabled({} as never)).toBe(false)
  })
  it('signs a short ES256 token for the push service that names this app', async () => {
    const auth = await vapidAuthorization(env, 'https://web.push.apple.com/abc/def', 1_000_000)
    const m = auth.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/)!
    expect(m).not.toBeNull()
    expect(m[4]).toBe(env.VAPID_PUBLIC_KEY)
    const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])))
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: 1_000_000 + 12 * 3600, sub: 'mailto:me@example.org' })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))
    expect(ok).toBe(true)
  })
})

describe('pushTickle', () => {
  const answer = (status: number) => (async () => new Response(null, { status })) as unknown as typeof fetch
  it('wakes a device with an empty push, and tells apart a dropped subscription from a hiccup', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const spy = (async (url: string, init: RequestInit) => ((seen = { url, init }), new Response(null, { status: 201 }))) as unknown as typeof fetch
    expect(await pushTickle(env, 'https://fcm.googleapis.com/fcm/send/xyz', 1, spy)).toBe('ok')
    expect(seen!.init.body).toBeUndefined()
    expect((seen!.init.headers as Record<string, string>).TTL).toBe('3600')
    expect((seen!.init.headers as Record<string, string>).Authorization).toMatch(/^vapid t=/)
    expect(await pushTickle(env, 'https://x.example/s', 1, answer(410))).toBe('gone')
    expect(await pushTickle(env, 'https://x.example/s', 1, answer(404))).toBe('gone')
    expect(await pushTickle(env, 'https://x.example/s', 1, answer(500))).toBe('failed')
  })
  it('never calls out for a non-https endpoint, a broken one, or when push is off', async () => {
    const boom = (async () => { throw new Error('should not be called') }) as unknown as typeof fetch
    expect(await pushTickle(env, 'http://x.example/s', 1, boom)).toBe('failed')
    expect(await pushTickle(env, 'not a url', 1, boom)).toBe('failed')
    expect(await pushTickle({} as never, 'https://x.example/s', 1, boom)).toBe('failed')
  })
})
