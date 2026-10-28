import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// The data export is one batch of SELECTs. A filter on an alias the query does not have (`m.deleted_at` on
// the invitations query) is a 500 that no unit test of the handler catches, so this pins the shape: an
// alias is only used by a statement that declares it. (Planted once on the invitations query to prove it.)
describe('export queries', () => {
  const src = readFileSync('functions/api/export.ts', 'utf8')
  const statements = [...src.matchAll(/db\.prepare\('([^']+)'\)/g)].map((m) => m[1])

  it('finds the statements', () => {
    expect(statements.length).toBeGreaterThan(10)
  })

  it('only uses a table alias that the statement declares', () => {
    for (const sql of statements) {
      for (const alias of ['m', 'i', 'e', 'g', 's', 'c', 'b']) {
        const used = new RegExp(String.raw`\b${alias}\.[a-z_]+`).test(sql)
        const declared = new RegExp(String.raw`(FROM|JOIN) [a-z_]+ ${alias}\b`).test(sql)
        if (used) expect(declared, `alias "${alias}" is used but not declared in: ${sql.slice(0, 90)}`).toBe(true)
      }
    }
  })

  it('hides deleted messages', () => {
    const messages = statements.find((s) => s.includes('FROM encounter_messages'))!
    expect(messages).toContain('m.deleted_at IS NULL')
  })
})
