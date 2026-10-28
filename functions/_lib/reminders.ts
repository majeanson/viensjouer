// The ONE reminder — the hourly cron (worker/index.ts `scheduled`). An invited parent
// ticked « me rappeler la veille » on the reply page; that set `remind_at` on their
// invitation. Every hour: the due ones that have not gone out, whose rencontre is still
// ahead and not cancelled, get one email; `reminded_at` is stamped first so a slow send
// can never double up. Mail unwired → the cron does nothing, loudly in the log once.
import type { Env } from './env'
import { escapeHtml, mailEnabled, sendMail } from './mail'
import { nowSec, paperCode, whenLong } from './ids'

interface Due {
  id: string
  token: string
  email: string | null
  parent_name: string
  title: string
  starts_at: number
  place: string | null
  tz: string
  host_child: string
}

export const REMIND_LEAD_SEC = 24 * 3600

export async function sendDueReminders(env: Env, origin: string): Promise<number> {
  if (!mailEnabled(env)) {
    console.warn('[reminders] mail not wired; nothing sent')
    return 0
  }
  const now = nowSec()
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.token, f.email, f.parent_name, e.title, e.starts_at, e.place, h.tz, c.first_name AS host_child
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN households h ON h.id = e.household_id
       JOIN children c ON c.id = e.child_id
      WHERE i.remind_at IS NOT NULL AND i.remind_at <= ? AND i.reminded_at IS NULL
        AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at > ?
      LIMIT 100`,
  )
    .bind(now, now)
    .all<Due>()
  let sent = 0
  for (const d of results) {
    // Stamp first: a crash between the stamp and the send loses one reminder, the other
    // order sends it every hour until the cron dies.
    const stamped = await env.DB.prepare('UPDATE invitations SET reminded_at = ? WHERE id = ? AND reminded_at IS NULL').bind(now, d.id).run()
    if (!stamped.meta.changes || !d.email) continue
    const when = whenLong(d.starts_at, 'fr', d.tz)
    const link = `${origin}/${paperCode(d.token)}`
    try {
      await sendMail(env, {
        to: d.email,
        subject: `Demain : ${d.title}`,
        text: `Bonjour ${d.parent_name},\n\nPetit rappel : ${d.title} avec ${d.host_child}, ${when}${d.place ? ` — ${d.place}` : ''}.\n\nLa page de la rencontre : ${link}\n\n— Viens jouer`,
        html: `<p>Bonjour ${escapeHtml(d.parent_name)},</p><p>Petit rappel : <strong>${escapeHtml(d.title)}</strong> avec ${escapeHtml(d.host_child)}, ${escapeHtml(when)}${d.place ? ` — ${escapeHtml(d.place)}` : ''}.</p><p><a href="${link}">La page de la rencontre</a></p><p>— Viens jouer</p>`,
      })
      sent++
    } catch (err) {
      console.error('[reminders] send', d.id, err)
    }
  }
  return sent
}

interface HostDue {
  id: string
  email: string
  display_name: string
  title: string
  starts_at: number
  place: string | null
  tz: string
  host_child: string
}

// The host's own reminder, only for a parent who turned it on (parents.remind_host). One email per rencontre, once it
// is under a day away: when, where, who said yes. Stamped first, like the others, so it can never go out twice.
export async function sendHostReminders(env: Env, origin: string): Promise<number> {
  if (!mailEnabled(env)) return 0
  const now = nowSec()
  const { results } = await env.DB.prepare(
    `SELECT e.id, p.email, p.display_name, e.title, e.starts_at, e.place, h.tz, c.first_name AS host_child
       FROM encounters e
       JOIN households h ON h.id = e.household_id
       JOIN children c ON c.id = e.child_id
       JOIN parents p ON p.household_id = e.household_id AND p.remind_host = 1
      WHERE e.host_reminded_at IS NULL AND e.deleted_at IS NULL AND e.status != 'cancelled'
        AND e.starts_at > ? AND e.starts_at <= ?
      LIMIT 100`,
  )
    .bind(now, now + REMIND_LEAD_SEC)
    .all<HostDue>()
  let sent = 0
  const stamped = new Set<string>()
  for (const d of results) {
    if (!stamped.has(d.id)) {
      const r = await env.DB.prepare('UPDATE encounters SET host_reminded_at = ? WHERE id = ? AND host_reminded_at IS NULL').bind(now, d.id).run()
      if (!r.meta.changes) continue
      stamped.add(d.id)
    }
    const { results: yes } = await env.DB.prepare(
      `SELECT f.child_first_name FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.encounter_id = ? AND i.reply = 'yes' ORDER BY f.child_first_name`,
    )
      .bind(d.id)
      .all<{ child_first_name: string }>()
    const who = yes.length ? yes.map((y) => y.child_first_name).join(', ') : 'personne n’a encore répondu oui'
    const when = whenLong(d.starts_at, 'fr', d.tz)
    const link = `${origin}/rencontres/${d.id}`
    try {
      await sendMail(env, {
        to: d.email,
        subject: `Demain : ${d.title}`,
        text: `Bonjour ${d.display_name},\n\nPetit rappel : ${d.title} avec ${d.host_child}, ${when}${d.place ? ` — ${d.place}` : ''}.\nQui vient : ${who}.\n\nLa page de la rencontre : ${link}\n\nTu reçois ce courriel parce que tu l’as demandé dans Mon profil. Tu peux le couper là-bas.\n\n— Viens jouer`,
        html: `<p>Bonjour ${escapeHtml(d.display_name)},</p><p>Petit rappel : <strong>${escapeHtml(d.title)}</strong> avec ${escapeHtml(d.host_child)}, ${escapeHtml(when)}${d.place ? ` — ${escapeHtml(d.place)}` : ''}.<br>Qui vient : ${escapeHtml(who)}.</p><p><a href="${link}">La page de la rencontre</a></p><p class="small">Tu reçois ce courriel parce que tu l’as demandé dans Mon profil. Tu peux le couper là-bas.</p><p>— Viens jouer</p>`,
      })
      sent++
    } catch (err) {
      console.error('[reminders] host send', d.id, err)
    }
  }
  return sent
}
