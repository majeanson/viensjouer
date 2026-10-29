// The bundle guard, run by CI after `npm run build` (and by `npm run verify`).
//
// A parent opens an invitation from a text, on a phone, often on a slow connection. What that phone has to
// download before it can show the page is the whole product for them, so it has a budget:
//   1. the ENTRY (what every route needs: React, the router, Query, the dictionaries) stays under a cap
//   2. every other chunk (one per page, plus what pages share) stays under a smaller cap
//   3. the stylesheet stays small
// The caps are RATCHETS, like Horizon's: they come DOWN after a win, never back up. Sizes are gzip, measured
// from the real build. 2026-10-28: entry 83 KB (it was a single 136 KB file before the pages went lazy), the biggest shared chunk 15 KB once English became its own 8 KB chunk.
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const KB = 1024
const ASSETS = join('dist', 'assets')
// Raised once, on purpose, in the 2026-10-28 audit pass (security screens, error/loading components, spacing and contrast tokens):
// 85 -> 86 KB entry, 5 -> 5.5 KB stylesheet. The ratchet applies from here: the next change that grows them pays for it elsewhere.
const ENTRY_GZ = 86 * KB
// 2026-10-28: the shared chunk that held the French dictionary hit 16.5 KB after two raises, so French became its own
// lazy chunk (i18n.fr, 9.8 KB), as English already was. The shared Icon chunk fell from 16.3 to 6.4 KB; the cap
// ratcheted down to 11 KB. The entry did not move: both dictionaries load before the first render, in parallel.
const CHUNK_GZ = 11 * KB
const CSS_GZ = 5.5 * KB

const files = readdirSync(ASSETS)
const gz = (f) => gzipSync(readFileSync(join(ASSETS, f))).length
const problems = []
const rows = []

for (const f of files) {
  if (f.endsWith('.js')) {
    const size = gz(f)
    const entry = /^index-/.test(f)
    const cap = entry ? ENTRY_GZ : CHUNK_GZ
    rows.push([entry ? 'entry' : 'chunk', f, size, cap])
    if (size > cap) problems.push(`${f}: ${(size / KB).toFixed(1)} KB gzip, over its ${(cap / KB).toFixed(0)} KB cap (${entry ? 'entry' : 'lazy chunk'})`)
  } else if (f.endsWith('.css')) {
    const size = gz(f)
    rows.push(['css', f, size, CSS_GZ])
    if (size > CSS_GZ) problems.push(`${f}: ${(size / KB).toFixed(1)} KB gzip, over the ${(CSS_GZ / KB).toFixed(1)} KB stylesheet cap`)
  }
}

if (!rows.some((r) => r[0] === 'entry')) problems.push('no entry chunk found: did the build run?')
// Every page must stay a lazy chunk of its own: a page folded back into the entry is the regression this guards.
for (const page of ['Reply', 'EncounterDetail', 'Door']) if (!files.some((f) => f.startsWith(`${page}-`) && f.endsWith('.js'))) problems.push(`${page} is no longer its own lazy chunk`)

for (const [kind, f, size, cap] of rows.sort((a, b) => b[2] - a[2]).slice(0, 6)) console.log(`${kind.padEnd(5)} ${(size / KB).toFixed(1).padStart(6)} KB / ${+(cap / KB).toFixed(1)} KB  ${f}`)
if (problems.length) {
  console.error('\nBundle budget exceeded:\n - ' + problems.join('\n - '))
  process.exit(1)
}
console.log('bundle budget ok')
