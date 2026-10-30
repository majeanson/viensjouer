// Shapes + the few rules shared by the host side (functions/api/encounters.ts) and the
// invited side (functions/api/r/*).

export type Kind = 'park' | 'home' | 'birthday'
// « postponed »: off for now, no new date yet. The link stays open, the answers stay, the reminders wait.
export type Status = 'proposed' | 'confirmed' | 'postponed' | 'cancelled'
export const isStatus = (v: unknown): v is Status => v === 'proposed' || v === 'confirmed' || v === 'postponed' || v === 'cancelled'
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
  co_child_id?: string | null
  co_child_name?: string | null
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
  thanked_at?: number | null
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
export interface IcsEvent {
  id: string
  title: string
  starts_at: number
  ends_at: number | null
  place: string | null
  note: string | null
  address?: string | null
  status?: Status
  updated_at?: number
}

const icsStamp = (sec: number) => new Date(sec * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

// RFC 5545: a line is at most 75 OCTETS; the rest continues on the next line after a space.
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const ICS_STATUS: Record<Status, string> = { proposed: 'TENTATIVE', confirmed: 'CONFIRMED', postponed: 'TENTATIVE', cancelled: 'CANCELLED' }

// One VEVENT. The UID never changes and SEQUENCE grows with every edit, so a calendar that already has the
// event UPDATES it (time moved, cancelled) instead of adding a second one.
export function icsEvent(e: IcsEvent, url: string, nowSecs = Math.floor(Date.now() / 1000)): string[] {
  const end = e.ends_at ?? e.starts_at + 2 * 3600
  const where = [e.place, e.address].filter(Boolean).join(', ')
  return [
    'BEGIN:VEVENT',
    `UID:${e.id}@viensjouer`,
    `DTSTAMP:${icsStamp(nowSecs)}`,
    e.updated_at ? `LAST-MODIFIED:${icsStamp(e.updated_at)}` : null,
    `SEQUENCE:${e.updated_at ?? 0}`,
    `DTSTART:${icsStamp(e.starts_at)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEsc(e.title)}`,
    where ? `LOCATION:${icsEsc(where)}` : null,
    `DESCRIPTION:${icsEsc((e.note ? e.note + '\n\n' : '') + url)}`,
    `URL:${url}`,
    e.status ? `STATUS:${ICS_STATUS[e.status]}` : null,
    'END:VEVENT',
  ].filter((l): l is string => l !== null)
}

export function icsCalendar(name: string, events: string[][]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Viens jouer//FR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEsc(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.flat(),
    'END:VCALENDAR',
    '',
  ]
    .map(icsFold)
    .join('\r\n')
}

// « Ajouter à mon calendrier »: one rencontre (a download, or a subscription that keeps itself up to date).
export function toIcs(e: IcsEvent, url: string): string {
  return icsCalendar('Viens jouer', [icsEvent(e, url)])
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
