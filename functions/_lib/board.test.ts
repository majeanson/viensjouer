import { describe, it, expect } from 'vitest'
import { MAX_MESSAGES, MAX_PINNED, canDeleteOwn } from './board'

describe('board rules', () => {
  it('a family deletes only its own message, never an anonymous or the host one', () => {
    expect(canDeleteOwn({ invitation_id: 'i1' }, 'i1')).toBe(true)
    expect(canDeleteOwn({ invitation_id: 'i2' }, 'i1')).toBe(false)
    expect(canDeleteOwn({ invitation_id: null }, 'i1')).toBe(false)
  })
  it('keeps the board small and calm', () => {
    expect(MAX_MESSAGES).toBeLessThanOrEqual(300)
    expect(MAX_PINNED).toBeLessThanOrEqual(3)
  })
})
