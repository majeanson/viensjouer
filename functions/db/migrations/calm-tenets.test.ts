import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Seeing a friend is never a number. The schema has nowhere to store a score, a streak,
// a rank or a badge, and this scans EVERY migration so it cannot drift in later. The
// product is for parents and may be ordinary (read receipts, a reminder someone asked
// for) — this guard is only about the counting that turns a relationship into a game.
const here = dirname(fileURLToPath(import.meta.url))
const schema = readdirSync(here)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .toLowerCase()

describe('calm tenets (schema)', () => {
  it('is reading the schema, not an empty folder', () => {
    expect(schema.includes('create table encounters')).toBe(true)
  })
  for (const word of ['streak', 'points', 'badge', 'score', 'rank', 'leaderboard']) {
    it(`has no "${word}" table or column`, () => {
      expect(schema.includes(word)).toBe(false)
    })
  }
})
