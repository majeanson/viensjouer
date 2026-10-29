// The words of every notification, both languages, in ONE place (callers pass facts, not sentences), like mailCopy.ts.
// Short on purpose: a notification is read on a lock screen. Never an address (that stays behind a yes).
import type { MailLang } from './lang'

export interface Words {
  title: string
  body: string
}
const pick = (lang: MailLang, fr: string, en: string) => (lang === 'fr' ? fr : en)

export const NOTE = {
  invited: (lang: MailLang, v: { host: string; title: string; when: string }): Words => ({
    title: pick(lang, `${v.host} t’invite`, `${v.host} invites you`),
    body: `${v.title}, ${v.when}`,
  }),
  changed: (lang: MailLang, v: { title: string; lines: string[] }): Words => ({
    title: pick(lang, `Changement : ${v.title}`, `Change: ${v.title}`),
    body: v.lines.slice(0, 3).join(' · '),
  }),
  cancelled: (lang: MailLang, v: { title: string; when: string }): Words => ({
    title: pick(lang, `Annulée : ${v.title}`, `Cancelled: ${v.title}`),
    body: v.when,
  }),
  postponed: (lang: MailLang, v: { title: string; when: string }): Words => ({
    title: pick(lang, `Reportée : ${v.title}`, `Postponed: ${v.title}`),
    body: pick(lang, `La nouvelle date viendra. Ta réponse reste. (${v.when})`, `The new date will come. Your answer stays. (${v.when})`),
  }),
  answered: (lang: MailLang, v: { guestChild: string; guestParent: string; reply: 'yes' | 'maybe' | 'no'; title: string }): Words => ({
    title: `${v.guestChild} : ${pick(lang, { yes: 'oui', maybe: 'peut-être', no: 'non' }[v.reply], { yes: 'yes', maybe: 'maybe', no: 'no' }[v.reply])}`,
    body: `${v.guestParent} · ${v.title}`,
  }),
  reminder: (lang: MailLang, v: { title: string; when: string; place: string | null }): Words => ({
    title: pick(lang, `Bientôt : ${v.title}`, `Soon: ${v.title}`),
    body: [v.when, v.place].filter(Boolean).join(' · '),
  }),
  test: (lang: MailLang): Words => ({
    title: pick(lang, 'Notification d’essai', 'Test notification'),
    body: pick(lang, 'Ça marche : tu recevras ici les nouvelles de tes rencontres.', 'It works: you will get your get-together news here.'),
  }),
}
