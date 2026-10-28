// « Me prévenir quand une famille répond » — the host's own opt-in (parents.notify_answers). One email per invitation
// per ten minutes, to the parents of the hosting household who asked, in their language, counted in the household's
// daily mail budget like every other mail a host's rencontre causes. Never to a sandbox. Fire-and-forget from the
// reply handler: the family's answer is already saved, and a failed mail must never make it look failed.
import type { Env } from './env'
import { isDemoEmail } from './demo'
import { nowSec, whenLong } from './ids'
import { mailLang } from './lang'
import { mailEnabled, sendMail } from './mail'
import { mailRoom, recordMail } from './mailBudget'
import { answerMail } from './mailCopy'

export const ANSWER_DEBOUNCE_SEC = 10 * 60

export interface Answered {
  householdId: string
  invitationId: string
  encounterId: string
  title: string
  startsAt: number
  tz: string
  reply: 'yes' | 'maybe' | 'no'
  guestParent: string
  guestChild: string
}

export async function notifyHostOfAnswer(env: Env, origin: string, a: Answered): Promise<number> {
  try {
    if (!mailEnabled(env)) return 0
    const { results } = await env.DB.prepare('SELECT email, display_name, lang FROM parents WHERE household_id = ? AND notify_answers = 1')
      .bind(a.householdId)
      .all<{ email: string; display_name: string; lang: string | null }>()
    const hosts = results.filter((h) => !isDemoEmail(h.email))
    if (!hosts.length) return 0
    const now = nowSec()
    const claimed = await env.DB.prepare('UPDATE invitations SET host_notified_at = ? WHERE id = ? AND (host_notified_at IS NULL OR host_notified_at < ?)')
      .bind(now, a.invitationId, now - ANSWER_DEBOUNCE_SEC)
      .run()
    if (!claimed.meta.changes) return 0
    let sent = 0
    for (const h of hosts.slice(0, await mailRoom(env, a.householdId))) {
      const lang = mailLang(h.lang)
      try {
        await sendMail(env, { to: h.email, ...answerMail(lang, { name: h.display_name, guestParent: a.guestParent, guestChild: a.guestChild, reply: a.reply, title: a.title, when: whenLong(a.startsAt, lang, a.tz), link: `${origin}/rencontres/${a.encounterId}` }) })
        sent++
      } catch (err) {
        console.error('[mail] answer', err)
      }
    }
    await recordMail(env, a.householdId, sent)
    return sent
  } catch (err) {
    console.error('[answerNotice]', err)
    return 0
  }
}
