import { describe, expect, it } from 'vitest'
import { clockLabel, napSlots } from './format'

describe('napSlots', () => {
  it('falls back to 10 h and 15 h when nothing is set', () => {
    expect(napSlots({ nap_start: null, nap_end: null })).toEqual({ before: '10:00', after: '15:00' })
  })
  it('after is when the nap ends, before is two hours ahead of when it starts', () => {
    expect(napSlots({ nap_start: '13:00', nap_end: '14:30' })).toEqual({ before: '11:00', after: '14:30' })
  })
  it('rounds the early slot down to the half hour and never goes before 8 h', () => {
    expect(napSlots({ nap_start: '12:50', nap_end: null }).before).toBe('10:30')
    expect(napSlots({ nap_start: '09:00', nap_end: null }).before).toBe('08:00')
  })
})

describe('clockLabel', () => {
  it('reads like the language', () => {
    expect(clockLabel('13:30', 'fr')).toBe('13 h 30')
    expect(clockLabel('15:00', 'fr')).toBe('15 h')
    expect(clockLabel('13:30', 'en')).toBe('1:30 pm')
    expect(clockLabel('00:15', 'en')).toBe('12:15 am')
  })
})

describe('napSlots with several children', () => {
  it('clears the earliest start and the latest end of everyone picked', () => {
    const slots = napSlots([{ nap_start: '13:00', nap_end: '14:30' }, { nap_start: '12:00', nap_end: '15:00' }])
    expect(slots).toEqual({ before: '10:00', after: '15:00' })
  })
  it('ignores a child with no nap, and falls back when nobody has one', () => {
    expect(napSlots([{}, { nap_start: '13:00', nap_end: '14:30' }])).toEqual({ before: '11:00', after: '14:30' })
    expect(napSlots([{}, { nap_start: null, nap_end: null }])).toEqual({ before: '10:00', after: '15:00' })
  })
})
