// Souvenir photos in R2 — OPTIONAL like mail: PHOTOS unset → the photo doors answer 503 and
// the UI hides them. The browser already resized to ≤ 1600 px JPEG, so the server's job is
// the cap, the type check and the key shape.
import type { Env } from './env'
import { newId } from './ids'

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024
export const MAX_PHOTOS_PER_ENCOUNTER = 12

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

// Validate, cap and store one souvenir; the caller has already authorised the person.
export async function storeSouvenir(env: Env, request: Request, encounterId: string, author: { kind: 'host' | 'guest'; label: string }, now: number): Promise<StoreResult> {
  if (!env.PHOTOS) return { ok: false, status: 503, message: 'Les photos ne sont pas branchées.' }
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_PHOTO_BYTES) return { ok: false, status: 413, message: 'Photo trop lourde (3 Mo au plus).' }
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length === 0) return { ok: false, status: 400, message: 'Photo vide.' }
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, status: 413, message: 'Photo trop lourde (3 Mo au plus).' }
  const type = sniffImage(bytes)
  if (!type) return { ok: false, status: 400, message: 'Seulement des photos JPEG, PNG ou WebP.' }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM souvenirs WHERE encounter_id = ? AND deleted_at IS NULL').bind(encounterId).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_ENCOUNTER) return { ok: false, status: 429, message: 'Déjà douze photos pour cette rencontre.' }
  const id = newId()
  const key = `souvenirs/${encounterId}/${id}`
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } })
  try {
    await env.DB.prepare('INSERT INTO souvenirs (id, encounter_id, media_kind, media_key, author_kind, author_label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, encounterId, 'image', key, author.kind, author.label.slice(0, 60), now)
      .run()
  } catch (err) {
    await env.PHOTOS.delete(key).catch(() => {})
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
