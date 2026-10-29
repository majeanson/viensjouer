// Telling a signed-in parent something happened: a row in `notifications` (the in-app « Nouveau » list, always) and, when
// the parent allowed it on a device, a payload-less Web Push to wake that device (_lib/webpush.ts). Everything here is
// best effort and NEVER throws: the thing that caused the notification (an invitation, an edit, an answer) is already
// saved, and a failed notice must never make it look failed.
import type { Env } from './env'
import { isDemoEmail } from './demo'
import { newId, nowSec } from './ids'
import { isLang, type MailLang } from './lang'
import { pushEnabled, pushTickle } from './webpush'
import type { Words } from './notifyCopy'

export type NoteKind = 'invited' | 'changed' | 'cancelled' | 'postponed' | 'answered' | 'reminder' | 'test'
export interface Recipient {
  email: string
  lang: MailLang
  householdId: string
}
export interface Note {
  kind: NoteKind
  url: string
  words: (lang: MailLang) => Words
}

const KEEP_PER_PARENT = 50
const SAME_NOTE_WINDOW_SEC = 10 * 60
const MAX_DEVICES = 8

interface ParentRow {
  email: string
  lang: string | null
  household_id: string
}
const toRecipient = (r: ParentRow): Recipient => ({ email: r.email, lang: isLang(r.lang) ? r.lang : 'fr', householdId: r.household_id })

export async function parentsOf(env: Env, householdId: string): Promise<Recipient[]> {
  const { results } = await env.DB.prepare('SELECT email, lang, household_id FROM parents WHERE household_id = ?').bind(householdId).all<ParentRow>()
  return results.map(toRecipient)
}

/** The accounts a friend family stands for: the household it was linked to, and any account on the family's own email. */
export async function accountsOfFamily(env: Env, family: { linked_household_id: string | null; email: string | null }, exceptHousehold: string): Promise<Recipient[]> {
  const { results } = await env.DB.prepare('SELECT email, lang, household_id FROM parents WHERE (household_id = ? OR lower(email) = lower(?)) AND household_id != ?')
    .bind(family.linked_household_id ?? '', family.email ?? '', exceptHousehold)
    .all<ParentRow>()
  return results.map(toRecipient)
}

export async function notify(env: Env, to: Recipient[], note: Note, now = nowSec()): Promise<void> {
  try {
    const seen = new Set<string>()
    const emails: string[] = []
    for (const r of to) {
      if (seen.has(r.email) || isDemoEmail(r.email)) continue
      seen.add(r.email)
      // The same news twice in ten minutes (a double tap, two quick edits) is one notice.
      const dup = await env.DB.prepare('SELECT 1 AS x FROM notifications WHERE email = ? AND kind = ? AND url = ? AND created_at > ?').bind(r.email, note.kind, note.url, now - SAME_NOTE_WINDOW_SEC).first()
      if (dup) continue
      const w = note.words(r.lang)
      await env.DB.batch([
        env.DB.prepare('INSERT INTO notifications (id, email, household_id, kind, title, body, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(newId(), r.email, r.householdId, note.kind, w.title.slice(0, 160), w.body.slice(0, 300), note.url, now),
        env.DB.prepare('DELETE FROM notifications WHERE email = ? AND id NOT IN (SELECT id FROM notifications WHERE email = ? ORDER BY created_at DESC LIMIT ?)').bind(r.email, r.email, KEEP_PER_PARENT),
      ])
      emails.push(r.email)
    }
    if (emails.length && pushEnabled(env)) await wake(env, emails, now)
  } catch (err) {
    console.error('[notify]', err)
  }
}

async function wake(env: Env, emails: string[], now: number): Promise<void> {
  const { results } = await env.DB.prepare(`SELECT id, endpoint FROM push_subscriptions WHERE email IN (${emails.map(() => '?').join(',')})`).bind(...emails).all<{ id: string; endpoint: string }>()
  await Promise.all(
    results.map(async (s) => {
      const r = await pushTickle(env, s.endpoint, now)
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run()
      else if (r === 'ok') await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?').bind(now, s.id).run()
    }),
  )
}

/** A device allowed notifications: remember its endpoint (one row per endpoint; the oldest of too many goes). */
export async function subscribeDevice(env: Env, parent: { email: string; householdId: string }, endpoint: string, now = nowSec()): Promise<void> {
  await env.DB.prepare('INSERT INTO push_subscriptions (id, email, household_id, endpoint, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, household_id = excluded.household_id')
    .bind(newId(), parent.email, parent.householdId, endpoint, now)
    .run()
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE email = ? AND id NOT IN (SELECT id FROM push_subscriptions WHERE email = ? ORDER BY created_at DESC LIMIT ?)').bind(parent.email, parent.email, MAX_DEVICES).run()
}
