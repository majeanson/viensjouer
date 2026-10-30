// Bilingual copy, FR-CA first. The dictionaries are src/i18n.fr.ts and src/i18n.en.ts, each its own lazy chunk;
// `Dict` (the shape of the French one) is the compile-time parity contract: EN must have every key FR has, or tsc fails.
import { createContext, useContext } from 'react'
import type { FR } from './i18n.fr'
import type { FR_MORE } from './i18n.fr.more'

export type Lang = 'fr' | 'en'

export type Core = typeof FR
export type More = typeof FR_MORE
export type Dict = Core & More

// `dict` is the dictionary for `lang`. Neither is in the entry: src/main.tsx loads the one the visitor needs before it
// renders anything, so no component ever sees this default.
export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void; dict: Dict }>({ lang: 'fr', setLang: () => {}, dict: undefined as unknown as Dict })

export function useLang() {
  return useContext(LangContext)
}

export function useT(): Dict {
  return useLang().dict
}

export function readLang(): Lang {
  try {
    const l = localStorage.getItem('vj-lang')
    if (l === 'en' || l === 'fr') return l
  } catch {
    /* storage blocked */
  }
  return pickLang(navigator.languages?.length ? navigator.languages : [navigator.language])
}

// French first. The device's own preference order decides: the first language it lists that we speak
// wins, so a phone set to English first gets English, and everything else (French, anything we
// do not translate) gets French.
export function pickLang(preferred: readonly (string | undefined)[]): Lang {
  for (const l of preferred) {
    const code = (l ?? '').toLowerCase()
    if (code.startsWith('fr')) return 'fr'
    if (code.startsWith('en')) return 'en'
  }
  return 'fr'
}

export function writeLang(l: Lang): void {
  try {
    localStorage.setItem('vj-lang', l)
  } catch {
    /* storage blocked */
  }
}
