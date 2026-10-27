// Birthdays are DERIVED, never stored as events: a 'YYYY-MM-DD' birthdate plus today gives
// the next occurrence and the age being turned. Pure string/number maths on calendar
// dates — no Date arithmetic across zones, so DST and the household's zone cannot move a
// birthday by a day. Feb 29 is celebrated on Feb 28 in a non-leap year.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const pad = (n: number) => String(n).padStart(2, '0')

export interface NextBirthday {
  date: string // 'YYYY-MM-DD'
  turns: number
}

export function nextBirthday(birthdate: string | null | undefined, today: string): NextBirthday | null {
  const b = birthdate ? DATE_RE.exec(birthdate) : null
  const t = DATE_RE.exec(today)
  if (!b || !t) return null
  const by = +b[1]
  const bm = +b[2]
  const bd = +b[3]
  const ty = +t[1]
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null
  const on = (year: number) => (bm === 2 && bd === 29 && !isLeap(year) ? `${year}-02-28` : `${year}-${pad(bm)}-${pad(bd)}`)
  let year = ty
  let date = on(year)
  if (date < today) {
    year += 1
    date = on(year)
  }
  if (year < by) return null // born in the future: nothing to celebrate yet
  return { date, turns: year - by }
}

// « Aujourd'hui » as a YYYY-MM-DD in `tz`, for the "from" side of nextBirthday.
export function todayIn(tz: string, now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return p // en-CA is already YYYY-MM-DD
}
