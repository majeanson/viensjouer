// A real link whose card the host has since removed. The code is still the credential, so the holder may be told who the
// host was (first name only): « cette rencontre est terminée, écris à Marie » beats the generic dead end. The handlers
// answer 410 with that first name as the message (the client prints it, it is not a sentence). A purged row is gone for
// good: plain 404, counted as a miss.
import type { Env } from './env'
import { normalizeLinkCode } from './ids'

const HOST = '(SELECT display_name FROM parents p WHERE p.household_id = x.household_id ORDER BY p.created_at LIMIT 1) AS host'
const SQL = {
  encounter: `SELECT ${HOST} FROM invitations i JOIN encounters x ON x.id = i.encounter_id WHERE i.token = ? AND x.deleted_at IS NOT NULL`,
  window: `SELECT ${HOST} FROM window_targets t JOIN open_windows x ON x.id = t.window_id WHERE t.token = ? AND x.deleted_at IS NOT NULL`,
}

export async function retiredHost(env: Env, kind: keyof typeof SQL, raw: string | undefined): Promise<string | null> {
  const code = normalizeLinkCode(raw)
  if (!code) return null
  const row = await env.DB.prepare(SQL[kind]).bind(code).first<{ host: string | null }>()
  return row ? (row.host ?? '').trim().split(/\s+/)[0] || null : null
}
