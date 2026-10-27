import { describe, it, expect } from 'vitest'
import { nextBirthday, todayIn } from './birthdays'

describe('nextBirthday', () => {
  it('is today when it is today, turning the right age', () => {
    expect(nextBirthday('2023-04-10', '2026-04-10')).toEqual({ date: '2026-04-10', turns: 3 })
  })
  it('rolls to next year once it has passed', () => {
    expect(nextBirthday('2023-04-10', '2026-04-11')).toEqual({ date: '2027-04-10', turns: 4 })
  })
  it('celebrates Feb 29 on Feb 28 in a non-leap year, Feb 29 in a leap one', () => {
    expect(nextBirthday('2020-02-29', '2026-01-01')).toEqual({ date: '2026-02-28', turns: 6 })
    expect(nextBirthday('2020-02-29', '2027-03-01')).toEqual({ date: '2028-02-29', turns: 8 })
  })
  it('refuses bad or future-only input', () => {
    expect(nextBirthday(null, '2026-01-01')).toBeNull()
    expect(nextBirthday('nope', '2026-01-01')).toBeNull()
    expect(nextBirthday('2030-05-05', '2026-01-01')).toBeNull()
  })
})

describe('todayIn', () => {
  it('uses the zone, not UTC: 03:00Z on the 11th is still the 10th in Toronto', () => {
    expect(todayIn('America/Toronto', new Date('2026-04-11T03:00:00Z'))).toBe('2026-04-10')
    expect(todayIn('UTC', new Date('2026-04-11T03:00:00Z'))).toBe('2026-04-11')
  })
})
