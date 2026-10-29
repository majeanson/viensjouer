// The events that tell a signed-in parent something (the words are in notifyCopy.ts, the delivery in notify.ts). One function
// per event, called from the handler that caused it AFTER its own work is saved. Each one is best effort and never throws.
import type { Env } from './env'
import { changeLines, type Change } from './changes'
import { nowSec, paperCode, whenLong } from './ids'
import { accountsOfFamily, notify, parentsOf, type Recipient } from './notify'
import { NOTE } from './notifyCopy'

interface Family {
  linked_household_id: string | null
  email: string | null
}

async function tzOf(env: Env, householdId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT tz FROM households WHERE id = ?').bind(householdId).first<{ tz: string }>()
  return row?.tz ?? 'America/Toronto'
}

/** « Marc t'invite »: new invitations, to the families that have an account (linked, or on the same email). */
export async function notifyInvited(env: Env, host: { householdId: string; displayName: string }, e: { title: string; startsAt: number }, minted: { familyId: string; token: string }[]): Promise<void> {
  try {
    if (!minted.length) return
    const tz = await tzOf(env, host.householdId)
    for (const m of minted) {
      const fam = await env.DB.prepare('SELECT linked_household_id, email FROM friend_families WHERE id = ?').bind(m.familyId).first<Family>()
      if (!fam) continue
      await notify(env, await accountsOfFamily(env, fam, host.householdId), { kind: 'invited', url: `/${paperCode(m.token)}`, words: (lang) => NOTE.invited(lang, { host: host.displayName, title: e.title, when: whenLong(e.startsAt, lang, tz) }) })
    }
  } catch (err) {
    console.error('[notify] invited', err)
  }
}

/** A rencontre changed, was cancelled or postponed: the invited families that have an account and did not say no. */
export async function notifyChanged(env: Env, host: { householdId: string }, e: { id: string; title: string; startsAt: number; status: string; statusChanged: boolean; changes: Change[] }): Promise<void> {
  try {
    const tz = await tzOf(env, host.householdId)
    const { results } = await env.DB.prepare(
      `SELECT i.token, f.linked_household_id, f.email FROM invitations i JOIN friend_families f ON f.id = i.friend_family_id
        WHERE i.encounter_id = ? AND f.deleted_at IS NULL AND (i.reply IS NULL OR i.reply != 'no') LIMIT 40`,
    )
      .bind(e.id)
      .all<Family & { token: string }>()
    for (const r of results) {
      const to = await accountsOfFamily(env, r, host.householdId)
      const kind = e.statusChanged && e.status === 'cancelled' ? 'cancelled' : e.statusChanged && e.status === 'postponed' ? 'postponed' : 'changed'
      await notify(env, to, {
        kind,
        url: `/${paperCode(r.token)}`,
        words: (lang) => {
          const when = whenLong(e.startsAt, lang, tz)
          return kind === 'cancelled' ? NOTE.cancelled(lang, { title: e.title, when }) : kind === 'postponed' ? NOTE.postponed(lang, { title: e.title, when }) : NOTE.changed(lang, { title: e.title, lines: changeLines(e.changes, tz, lang) })
        },
      })
    }
  } catch (err) {
    console.error('[notify] changed', err)
  }
}

/** A family answered: every parent of the hosting household. One per invitation (the url carries it) per ten minutes. */
export async function notifyAnswered(env: Env, a: { householdId: string; invitationId: string; encounterId: string; title: string; reply: 'yes' | 'maybe' | 'no'; guestParent: string; guestChild: string }): Promise<void> {
  try {
    await notify(env, await parentsOf(env, a.householdId), { kind: 'answered', url: `/rencontres/${a.encounterId}#${a.invitationId}`, words: (lang) => NOTE.answered(lang, { guestChild: a.guestChild, guestParent: a.guestParent, reply: a.reply, title: a.title }) })
  } catch (err) {
    console.error('[notify] answered', err)
  }
}

/** The day-before reminder, for the people it already goes to by email. */
export async function notifyReminder(env: Env, to: Recipient[], url: string, e: { title: string; startsAt: number; place: string | null; tz: string }, now = nowSec()): Promise<void> {
  try {
    await notify(env, to, { kind: 'reminder', url, words: (lang) => NOTE.reminder(lang, { title: e.title, when: whenLong(e.startsAt, lang, e.tz), place: e.place }) }, now)
  } catch (err) {
    console.error('[notify] reminder', err)
  }
}
