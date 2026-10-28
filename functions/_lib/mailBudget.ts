// The ceiling on what one household can make the app email in a day. Signup is open and a friend
// family's address is free text, so without a cap any account could aim the verified sender at
// strangers. The cap is generous for a real host (a handful of families a week) and fatal to a relay.
// Not counted, on purpose: the reminders the cron sends (one per invitation, and only because the RECIPIENT ticked the box
// or the host turned their own on), and the test mail (to oneself, rate-limited). Callers ask `mailRoom` first, send at most that many, then `recordMail` what actually left.
import type { Env } from './env'
import { newId, nowSec } from './ids'

export const MAIL_DAILY_CAP = 60
export const MAIL_KEEP_SEC = 2 * 24 * 3600
const DAY = 24 * 3600

/** How many more emails this household may send right now (0 when the day is used up). */
export async function mailRoom(env: Env, householdId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mail_sends WHERE household_id = ? AND created_at > ?')
    .bind(householdId, nowSec() - DAY)
    .first<{ n: number }>()
  return Math.max(0, MAIL_DAILY_CAP - (row?.n ?? 0))
}

export async function recordMail(env: Env, householdId: string, n = 1): Promise<void> {
  if (n < 1) return
  const ts = nowSec()
  await env.DB.batch(Array.from({ length: n }, () => env.DB.prepare('INSERT INTO mail_sends (id, household_id, created_at) VALUES (?, ?, ?)').bind(newId(), householdId, ts)))
}

export async function purgeMailLedger(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM mail_sends WHERE created_at < ?').bind(nowSec() - MAIL_KEEP_SEC).run()
}

export const MAIL_CAP_MESSAGE = 'Beaucoup de courriels aujourd’hui : réessaie demain, ou copie le lien.'
