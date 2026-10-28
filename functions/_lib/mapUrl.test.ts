import { describe, it, expect } from 'vitest'
import { cleanMapUrl } from './encounters'

describe('cleanMapUrl', () => {
  it('keeps a real https map link and adds https to a bare one', () => {
    expect(cleanMapUrl('https://maps.app.goo.gl/abc123')).toBe('https://maps.app.goo.gl/abc123')
    expect(cleanMapUrl('  maps.app.goo.gl/abc123 ')).toBe('https://maps.app.goo.gl/abc123')
    expect(cleanMapUrl('https://www.google.com/maps/place/Parc+Lafontaine/@45.5,-73.5,17z')).toMatch(/^https:\/\/www\.google\.com\/maps/)
  })
  it('refuses anything that is not a plain https link', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'http://maps.example.com/x', 'ftp://x.com/a', 'https://user:pw@x.com/a', 'une adresse avec des espaces', 'localhost', '', '   ', 'https://' + 'a'.repeat(300) + '.com']) {
      expect(cleanMapUrl(bad), bad).toBeNull()
    }
    expect(cleanMapUrl(42)).toBeNull()
    expect(cleanMapUrl(null)).toBeNull()
  })
})
