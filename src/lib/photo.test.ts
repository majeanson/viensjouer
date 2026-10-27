import { describe, it, expect } from 'vitest'
import { fitSize } from './photo'

describe('fitSize', () => {
  it('shrinks the long side to 1600 keeping the ratio', () => {
    expect(fitSize(4000, 3000)).toEqual({ w: 1600, h: 1200 })
    expect(fitSize(3000, 4000)).toEqual({ w: 1200, h: 1600 })
  })
  it('never enlarges a small photo', () => {
    expect(fitSize(800, 600)).toEqual({ w: 800, h: 600 })
  })
  it('never returns a zero side', () => {
    expect(fitSize(10000, 1).h).toBe(1)
  })
})
