// The try-it door: « Essayer sans compte » mints a throwaway SANDBOX — a real household
// with a real parent session and a little seeded data — swept after 24 h. No special auth
// mode: it can genuinely write, so what a visitor sees is what the app does.
//
// Bounds: DEMO_TTL_SEC (every mint first sweeps what has aged out), DEMO_CAP (past it the
// door says « reviens plus tard » rather than minting), and a demo household can never SEND
// mail (isDemoEmail gates the two send doors) or be mistaken for a real one by the cron
// (reminders skip it: its invitations carry no email).
import type { Env } from './env'
import { hashPassword } from './password'
import { freshLinkCode, newId, nowSec } from './ids'

export const DEMO_TTL_SEC = 24 * 3600
export const DEMO_CAP = 50
export const DEMO_DOMAIN = '@viensjouer.invalid' // RFC 2606: can never be a real inbox

export const isDemoEmail = (email: string | null | undefined): boolean => !!email && email.startsWith('demo-') && email.endsWith(DEMO_DOMAIN)

// EVERY table a household's data lives in, in the order rows must go (children of a row
// before the row). `demo.test.ts` reads the migrations and FAILS if a table is missing here:
// a sandbox swept with a forgotten table would leave a stranger's rows behind forever.
// `byHousehold` runs `DELETE … WHERE <col> IN (ids)`; `via` goes through a parent table.
export const SWEEP_ORDER: { table: string; sql: (ids: string) => string }[] = [
  { table: 'bring_items', sql: (i) => `DELETE FROM bring_items WHERE encounter_id IN (SELECT id FROM encounters WHERE household_id IN (${i}))` },
  { table: 'encounter_changes', sql: (i) => `DELETE FROM encounter_changes WHERE encounter_id IN (SELECT id FROM encounters WHERE household_id IN (${i}))` },
  { table: 'encounter_messages', sql: (i) => `DELETE FROM encounter_messages WHERE encounter_id IN (SELECT id FROM encounters WHERE household_id IN (${i}))` },
  { table: 'relais', sql: (i) => `DELETE FROM relais WHERE invitation_id IN (SELECT inv.id FROM invitations inv JOIN encounters e ON e.id = inv.encounter_id WHERE e.household_id IN (${i}))` },
  { table: 'souvenirs', sql: (i) => `DELETE FROM souvenirs WHERE encounter_id IN (SELECT id FROM encounters WHERE household_id IN (${i}))` },
  { table: 'invitations', sql: (i) => `DELETE FROM invitations WHERE encounter_id IN (SELECT id FROM encounters WHERE household_id IN (${i}))` },
  { table: 'encounters', sql: (i) => `DELETE FROM encounters WHERE household_id IN (${i})` },
  { table: 'window_targets', sql: (i) => `DELETE FROM window_targets WHERE window_id IN (SELECT id FROM open_windows WHERE household_id IN (${i}))` },
  { table: 'open_windows', sql: (i) => `DELETE FROM open_windows WHERE household_id IN (${i})` },
  { table: 'friend_group_members', sql: (i) => `DELETE FROM friend_group_members WHERE group_id IN (SELECT id FROM friend_groups WHERE household_id IN (${i}))` },
  { table: 'friend_groups', sql: (i) => `DELETE FROM friend_groups WHERE household_id IN (${i})` },
  { table: 'child_links', sql: (i) => `DELETE FROM child_links WHERE household_a IN (${i}) OR household_b IN (${i})` },
  { table: 'friend_families', sql: (i) => `DELETE FROM friend_families WHERE household_id IN (${i})` },
  { table: 'children', sql: (i) => `DELETE FROM children WHERE household_id IN (${i})` },
  { table: 'home_cards', sql: (i) => `DELETE FROM home_cards WHERE household_id IN (${i})` },
  { table: 'mail_sends', sql: (i) => `DELETE FROM mail_sends WHERE household_id IN (${i})` },
  { table: 'notifications', sql: (i) => `DELETE FROM notifications WHERE household_id IN (${i})` },
  { table: 'push_subscriptions', sql: (i) => `DELETE FROM push_subscriptions WHERE household_id IN (${i})` },
  { table: 'parent_invites', sql: (i) => `DELETE FROM parent_invites WHERE household_id IN (${i})` },
  { table: 'password_resets', sql: (i) => `DELETE FROM password_resets WHERE email IN (SELECT email FROM parents WHERE household_id IN (${i}))` },
  { table: 'parents', sql: (i) => `DELETE FROM parents WHERE household_id IN (${i})` },
  { table: 'households', sql: (i) => `DELETE FROM households WHERE id IN (${i})` },
]

// Delete households for good: their photo blobs first, then every table in SWEEP_ORDER. Linked
// families elsewhere keep their own data and only lose the link. Used by the 24 h sandbox sweep
// AND by « Tout effacer » (DELETE /api/household) — one path, so neither can leave a table behind.
export async function deleteHouseholds(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return
  const marks = ids.map(() => '?').join(',')
  if (env.PHOTOS) {
    const { results: keys } = await env.DB.prepare(`SELECT s.media_key FROM souvenirs s JOIN encounters e ON e.id = s.encounter_id WHERE e.household_id IN (${marks})`).bind(...ids).all<{ media_key: string }>()
    await Promise.all(keys.map((k) => env.PHOTOS!.delete(k.media_key).catch((e) => console.error('[r2] delete failed', e))))
    const { results: covers } = await env.DB.prepare(`SELECT cover_key FROM encounters WHERE household_id IN (${marks}) AND cover_key IS NOT NULL`).bind(...ids).all<{ cover_key: string }>()
    await Promise.all(covers.map((c) => env.PHOTOS!.delete(c.cover_key).catch((e) => console.error('[r2] delete failed', e))))
    const { results: faces } = await env.DB.prepare(`SELECT photo_key FROM children WHERE household_id IN (${marks}) AND photo_key IS NOT NULL UNION ALL SELECT photo_key FROM parents WHERE household_id IN (${marks}) AND photo_key IS NOT NULL`).bind(...ids, ...ids).all<{ photo_key: string }>()
    await Promise.all(faces.map((f) => env.PHOTOS!.delete(f.photo_key).catch((e) => console.error('[r2] delete failed', e))))
  }
  // The `?` list is repeated where a statement mentions the ids twice (child_links).
  const stmts = SWEEP_ORDER.map((s) => {
    const sql = s.sql(marks)
    const uses = sql.split(marks).length - 1
    return env.DB.prepare(sql).bind(...Array.from({ length: uses }, () => ids).flat())
  })
  const unlink = env.DB.prepare(`UPDATE friend_families SET linked_household_id = NULL, linked_child_id = NULL WHERE linked_household_id IN (${marks})`).bind(...ids)
  await env.DB.batch([unlink, ...stmts])
}

// Delete aged-out sandboxes. Bounded per call so a mint stays cheap.
export async function sweepDemos(env: Env, now = nowSec(), limit = 20): Promise<number> {
  const { results } = await env.DB.prepare("SELECT id FROM households WHERE kind = 'demo' AND created_at < ? LIMIT ?").bind(now - DEMO_TTL_SEC, limit).all<{ id: string }>()
  await deleteHouseholds(env, results.map((r) => r.id))
  return results.length
}

// Mint a sandbox: household + parent + a seeded child, two friend families, one park
// rencontre inviting both, and a home card. Returns the parent's email (to sign in as).
export async function mintDemo(env: Env): Promise<string> {
  const ts = nowSec()
  const hh = newId()
  const email = `demo-${newId(10).toLowerCase()}${DEMO_DOMAIN}`
  const child = newId()
  const f1 = newId()
  const f2 = newId()
  const enc = newId()
  const saturday = (() => {
    const d = new Date()
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
    d.setHours(10, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })()
  const b = (y: number) => `${new Date().getFullYear() - y}-06-15`
  const code1 = await freshLinkCode(env.DB, 'invitations')
  let code2 = await freshLinkCode(env.DB, 'invitations')
  while (code2 === code1) code2 = await freshLinkCode(env.DB, 'invitations')
  await env.DB.batch([
    env.DB.prepare("INSERT INTO households (id, name, kind, created_at, updated_at) VALUES (?, 'La famille Essai', 'demo', ?, ?)").bind(hh, ts, ts),
    env.DB.prepare('INSERT INTO parents (email, household_id, display_name, password_hash, origin, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(email, hh, 'Camille', await hashPassword(newId(24)), 'signup', ts),
    env.DB.prepare('INSERT INTO children (id, household_id, first_name, birthdate, colour, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').bind(child, hh, 'Noé', b(3), '#f2a03d', ts, ts),
    env.DB.prepare('INSERT INTO friend_families (id, household_id, parent_name, child_first_name, child_birthdate, allergies, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(f1, hh, 'Julie', 'Léa', b(3), 'arachides', ts, ts),
    env.DB.prepare('INSERT INTO friend_families (id, household_id, parent_name, child_first_name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(f2, hh, 'Paul', 'Max', 'Un chien à la maison', ts, ts),
    env.DB.prepare("INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, place, note, created_at, updated_at) VALUES (?, ?, ?, 'park', ?, ?, ?, ?, ?, ?)").bind(enc, hh, child, 'Au parc Lafontaine', saturday, 'Près des jeux d’eau', 'Apporte une collation', ts, ts),
    env.DB.prepare('INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), enc, f1, code1, ts, ts),
    env.DB.prepare('INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(newId(), enc, f2, code2, ts, ts),
    env.DB.prepare('INSERT INTO home_cards (household_id, details, updated_at) VALUES (?, ?, ?)').bind(hh, JSON.stringify({ dog: false, pool: false, screens: 'little', nutFree: true, note: 'Collation sans noix' }), ts),
  ])
  return email
}
