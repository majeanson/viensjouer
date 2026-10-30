import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FR } from '../../src/i18n.fr'
import { FR_MORE } from '../../src/i18n.fr.more'
import { EN } from '../../src/i18n.en'
import { EN_MORE } from '../../src/i18n.en.more'
import { PRIVACY_FR } from '../../src/i18n.privacy.fr'
import { PRIVACY_EN } from '../../src/i18n.privacy.en'
import { WHY_FR } from '../../src/i18n.why.fr'
import { WHY_EN } from '../../src/i18n.why.en'

// Rules about the words on screen, held by the build like Babillard's glossary tests:
//   - no dead copy: a dictionary key nothing refers to is removed, not left to rot (the refactors that
//     replaced confirm() dialogs and merged three tabs each left a dozen behind)
//   - no em-dash and no emoji in what a person reads (the house style: plain words, icons from Icon.tsx)
//   - French and English carry the same keys at run time too (tsc already holds the types)
type Dict = Record<string, unknown>
// The privacy page's long text lives in its own lazy files (src/i18n.privacy.*.ts); the rules cover it as the "privacy." part of each language.
const FRALL = { ...FR, ...FR_MORE, privacyText: PRIVACY_FR, whyText: WHY_FR }
const ENALL = { ...EN, ...EN_MORE, privacyText: PRIVACY_EN, whyText: WHY_EN }

const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.(tsx?|mjs)$/.test(e.name) && !e.name.endsWith('i18n.ts') && !e.name.includes('copyRules') ? [join(d, e.name)] : []))

function leaves(o: unknown, path: string[] = []): [string, unknown][] {
  if (o && typeof o === 'object' && !Array.isArray(o)) return Object.entries(o as Dict).flatMap(([k, v]) => leaves(v, [...path, k]))
  return [[path.join('.'), o]]
}

const SOURCE = [...walk('src'), ...walk('functions'), ...walk('e2e')].map((f) => readFileSync(f, 'utf8')).join('\n')

describe('copy rules', () => {
  it('has no dictionary key that nothing refers to', () => {
    const unused = leaves(FRALL)
      .map(([p]) => p)
      .filter((p) => {
        const name = p.split('.').pop()!
        return !new RegExp(String.raw`\.${name}\b|'${name}'|\b${name}:`).test(SOURCE)
      })
    expect(unused.join(', '), 'remove these keys from FR and EN in src/i18n.fr.ts and src/i18n.en.ts').toBe('')
  })

  it('has no em-dash and no emoji in any string, in either language', () => {
    for (const [lang, dict] of [['FR', FRALL], ['EN', ENALL]] as const) {
      for (const [path, v] of leaves(dict)) {
        const texts = typeof v === 'string' ? [v] : Array.isArray(v) ? v.flat().filter((x): x is string => typeof x === 'string') : typeof v === 'function' ? [String((v as (...a: never[]) => unknown)(...([1, 2, 3, 4] as never[])))] : []
        for (const text of texts) {
          expect(text, `${lang} ${path}`).not.toMatch(/—/)
          expect(text, `${lang} ${path}`).not.toMatch(/\p{Extended_Pictographic}/u)
        }
      }
    }
  })

  it('has the same keys in French and in English', () => {
    expect(leaves(ENALL).map(([p]) => p)).toEqual(leaves(FRALL).map(([p]) => p))
  })
})
