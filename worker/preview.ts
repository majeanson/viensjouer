// The link preview: what a messaging app shows when an invitation link is texted. Without this every link
// says « Viens jouer » with the default picture; with it the card says « Noé invite Léa », when and where, and
// shows the cover picture. It is exactly what the person holding the link already sees on the page (never the
// address, never who else is coming), and it goes through the same door as the page itself: the per-address
// rate limit and the wrong-guess lockout, so a crawler cannot be used to guess codes.
import type { Env } from '../functions/_lib/env'
import { lockedOut, recordMiss } from '../functions/_lib/guessLimit'
import { overAuthLimit } from '../functions/_lib/rateLimit'
import { coverId } from '../functions/_lib/encounters'
import { normalizeLinkCode, paperCode, whenLong } from '../functions/_lib/ids'

// `/lune-miel` or `/r/lune-miel`: the two shapes of an invitation link.
const CODE_PATH = /^(?:r\/)?([a-z]{3,7}-[a-z]{3,7}|[a-z0-9]{4}-?[a-z0-9]{4})$/i

interface Row {
  title: string
  starts_at: number
  ends_at: number | null
  status: string
  place: string | null
  cover_key: string | null
  host_child: string
  you_child: string
  tz: string
}

export async function previewFor(request: Request, env: Env, path: string): Promise<{ title: string; description: string; image: string; url: string } | null> {
  const m = CODE_PATH.exec(path.replace(/\/+$/, ''))
  if (!m || request.method !== 'GET') return null
  if (!(request.headers.get('accept') ?? '').includes('text/html')) return null
  if ((await overAuthLimit(env, request)) || (await lockedOut(env, request))) return null
  const code = normalizeLinkCode(m[1])
  if (!code) return null
  const row = await env.DB.prepare(
    `SELECT e.title, e.starts_at, e.ends_at, e.status, e.place, e.cover_key, c.first_name AS host_child, f.child_first_name AS you_child, h.tz
       FROM invitations i
       JOIN encounters e ON e.id = i.encounter_id
       JOIN children c ON c.id = e.child_id
       JOIN friend_families f ON f.id = i.friend_family_id
       JOIN households h ON h.id = e.household_id
      WHERE i.token = ? AND e.deleted_at IS NULL`,
  )
    .bind(code)
    .first<Row>()
  if (!row) {
    await recordMiss(env, request)
    return null
  }
  // A cancelled or long-past invitation shows the plain card: no title to advertise.
  const now = Math.floor(Date.now() / 1000)
  if (row.status === 'cancelled' || (row.ends_at ?? row.starts_at) + 86_400 < now) return null
  const origin = new URL(request.url).origin
  const english = /^en/i.test(request.headers.get('accept-language') ?? '')
  const lang = english ? 'en' : 'fr'
  const when = whenLong(row.starts_at, lang, row.tz)
  const title = english ? `${row.host_child} invites ${row.you_child}` : `${row.host_child} invite ${row.you_child}`
  const tail = english ? 'Answer with one tap, no account.' : 'Réponds d’un toucher, sans compte.'
  const description = [row.title, when, row.place].filter(Boolean).join(' · ') + `. ${tail}`
  const cover = coverId(row.cover_key)
  return {
    title,
    description,
    image: cover ? `${origin}/api/r/${paperCode(code)}/cover?v=${cover}` : `${origin}/og-image.png`,
    url: `${origin}/${paperCode(code)}`,
  }
}

// Rewrite the shell's head with the preview. Text is set as text (never as HTML), so a title cannot inject markup.
export function withPreview(res: Response, p: { title: string; description: string; image: string; url: string }): Response {
  const set = (value: string) => ({
    element(el: Element) {
      el.setAttribute('content', value)
    },
  })
  const rewritten = new HTMLRewriter()
    .on('title', { element: (el) => void el.setInnerContent(`${p.title} · Viens jouer`) })
    .on('meta[property="og:title"]', set(p.title))
    .on('meta[property="og:description"]', set(p.description))
    .on('meta[name="description"]', set(p.description))
    .on('meta[property="og:image"]', set(p.image))
    .on('meta[name="twitter:image"]', set(p.image))
    .on('meta[property="og:url"]', set(p.url))
    .transform(res)
  const headers = new Headers(rewritten.headers)
  // This card is about one invitation: never shared from a cache.
  headers.set('cache-control', 'no-store')
  return new Response(rewritten.body, { status: rewritten.status, headers })
}
