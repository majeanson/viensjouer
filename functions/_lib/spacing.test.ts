import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// One spacing scale for the whole app: every margin, padding and gap written inline in a screen is one of these steps (in rem), so
// the gaps between things are the same everywhere instead of 0.35 here and 0.4 there. Plant a 0.35rem to see this fail.
const STEPS = new Set([0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4])
const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'src')
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

describe('spacing scale', () => {
  const files = walk(src).filter((f) => f.endsWith('.tsx'))
  it('reads the screens (not an empty folder)', () => expect(files.length).toBeGreaterThan(20))
  it('uses only the steps of the scale for inline margin, padding and gap', () => {
    const off: string[] = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/(?:margin|padding)[A-Za-z]*: '([^']+)'|gap: '([^']+)'/g)) {
        for (const r of (m[1] ?? m[2]).matchAll(/(-?\d*\.?\d+)rem/g)) {
          if (!STEPS.has(Math.abs(parseFloat(r[1])))) off.push(`${f.slice(src.length + 1)}: ${m[0]}`)
        }
      }
    }
    expect(off).toEqual([])
  })
})
