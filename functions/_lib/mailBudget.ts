// The ceiling on what one household can make the app email in a day. Signup is open and a friend
// family's address is free text, so without a cap any account could aim the verified sender at
// strangers. The cap is generous for a real host (a handful of families a week) and fatal to a relay.
// The cron's reminders ARE counted (they share Resend's 100 a day with everything else); a household with no room is
// skipped until a later run. Not counted: the test mail (to oneself, rate-limited). Callers ask `mailRoom` first, send at most that many, then `recordMail` what actually left.
import type { Env } from './env'
import { newId, nowSec } from './ids'
import { mailEnabled, sendMail } from './mail'
import { beat, beatAge } from './beats'

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

// Resend's free tier is 100 emails a day for the WHOLE app, whatever the per-household cap says: the cron logs a warning
// once the last 24 h pass 80 of them, so the day it fills up is seen coming (in the logs) and not found out from a bounce.
export const RESEND_FREE_DAILY = 100
export const HEADROOM_WARN_AT = 80

export async function warnIfMailNearFree(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mail_sends WHERE created_at > ?').bind(nowSec() - DAY).first<{ n: number }>()
  const n = row?.n ?? 0
  if (n >= HEADROOM_WARN_AT) {
    console.warn(`[mail] ${n} of ${RESEND_FREE_DAILY} free emails used in the last 24 h`)
    // And one email to the owner, at most once a day, when ADMIN_EMAIL is set (a log line nobody reads is not an alert).
    const last = await beatAge(env, 'mail80')
    if (env.ADMIN_EMAIL && mailEnabled(env) && (last === null || last > 20 * 3600)) {
      await beat(env, 'mail80')
      await sendMail(env, { to: env.ADMIN_EMAIL, subject: `Viens jouer : ${n} courriels sur ${RESEND_FREE_DAILY} aujourd’hui`, text: `${n} courriels sont partis ces dernières 24 h, sur ${RESEND_FREE_DAILY} gratuits chez Resend. Au-delà, les envois échouent jusqu’au lendemain.` }).catch((err) => console.error('[mail] admin alert', err))
    }
  }
  return n
}

export async function purgeMailLedger(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM mail_sends WHERE created_at < ?').bind(nowSec() - MAIL_KEEP_SEC).run()
}

export const MAIL_CAP_MESSAGE = 'Beaucoup de courriels aujourd’hui : réessaie demain, ou copie le lien.'
