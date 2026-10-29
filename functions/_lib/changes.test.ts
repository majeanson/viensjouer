import { describe, it, expect } from 'vitest'
import { changeLines, diffEncounter, type Snapshot } from './changes'

const base: Snapshot = { title: 'Au parc', starts_at: 1_800_000_000, ends_at: null, place: 'Parc Lafontaine', address: null, map_url: null, note: null, planB: null, gift: null, status: 'proposed' }

describe('diffEncounter', () => {
  it('is empty when nothing changed, and blank counts as nothing', () => {
    expect(diffEncounter(base, { ...base })).toEqual([])
    expect(diffEncounter({ ...base, note: '' }, { ...base, note: null })).toEqual([])
    expect(diffEncounter({ ...base, note: '  ' }, { ...base, note: null })).toEqual([])
  })
  it('reports only the fields that differ, in a fixed order', () => {
    const c = diffEncounter(base, { ...base, place: 'Chez nous', title: 'Chez nous', starts_at: base.starts_at + 3600 })
    expect(c.map((x) => x.field)).toEqual(['title', 'starts_at', 'place'])
    expect(c[1]).toEqual({ field: 'starts_at', old: '1800000000', new: '1800003600' })
  })
  it('notes a field going from empty to set and back', () => {
    expect(diffEncounter(base, { ...base, note: 'Collation' })).toEqual([{ field: 'note', old: null, new: 'Collation' }])
    expect(diffEncounter({ ...base, ends_at: 5 }, { ...base, ends_at: null })).toEqual([{ field: 'ends_at', old: '5', new: null }])
  })
  it('never records the address itself, only that it changed', () => {
    const c = diffEncounter({ ...base, address: '12 rue X' }, { ...base, address: '14 rue Y' })
    expect(c).toEqual([{ field: 'address', old: null, new: null }])
    expect(JSON.stringify(c)).not.toContain('rue')
  })
  it('logs a plan B added, with its value (it is public to the families)', () => {
    expect(diffEncounter(base, { ...base, planB: 'Chez nous' })).toEqual([{ field: 'planB', old: null, new: 'Chez nous' }])
  })
  it('logs a status change', () => {
    expect(diffEncounter(base, { ...base, status: 'confirmed' })).toEqual([{ field: 'status', old: 'proposed', new: 'confirmed' }])
  })
})

describe('changeLines', () => {
  it('writes one readable line per change and keeps the address out of the text', () => {
    const lines = changeLines(
      [
        { field: 'place', old: 'Parc', new: 'Chez nous' },
        { field: 'address', old: null, new: null },
        { field: 'status', old: 'proposed', new: 'cancelled' },
      ],
      'America/Toronto',
    )
    expect(lines).toEqual(['Lieu : Parc → Chez nous', 'Adresse : mise à jour, à voir sur la page', 'Statut : proposée → annulée'])
  })
  it('formats times in the household zone', () => {
    const [l] = changeLines([{ field: 'starts_at', old: String(1_793_000_000), new: String(1_793_003_600) }], 'America/Toronto')
    expect(l).toMatch(/^Début : .+ → .+$/)
    expect(l).not.toMatch(/179300/)
  })
})

describe('changeLines in English', () => {
  it('speaks the reader’s language and still keeps the address out', () => {
    const lines = changeLines(
      [
        { field: 'place', old: 'Parc', new: 'Chez nous' },
        { field: 'address', old: null, new: null },
        { field: 'status', old: 'proposed', new: 'cancelled' },
      ],
      'America/Toronto',
      'en',
    )
    expect(lines).toEqual(['Place : Parc → Chez nous', 'Address : updated, see the page', 'Status : proposed → cancelled'])
  })
})
