// Souvenir photos in R2 — OPTIONAL like mail: PHOTOS unset → the photo doors answer 503 and
// the UI hides them. The browser already resized to ≤ 1600 px JPEG, so the server's job is
// the cap, the type check and the key shape.
import type { Env } from './env'
import { newId } from './ids'
import { FULL, roomFor } from './ceilings'

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024
export const MAX_PHOTOS_PER_ENCOUNTER = 12
// A face is a small square JPEG (the browser sends ~256 px); this is the cap, not the target.
export const MAX_AVATAR_BYTES = 400 * 1024

export const photosEnabled = (env: Env): boolean => !!env.PHOTOS

// The file's own first bytes decide the type — never the Content-Type header, which a
// client can set to anything. JPEG, PNG and WebP only (no SVG: it can carry script).
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

export type StoreResult = { ok: true; id: string } | { ok: false; status: 400 | 413 | 429 | 503; message: string }

type Taken = { ok: true; bytes: Uint8Array; type: 'image/jpeg' | 'image/png' | 'image/webp' } | { ok: false; status: 400 | 413 | 429 | 503; message: string }

// The body as an image: capped, non-empty, and typed by its own first bytes.
async function takeImage(env: Env, request: Request, max = MAX_PHOTO_BYTES): Promise<Taken> {
  if (!env.PHOTOS) return { ok: false, status: 503, message: 'Les photos ne sont pas branchées.' }
  const declared = Number(request.headers.get('content-length') ?? 0)
  const tooBig = { ok: false as const, status: 413 as const, message: max < MAX_PHOTO_BYTES ? 'Photo trop lourde (400 Ko au plus).' : 'Photo trop lourde (3 Mo au plus).' }
  if (declared > max) return tooBig
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length === 0) return { ok: false, status: 400, message: 'Photo vide.' }
  if (bytes.length > max) return tooBig
  const type = sniffImage(bytes)
  if (!type) return { ok: false, status: 400, message: 'Seulement des photos JPEG, PNG ou WebP.' }
  return { ok: true, bytes, type }
}

// The host's cover picture: one per rencontre, replacing the last (whose blob is freed).
export async function storeCover(env: Env, request: Request, encounterId: string, now: number): Promise<{ ok: true; id: string; key: string } | Exclude<StoreResult, { ok: true }>> {
  const img = await takeImage(env, request)
  if (!img.ok) return img
  const id = newId()
  const key = `covers/${encounterId}/${id}`
  await env.PHOTOS!.put(key, img.bytes, { httpMetadata: { contentType: img.type } })
  const old = await env.DB.prepare('SELECT cover_key FROM encounters WHERE id = ?').bind(encounterId).first<{ cover_key: string | null }>()
  try {
    await env.DB.prepare('UPDATE encounters SET cover_key = ?, updated_at = ? WHERE id = ?').bind(key, now, encounterId).run()
  } catch (err) {
    await env.PHOTOS!.delete(key).catch(() => {})
    throw err
  }
  if (old?.cover_key) await env.PHOTOS!.delete(old.cover_key).catch(() => {})
  return { ok: true, id, key }
}

// Validate, cap and store one souvenir; the caller has already authorised the person.
export async function storeSouvenir(env: Env, request: Request, encounterId: string, author: { kind: 'host' | 'guest'; label: string }, now: number): Promise<StoreResult> {
  const img = await takeImage(env, request)
  if (!img.ok) return img
  const { bytes, type } = img
  const owner = await env.DB.prepare('SELECT household_id FROM encounters WHERE id = ?').bind(encounterId).first<{ household_id: string }>()
  if (owner && (await roomFor(env, 'photos', owner.household_id)) < 1) return { ok: false, status: 429, message: FULL.photos }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL').bind(encounterId).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_ENCOUNTER) return { ok: false, status: 429, message: 'Déjà douze photos pour cette rencontre.' }
  const id = newId()
  const key = `souvenirs/${encounterId}/${id}`
  await env.PHOTOS!.put(key, bytes, { httpMetadata: { contentType: type } })
  try {
    await env.DB.prepare('INSERT INTO souvenirs (id, encounter_id, media_kind, media_key, author_kind, author_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, encounterId, 'image', key, author.kind, author.label.slice(0, 60), now)
      .run()
  } catch (err) {
    await env.PHOTOS!.delete(key).catch(() => {})
    throw err
  }
  return { ok: true, id }
}

// Serve one stored photo (after the caller authorised the person).
export async function serveSouvenir(env: Env, key: string): Promise<Response> {
  if (!env.PHOTOS) return new Response('Not found', { status: 404 })
  const obj = await env.PHOTOS.get(key)
  if (!obj) return new Response('Not found', { status: 404 })
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      // The id in the URL never changes its bytes, but the AUTHORISATION can end — so
      // private, and short.
      'cache-control': 'private, max-age=600',
      'x-content-type-options': 'nosniff',
    },
  })
}

// A face: stored under the household, the old one's blob freed. The caller has authorised the person and
// says which row (child or parent) carries the key.
export async function storeAvatar(env: Env, request: Request, householdId: string, oldKey: string | null, saveKey: (key: string) => Promise<void>): Promise<{ ok: true; id: string } | Exclude<StoreResult, { ok: true }>> {
  const img = await takeImage(env, request, MAX_AVATAR_BYTES)
  if (!img.ok) return img
  const id = newId()
  const key = `avatars/${householdId}/${id}`
  await env.PHOTOS!.put(key, img.bytes, { httpMetadata: { contentType: img.type } })
  try {
    await saveKey(key)
  } catch (err) {
    await env.PHOTOS!.delete(key).catch(() => {})
    throw err
  }
  if (oldKey) await env.PHOTOS!.delete(oldKey).catch(() => {})
  return { ok: true, id }
}
