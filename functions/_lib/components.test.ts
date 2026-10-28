import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// COMPONENTS.md is the inventory a reader checks before writing UI. A shared piece with no row is invisible to the
// next person, who writes it again; a row for a deleted piece sends them looking for it.
const files = readdirSync('src/components').filter((f) => f.endsWith('.tsx')).map((f) => f.replace(/\.tsx$/, ''))
const doc = readFileSync('COMPONENTS.md', 'utf8')

describe('COMPONENTS.md', () => {
  it('has a row for every file in src/components', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.filter((f) => !doc.includes(`\`${f}\``) && !doc.includes(`\`${f} `) && !new RegExp(`\`[^\`]*\b${f}\b[^\`]*\``).test(doc))).toEqual([])
  })
  it('names no component that no longer exists', () => {
    const named = [...doc.matchAll(/^\| `([A-Z]\w+)`/gm)].map((m) => m[1])
    expect(named.filter((n) => !files.includes(n))).toEqual([])
  })
})
