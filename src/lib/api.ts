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

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown }

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  const headers: Record<string, string> = { 'X-Lang': readLang() }
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET') {
    const csrf = readCsrfCookie()
    if (csrf) headers['X-CSRF-Token'] = csrf
  }
  const res = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
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
