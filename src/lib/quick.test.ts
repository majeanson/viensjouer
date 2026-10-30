import { describe, expect, it } from 'vitest'
import { parseQuick } from './quick'

const fams = [
  { id: 'a', child_first_name: 'Léa', parent_name: 'Sophie Tremblay' },
  { id: 'b', child_first_name: 'Noé', parent_name: 'Marc Roy' },
  { id: 'c', child_first_name: 'Zoé', parent_name: 'Ana Silva' },
]
// Wednesday 2026-10-28 09:00 local.
const now = new Date(2026, 9, 28, 9, 0, 0)

describe('parseQuick', () => {
  it('reads kind, next weekday, hour and friends', () => {
    const q = parseQuick('Parc samedi 10h avec Léa et Noé', fams, now)
    expect(q.kind).toBe('park')
    expect(new Date(q.startsAt! * 1000).toString().slice(0, 21)).toBe(new Date(2026, 9, 31, 10, 0).toString().slice(0, 21))
    expect(q.familyIds).toEqual(['a', 'b'])
  })
  it('reads a half hour, tomorrow, and a place', () => {
    const q = parseQuick('chez Léa demain 14h30', fams, now)
    expect(q.kind).toBe('home')
    expect(q.place).toBe('Chez Léa')
    expect(new Date(q.startsAt! * 1000).getHours()).toBe(14)
    expect(new Date(q.startsAt! * 1000).getMinutes()).toBe(30)
    const p = parseQuick('Jeu au Parc Lafontaine dimanche 9h', fams, now)
    expect(p.place).toBe('Parc Lafontaine')
  })
  it('leaves what is not said undefined', () => {
    expect(parseQuick('hello', fams, now)).toEqual({ familyIds: [] })
  })
  it('understands English', () => {
    const q = parseQuick('birthday saturday 3pm with Zoe', fams, now)
    expect(q.kind).toBe('birthday')
    expect(new Date(q.startsAt! * 1000).getHours()).toBe(15)
    expect(q.familyIds).toEqual(['c'])
  })
})
