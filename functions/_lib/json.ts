// Response helpers so status codes stay consistent across handlers.
//
// `no-store` is load-bearing: every body here is per-household data behind a cookie or
// a capability link, and a cached frame could show a rencontre someone cancelled.
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function body(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

export const ok = (data: unknown = { ok: true }) => body(data, 200)
export const created = (data: unknown) => body(data, 201)
export const badRequest = (message: string) => body({ error: message }, 400)
export const unauthorized = (message = 'Pas connecté.') => body({ error: message }, 401)
export const forbidden = (message = 'Interdit.') => body({ error: message }, 403)
export const notFound = (message = 'Introuvable.') => body({ error: message }, 404)
export const gone = (message: string) => body({ error: message }, 410)
export const conflict = (message: string) => body({ error: message }, 409)
export const tooManyRequests = (message = 'Trop d’essais. Réessaie dans une minute.') =>
  new Response(JSON.stringify({ error: message }), { status: 429, headers: { ...JSON_HEADERS, 'retry-after': '60' } })
export const serviceUnavailable = (message: string) => body({ error: message }, 503)
export const serverError = (message = 'Quelque chose a cassé.') => body({ error: message }, 500)

// Parse a JSON body; null on anything malformed so the handler answers a clean 400.
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

// A trimmed string field, capped, or null when absent/blank. Every text column goes
// through this so a 2 MB "note" never reaches D1.
export function str(v: unknown, cap: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, cap)
  return s.length ? s : null
}

// What every account-creating door says when the email is already taken. It never confirms that an account exists:
// the person is pointed at both ways out (sign in, or reset the password) and the doors that can tell by
// the password (signup) simply sign them in.
export const ACCOUNT_UNAVAILABLE = 'Impossible de créer un compte avec ce courriel. Si tu en as déjà un, connecte-toi ou réinitialise ton mot de passe.'
