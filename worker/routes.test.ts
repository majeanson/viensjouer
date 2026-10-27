import { describe, it, expect } from 'vitest'
import { csrfExempt, matchRoute } from './routes'

describe('matchRoute', () => {
  it('captures the token and prefers the longer pattern', () => {
    expect(matchRoute('r/abc123/ics')?.params).toEqual({ token: 'abc123' })
    expect(matchRoute('r/abc123')?.params).toEqual({ token: 'abc123' })
    expect(matchRoute('r/abc123')?.mod).not.toBe(matchRoute('r/abc123/ics')?.mod)
  })
  it('misses what is not in the table', () => {
    expect(matchRoute('nope')).toBeNull()
    expect(matchRoute('children/extra')).toBeNull()
  })
})

describe('csrfExempt', () => {
  it('exempts exactly the doors that have no session', () => {
    expect(csrfExempt('auth/login')).toBe(true)
    expect(csrfExempt('auth/signup')).toBe(true)
    expect(csrfExempt('r/abc')).toBe(true)
    expect(csrfExempt('demo')).toBe(true)
    expect(csrfExempt('join')).toBe(true)
    expect(csrfExempt('parent-invite')).toBe(false)
    expect(csrfExempt('auth/logout')).toBe(false)
    expect(csrfExempt('encounters')).toBe(false)
    expect(csrfExempt('invitations')).toBe(false)
  })
})
