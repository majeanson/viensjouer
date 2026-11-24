// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { verifyCsrf } from './auth'

// Double-submit: the cookie and the echoed header must match. The compare is now
// constant-time (safeEqual), so this pins the behaviour the === used to give.
const req = (cookie: string | null, header: string | null): Request =>
  new Request('https://x.test/api/anything', {
    method: 'POST',
    headers: {
      ...(cookie !== null ? { Cookie: `vj_csrf=${cookie}` } : {}),
      ...(header !== null ? { 'X-CSRF-Token': header } : {}),
    },
  })

describe('verifyCsrf', () => {
  it('passes only when the cookie and the header are the same token', () => {
    expect(verifyCsrf(req('abc123', 'abc123'))).toBe(true)
    expect(verifyCsrf(req('abc123', 'abc124'))).toBe(false)
  })
  it('fails when either side is missing or empty', () => {
    expect(verifyCsrf(req(null, 'abc123'))).toBe(false)
    expect(verifyCsrf(req('abc123', null))).toBe(false)
    expect(verifyCsrf(req('', ''))).toBe(false)
  })
  it('rejects a differing length without leaking it (constant-time compare returns false)', () => {
    expect(verifyCsrf(req('abc', 'abcd'))).toBe(false)
    expect(verifyCsrf(req('abcd', 'abc'))).toBe(false)
  })
})
