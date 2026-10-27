import { describe, it, expect } from 'vitest'
import { LINK_CODE_LEN, newLinkCode, normalizeLinkCode } from './ids'

describe('link codes', () => {
  it('are 8 lowercase chars with no look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const c = newLinkCode()
      expect(c).toHaveLength(LINK_CODE_LEN)
      expect(c).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/)
    }
  })
  it('normalize forgives the paper spelling and refuses the wrong length', () => {
    expect(normalizeLinkCode('H7KQ-3WPM')).toBe('h7kq3wpm')
    expect(normalizeLinkCode(' h7kq 3wpm ')).toBe('h7kq3wpm')
    expect(normalizeLinkCode('h7kq3wp')).toBeNull()
    expect(normalizeLinkCode('')).toBeNull()
    expect(normalizeLinkCode(undefined)).toBeNull()
  })
})
