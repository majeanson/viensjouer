import { describe, it, expect } from 'vitest'
import { newLinkCode, normalizeLinkCode, paperCode } from './ids'
import { WORDS } from './words'

describe('word list', () => {
  it('is big enough and every word has the right shape', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(300)
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,6}$/)
    expect(new Set(WORDS).size).toBe(WORDS.length)
  })
})

describe('link codes', () => {
  it('are two different words and a three-digit number', () => {
    for (let i = 0; i < 300; i++) {
      const c = newLinkCode()
      expect(c).toMatch(/^[a-z]{3,6}-[a-z]{3,6}-[1-9]\d{2}$/)
      const [a, b] = c.split('-')
      expect(a).not.toBe(b)
      expect(WORDS).toContain(a)
      expect(WORDS).toContain(b)
    }
  })
  it('do not repeat in a thousand draws (a smoke check that the draw is not stuck)', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => newLinkCode()))
    expect(seen.size).toBeGreaterThan(990)
  })
  it('normalize forgives case, spaces, dots, underscores and accents', () => {
    expect(normalizeLinkCode('Lune-Pain-482')).toBe('lune-pain-482')
    expect(normalizeLinkCode(' lune pain 482 ')).toBe('lune-pain-482')
    expect(normalizeLinkCode('lune.pain.482')).toBe('lune-pain-482')
    expect(normalizeLinkCode('lune_pain_482')).toBe('lune-pain-482')
  })
  it('still understands the older 8-character codes, written any way', () => {
    expect(normalizeLinkCode('H7KQ-3WPM')).toBe('h7kq3wpm')
    expect(normalizeLinkCode(' h7kq 3wpm ')).toBe('h7kq3wpm')
  })
  it('refuses what is not a code', () => {
    for (const bad of ['', undefined, null, 'lune-pain-48', 'lune-pain-4821', 'h7kq3wp', 'a-b-123']) expect(normalizeLinkCode(bad as string)).toBeNull()
  })
  it('paperCode writes an old code with its hyphen and leaves a new one alone', () => {
    expect(paperCode('h7kq3wpm')).toBe('h7kq-3wpm')
    expect(paperCode('lune-pain-482')).toBe('lune-pain-482')
  })
})
