import { describe, it, expect } from 'vitest'
import { seriesTimes } from './encounters'

const DAY = 86_400
describe('seriesTimes', () => {
  it('is a single occurrence when no list is sent', () => {
    expect(seriesTimes(1000, undefined)).toEqual([1000])
  })
  it('accepts an ascending list that starts at startsAt', () => {
    const l = [1000, 1000 + 7 * DAY, 1000 + 14 * DAY]
    expect(seriesTimes(1000, l)).toEqual(l)
  })
  it('refuses a list that does not start at startsAt, is unordered, or has junk', () => {
    expect(seriesTimes(1000, [2000, 3000])).toBeNull()
    expect(seriesTimes(1000, [1000, 900])).toBeNull()
    expect(seriesTimes(1000, [1000, 1000])).toBeNull()
    expect(seriesTimes(1000, [1000, 'x'])).toBeNull()
    expect(seriesTimes(1000, [])).toBeNull()
    expect(seriesTimes(1000, 'nope')).toBeNull()
  })
  it('caps at 12 occurrences and one year', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => 1000 + i * 7 * DAY)
    expect(seriesTimes(1000, twelve)).toEqual(twelve)
    expect(seriesTimes(1000, [...twelve, 1000 + 12 * 7 * DAY])).toBeNull()
    expect(seriesTimes(1000, [1000, 1000 + 400 * DAY])).toBeNull()
  })
})
