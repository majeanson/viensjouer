// « Envoyer les invitations tout de suite » at creation: one email to every family picked that has an address, was not told
// before, did not ask to stop and whose address did not bounce. Same mail, same claim-then-send order and same budget as the
// single « Envoyer » button (functions/api/invitations.ts), so nothing goes out twice and the daily cap holds.
import type { Env } from './env'
import { mailEnabled, sendMail } from './mail'
import { mailLang } from './lang'
import { invitationMail, withUnsubscribe } from './mailCopy'
import { mailRoom, recordMail } from './mailBudget'
import { nowSec, paperCode, whenLong } from './ids'

interface Row {
  id: string
  token: string
  scope: string
  email: string
  lang: string | null
  parent_name: string
  child_first_name: string
  title: string
  starts_at: number
  host_child: string
  tz: string
}

export async function sendEncounterInvitations(
  env: Env,
  request: Request,
  host: { householdId: string; displayName: string; email: string },
  encounterId: string,
): Promise<{ sent: number; skipped: number }> {
  if (!mailEnabled(env)) return { sent: 0, skipped: 0 }
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.token, i.scope, f.email, f.lang, f.parent_name, f.child_first_name, e.title, e.starts_at, c.first_name || COALESCE(' & ' || (SELECT first_name FROM children WHERE id = e.co_child_id), '') AS host_child, h.tz
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN children c ON c.id = e.child_id
       JOIN households h ON h.id = e.household_id
      WHERE i.encounter_id = ? AND e.household_id = ? AND e.deleted_at IS NULL AND i.sent_at IS NULL AND i.reply IS NULL
        AND f.email IS NOT NULL AND f.deleted_at IS NULL AND f.mail_stopped_at IS NULL AND f.email_bounced_at IS NULL
      ORDER BY i.created_at LIMIT 40`,
  )
    .bind(encounterId, host.householdId)
    .all<Row>()
  const room = await mailRoom(env, host.householdId)
  const origin = new URL(request.url).origin
  let sent = 0
  for (const r of results.slice(0, room)) {
    const now = nowSec()
    const claimed = await env.DB.prepare('UPDATE invitations SET sent_at = ?, updated_at = ? WHERE id = ? AND sent_at IS NULL').bind(now, now, r.id).run()
    if (!claimed.meta.changes) continue
    const lang = mailLang(r.lang, request)
    const link = `${origin}/${paperCode(r.token)}`
    const mail = withUnsubscribe(lang, origin, r.token, invitationMail(lang, { parent: r.parent_name, host: host.displayName, hostChild: r.host_child, child: r.child_first_name, title: r.title, when: whenLong(r.starts_at, lang, r.tz), friendOnly: r.scope === 'friend', link }))
    try {
      await sendMail(env, { to: r.email, fromName: host.displayName, replyTo: host.email, ...mail })
      sent++
    } catch (err) {
      // Nothing left: give the slot back so « Envoyer » on the page still works.
      await env.DB.prepare('UPDATE invitations SET sent_at = NULL WHERE id = ?').bind(r.id).run()
      console.error('[mail] invitation', r.id, err)
    }
  }
  await recordMail(env, host.householdId, sent)
  // Families with an address left out because the day's budget ran out are counted, so the host is told.
  return { sent, skipped: Math.max(0, results.length - room) }
}
