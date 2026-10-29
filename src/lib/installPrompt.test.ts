import { describe, expect, it } from 'vitest'
import { bumpVisits, shouldOffer } from './installPrompt'

describe('install offer', () => {
  it('counts a day once, however many times the app is opened that day', () => {
    let v = bumpVisits(null, '2030-01-01')
    expect(v).toEqual({ n: 1, last: '2030-01-01' })
    v = bumpVisits(v, '2030-01-01')
    expect(v.n).toBe(1)
    v = bumpVisits(v, '2030-01-02')
    expect(v.n).toBe(2)
  })
  it('offers from the third day on, once, and never to an installed app', () => {
    expect(shouldOffer({ n: 2, last: 'x' }, false, false)).toBe(false)
    expect(shouldOffer({ n: 3, last: 'x' }, false, false)).toBe(true)
    expect(shouldOffer({ n: 9, last: 'x' }, true, false)).toBe(false)
    expect(shouldOffer({ n: 9, last: 'x' }, false, true)).toBe(false)
  })
})
