import { describe, it, expect } from 'vitest'
import { addressFor, linkAlive, toIcs } from './encounters'

describe('linkAlive', () => {
  const base = { starts_at: 1_000_000, ends_at: null, status: 'proposed' as const }
  it('lives until a day after the start', () => {
    expect(linkAlive(base, 1_000_000 + 86_399)).toBe(true)
    expect(linkAlive(base, 1_000_000 + 86_401)).toBe(false)
  })
  it('uses the end when there is one', () => {
    expect(linkAlive({ ...base, ends_at: 1_010_000 }, 1_010_000 + 86_399)).toBe(true)
  })
  it('dies on cancel whatever the date', () => {
    expect(linkAlive({ ...base, status: 'cancelled' }, 0)).toBe(false)
  })
})

describe('addressFor', () => {
  it('shows the address only on yes', () => {
    expect(addressFor('yes', '12 rue X')).toBe('12 rue X')
    expect(addressFor('maybe', '12 rue X')).toBeNull()
    expect(addressFor(null, '12 rue X')).toBeNull()
  })
})

describe('toIcs', () => {
  it('escapes and defaults a two-hour end', () => {
    const ics = toIcs({ id: 'abc', title: 'Parc; Lafontaine, 10h', starts_at: 1_700_000_000, ends_at: null, place: null, note: null }, 'https://x')
    expect(ics).toContain('SUMMARY:Parc\\; Lafontaine\\, 10h')
    expect(ics).toContain('DTSTART:20231114T221320Z')
    expect(ics).toContain('DTEND:20231115T001320Z')
    expect(ics).not.toContain('LOCATION')
  })
})
