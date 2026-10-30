import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Two things a screen reader cannot guess, checked on the source so a new screen cannot forget them: a button that is only an icon
// must carry its name (aria-label), and a picture must say whether it is decoration (alt="") or content. Plant either to see it fail.
const here = dirname(fileURLToPath(import.meta.url))
const src = join(here, '..', '..', 'src')
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
const files = walk(src).filter((f) => f.endsWith('.tsx'))

describe('accessibility, on the source', () => {
  it('reads the screens (not an empty folder)', () => expect(files.length).toBeGreaterThan(20))
  it('every icon-only button (btn--icon, tool--icon) has an aria-label', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/<button\b[^>]*className=(?:"[^"]*|\{`[^`]*)(?:btn--icon|tool--icon)[^>]*>/g)) {
        if (!/aria-label=/.test(m[0])) bad.push(`${f.slice(src.length + 1)}: ${m[0].slice(0, 90)}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('every <img> has an alt', () => {
    const bad: string[] = []
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) bad.push(`${f.slice(src.length + 1)}: ${m[0].slice(0, 90)}`)
    }
    expect(bad).toEqual([])
  })
})
