import { describe, it, expect } from 'vitest'
import { clientDiff, showValue, type Snap } from './changes'

const base: Snap = { title: 'Au parc', starts_at: 1_800_000_000, ends_at: null, place: 'Parc', address: null, map_url: null, note: null, gift: null, status: 'proposed' }

describe('clientDiff (must match the server rule so the preview never lies)', () => {
  it('is empty for no change, and blank text counts as nothing', () => {
    expect(clientDiff(base, { ...base })).toEqual([])
    expect(clientDiff({ ...base, note: '' }, { ...base, note: '   ' })).toEqual([])
  })
  it('lists changed fields in the fixed order with their values', () => {
    const d = clientDiff(base, { ...base, place: 'Chez nous', starts_at: base.starts_at + 3600, title: 'Chez nous' })
    expect(d.map((x) => x.field)).toEqual(['title', 'starts_at', 'place'])
    expect(d[2]).toEqual({ field: 'place', from: 'Parc', to: 'Chez nous' })
  })
  it('keeps the map link out of the values too', () => {
    expect(clientDiff(base, { ...base, map_url: 'https://maps.app.goo.gl/x' })).toEqual([{ field: 'map_url', from: null, to: null }])
  })
  it('keeps the address out of the values', () => {
    expect(clientDiff({ ...base, address: '1 rue A' }, { ...base, address: '2 rue B' })).toEqual([{ field: 'address', from: null, to: null }])
  })
})

describe('showValue', () => {
  const status = { confirmed: 'confirmée' }
  it('words nothing, status and text', () => {
    expect(showValue('note', null, 'fr', status, '(rien)')).toBe('(rien)')
    expect(showValue('status', 'confirmed', 'fr', status, '')).toBe('confirmée')
    expect(showValue('place', 'Parc', 'fr', status, '')).toBe('Parc')
  })
  it('writes a time in the reader language', () => {
    expect(showValue('starts_at', String(1_800_000_000), 'fr', status, '')).not.toBe('1800000000')
    expect(showValue('starts_at', String(1_800_000_000), 'en', status, '')).toMatch(/\d/)
  })
})
