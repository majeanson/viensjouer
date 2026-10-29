// What the hourly cron tidies so nothing outlives its purpose: spent or expired password-reset and second-parent
// tokens (a week after they stopped working, long enough to answer « why did my link die »), the mail ledger, and
// sandboxes that aged out while nobody minted a new one (the sweep otherwise only ran on a mint), rows removed more
// than a month ago, and the share words of rencontres long over (purge.ts).
import type { Env } from './env'
import { sweepDemos } from './demo'
import { purgeMailLedger } from './mailBudget'
import { purgeRemoved, retireLinks } from './purge'
import { nowSec } from './ids'

export const TOKEN_GRACE_SEC = 7 * 24 * 3600

// Each step stands alone: one failing (a locked table, a sweep over a bad row) must not skip the others for the hour.
export async function tidy(env: Env, now = nowSec()): Promise<void> {
  const cutoff = now - TOKEN_GRACE_SEC
  const steps: [string, () => Promise<unknown>][] = [
    ['tokens', () => env.DB.batch([
      env.DB.prepare('DELETE FROM password_resets WHERE expires_at < ?').bind(cutoff),
      env.DB.prepare('DELETE FROM parent_invites WHERE expires_at < ?').bind(cutoff),
    ])],
    ['mail ledger', () => purgeMailLedger(env)],
    // A notification is news, not a record: read or not, it goes after 30 days.
    ['notifications', () => env.DB.prepare('DELETE FROM notifications WHERE created_at < ?').bind(now - 30 * 86_400).run()],
    ['sandboxes', () => sweepDemos(env, now)],
    ['removed rows', () => purgeRemoved(env, now)],
    ['ended links', () => retireLinks(env, now)],
  ]
  for (const [name, run] of steps) {
    try {
      await run()
    } catch (err) {
      console.error('[tidy]', name, err)
    }
  }
}
