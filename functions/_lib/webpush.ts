// Web Push with NO payload: the push tells the phone « there is news », the service worker then asks the server what it is
// (GET /api/notifications?push=1) and shows it. No message encryption to get wrong, nothing readable ever travels through
// Apple's, Google's or Mozilla's push service, and the text can be in the recipient's language. Authenticated to the push
// service with VAPID (RFC 8292): a short-lived ES256 token naming this app.
//   VAPID_PUBLIC_KEY   the uncompressed P-256 point, base64url (public: /api/health hands it to the page)
//   VAPID_PRIVATE_KEY  the private key as a JWK, as JSON (a secret: `wrangler secret put VAPID_PRIVATE_KEY`)
//   VAPID_SUBJECT      « mailto:you@example.com »: who the push service may write to if this app misbehaves
// All three unset → push is off, the in-app notifications still work.
import type { Env } from './env'

export function pushEnabled(env: Env): boolean {
  return !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY && !!env.VAPID_SUBJECT
}

const b64u = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const text = (v: unknown) => b64u(new TextEncoder().encode(JSON.stringify(v)))

export async function vapidAuthorization(env: Env, endpoint: string, nowSecs: number): Promise<string> {
  const head = text({ typ: 'JWT', alg: 'ES256' })
  const claims = text({ aud: new URL(endpoint).origin, exp: nowSecs + 12 * 3600, sub: env.VAPID_SUBJECT })
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_KEY!), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  // WebCrypto signs ES256 as the raw 64 bytes (r then s), which is exactly what a JWT wants.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`))
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`
}

export type PushResult = 'ok' | 'gone' | 'failed'

/** Wake one device. `gone` (404 or 410) means the browser dropped the subscription: the caller deletes it. */
export async function pushTickle(env: Env, endpoint: string, nowSecs: number, fetchImpl: typeof fetch = fetch): Promise<PushResult> {
  if (!pushEnabled(env)) return 'failed'
  try {
    if (new URL(endpoint).protocol !== 'https:') return 'failed'
    const res = await fetchImpl(endpoint, { method: 'POST', headers: { Authorization: await vapidAuthorization(env, endpoint, nowSecs), TTL: '3600', Urgency: 'normal', 'Content-Length': '0' } })
    if (res.status === 404 || res.status === 410) return 'gone'
    return res.ok ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}
