import { describe, expect, it } from 'vitest'
import { PALETTE, contrast, inkOn } from './palette'

describe('face palette', () => {
  it('gives every swatch an initial that reads at 4.5:1 with the ink chosen for it', () => {
    for (const bg of PALETTE) expect(contrast(bg, inkOn(bg)!), bg).toBeGreaterThanOrEqual(4.5)
  })
  it('chooses dark ink on the light orange and leaves tokens alone', () => {
    expect(inkOn('#f2a03d')).toBe('#1b1814')
    expect(inkOn('var(--host)')).toBeUndefined()
    expect(inkOn(undefined)).toBeUndefined()
  })
})
