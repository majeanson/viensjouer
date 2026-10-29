import { describe, it, expect } from 'vitest'
import { cleanTz, freshLinkCode, newLinkCode, normalizeLinkCode, paperCode } from './ids'
import { WORDS } from './words'

describe('word list', () => {
  it('has 2,048 or more words, each of the right shape, none twice', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(2048)
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,7}$/)
    expect(new Set(WORDS).size).toBe(WORDS.length)
  })
  it('keeps out what a child should not read, whatever else changes', () => {
    const banned = ['merde', 'putain', 'pute', 'con', 'cul', 'bite', 'sexe', 'salope', 'chier', 'foutre', 'baise', 'nique', 'bordel', 'mort', 'tuer', 'sang', 'guerre', 'arme', 'bombe', 'viol', 'drogue', 'nazi', 'pouf', 'morue', 'grue', 'cafard', 'boudin', 'moule', 'pipe', 'culotte', 'troll', 'ogre']
    for (const b of banned) expect(WORDS).not.toContain(b)
  })
  it('keeps the words the links are supposed to sound like', () => {
    for (const w of ['lune', 'miel', 'chat', 'ours', 'poule', 'plage', 'ballon']) expect(WORDS).toContain(w)
  })
})

describe('link codes', () => {
  it('are two different listed words, nothing else', () => {
    for (let i = 0; i < 400; i++) {
      const c = newLinkCode()
      expect(c).toMatch(/^[a-z]{3,7}-[a-z]{3,7}$/)
      const [a, b] = c.split('-')
      expect(a).not.toBe(b)
      expect(WORDS).toContain(a)
      expect(WORDS).toContain(b)
    }
  })
  it('are not stuck: a thousand draws are almost all different', () => {
    expect(new Set(Array.from({ length: 1000 }, () => newLinkCode())).size).toBeGreaterThan(990)
  })
  it('every word is reachable (a uniform draw, not a biased one)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20000; i++) for (const w of newLinkCode().split('-')) seen.add(w)
    expect(seen.size).toBeGreaterThan(WORDS.length * 0.95)
  })
  it('normalize forgives case, spaces, dots, underscores and accents', () => {
    expect(normalizeLinkCode('Lune-Miel')).toBe('lune-miel')
    expect(normalizeLinkCode(' lune miel ')).toBe('lune-miel')
    expect(normalizeLinkCode('lune.miel')).toBe('lune-miel')
    expect(normalizeLinkCode('LUNE_MIEL')).toBe('lune-miel')
    expect(normalizeLinkCode('lüne  miel')).toBe('lune-miel')
  })
  it('still understands the older 8-character codes, written any way (even an all-letter one)', () => {
    expect(normalizeLinkCode('H7KQ-3WPM')).toBe('h7kq3wpm')
    expect(normalizeLinkCode(' h7kq 3wpm ')).toBe('h7kq3wpm')
    expect(normalizeLinkCode('abcd-efgh')).toBe('abcdefgh')
  })
  it('refuses what is not a code', () => {
    for (const bad of ['', undefined, null, 'lune', 'zzzzz-yyyyy', 'h7kq3wp', 'a-b']) expect(normalizeLinkCode(bad as string)).toBeNull()
  })
  it('paperCode writes an old code with its hyphen and leaves a new one alone', () => {
    expect(paperCode('h7kq3wpm')).toBe('h7kq-3wpm')
    expect(paperCode('lune-miel')).toBe('lune-miel')
  })
})

describe('freshLinkCode', () => {
  it('retries a clash and gives up loudly rather than return a taken code', async () => {
    let calls = 0
    const takeFirstThree = {
      prepare: () => ({ bind: () => ({ first: async () => (++calls <= 3 ? { x: 1 } : null) }) }),
    } as unknown as D1Database
    const c = await freshLinkCode(takeFirstThree, 'invitations')
    expect(c).toMatch(/^[a-z]+-[a-z]+$/)
    expect(calls).toBe(4)
    const everythingTaken = { prepare: () => ({ bind: () => ({ first: async () => ({ x: 1 }) }) }) } as unknown as D1Database
    await expect(freshLinkCode(everythingTaken, 'invitations')).rejects.toThrow(/exhausted/)
  })
})

describe('cleanTz', () => {
  it('keeps a real zone and refuses anything else', () => {
    expect(cleanTz('Europe/Paris')).toBe('Europe/Paris')
    expect(cleanTz('Mars/Olympus')).toBeNull()
    expect(cleanTz('')).toBeNull()
    expect(cleanTz(42)).toBeNull()
  })
})
