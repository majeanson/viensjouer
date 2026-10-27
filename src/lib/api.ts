// The ONLY path to /api/*: attaches the CSRF echo, credentials and the locale. Calling
// fetch directly loses one of these and gets a silent 403.
import { readLang } from '../i18n'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const isStatus = (e: unknown, status: number): boolean => e instanceof ApiError && e.status === status

function readCsrfCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)vj_csrf=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// A Blob body (a photo) goes up raw with its own type; everything else is JSON.
type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }

const TIMEOUT_MS = 20_000
const UPLOAD_TIMEOUT_MS = 60_000

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { 'X-Lang': readLang() }
  const isBlob = opts.body instanceof Blob
  if (opts.body !== undefined) headers['content-type'] = isBlob ? (opts.body as Blob).type || 'application/octet-stream' : 'application/json'
  if (method !== 'GET') {
    const csrf = readCsrfCookie()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body === undefined ? undefined : isBlob ? (opts.body as Blob) : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(isBlob ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS),
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) message = j.error
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}
