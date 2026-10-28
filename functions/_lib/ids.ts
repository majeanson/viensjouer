// Opaque ids + tokens. crypto.getRandomValues is available in the Workers runtime.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// 12 chars ≈ 71 bits for a row id; 32 chars for a capability (a reply link).
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

// The share-link code: two plain words and a number, « lune-pain-482 » — easy to say, spell and write on a
// paper (words.ts has the list and the honest strength trade). The code IS the credential (one
// rencontre, one family, dead after the date) behind a per-address rate limit. Older 8-character
// codes (« h7kq-3wpm ») still resolve: normalizeLinkCode accepts both shapes and forgives case, spaces,
// dots, accents and the hyphen.
import { WORDS } from './words'

// Uniform integer in [0, n) by rejection sampling, so no word is likelier than another.
function randBelow(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n
  const a = new Uint32Array(1)
  do crypto.getRandomValues(a)
  while (a[0] >= limit)
  return a[0] % n
}

export function newLinkCode(): string {
  const first = WORDS[randBelow(WORDS.length)]
  let second = WORDS[randBelow(WORDS.length)]
  while (second === first) second = WORDS[randBelow(WORDS.length)]
  return `${first}-${second}-${100 + randBelow(900)}`
}

const NEW_SHAPE = /^[a-z]{3,6}-[a-z]{3,6}-\d{3}$/
export function normalizeLinkCode(raw: string | undefined | null): string | null {
  if (!raw) return null
  const s = raw.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s_.,]+/g, '-')
  if (NEW_SHAPE.test(s)) return s
  const flat = s.replace(/[^a-z0-9]/g, '')
  return flat.length === 8 ? flat : null
}

// How a code is WRITTEN: a new one already is; an old 8-character one gets its hyphen.
export function paperCode(token: string): string {
  if (token.includes('-')) return token
  return token.length === 8 ? `${token.slice(0, 4)}-${token.slice(4)}` : token
}

// A code that no row of `table` holds yet. The space is ~1.3e8, so a clash is rare but real, and a
// UNIQUE violation must never reach a parent as a 500.
export async function freshLinkCode(db: D1Database, table: 'invitations' | 'window_targets'): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = newLinkCode()
    if (!(await db.prepare(`SELECT 1 AS x FROM ${table} WHERE token = ?`).bind(code).first())) return code
  }
  throw new Error('link code space exhausted')
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
