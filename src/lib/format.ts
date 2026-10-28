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

// Same calendar day, in the browser's zone?
export function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a * 1000)
  const y = new Date(b * 1000)
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
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
