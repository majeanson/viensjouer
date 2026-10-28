import { describe, it, expect } from 'vitest'
import { repeatTimes } from './repeat'

const at = (y: number, m: number, d: number, h = 10) => Math.floor(new Date(y, m - 1, d, h, 0, 0).getTime() / 1000)
const day = (sec: number) => {
  const d = new Date(sec * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.getHours()}h`
}

describe('repeatTimes', () => {
  it('once is just the start', () => {
    expect(repeatTimes(at(2026, 11, 7), 'once', 8)).toEqual([at(2026, 11, 7)])
  })
  it('every week / every 2 weeks, the clock staying at 10 h', () => {
    expect(repeatTimes(at(2026, 11, 7), 'week', 3).map(day)).toEqual(['2026-11-07 10h', '2026-11-14 10h', '2026-11-21 10h'])
    expect(repeatTimes(at(2026, 11, 7), 'biweek', 3).map(day)).toEqual(['2026-11-07 10h', '2026-11-21 10h', '2026-12-05 10h'])
  })
  it('every month keeps the day of the month', () => {
    expect(repeatTimes(at(2026, 11, 7), 'month', 4).map(day)).toEqual(['2026-11-07 10h', '2026-12-07 10h', '2027-01-07 10h', '2027-02-07 10h'])
  })
  it('a month that is too short lands on its last day instead of spilling over', () => {
    expect(repeatTimes(at(2026, 1, 31), 'month', 4).map(day)).toEqual(['2026-01-31 10h', '2026-02-28 10h', '2026-03-31 10h', '2026-04-30 10h'])
    expect(repeatTimes(at(2027, 12, 31), 'month', 3).map(day)).toEqual(['2027-12-31 10h', '2028-01-31 10h', '2028-02-29 10h'])
  })
  it('keeps the wall-clock time across the spring and autumn clock changes', () => {
    for (const t of repeatTimes(at(2026, 3, 1), 'week', 12)) expect(new Date(t * 1000).getHours()).toBe(10)
    for (const t of repeatTimes(at(2026, 10, 25), 'week', 8)) expect(new Date(t * 1000).getHours()).toBe(10)
  })
  it('clamps the count to 1..12 and always starts at the start', () => {
    expect(repeatTimes(at(2026, 11, 7), 'week', 50)).toHaveLength(12)
    expect(repeatTimes(at(2026, 11, 7), 'week', 0)).toHaveLength(1)
    expect(repeatTimes(at(2026, 11, 7), 'month', 5)[0]).toBe(at(2026, 11, 7))
  })
  it('twelve months fit the server\'s one-year window', () => {
    const t = repeatTimes(at(2026, 11, 7), 'month', 12)
    expect(t[t.length - 1] - t[0]).toBeLessThanOrEqual(366 * 86400)
  })
})
