// Shapes + the few rules shared by the host side (functions/api/encounters.ts) and the
// invited side (functions/api/r/*).

export type Kind = 'park' | 'home' | 'birthday'
export type Status = 'proposed' | 'confirmed' | 'cancelled'
export type Reply = 'yes' | 'no' | 'maybe'

export const KINDS: Kind[] = ['park', 'home', 'birthday']
export const REPLIES: Reply[] = ['yes', 'no', 'maybe']

export function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && (KINDS as string[]).includes(v)
}
export function isReply(v: unknown): v is Reply {
  return typeof v === 'string' && (REPLIES as string[]).includes(v)
}

export interface EncounterRow {
  id: string
  child_id: string
  kind: Kind
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  address: string | null
  map_url: string | null
  note: string | null
  status: Status
  here_at?: number | null
  details?: string
  cover_key?: string | null
  show_guests?: number
}

// The id at the tail of a stored cover key: what the page puts in the image URL (it also busts the cache).
export const coverId = (key: string | null | undefined): string | null => (key ? (key.split('/').pop() ?? null) : null)

// A link stays usable until a day after the rencontre (a late « merci » still lands),
// and dies the moment it is cancelled.
const LINK_GRACE_SEC = 60 * 60 * 24

export function linkAlive(e: { starts_at: number; ends_at: number | null; status: Status }, now: number): boolean {
  if (e.status === 'cancelled') return false
  return (e.ends_at ?? e.starts_at) + LINK_GRACE_SEC > now
}

// The address is the one field a stranger must not see from a forwarded link: it shows
// to a family only once they said yes.
export function addressFor(reply: Reply | null, address: string | null): string | null {
  return reply === 'yes' ? address : null
}

// iCalendar text for one rencontre. UTC instants (`Z`), which every calendar app maps
// to the reader's own zone; no VTIMEZONE block to get wrong.
export function toIcs(e: { id: string; title: string; starts_at: number; ends_at: number | null; place: string | null; note: string | null }, origin: string): string {
  const stamp = (sec: number) => new Date(sec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const end = e.ends_at ?? e.starts_at + 2 * 3600
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Viens jouer//FR',
    'BEGIN:VEVENT',
    `UID:${e.id}@viensjouer`,
    `DTSTAMP:${stamp(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${stamp(e.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.place ? `LOCATION:${esc(e.place)}` : null,
    `DESCRIPTION:${esc((e.note ? e.note + '\n\n' : '') + origin)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ]
    .filter((l): l is string => l !== null)
    .join('\r\n')
}

// An optional link to a map (Google Maps, Apple Plans, OpenStreetMap, a short link…). Only https, no
// credentials, one line. A bare « maps.app.goo.gl/x » gets its https:// added. Anything else is refused,
// so a stored link can never be a javascript: or data: URL.
export function cleanMapUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let t = v.trim()
  if (!t || t.length > 300 || /\s/.test(t)) return null
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:' || !u.hostname.includes('.') || u.username || u.password) return null
    return t
  } catch {
    return null
  }
}
