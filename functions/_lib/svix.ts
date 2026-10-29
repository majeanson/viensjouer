// Verifying a Svix-signed webhook (what Resend sends): HMAC-SHA256 over `${id}.${timestamp}.${body}`, keyed with the
// base64 part of the `whsec_…` secret, compared to each `v1,<base64>` in the signature header. A timestamp more than five
// minutes off is refused (a replayed request).
const TOLERANCE_SEC = 5 * 60

const b64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function signSvix(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', unb64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
}

export async function verifySvix(secret: string, headers: Headers, body: string, now: number): Promise<boolean> {
  const id = headers.get('svix-id')
  const ts = headers.get('svix-timestamp')
  const sigs = headers.get('svix-signature')
  if (!id || !ts || !sigs || !/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > TOLERANCE_SEC) return false
  let expected: string
  try {
    expected = await signSvix(secret, id, ts, body)
  } catch {
    return false // a secret that is not base64 must refuse, not throw
  }
  return sigs.split(' ').some((part) => {
    const [v, sig] = part.split(',')
    return v === 'v1' && sig === expected
  })
}
