import { describe, expect, it } from 'vitest'
import { ENFORCED, headersFileSource, withSecurityHeaders } from './securityHeaders'

// The headers reach a response by two paths (the Worker, and the generated `_headers` file for the static shell
// that Cloudflare serves without the Worker). Both are built from ENFORCED; this pins what is in it.
const csp = ENFORCED.find(([n]) => n === 'Content-Security-Policy')![1]
const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `)) ?? ''

describe('security headers', () => {
  it('sends every enforced header on a Worker response', () => {
    const res = withSecurityHeaders(new Response('x'))
    for (const [name, value] of ENFORCED) expect(res.headers.get(name), name).toBe(value)
    expect(res.headers.get('Strict-Transport-Security')).toMatch(/max-age=\d{7,}/)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('writes the same list into the static _headers file', () => {
    const file = headersFileSource()
    for (const [name, value] of ENFORCED) expect(file).toContain(`  ${name}: ${value}`)
  })

  it('allows no third party the app does not use (the privacy page promises none)', () => {
    expect(csp).not.toMatch(/googleapis|gstatic/)
    // The one allowed addition: Cloudflare's Turnstile bot check (signup, forgot-password), named on the privacy page.
    expect(directive('frame-src')).toBe('frame-src https://challenges.cloudflare.com')
    expect(directive('script-src')).toContain('https://challenges.cloudflare.com')
    expect(directive('img-src')).not.toMatch(/https:/)
    expect(directive('connect-src')).toBe("connect-src 'self'")
    expect(directive('default-src')).toBe("default-src 'self'")
  })

  it('cannot be framed, nor smuggle a base or a form target', () => {
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'self'")
    expect(directive('object-src')).toBe("object-src 'none'")
    expect(directive('base-uri')).toBe("base-uri 'self'")
    expect(directive('form-action')).toBe("form-action 'self'")
  })
})
