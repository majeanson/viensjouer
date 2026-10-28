import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The design tokens are plain text in three kinds of file, so the build reads the text. (This lives beside the
// other source-reading guards because the SPA's tsconfig has no Node types.)
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name).replace(/\\/g, '/')]))
const css = readFileSync('src/styles.css', 'utf8')
const html = readFileSync('index.html', 'utf8')
const theme = readFileSync('src/lib/theme.ts', 'utf8')
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as { background_color: string; theme_color: string }
const hex = (re: RegExp, src: string) => src.match(re)?.[1]?.toLowerCase()

describe('paper colour', () => {
  // Three places say what « paper » is: the --paper token, the browser-chrome metas, the manifest. They drifted once
  // (three slightly different creams); this keeps them one colour per theme.
  const light = hex(/:root \{[^}]*?--paper: (#[0-9a-f]{6})/i, css)
  const dark = hex(/:root\[data-theme='dark'\] \{[^}]*?--paper: (#[0-9a-f]{6})/i, css)
  it('is one colour per theme in the stylesheet, theme.ts, the metas and the manifest', () => {
    expect(light).toMatch(/^#[0-9a-f]{6}$/)
    expect(dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(hex(/PAPER[^=]*=\s*\{\s*light: '(#[0-9a-f]{6})'/i, theme)).toBe(light)
    expect(hex(/dark: '(#[0-9a-f]{6})' \}/i, theme)).toBe(dark)
    expect(html).toContain(`content="${light}" media="(prefers-color-scheme: light)"`)
    expect(html).toContain(`content="${dark}" media="(prefers-color-scheme: dark)"`)
    expect(manifest.background_color.toLowerCase()).toBe(light)
    expect(manifest.theme_color.toLowerCase()).toBe(light)
    // the first-paint script sets the chrome colour for a saved choice, so it must carry the same two colours
    const boot = readFileSync('public/theme-bootstrap.js', 'utf8').toLowerCase()
    expect(boot).toContain(`'${light}'`)
    expect(boot).toContain(`'${dark}'`)
  })
  it('tells the browser which scheme each theme is, so native controls follow the in-app toggle', () => {
    expect(css).toMatch(/:root \{\s*color-scheme: light;/)
    expect(css).toMatch(/:root\[data-theme='dark'\] \{\s*color-scheme: dark;/)
  })
})

describe('css custom properties', () => {
  // A `var(--x)` with no declaration is silent: the property drops out (a Face with no colour rendered a transparent
  // circle). Every custom property used in src must be declared in styles.css or set inline where it is used.
  const files = walk('src').filter((f) => /\.(css|tsx?)$/.test(f) && !f.endsWith('.test.ts'))
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  const declared = new Set([...text.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  const used = new Set([...text.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))
  it('reads the sources (not an empty folder)', () => {
    expect(declared.has('--paper')).toBe(true)
    expect(used.size).toBeGreaterThan(10)
  })
  it('declares every var(--x) it uses', () => {
    expect([...used].filter((v) => !declared.has(v))).toEqual([])
  })
})

describe('stylesheet order', () => {
  it('never re-positions an absolutely placed control further down the file', () => {
    // A later `position: relative` on the same specificity silently beats `position: absolute` (the photo remove
    // button once fell out of its corner this way). Every selector placed absolute must not be listed in a later relative rule.
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].split(',').map((x) => x.trim()), body: m[2] }))
    rules.forEach((r, i) => {
      if (!/position:\s*absolute/.test(r.body)) return
      for (const later of rules.slice(i + 1)) {
        if (!/position:\s*relative/.test(later.body)) continue
        expect(later.sel.filter((s) => r.sel.includes(s)), `${r.sel.join(', ')} is absolute, then relative again`).toEqual([])
      }
    })
  })
})
