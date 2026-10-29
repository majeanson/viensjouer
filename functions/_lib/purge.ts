// Hygiene, run by the hourly `tidy`: what a person removed does not stay in D1 forever, and the two-word link space
// does not fill up with links nobody can use any more.
//
//   - REMOVED_GRACE_SEC after a rencontre, window, group, message, photo, family or child was removed, the row is deleted
//     for good (with what hangs off it). The grace is long enough to answer « I removed it by mistake », short enough
//     that the privacy page's « stays hidden until Tout effacer » is a month, not a lifetime.
//   - A family or child still named by something that survives (a past invitation, a link, a rencontre) is kept: the
//     book entry is what makes that history readable.
//   - LINK_RETIRE_SEC after a rencontre (or window) ended, its share words are replaced by an unusable token, so
//     `freshLinkCode` can hand them out again. The row, its answer and the history stay.
// Bounded per run (BATCH) so an hour never does unbounded work; a backlog clears over a few hours.
import type { Env } from './env'
import { nowSec } from './ids'

export const REMOVED_GRACE_SEC = 30 * 24 * 3600
export const LINK_RETIRE_SEC = 90 * 24 * 3600
export const RETIRED_PREFIX = 'old-'
const BATCH = 25

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',')

async function dropBlobs(env: Env, keys: (string | null)[]): Promise<void> {
  if (!env.PHOTOS) return
  await Promise.all(keys.filter((k): k is string => !!k).map((k) => env.PHOTOS!.delete(k).catch((e) => console.error('[r2] delete failed', e))))
}

export async function purgeRemoved(env: Env, now = nowSec()): Promise<void> {
  const cutoff = now - REMOVED_GRACE_SEC

  // Rencontres: everything that hangs off them, and their blobs.
  const { results: encs } = await env.DB.prepare('SELECT id, cover_key FROM encounters WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?').bind(cutoff, BATCH).all<{ id: string; cover_key: string | null }>()
  if (encs.length) {
    const ids = encs.map((e) => e.id)
    const m = marks(ids.length)
    const { results: shots } = await env.DB.prepare(`SELECT media_key FROM souvenirs WHERE encounter_id IN (${m})`).bind(...ids).all<{ media_key: string }>()
    await dropBlobs(env, [...shots.map((s) => s.media_key), ...encs.map((e) => e.cover_key)])
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM bring_items WHERE encounter_id IN (${m})`).bind(...ids),
      env.DB.prepare(`DELETE FROM encounter_changes WHERE encounter_id IN (${m})`).bind(...ids),
      env.DB.prepare(`DELETE FROM encounter_messages WHERE encounter_id IN (${m})`).bind(...ids),
      env.DB.prepare(`DELETE FROM relais WHERE invitation_id IN (SELECT id FROM invitations WHERE encounter_id IN (${m}))`).bind(...ids),
      env.DB.prepare(`DELETE FROM souvenirs WHERE encounter_id IN (${m})`).bind(...ids),
      env.DB.prepare(`DELETE FROM invitations WHERE encounter_id IN (${m})`).bind(...ids),
      env.DB.prepare(`DELETE FROM encounters WHERE id IN (${m})`).bind(...ids),
    ])
  }

  // Windows and groups: their members first.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM window_targets WHERE window_id IN (SELECT id FROM open_windows WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
    env.DB.prepare('DELETE FROM open_windows WHERE id IN (SELECT id FROM open_windows WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
    env.DB.prepare('DELETE FROM friend_group_members WHERE group_id IN (SELECT id FROM friend_groups WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
    env.DB.prepare('DELETE FROM friend_groups WHERE id IN (SELECT id FROM friend_groups WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
    env.DB.prepare('DELETE FROM encounter_messages WHERE id IN (SELECT id FROM encounter_messages WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
    env.DB.prepare('DELETE FROM souvenirs WHERE id IN (SELECT id FROM souvenirs WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?)').bind(cutoff, BATCH),
  ])

  // A removed family leaves its groups, then goes unless a past invitation or window link still names it.
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM friend_group_members WHERE friend_family_id IN (SELECT id FROM friend_families f WHERE f.deleted_at IS NOT NULL AND f.deleted_at < ?
         AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.friend_family_id = f.id) AND NOT EXISTS (SELECT 1 FROM window_targets w WHERE w.friend_family_id = f.id) LIMIT ?)`,
    ).bind(cutoff, BATCH),
    env.DB.prepare(
      `DELETE FROM friend_families WHERE id IN (SELECT f.id FROM friend_families f WHERE f.deleted_at IS NOT NULL AND f.deleted_at < ?
         AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.friend_family_id = f.id) AND NOT EXISTS (SELECT 1 FROM window_targets w WHERE w.friend_family_id = f.id) LIMIT ?)`,
    ).bind(cutoff, BATCH),
  ])

  // A removed child goes unless a rencontre, window or link still points at it. Its face goes with it.
  const kept = `NOT EXISTS (SELECT 1 FROM encounters e WHERE e.child_id = c.id) AND NOT EXISTS (SELECT 1 FROM open_windows w WHERE w.child_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM child_links l WHERE l.child_a = c.id OR l.child_b = c.id)`
  const { results: kids } = await env.DB.prepare(`SELECT c.id, c.photo_key FROM children c WHERE c.deleted_at IS NOT NULL AND c.deleted_at < ? AND ${kept} LIMIT ?`).bind(cutoff, BATCH).all<{ id: string; photo_key: string | null }>()
  if (kids.length) {
    await dropBlobs(env, kids.map((k) => k.photo_key))
    await env.DB.prepare(`DELETE FROM children WHERE id IN (${marks(kids.length)})`).bind(...kids.map((k) => k.id)).run()
  }
}

// Frees the two-word space: an ended rencontre's links stop being codes. The unique token column stays satisfied
// because each retired token embeds the row's own id.
export async function retireLinks(env: Env, now = nowSec()): Promise<void> {
  const cutoff = now - LINK_RETIRE_SEC
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE invitations SET token = ? || id WHERE id IN (SELECT i.id FROM invitations i JOIN encounters e ON e.id = i.encounter_id
         WHERE e.starts_at < ? AND i.token NOT LIKE ? LIMIT 200)`,
    ).bind(RETIRED_PREFIX, cutoff, `${RETIRED_PREFIX}%`),
    env.DB.prepare(
      `UPDATE window_targets SET token = ? || id WHERE id IN (SELECT t.id FROM window_targets t JOIN open_windows w ON w.id = t.window_id
         WHERE w.ends_at < ? AND t.token NOT LIKE ? LIMIT 200)`,
    ).bind(RETIRED_PREFIX, cutoff, `${RETIRED_PREFIX}%`),
  ])
}
