import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from './env'
import { ANSWER_DEBOUNCE_SEC, notifyHostOfAnswer, type Answered } from './answerNotice'
import { MAIL_DAILY_CAP } from './mailBudget'

// A small stand-in for D1 that keeps just what this feature touches: the hosts who opted in, the invitation's
// last-notified stamp, and the household's mail ledger.
function world(opts: { hosts: { email: string; display_name: string; lang: string | null }[]; used?: number }) {
  const state = { stamp: null as number | null, ledger: opts.used ?? 0, mails: [] as { to: string; subject: string; text: string }[] }
  const prepare = (sql: string) => ({
    bind: (...b: unknown[]) => ({
      all: async () => ({ results: /FROM parents/.test(sql) ? opts.hosts : [] }),
      first: async () => (/COUNT\(\*\)/.test(sql) ? { n: state.ledger } : null),
      run: async () => {
        if (/UPDATE invitations SET host_notified_at/.test(sql)) {
          const [now, , before] = b as [number, string, number]
          if (state.stamp === null || state.stamp < before) { state.stamp = now; return { meta: { changes: 1 } } }
          return { meta: { changes: 0 } }
        }
        return { meta: { changes: 0 } }
      },
      _sql: sql,
      _b: b,
    }),
  })
  const DB = {
    prepare,
    batch: async (stmts: { _sql: string }[]) => { for (const s of stmts) if (/INSERT INTO mail_sends/.test(s._sql)) state.ledger++; return [] },
  }
  const env = { DB, RESEND_API_KEY: 'k', MAIL_FROM: 'Viens jouer <j@x.test>' } as unknown as Env
  vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => {
    const m = JSON.parse(init.body) as { to: string[]; subject: string; text: string }
    state.mails.push({ to: m.to[0], subject: m.subject, text: m.text })
    return new Response(JSON.stringify({ id: 'm' }), { status: 200 })
  })
  return { env, state }
}

const answered: Answered = { householdId: 'h1', invitationId: 'i1', encounterId: 'e1', title: 'Au parc', startsAt: 1_800_000_000, tz: 'America/Toronto', reply: 'yes', guestParent: 'Julie', guestChild: 'Léa' }
const marc = { email: 'marc@example.com', display_name: 'Marc', lang: 'fr' }

afterEach(() => vi.unstubAllGlobals())

describe('telling the host a family answered', () => {
  it('mails each parent who asked, once, in their own language', async () => {
    const { env, state } = world({ hosts: [marc, { email: 'ana@example.com', display_name: 'Ana', lang: 'en' }] })
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', answered)).toBe(2)
    expect(state.mails.map((m) => m.to)).toEqual(['marc@example.com', 'ana@example.com'])
    expect(state.mails[0].subject).toBe('Léa : oui (Au parc)')
    expect(state.mails[1].subject).toBe('Léa: yes (Au parc)')
    expect(state.mails[1].text).toContain('answered “yes” for Léa')
    expect(state.mails[0].text).toContain('https://jouer.test/rencontres/e1')
    expect(state.ledger).toBe(2)
  })
  it('does nothing when no one asked', async () => {
    const { env, state } = world({ hosts: [] })
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', answered)).toBe(0)
    expect(state.mails).toEqual([])
  })
  it('does not mail the host again for the same invitation inside the debounce window', async () => {
    const { env, state } = world({ hosts: [marc] })
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', answered)).toBe(1)
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', { ...answered, reply: 'no' })).toBe(0)
    expect(state.mails).toHaveLength(1)
    expect(ANSWER_DEBOUNCE_SEC).toBe(600)
  })
  it('stops at the household’s daily mail budget', async () => {
    const { env, state } = world({ hosts: [marc], used: MAIL_DAILY_CAP })
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', answered)).toBe(0)
    expect(state.mails).toEqual([])
  })
  it('never mails a sandbox household', async () => {
    const { env, state } = world({ hosts: [{ email: 'demo-abc@viensjouer.invalid', display_name: 'Camille', lang: null }] })
    expect(await notifyHostOfAnswer(env, 'https://jouer.test', answered)).toBe(0)
    expect(state.mails).toEqual([])
  })
  it('does nothing without mail wired, and never throws', async () => {
    const { env } = world({ hosts: [marc] })
    expect(await notifyHostOfAnswer({ ...env, RESEND_API_KEY: undefined } as unknown as Env, 'https://jouer.test', answered)).toBe(0)
  })
})
