import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// iOS spills a native date/time input out of its card unless the native chrome is off and the box may shrink.
const css = readFileSync('src/styles.css', 'utf8')
const rule = css.match(/input\[type="date"\], input\[type="time"\] \{([^}]*)\}/)?.[1] ?? ''

describe('date and time inputs (iOS overflow)', () => {
  it('drop the native appearance and may shrink inside their box', () => {
    expect(rule).toContain('appearance: none')
    expect(rule).toContain('-webkit-appearance: none')
    expect(rule).toContain('min-width: 0')
    expect(rule).toContain('max-width: 100%')
  })
  it('keep an empty value as tall as a full one', () => {
    expect(css).toMatch(/::-webkit-date-and-time-value[^}]*min-height/)
  })
  it('no screen puts a bare label next to a time input (they overlap): the nap pickers use .when', () => {
    const src = readFileSync('src/pages/Children.tsx', 'utf8')
    expect(src).not.toMatch(/<label className="small">[^<]*<input[^>]*type="time"/)
  })
});
