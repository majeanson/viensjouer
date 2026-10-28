import { describe, it, expect } from 'vitest'
import { pickLang } from '../i18n'

describe('pickLang: French first, English only when the device asks for it first', () => {
  it('French and every other language we do not translate give French', () => {
    expect(pickLang(['fr-CA', 'en-CA'])).toBe('fr')
    expect(pickLang(['fr'])).toBe('fr')
    expect(pickLang(['es-MX'])).toBe('fr')
    expect(pickLang([])).toBe('fr')
    expect(pickLang([undefined])).toBe('fr')
  })
  it('English wins only when it is the first language we speak in the device list', () => {
    expect(pickLang(['en-US', 'fr-CA'])).toBe('en')
    expect(pickLang(['de-DE', 'en-GB'])).toBe('en')
    expect(pickLang(['fr-FR', 'en-US'])).toBe('fr')
  })
})
