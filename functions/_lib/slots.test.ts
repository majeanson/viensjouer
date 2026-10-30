import { describe, expect, it } from 'vitest'
import { MAX_SLOTS, cleanSlots } from './slots'

describe('cleanSlots', () => {
  it('keeps future whole times, sorted, without repeats, at most four', () => {
    expect(cleanSlots([300, 200, 200.7, 50, 'x', 400, 500, 600], 100)).toEqual([200, 300, 400, 500])
    expect(cleanSlots([100, 99], 100)).toEqual([])
    expect(cleanSlots('nope', 0)).toEqual([])
    expect(MAX_SLOTS).toBe(4)
  })
})
