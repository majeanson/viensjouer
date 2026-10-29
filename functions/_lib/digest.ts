// The weekly digest: ONE email on Monday morning to a parent who asked for it (parents.weekly_digest, off unless ticked):
// the rencontres of the coming seven days and who has said what. Nothing to say (no rencontre that week) means no email.
// Hourly cron, like the reminders: it sends from 7 h to 11 h Monday in the household's own time zone, at most once a
// week (digest_at is stamped BEFORE the send, so a slow send can never double up), and it counts against the daily mail budget.
import type { Env } from './env'
import { mailEnabled, sendMail } from './mail'
import { mailRoom, recordMail } from './mailBudget'
import { mailLang } from './lang'
import { digestMail } from './mailCopy'
import { nowSec, whenLong } from './ids'

const WEEK = 7 * 86_400

/** Monday between 7 h and 11 h in `tz`? (an unknown zone never sends: better silent than at the wrong hour) */
export function isDigestTime(nowSecs: number, tz: string): boolean {
  try {
    const d = new Date(nowSecs * 1000)
    const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: tz }).format(d)
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d))
    return day === 'Mon' && hour >= 7 && hour < 11
  } catch {
    return false
  }
}

interface Due {
  email: string
  lang: string | null
  display_name: string
  household_id: string
  tz: string
}

export async function sendWeeklyDigests(env: Env, origin: string): Promise<number> {
  if (!mailEnabled(env)) return 0
  const now = nowSec()
  const { results } = await env.DB.prepare(
    `SELECT p.email, p.lang, p.display_name, p.household_id, h.tz FROM parents p JOIN households h ON h.id = p.household_id
      WHERE p.weekly_digest = 1 AND (p.digest_at IS NULL OR p.digest_at < ?) LIMIT 100`,
  )
    .bind(now - 5 * 86_400)
    .all<Due>()
  let sent = 0
  const rooms = new Map<string, number>()
  for (const d of results) {
    if (!isDigestTime(now, d.tz)) continue
    const room = rooms.get(d.household_id) ?? (await mailRoom(env, d.household_id))
    rooms.set(d.household_id, room)
    if (room < 1) continue
    const stamped = await env.DB.prepare('UPDATE parents SET digest_at = ? WHERE email = ? AND (digest_at IS NULL OR digest_at < ?)').bind(now, d.email, now - 5 * 86_400).run()
    if (!stamped.meta.changes) continue
    const { results: items } = await env.DB.prepare(
      `SELECT e.id, e.title, e.starts_at,
              (SELECT COUNT(*) FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.encounter_id = e.id AND f.deleted_at IS NULL AND i.reply = 'yes') AS yes,
              (SELECT COUNT(*) FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.encounter_id = e.id AND f.deleted_at IS NULL AND i.reply = 'maybe') AS maybe,
              (SELECT COUNT(*) FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id WHERE i.encounter_id = e.id AND f.deleted_at IS NULL AND i.reply IS NULL) AS waiting
         FROM encounters e WHERE e.household_id = ? AND e.deleted_at IS NULL AND e.status != 'cancelled' AND e.starts_at > ? AND e.starts_at <= ? ORDER BY e.starts_at LIMIT 20`,
    )
      .bind(d.household_id, now, now + WEEK)
      .all<{ id: string; title: string; starts_at: number; yes: number; maybe: number; waiting: number }>()
    if (!items.length) continue
    const lang = mailLang(d.lang)
    try {
      await sendMail(env, { to: d.email, ...digestMail(lang, { name: d.display_name, items: items.map((i) => ({ title: i.title, when: whenLong(i.starts_at, lang, d.tz), yes: i.yes, maybe: i.maybe, waiting: i.waiting, link: `${origin}/rencontres/${i.id}` })), link: `${origin}/rencontres` }) })
      await recordMail(env, d.household_id)
      rooms.set(d.household_id, room - 1)
      sent++
    } catch (err) {
      console.error('[digest] send', d.email, err)
    }
  }
  return sent
}
