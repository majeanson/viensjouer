import { describe, expect, it } from 'vitest'
import { inQuietHours } from './reminders'

// 2030-01-15 is in winter: America/Toronto is UTC-5.
const at = (utc: string) => Math.floor(new Date(utc).getTime() / 1000)

describe('inQuietHours', () => {
  it('is quiet from 21 h to 7 h in the household zone, not by the server clock', () => {
    expect(inQuietHours(at('2030-01-15T01:59:00Z'), 'America/Toronto')).toBe(false) // 20:59 local
    expect(inQuietHours(at('2030-01-15T02:00:00Z'), 'America/Toronto')).toBe(true) // 21:00
    expect(inQuietHours(at('2030-01-15T11:59:00Z'), 'America/Toronto')).toBe(true) // 06:59
    expect(inQuietHours(at('2030-01-15T12:00:00Z'), 'America/Toronto')).toBe(false) // 07:00
  })
  it('follows the zone: the same instant is day in one place and night in another', () => {
    const t = at('2030-01-15T15:00:00Z')
    expect(inQuietHours(t, 'America/Toronto')).toBe(false) // 10:00
    expect(inQuietHours(t, 'Asia/Tokyo')).toBe(true) // 00:00 next day
  })
  it('an unknown zone never silences reminders', () => {
    expect(inQuietHours(at('2030-01-15T05:00:00Z'), 'Not/AZone')).toBe(false)
  })
})
