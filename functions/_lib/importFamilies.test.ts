// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from './testDb'
import { cleanImportRows, insertFamilies } from './importFamilies'

describe('cleanImportRows', () => {
  it('trims, lower-cases the email and keeps the optional ones empty', () => {
    expect(cleanImportRows([{ parentName: ' Julie ', childFirstName: 'Léa', email: ' Julie@Example.com ' }, { parentName: 'Paul', childFirstName: 'Max' }])).toEqual([
      { parentName: 'Julie', childFirstName: 'Léa', email: 'julie@example.com' },
      { parentName: 'Paul', childFirstName: 'Max', email: null },
    ])
  })
  it('refuses the whole list on one bad row, an empty list, a non-list or more than 40', () => {
    expect(cleanImportRows([{ parentName: 'Julie', childFirstName: 'Léa' }, { parentName: 'Paul' }])).toBeNull()
    expect(cleanImportRows([{ parentName: 'Julie', childFirstName: 'Léa', email: 'nope' }])).toBeNull()
    expect(cleanImportRows([])).toBeNull()
    expect(cleanImportRows('x')).toBeNull()
    expect(cleanImportRows(Array.from({ length: 41 }, (_, i) => ({ parentName: `P${i}`, childFirstName: `C${i}` })))).toBeNull()
  })
})

describe('insertFamilies', () => {
  it('adds them to this household only and skips one already in the book (any case), never doubling within the list either', async () => {
    const { db, env } = realDb()
    db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1), ('h2', 'H2', 'America/Toronto', 1, 1)`)
    db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, created_at, updated_at) VALUES ('old', 'h1', 'Julie', 'Léa', 1, 1)`)
    const rows = cleanImportRows([
      { parentName: 'julie', childFirstName: 'LÉA' },
      { parentName: 'Paul', childFirstName: 'Max', email: 'p@x.org' },
      { parentName: 'Paul', childFirstName: 'Max' },
    ])!
    expect(await insertFamilies(env.DB, 'h1', rows)).toEqual({ added: 1, skipped: 2 })
    const mine = db.prepare("SELECT parent_name, email FROM friend_families WHERE household_id = 'h1' ORDER BY parent_name").all() as { parent_name: string; email: string | null }[]
    expect(mine.map((x) => [x.parent_name, x.email])).toEqual([['Julie', null], ['Paul', 'p@x.org']])
    expect(await insertFamilies(env.DB, 'h2', rows)).toEqual({ added: 2, skipped: 1 })
  })
})
