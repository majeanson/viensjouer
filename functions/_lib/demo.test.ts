import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SWEEP_ORDER, isDemoEmail } from './demo'

// The guard that earns its keep: every table a migration creates must be swept, or a
// sandbox visitor's rows outlive the sandbox forever. A NEW migration table that is not in
// SWEEP_ORDER fails this build — add it there (or, for a table that holds no household data,
// to the short allow-list below WITH the reason).
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const created = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .flatMap((f) => [...readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').matchAll(/create table (\w+)/gi)].map((m) => m[1]))

// code_misses (0007) is a per-hour counter of WRONG share-link guesses keyed by a salted address hash, deleted after
// two hours: it holds no household and no person.
const NOT_HOUSEHOLD_DATA: string[] = ['code_misses']

describe('demo sweep', () => {
  it('reads the migrations (not an empty folder)', () => {
    expect(created).toContain('households')
    expect(created.length).toBeGreaterThan(10)
  })
  it('sweeps every table the migrations create', () => {
    const swept = new Set(SWEEP_ORDER.map((s) => s.table))
    const missing = created.filter((t) => !swept.has(t) && !NOT_HOUSEHOLD_DATA.includes(t))
    expect(missing).toEqual([])
  })
  it('deletes children before their parents (households last)', () => {
    expect(SWEEP_ORDER[SWEEP_ORDER.length - 1].table).toBe('households')
    const at = (t: string) => SWEEP_ORDER.findIndex((s) => s.table === t)
    expect(at('invitations')).toBeLessThan(at('encounters'))
    expect(at('relais')).toBeLessThan(at('invitations'))
    expect(at('window_targets')).toBeLessThan(at('open_windows'))
    expect(at('parents')).toBeLessThan(at('households'))
  })
})

describe('isDemoEmail', () => {
  it('only the reserved sandbox shape', () => {
    expect(isDemoEmail('demo-abc123@viensjouer.invalid')).toBe(true)
    expect(isDemoEmail('demo-abc@gmail.com')).toBe(false)
    expect(isDemoEmail('marc@viensjouer.invalid')).toBe(false)
    expect(isDemoEmail(null)).toBe(false)
  })
})
