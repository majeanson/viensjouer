import { describe, expect, it } from 'vitest'
import { mailLang, requestLang } from './lang'
import { answerMail, hostReminderMail, invitationMail, reminderMail, resetMail, thanksMail, updateMail, windowMail, type MailBody } from './mailCopy'

const link = 'https://jouer.example/lune-miel'
const evil = '<script>x</script>'
const base = { parent: evil, host: 'Marc', hostChild: 'Noé', child: 'Léa', title: 'Au parc', when: 'samedi 10 h', link }

// One call per builder, in both languages.
const all = (lang: 'fr' | 'en'): Record<string, MailBody> => ({
  invitation: invitationMail(lang, { ...base, friendOnly: false }),
  window: windowMail(lang, { ...base, note: 'Une note' }),
  update: updateMail(lang, { parent: evil, host: 'Marc', title: 'Au parc', lines: ['Lieu : A → B'], link }),
  thanks: thanksMail(lang, { parent: evil, host: 'Marc', title: 'Au parc', text: 'Merci', link }),
  reminder: reminderMail(lang, { parent: evil, title: 'Au parc', hostChild: 'Noé', when: 'samedi', place: 'Parc', link }),
  hostReminder: hostReminderMail(lang, { name: evil, title: 'Au parc', hostChild: 'Noé', when: 'samedi', place: null, who: [], link }),
  reset: resetMail(lang, { link }),
  answer: answerMail(lang, { name: evil, guestParent: 'Julie', guestChild: 'Léa', reply: 'maybe', title: 'Au parc', when: 'samedi', link }),
})

describe('email copy', () => {
  const fr = all('fr')
  const en = all('en')
  for (const name of Object.keys(fr)) {
    it(`${name}: both languages carry the link, differ from each other, and never let a name through as markup`, () => {
      for (const m of [fr[name], en[name]]) {
        expect(m.text).toContain(link)
        expect(m.html).toContain(link)
        expect(m.html).not.toContain(evil)
        expect(m.subject.length).toBeGreaterThan(3)
      }
      expect(en[name].text).not.toBe(fr[name].text)
      expect(en[name].subject).not.toBe(fr[name].subject)
    })
  }
  it('English mail has no French greeting and French mail has no English one', () => {
    for (const m of Object.values(en)) expect(m.text).not.toMatch(/Bonjour|Petit rappel|Quelqu/)
    for (const m of Object.values(fr)) expect(m.text).not.toMatch(/\bHello\b|A quick reminder|Someone \(/)
  })
  it('says who an invitation is for', () => {
    expect(invitationMail('en', { ...base, friendOnly: true }).text).toContain('for Léa only')
    expect(invitationMail('fr', { ...base, friendOnly: true }).text).toContain('pour Léa seulement')
  })
})

describe('mail language', () => {
  const req = (h?: string) => new Request('https://x.test/', { headers: h ? { 'X-Lang': h } : {} })
  it('reads only a supported X-Lang', () => {
    expect(requestLang(req('en'))).toBe('en')
    expect(requestLang(req('de'))).toBeNull()
    expect(requestLang(req())).toBeNull()
  })
  it('prefers the recipient’s stored language, then the sender’s, then French', () => {
    expect(mailLang('en', req('fr'))).toBe('en')
    expect(mailLang(null, req('en'))).toBe('en')
    expect(mailLang('xx', req())).toBe('fr')
    expect(mailLang(undefined)).toBe('fr')
  })
})
