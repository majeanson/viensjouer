// The words of every email the app sends, in both languages, in ONE place (handlers pass facts, not sentences).
// Plain text and HTML are built together so they cannot drift. French is the house language; English is the
// same message, not a different one.
import { escapeHtml } from './mail'
import type { MailLang } from './lang'

export interface MailBody {
  subject: string
  text: string
  html: string
}

const pick = (lang: MailLang, fr: string, en: string) => (lang === 'fr' ? fr : en)
const p = (s: string) => `<p>${s}</p>`
const e = escapeHtml
const SIGN = '— Viens jouer'

export function invitationMail(lang: MailLang, v: { parent: string; host: string; hostChild: string; child: string; title: string; when: string; friendOnly: boolean; link: string }): MailBody {
  const who = pick(
    lang,
    v.friendOnly ? `L’invitation est pour ${v.child} seulement.` : 'Toute la famille est la bienvenue, frères et sœurs inclus.',
    v.friendOnly ? `The invitation is for ${v.child} only.` : 'The whole family is welcome, siblings included.',
  )
  return {
    subject: pick(lang, `${v.hostChild} invite ${v.child} — ${v.title}`, `${v.hostChild} invites ${v.child}: ${v.title}`),
    text: pick(
      lang,
      `Bonjour ${v.parent},\n\n${v.host} propose une rencontre : ${v.title}, ${v.when}. ${who}\n\nRéponds ici (pas de compte à créer) :\n${v.link}\n\n${SIGN}`,
      `Hello ${v.parent},\n\n${v.host} is proposing a get-together: ${v.title}, ${v.when}. ${who}\n\nAnswer here (no account to create):\n${v.link}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.parent)},`) + p(`${e(v.host)} propose une rencontre : <strong>${e(v.title)}</strong>, ${e(v.when)}. ${e(who)}`) + p(`<a href="${v.link}">Répondre</a> — pas de compte à créer.`) + p(SIGN),
      p(`Hello ${e(v.parent)},`) + p(`${e(v.host)} is proposing a get-together: <strong>${e(v.title)}</strong>, ${e(v.when)}. ${e(who)}`) + p(`<a href="${v.link}">Answer</a> (no account to create).`) + p(SIGN),
    ),
  }
}

export function windowMail(lang: MailLang, v: { parent: string; host: string; hostChild: string; child: string; when: string; note: string | null; link: string }): MailBody {
  return {
    subject: pick(lang, `${v.hostChild} est libre — ${v.when}`, `${v.hostChild} is free: ${v.when}`),
    text: pick(
      lang,
      `Bonjour ${v.parent},\n\n${v.host} se demande si ${v.child} et ${v.hostChild} se voient : on est libres ${v.when}.${v.note ? `\n\n« ${v.note} »` : ''}\n\nRéponds ici (pas de compte) :\n${v.link}\n\n${SIGN}`,
      `Hello ${v.parent},\n\n${v.host} wonders whether ${v.child} and ${v.hostChild} could get together: we are free ${v.when}.${v.note ? `\n\n“${v.note}”` : ''}\n\nAnswer here (no account):\n${v.link}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.parent)},`) + p(`${e(v.host)} se demande si ${e(v.child)} et ${e(v.hostChild)} se voient : on est libres <strong>${e(v.when)}</strong>.`) + (v.note ? p(`« ${e(v.note)} »`) : '') + p(`<a href="${v.link}">Répondre</a> — pas de compte.`) + p(SIGN),
      p(`Hello ${e(v.parent)},`) + p(`${e(v.host)} wonders whether ${e(v.child)} and ${e(v.hostChild)} could get together: we are free <strong>${e(v.when)}</strong>.`) + (v.note ? p(`“${e(v.note)}”`) : '') + p(`<a href="${v.link}">Answer</a> (no account).`) + p(SIGN),
    ),
  }
}

export function updateMail(lang: MailLang, v: { parent: string; host: string; title: string; lines: string[]; link: string; sample?: boolean }): MailBody {
  const intro = v.sample ? pick(lang, 'Ceci est un courriel d’essai : voici ce que recevront les familles quand tu modifies une rencontre.', 'This is a test email: here is what the families receive when you edit a get-together.') : ''
  const tag = v.sample ? pick(lang, ' (courriel d’essai)', ' (test email)') : ''
  return {
    subject: pick(lang, `Mise à jour : ${v.title}${tag}`, `Update: ${v.title}${tag}`),
    text: pick(
      lang,
      `Bonjour ${v.parent},\n\n${intro ? `${intro}\n\n` : ''}${v.host} a modifié « ${v.title} » :\n- ${v.lines.join('\n- ')}\n\nLa page de la rencontre (tu peux y changer ta réponse) :\n${v.link}\n\n${SIGN}`,
      `Hello ${v.parent},\n\n${intro ? `${intro}\n\n` : ''}${v.host} changed “${v.title}”:\n- ${v.lines.join('\n- ')}\n\nThe get-together page (you can change your answer there):\n${v.link}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.parent)},`) + (intro ? p(`<em>${e(intro)}</em>`) : '') + p(`${e(v.host)} a modifié <strong>« ${e(v.title)} »</strong> :`) + `<ul>${v.lines.map((l) => `<li>${e(l)}</li>`).join('')}</ul>` + p(`<a href="${v.link}">La page de la rencontre</a> (tu peux y changer ta réponse).`) + p(SIGN),
      p(`Hello ${e(v.parent)},`) + (intro ? p(`<em>${e(intro)}</em>`) : '') + p(`${e(v.host)} changed <strong>“${e(v.title)}”</strong>:`) + `<ul>${v.lines.map((l) => `<li>${e(l)}</li>`).join('')}</ul>` + p(`<a href="${v.link}">The get-together page</a> (you can change your answer there).`) + p(SIGN),
    ),
  }
}

export function thanksMail(lang: MailLang, v: { parent: string; host: string; title: string; text: string; link: string }): MailBody {
  return {
    subject: pick(lang, `Merci : ${v.title}`, `Thank you: ${v.title}`),
    text: pick(
      lang,
      `Bonjour ${v.parent},\n\n${v.text}\n\n— ${v.host}\n\nLa page de la rencontre (les photos, si on en a ajouté) :\n${v.link}\n\n${SIGN}`,
      `Hello ${v.parent},\n\n${v.text}\n\n— ${v.host}\n\nThe get-together page (the photos, if any were added):\n${v.link}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.parent)},`) + p(e(v.text).replace(/\n/g, '<br>')) + p(`— ${e(v.host)}`) + p(`<a href="${v.link}">La page de la rencontre</a> (les photos, si on en a ajouté).`) + p(SIGN),
      p(`Hello ${e(v.parent)},`) + p(e(v.text).replace(/\n/g, '<br>')) + p(`— ${e(v.host)}`) + p(`<a href="${v.link}">The get-together page</a> (the photos, if any were added).`) + p(SIGN),
    ),
  }
}

export function reminderMail(lang: MailLang, v: { parent: string; title: string; hostChild: string; when: string; place: string | null; link: string }): MailBody {
  const at = v.place ? ` — ${v.place}` : ''
  return {
    subject: pick(lang, `Demain : ${v.title}`, `Tomorrow: ${v.title}`),
    text: pick(
      lang,
      `Bonjour ${v.parent},\n\nPetit rappel : ${v.title} avec ${v.hostChild}, ${v.when}${at}.\n\nLa page de la rencontre : ${v.link}\n\n${SIGN}`,
      `Hello ${v.parent},\n\nA quick reminder: ${v.title} with ${v.hostChild}, ${v.when}${at}.\n\nThe get-together page: ${v.link}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.parent)},`) + p(`Petit rappel : <strong>${e(v.title)}</strong> avec ${e(v.hostChild)}, ${e(v.when)}${e(at)}.`) + p(`<a href="${v.link}">La page de la rencontre</a>`) + p(SIGN),
      p(`Hello ${e(v.parent)},`) + p(`A quick reminder: <strong>${e(v.title)}</strong> with ${e(v.hostChild)}, ${e(v.when)}${e(at)}.`) + p(`<a href="${v.link}">The get-together page</a>`) + p(SIGN),
    ),
  }
}

export function hostReminderMail(lang: MailLang, v: { name: string; title: string; hostChild: string; when: string; place: string | null; who: string[]; link: string }): MailBody {
  const at = v.place ? ` — ${v.place}` : ''
  const who = v.who.length ? v.who.join(', ') : pick(lang, 'personne n’a encore répondu oui', 'nobody has said yes yet')
  const foot = pick(lang, 'Tu reçois ce courriel parce que tu l’as demandé dans Mon profil. Tu peux le couper là-bas.', 'You get this email because you asked for it in My profile. You can turn it off there.')
  return {
    subject: pick(lang, `Demain : ${v.title}`, `Tomorrow: ${v.title}`),
    text: pick(
      lang,
      `Bonjour ${v.name},\n\nPetit rappel : ${v.title} avec ${v.hostChild}, ${v.when}${at}.\nQui vient : ${who}.\n\nLa page de la rencontre : ${v.link}\n\n${foot}\n\n${SIGN}`,
      `Hello ${v.name},\n\nA quick reminder: ${v.title} with ${v.hostChild}, ${v.when}${at}.\nWho is coming: ${who}.\n\nThe get-together page: ${v.link}\n\n${foot}\n\n${SIGN}`,
    ),
    html: pick(
      lang,
      p(`Bonjour ${e(v.name)},`) + p(`Petit rappel : <strong>${e(v.title)}</strong> avec ${e(v.hostChild)}, ${e(v.when)}${e(at)}.<br>Qui vient : ${e(who)}.`) + p(`<a href="${v.link}">La page de la rencontre</a>`) + `<p class="small">${e(foot)}</p>` + p(SIGN),
      p(`Hello ${e(v.name)},`) + p(`A quick reminder: <strong>${e(v.title)}</strong> with ${e(v.hostChild)}, ${e(v.when)}${e(at)}.<br>Who is coming: ${e(who)}.`) + p(`<a href="${v.link}">The get-together page</a>`) + `<p class="small">${e(foot)}</p>` + p(SIGN),
    ),
  }
}

export function resetMail(lang: MailLang, v: { link: string }): MailBody {
  return {
    subject: pick(lang, 'Viens jouer — un nouveau mot de passe', 'Viens jouer: a new password'),
    text: pick(
      lang,
      `Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Viens jouer.\n\nOuvre ce lien dans les 30 prochaines minutes pour en choisir un :\n${v.link}\n\nSi ce n'était pas toi, ignore ce courriel — rien ne change.`,
      `Someone (you, we hope) asked for a new password for Viens jouer.\n\nOpen this link within the next 30 minutes to choose one:\n${v.link}\n\nIf it was not you, ignore this email: nothing changes.`,
    ),
    html: pick(
      lang,
      p("Quelqu'un (toi, on espère) a demandé un nouveau mot de passe pour Viens jouer.") + p(`<a href="${v.link}">Choisir un nouveau mot de passe</a> — le lien est bon 30 minutes.`) + p("Si ce n'était pas toi, ignore ce courriel : rien ne change."),
      p('Someone (you, we hope) asked for a new password for Viens jouer.') + p(`<a href="${v.link}">Choose a new password</a>. The link is good for 30 minutes.`) + p('If it was not you, ignore this email: nothing changes.'),
    ),
  }
}
