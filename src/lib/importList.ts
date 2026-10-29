// « Importer une liste » on Amis: one family per line, « parent, enfant, courriel » (the email is optional and may come
// anywhere on the line; commas, semicolons and tabs all separate). Pure, so a paste from a spreadsheet or a note is read
// the same way everywhere and the page can say what it understood before anything is saved.
export interface ImportRow {
  parentName: string
  childFirstName: string
  email: string | null
}

export type ImportProblem = 'child' | 'parent' | 'extra' | 'email'

export interface Parsed {
  rows: ImportRow[]
  bad: { line: number; text: string; why: ImportProblem }[]
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const MAX_IMPORT = 40

export function parseList(text: string): Parsed {
  const rows: ImportRow[] = []
  const bad: Parsed['bad'] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const tokens = line.split(/[,;\t]/).map((x) => x.trim()).filter(Boolean)
    const at = tokens.filter((x) => x.includes('@'))
    const names = tokens.filter((x) => !x.includes('@'))
    const fail = (why: ImportProblem) => bad.push({ line: i + 1, text: line, why })
    if (at.length > 1 || (at[0] && !EMAIL.test(at[0]))) return fail('email')
    if (names.length === 0) return fail('parent')
    if (names.length === 1) return fail('child')
    if (names.length > 2) return fail('extra')
    rows.push({ parentName: names[0].slice(0, 60), childFirstName: names[1].slice(0, 40), email: at[0]?.toLowerCase() ?? null })
  })
  return { rows, bad }
}
