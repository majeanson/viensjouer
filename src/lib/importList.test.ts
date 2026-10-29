import { describe, expect, it } from 'vitest'
import { parseList } from './importList'

describe('parseList', () => {
  it('reads parent, child and an optional email, in any order of the email', () => {
    const { rows, bad } = parseList('Julie, Léa, julie@example.com\nPaul;Max\nmax@x.org, Sonia, Zoé')
    expect(bad).toEqual([])
    expect(rows).toEqual([
      { parentName: 'Julie', childFirstName: 'Léa', email: 'julie@example.com' },
      { parentName: 'Paul', childFirstName: 'Max', email: null },
      { parentName: 'Sonia', childFirstName: 'Zoé', email: 'max@x.org' },
    ])
  })
  it('reads a spreadsheet paste (tabs), skips blank lines and lower-cases the email', () => {
    const { rows } = parseList('\nJulie\tLéa\tJulie@Example.com\n\n')
    expect(rows).toEqual([{ parentName: 'Julie', childFirstName: 'Léa', email: 'julie@example.com' }])
  })
  it('names what is wrong with a line instead of guessing, and keeps the good ones', () => {
    const { rows, bad } = parseList('Julie\nJulie, Léa, nope@\nA, B, C\nJulie, Léa, a@b.co, c@d.co\n, ,\nPaul, Max')
    expect(rows).toEqual([{ parentName: 'Paul', childFirstName: 'Max', email: null }])
    expect(bad.map((b) => [b.line, b.why])).toEqual([[1, 'child'], [2, 'email'], [3, 'extra'], [4, 'email'], [5, 'parent']])
  })
  it('a contact-picker line with no child yet says the child is missing', () => {
    expect(parseList('Julie, , julie@example.com').bad[0].why).toBe('child')
  })
})
