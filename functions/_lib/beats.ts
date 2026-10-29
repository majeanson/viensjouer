// A heartbeat for the hourly cron: it stamps `cron_beats` when it runs, /api/health reports how long ago, and the nightly
// production check (.github/workflows/stranger.yml) fails when that is more than three hours, so a stopped cron is noticed
// by an email from GitHub instead of by a parent whose reminder never came. Also the one-per-day memory of the mail alert.
import type { Env } from './env'
import { nowSec } from './ids'

export async function beat(env: Env, name: string): Promise<void> {
  await env.DB.prepare('INSERT INTO cron_beats (name, at) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET at = excluded.at').bind(name, nowSec()).run()
}

/** Seconds since `name` last beat, or null when it never has. */
export async function beatAge(env: Env, name: string): Promise<number | null> {
  const row = await env.DB.prepare('SELECT at FROM cron_beats WHERE name = ?').bind(name).first<{ at: number }>()
  return row ? Math.max(0, nowSec() - row.at) : null
}
