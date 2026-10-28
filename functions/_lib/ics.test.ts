import { describe, it, expect } from 'vitest'
import { icsCalendar, icsEvent, icsFold, toIcs } from './encounters'

const base = { id: 'abc', title: 'Parc, Lafontaine; 10 h', starts_at: 1_800_000_000, ends_at: null, place: 'Parc Lafontaine', note: null }

describe('ICS', () => {
  it('keeps one UID and raises SEQUENCE with every edit, so calendars update the event', () => {
    const a = icsEvent({ ...base, updated_at: 1_790_000_000 }, 'https://x/y').join('\n')
    const b = icsEvent({ ...base, updated_at: 1_790_000_500, starts_at: base.starts_at + 3600 }, 'https://x/y').join('\n')
    expect(a).toContain('UID:abc@viensjouer')
    expect(b).toContain('UID:abc@viensjouer')
    expect(a).toContain('SEQUENCE:1790000000')
    expect(b).toContain('SEQUENCE:1790000500')
  })
  it('says cancelled / confirmed / tentative', () => {
    expect(icsEvent({ ...base, status: 'cancelled' }, 'u').join('\n')).toContain('STATUS:CANCELLED')
    expect(icsEvent({ ...base, status: 'confirmed' }, 'u').join('\n')).toContain('STATUS:CONFIRMED')
    expect(icsEvent({ ...base, status: 'proposed' }, 'u').join('\n')).toContain('STATUS:TENTATIVE')
  })
  it('escapes commas and semicolons and joins place and address', () => {
    const t = icsEvent({ ...base, address: '12 rue X' }, 'u').join('\n')
    expect(t).toContain('SUMMARY:Parc\\, Lafontaine\\; 10 h')
    expect(t).toContain('LOCATION:Parc Lafontaine\\, 12 rue X')
  })
  it('folds long lines at 75 octets, multi-byte safe, and a folded line unfolds to the original', () => {
    const long = 'DESCRIPTION:' + 'é'.repeat(80)
    const folded = icsFold(long)
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, '')).toBe(long)
  })
  it('a calendar is CRLF-terminated, refreshes hourly and can hold many events', () => {
    const ics = icsCalendar('Les Jeanson', [icsEvent(base, 'u'), icsEvent({ ...base, id: 'def' }, 'u')])
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(toIcs(base, 'u')).toContain('PRODID:-//Viens jouer//FR')
  })
})
