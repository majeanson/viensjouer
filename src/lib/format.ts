import type { Lang } from '../i18n'

// Cached formatters: constructing Intl.DateTimeFormat costs ~100 µs each.
const cache = new Map<string, Intl.DateTimeFormat>()
function f(lang: Lang, opts: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const k = `${lang}|${key}`
  let x = cache.get(k)
  if (!x) {
    x = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', opts)
    cache.set(k, x)
  }
  return x
}

export const whenLong = (sec: number, lang: Lang) =>
  f(lang, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }, 'long').format(new Date(sec * 1000))

export const whenDay = (sec: number, lang: Lang) =>
  f(lang, { weekday: 'long', day: 'numeric', month: 'long' }, 'day').format(new Date(sec * 1000))

export const whenShort = (sec: number, lang: Lang) =>
  f(lang, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }, 'short').format(new Date(sec * 1000))

// « aujourd’hui », « demain », « dans 3 jours » for a date within the coming week, else null (the weekday and date
// already say it). Counted in calendar days on the device, so « demain » means tomorrow for the person reading it.
export function relativeDay(sec: number, lang: Lang, nowMs = Date.now()): string | null {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000
  const diff = day(new Date(sec * 1000)) - day(new Date(nowMs))
  if (diff < 0 || diff > 6) return null
  return new Intl.RelativeTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { numeric: 'auto' }).format(diff, 'day')
}

export const timeOnly = (sec: number, lang: Lang) => f(lang, { hour: 'numeric', minute: '2-digit' }, 'time').format(new Date(sec * 1000))

// <input type="datetime-local"> ↔ unix seconds, in the browser's zone.
export function toLocalInput(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInput(v: string): number | null {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

// Next Saturday 10:00 — the default a park meet-up almost always wants.
export function nextSaturdayTen(): number {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
  d.setHours(10, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export function ageLabel(birthdate: string | null, lang: Lang): string | null {
  if (!birthdate) return null
  const b = new Date(birthdate + 'T12:00:00')
  if (!Number.isFinite(b.getTime())) return null
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months--
  if (months < 0) return null
  if (months < 24) return lang === 'fr' ? `${months} mois` : `${months} mo`
  const y = Math.floor(months / 12)
  return lang === 'fr' ? `${y} ans` : `${y} yrs`
}

// « Jusqu'à (facultatif) » is only a TIME on the day of « Quand »: nothing runs past midnight, so the
// end is on the same day and must come after the start. Anything else is null (the form says so).
export function endFromTime(startSec: number, hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const d = new Date(startSec * 1000)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  const end = Math.floor(d.getTime() / 1000)
  return end > startSec ? end : null
}

// The time of day of an instant as « HH:MM » for an <input type="time">.
export function toLocalTime(sec: number): string {
  const d = new Date(sec * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// « samedi 10 h » — the weekday and the hour, for an automatic title.
export const dayHour = (sec: number, lang: Lang) => {
  const d = new Date(sec * 1000)
  return d.getMinutes() === 0
    ? f(lang, { weekday: 'long', hour: 'numeric' }, 'dayh').format(d)
    : f(lang, { weekday: 'long', hour: 'numeric', minute: '2-digit' }, 'dayhm').format(d)
}

// The next given weekday (0 = Sunday) at 10:00, or tomorrow at 10:00 (weekday = -1).
export function nextAt(weekday: number, hour = 10): number {
  const d = new Date()
  if (weekday < 0) d.setDate(d.getDate() + 1)
  else d.setDate(d.getDate() + (((weekday - d.getDay() + 7) % 7) || 7))
  d.setHours(hour, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

// The same weekday and time, one or more weeks on, until it is ahead of now (« Refaire pareil »).
export function sameSlotAhead(sec: number): number {
  const d = new Date(sec * 1000)
  while (d.getTime() <= Date.now()) d.setDate(d.getDate() + 7)
  return Math.floor(d.getTime() / 1000)
}

// « Avant / après la sieste » on the new-rencontre form. A nap time is 'HH:MM'. Several children (the host's and every picked
// friend): the early slot clears the EARLIEST nap start, the late one the LATEST nap end. Not set: before = 10 h, after = 15 h.
// Set: after is when the nap ends; before is two hours ahead of when it starts (never earlier than 8 h).
type Nap = { nap_start?: string | null; nap_end?: string | null }
export function napSlots(naps: Nap | Nap[]): { before: string; after: string } {
  const list = Array.isArray(naps) ? naps : [naps]
  const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const starts = list.flatMap((n) => (n.nap_start ? [mins(n.nap_start)] : []))
  const ends = list.flatMap((n) => (n.nap_end ? [mins(n.nap_end)] : []))
  const before = starts.length ? hhmm(Math.max(8 * 60, Math.floor((Math.min(...starts) - 120) / 30) * 30)) : '10:00'
  return { before, after: ends.length ? hhmm(Math.max(...ends)) : '15:00' }
}

// 'HH:MM' as a short clock: « 13 h 30 » in French, « 1:30 pm » in English.
export function clockLabel(hhmm: string, lang: Lang): string {
  const h = Number(hhmm.slice(0, 2))
  const m = hhmm.slice(3, 5)
  if (lang === 'fr') return m === '00' ? `${h} h` : `${h} h ${m}`
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}
