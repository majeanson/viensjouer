import { describe, expect, it } from 'vitest'
import type { Env } from './env'
import { CEILING, roomFor, type Thing } from './ceilings'

const envWith = (n: number) => ({ DB: { prepare: () => ({ bind: () => ({ first: async () => ({ n }) }) }) } }) as unknown as Env

describe('household ceilings', () => {
  it('leaves the rest of the ceiling, never below zero', async () => {
    for (const t of Object.keys(CEILING) as Thing[]) {
      expect(await roomFor(envWith(0), t, 'h')).toBe(CEILING[t])
      expect(await roomFor(envWith(CEILING[t] - 1), t, 'h')).toBe(1)
      expect(await roomFor(envWith(CEILING[t] + 50), t, 'h')).toBe(0)
    }
  })
  it('is far above a real family', () => {
    expect(CEILING.children).toBeGreaterThanOrEqual(8)
    expect(CEILING.families).toBeGreaterThanOrEqual(200)
    expect(CEILING.encounters).toBeGreaterThanOrEqual(500)
  })
})
