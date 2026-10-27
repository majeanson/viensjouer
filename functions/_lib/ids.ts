// Opaque ids + tokens. crypto.getRandomValues is available in the Workers runtime.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// 12 chars ≈ 71 bits for a row id; 32 chars for a capability (a reply link).
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// SHA-256 hex. A reply link's token is stored hashed, never raw: the database holds
// nothing that opens a door.
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const nowSec = () => Math.floor(Date.now() / 1000)

// Every household is in one zone for now (Québec). A `tz` column on households
// exists from day one so this becomes a per-household read without a reshape.
export const DEFAULT_TZ = 'America/Toronto'

// Constructing an Intl formatter costs ~100 µs; cache one per (tz, shape).
const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string, lang: 'fr' | 'en', shape: 'long' | 'time'): Intl.DateTimeFormat {
  const key = `${tz}|${lang}|${shape}`
  let f = fmtCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(
      lang === 'fr' ? 'fr-CA' : 'en-CA',
      shape === 'long'
        ? { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }
        : { timeZone: tz, hour: 'numeric', minute: '2-digit' },
    )
    fmtCache.set(key, f)
  }
  return f
}

// « samedi 7 novembre, 10 h 00 » for an instant, in the household's zone. Used in
// emails and the .ics description, where the reader has no browser Intl of their own.
export function whenLong(sec: number, lang: 'fr' | 'en' = 'fr', tz = DEFAULT_TZ): string {
  return fmt(tz, lang, 'long').format(new Date(sec * 1000))
}

export function whenTime(sec: number, lang: 'fr' | 'en' = 'fr', tz = DEFAULT_TZ): string {
  return fmt(tz, lang, 'time').format(new Date(sec * 1000))
}
