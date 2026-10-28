import { describe, expect, it } from 'vitest'
import { relativeDay } from './format'

// Counted in calendar days on the device, so late evening is still « aujourd’hui » for tonight and « demain » starts at midnight.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime() / 1000
const now = new Date(2026, 9, 28, 23, 30).getTime() // 28 Oct, 23:30 local

describe('relativeDay', () => {
  it('names today, tomorrow and the days up to a week ahead, in both languages', () => {
    expect(relativeDay(at(2026, 10, 28, 23), 'fr', now)).toBe('aujourd’hui')
    expect(relativeDay(at(2026, 10, 29, 0), 'fr', now)).toBe('demain')
    expect(relativeDay(at(2026, 10, 31), 'fr', now)).toBe('dans 3 jours')
    expect(relativeDay(at(2026, 10, 29, 9), 'en', now)).toBe('tomorrow')
    expect(relativeDay(at(2026, 11, 3), 'en', now)).toBe('in 6 days')
  })
  it('says nothing for the past or beyond a week (the date already says it)', () => {
    expect(relativeDay(at(2026, 10, 27), 'fr', now)).toBeNull()
    expect(relativeDay(at(2026, 11, 4), 'fr', now)).toBeNull()
  })
})
