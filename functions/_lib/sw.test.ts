// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// public/sw.js run against a stand-in for the worker's global scope: what a push shows, what a tap opens. (A real phone is
// still the last word; this holds the logic.)
const src = readFileSync('public/sw.js', 'utf8')

type Listener = (e: unknown) => void
function boot(opts: { fetchImpl: (u: string, i?: unknown) => Promise<{ ok: boolean; json: () => Promise<unknown> }>; windows?: { focus: () => Promise<void>; navigate?: (u: string) => Promise<void> }[]; language?: string }) {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; opts: { body: string; tag: string; data: { url: string } } }[] = []
  const opened: string[] = []
  const self = {
    addEventListener: (t: string, l: Listener) => (listeners[t] = l),
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => opts.windows ?? [], openWindow: async (u: string) => void opened.push(u) },
    registration: { showNotification: async (title: string, o: never) => void shown.push({ title, opts: o }) },
    navigator: { language: opts.language ?? 'fr-CA' },
  }
  new Function('self', 'fetch', src)(self, opts.fetchImpl)
  const run = async (type: string, event: Record<string, unknown>) => {
    let p: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...event, waitUntil: (x: Promise<unknown>) => (p = x) })
    await p
  }
  return { run, shown, opened }
}
const reply = (items: unknown[]) => async () => ({ ok: true, json: async () => ({ notifications: items }) })

describe('push', () => {
  it('asks the server what is new, with the person’s own session, and shows each item once under its own tag', async () => {
    let asked = ''
    let creds: unknown
    const w = boot({ fetchImpl: async (u, i) => ((asked = u), (creds = (i as { credentials?: string }).credentials), reply([{ id: 'n1', title: 'Marc t’invite', body: 'Au parc', url: '/lune-miel' }, { id: 'n2', title: 'Léa : oui', body: null, url: null }])()) })
    await w.run('push', {})
    expect(asked).toBe('/api/notifications?push=1')
    expect(creds).toBe('same-origin')
    expect(w.shown.map((s) => [s.title, s.opts.tag, s.opts.data.url, s.opts.body])).toEqual([
      ['Marc t’invite', 'n1', '/lune-miel', 'Au parc'],
      ['Léa : oui', 'n2', '/rencontres', ''],
    ])
  })
  it('always shows something (a phone refuses a push that shows nothing): a plain notice in the device’s language', async () => {
    const empty = boot({ fetchImpl: reply([]) })
    await empty.run('push', {})
    expect(empty.shown.map((s) => [s.title, s.opts.body])).toEqual([['Viens jouer', 'Il y a du nouveau.']])
    const offline = boot({ fetchImpl: async () => { throw new Error('offline') }, language: 'en-CA' })
    await offline.run('push', {})
    expect(offline.shown.map((s) => s.opts.body)).toEqual(['There is news.'])
    const signedOut = boot({ fetchImpl: async () => ({ ok: false, json: async () => ({}) }) })
    await signedOut.run('push', {})
    expect(signedOut.shown).toHaveLength(1)
  })
})

describe('tapping a notification', () => {
  const click = (w: ReturnType<typeof boot>, url?: string) => {
    let closed = false
    return w.run('notificationclick', { notification: { close: () => (closed = true), data: url ? { url } : null } }).then(() => closed)
  }
  it('opens the page it names in a window that is already open, or in a new one', async () => {
    const nav: string[] = []
    let focused = 0
    const open = boot({ fetchImpl: reply([]), windows: [{ focus: async () => void focused++, navigate: async (u: string) => void nav.push(u) }] })
    expect(await click(open, '/rencontres/e1')).toBe(true)
    expect(nav).toEqual(['/rencontres/e1'])
    expect(focused).toBe(1)
    const none = boot({ fetchImpl: reply([]) })
    await click(none, '/lune-miel')
    expect(none.opened).toEqual(['/lune-miel'])
    const noData = boot({ fetchImpl: reply([]) })
    await click(noData)
    expect(noData.opened).toEqual(['/rencontres'])
  })
})
