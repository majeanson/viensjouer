import { describe, it, expect } from 'vitest'
import { cleanCount, cleanDetails, cleanHomeCard, hereAllowed, homeCardOrNull, parseDetails, souvenirsVisible } from './kinds'
import { sniffImage } from './photos'

describe('cleanHomeCard / homeCardOrNull', () => {
  it('keeps only the known shape and trims the note', () => {
    const c = cleanHomeCard({ dog: true, pool: 'yes', screens: 'little', nutFree: true, note: '  Le chien est doux  ', extra: 1 })
    expect(c).toEqual({ dog: true, pool: false, screens: 'little', nutFree: true, note: 'Le chien est doux' })
  })
  it('rejects an unknown screens value and caps the note', () => {
    expect(cleanHomeCard({ screens: 'always' }).screens).toBeNull()
    expect(cleanHomeCard({ note: 'x'.repeat(900) }).note).toHaveLength(400)
  })
  it('an empty or never-filled card reads as nothing to show', () => {
    expect(homeCardOrNull(null)).toBeNull()
    expect(homeCardOrNull('{}')).toBeNull()
    expect(homeCardOrNull('not json')).toBeNull()
    expect(homeCardOrNull(JSON.stringify({ dog: true }))?.dog).toBe(true)
  })
})

describe('cleanDetails', () => {
  it('only a birthday keeps a gift wish, trimmed and capped', () => {
    expect(cleanDetails('birthday', { gift: '  des livres  ' })).toEqual({ gift: 'des livres' })
    expect(cleanDetails('birthday', { gift: '   ' })).toEqual({})
    expect(cleanDetails('park', { gift: 'x' })).toEqual({})
    expect(cleanDetails('birthday', 'nope')).toEqual({})
  })
  it('parseDetails survives junk', () => {
    expect(parseDetails('[1]')).toEqual({})
    expect(parseDetails('nope')).toEqual({})
    expect(parseDetails('{"gift":"a"}')).toEqual({ gift: 'a' })
  })
})

describe('hereAllowed', () => {
  const e = { starts_at: 100_000, ends_at: null, status: 'confirmed' as const }
  it('opens three hours before and closes six hours after the end', () => {
    expect(hereAllowed(e, 100_000 - 3 * 3600 - 1)).toBe(false)
    expect(hereAllowed(e, 100_000 - 3 * 3600)).toBe(true)
    expect(hereAllowed(e, 100_000 + 2 * 3600 + 6 * 3600)).toBe(true)
    expect(hereAllowed(e, 100_000 + 2 * 3600 + 6 * 3600 + 1)).toBe(false)
  })
  it('never on a cancelled one', () => {
    expect(hereAllowed({ ...e, status: 'cancelled' }, 100_000)).toBe(false)
  })
})

describe('souvenirsVisible', () => {
  const now = 10_000_000
  const e = { starts_at: now - 86_400, status: 'confirmed' as const }
  it('only to a family that said yes, once it has started, for 60 days', () => {
    expect(souvenirsVisible(e, 'yes', now)).toBe(true)
    expect(souvenirsVisible(e, 'maybe', now)).toBe(false)
    expect(souvenirsVisible(e, null, now)).toBe(false)
    expect(souvenirsVisible({ ...e, starts_at: now + 7200 }, 'yes', now)).toBe(false)
    expect(souvenirsVisible({ ...e, starts_at: now - 61 * 86_400 }, 'yes', now)).toBe(false)
    expect(souvenirsVisible({ ...e, status: 'cancelled' }, 'yes', now)).toBe(false)
  })
})

describe('cleanCount', () => {
  it('accepts small whole numbers only', () => {
    expect(cleanCount(0)).toBe(0)
    expect(cleanCount(3)).toBe(3)
    expect(cleanCount(21)).toBeNull()
    expect(cleanCount(-1)).toBeNull()
    expect(cleanCount(1.5)).toBeNull()
    expect(cleanCount('2')).toBeNull()
  })
})

describe('sniffImage', () => {
  const bytes = (...n: number[]) => new Uint8Array(n)
  it('reads the magic bytes, not a header', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
    expect(sniffImage(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
  })
  it('refuses an svg, a script and an empty file', () => {
    expect(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<script>'))).toBeNull()
    expect(sniffImage(bytes())).toBeNull()
  })
})

import { defaultScope, headcount, isScope, kidsComing } from './kinds'
describe('invitation scope', () => {
  it('a birthday defaults to the friend only, everything else to the whole family', () => {
    expect(defaultScope('birthday')).toBe('friend')
    expect(defaultScope('park')).toBe('family')
    expect(defaultScope('home')).toBe('family')
  })
  it('only the two scopes are accepted', () => {
    expect(isScope('friend')).toBe(true)
    expect(isScope('family')).toBe(true)
    expect(isScope('all')).toBe(false)
    expect(isScope(undefined)).toBe(false)
  })
  it('a friend-only answer never stores a number of children; only a birthday stores adults', () => {
    expect(headcount('birthday', 'friend', { adults: 2, kids: 3 })).toEqual({ adults: 2, kids: null })
    expect(headcount('park', 'family', { adults: 2, kids: 3 })).toEqual({ adults: null, kids: 3 })
    expect(headcount('birthday', 'family', { adults: 1, kids: 2 })).toEqual({ adults: 1, kids: 2 })
    expect(headcount('park', 'family', { kids: 99 })).toEqual({ adults: null, kids: null })
  })
  it('counts one child for a friend-only invitation and what was said (or one) for a family', () => {
    expect(kidsComing('friend', 5)).toBe(1)
    expect(kidsComing('family', 3)).toBe(3)
    expect(kidsComing('family', null)).toBe(1)
  })
})
