import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// An action is a button, not an underlined word: a tap target a grandparent can see and hit. `.linkbtn` (the
// underlined look) is kept only for the undo bar, whose dark strip styles it. Real links to somewhere else
// (a map, a policy page) stay plain `<a>`/`<Link>` text.
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.tsx') ? [join(d, f)] : []))
const ALLOWED = ['src/lib/toast.tsx']

describe('actions are buttons', () => {
  it('no screen styles an action as an underlined link', () => {
    const bad = walk('src').map((f) => f.split(sep).join('/')).filter((f) => !ALLOWED.includes(f) && /linkbtn/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
