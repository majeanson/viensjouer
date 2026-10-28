// How often a rencontre comes back. Computed HERE in the browser's own zone so the wall-clock time
// stays put across a daylight-saving change (setDate / setMonth keep the clock; adding
// 7 * 86400 seconds would drift an hour twice a year). The server only checks the list it is
// handed (ascending, at most 12, within a year).
export type Frequency = 'once' | 'week' | 'biweek' | 'month'
export const FREQUENCIES: Frequency[] = ['once', 'week', 'biweek', 'month']
export const MAX_OCCURRENCES = 12

// The `i`-th occurrence after `start`. A month keeps the day of the month, and a day that does
// not exist in the target month (the 31st in April) falls on that month's last day instead of
// spilling into the next one.
function nth(start: Date, freq: Exclude<Frequency, 'once'>, i: number): Date {
  const d = new Date(start)
  if (freq === 'week') d.setDate(start.getDate() + 7 * i)
  else if (freq === 'biweek') d.setDate(start.getDate() + 14 * i)
  else {
    d.setDate(1)
    d.setMonth(start.getMonth() + i)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(start.getDate(), last))
  }
  return d
}

// Unix-second times of every occurrence, the first being `startsAt` itself. One time for
// `once`; otherwise `count` times, clamped to 1..12.
export function repeatTimes(startsAt: number, freq: Frequency, count: number): number[] {
  if (freq === 'once') return [startsAt]
  const n = Math.max(1, Math.min(MAX_OCCURRENCES, Math.floor(count) || 1))
  const start = new Date(startsAt * 1000)
  return Array.from({ length: n }, (_, i) => Math.floor(nth(start, freq, i).getTime() / 1000))
}
