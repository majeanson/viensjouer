// Security headers on every response. The SPA loads nothing cross-origin (fonts are the system's,
// every picture is served by our own /api), so the policy is tight and the privacy page can say « no other third party ». `script-src` keeps 'unsafe-inline' because
// Cloudflare's edge injects inline scripts (its RUM beacon) into the shell — a strict
// policy would break the door intermittently, in production only (Babillard learned this
// over a week of report-only logs; no need to learn it twice).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ')

export const ENFORCED: ReadonlyArray<readonly [name: string, value: string]> = [
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy', CSP],
  // Private by design (privacy page: « rien n’est public, rien ne se cherche »): no indexing.
  ['X-Robots-Tag', 'noindex, nofollow'],
]

// Cloudflare serves a static file that matches the request WITHOUT the Worker, so `/`
// needs this second delivery path. Built from the SAME list; vite.config.ts emits it.
export function headersFileSource(): string {
  return ['# Generated from functions/_lib/securityHeaders.ts — do not edit.', '/*', ...ENFORCED.map(([n, v]) => `  ${n}: ${v}`), ''].join('\n')
}

export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [name, value] of ENFORCED) headers.set(name, value)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
