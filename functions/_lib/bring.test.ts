import { describe, it, expect } from 'vitest'
import { canClaim, cleanLabel } from './bring'

describe('cleanLabel', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(cleanLabel('  la   collation ')).toBe('la collation')
    expect(cleanLabel('x'.repeat(100))).toHaveLength(60)
  })
  it('refuses empty and non-text', () => {
    for (const v of ['', '   ', null, undefined, 4]) expect(cleanLabel(v)).toBeNull()
  })
})

describe('canClaim', () => {
  it('lets yes and maybe take something, nobody else', () => {
    expect(canClaim('yes')).toBe(true)
    expect(canClaim('maybe')).toBe(true)
    expect(canClaim('no')).toBe(false)
    expect(canClaim(null)).toBe(false)
  })
})
