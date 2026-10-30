import { describe, it, expect } from 'vitest'
import { endFromTime, humanWhen, nextAt, sameSlotAhead, toLocalTime } from './format'

describe('endFromTime (same day only, nothing runs past midnight)', () => {
  const start = Math.floor(new Date(2030, 5, 15, 10, 0).getTime() / 1000)
  it('puts the end on the day of the start', () => {
    const end = endFromTime(start, '12:30')!
    expect(toLocalTime(end)).toBe('12:30')
    expect(new Date(end * 1000).getDate()).toBe(15)
  })
  it('refuses an end that is not after the start, rather than rolling to the next day', () => {
    expect(endFromTime(start, '10:00')).toBeNull()
    expect(endFromTime(start, '09:00')).toBeNull()
    expect(endFromTime(start, '01:00')).toBeNull()
  })
  it('refuses junk', () => {
    expect(endFromTime(start, '')).toBeNull()
    expect(endFromTime(start, 'noon')).toBeNull()
  })
})

describe('slots', () => {
  it('nextAt lands in the future at the hour', () => {
    for (const w of [-1, 0, 6]) {
      const at = nextAt(w)
      expect(at * 1000).toBeGreaterThan(Date.now())
      expect(new Date(at * 1000).getHours()).toBe(10)
    }
  })
  it('sameSlotAhead keeps the weekday and the time and is ahead of now', () => {
    const old = Math.floor(new Date(2020, 0, 8, 15, 30).getTime() / 1000)
    const next = sameSlotAhead(old)
    expect(next * 1000).toBeGreaterThan(Date.now())
    expect(new Date(next * 1000).getDay()).toBe(new Date(old * 1000).getDay())
    expect(toLocalTime(next)).toBe('15:30')
  })
})

describe('humanWhen (the way a parent says it)', () => {
  const now = new Date(2030, 5, 12, 8, 0).getTime() // a Wednesday
  const at = (day: number, h: number) => Math.floor(new Date(2030, 5, day, h, 0).getTime() / 1000)
  it('says today and tomorrow with the part of the day', () => {
    expect(humanWhen(at(12, 14), 'fr', now)).toBe('Aujourd’hui après-midi')
    expect(humanWhen(at(13, 9), 'fr', now)).toBe('Demain matin')
    expect(humanWhen(at(13, 18), 'en', now)).toBe('Tomorrow evening')
  })
  it('says the weekday within the week, weekday and date after', () => {
    expect(humanWhen(at(15, 10), 'fr', now)).toBe('Samedi matin')
    expect(humanWhen(at(29, 10), 'fr', now)).toBe('Samedi 29 juin, matin')
  })
})
