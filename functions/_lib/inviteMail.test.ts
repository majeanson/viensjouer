// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { realDb } from './testDb'
import { sendEncounterInvitations } from './inviteMail'

afterEach(() => vi.unstubAllGlobals())

function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1), ('h2', 'Other', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  const fam = (id: string, email: string | null, extra = '') =>
    r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at${extra ? ', ' + extra.split('=')[0] : ''}) VALUES ('${id}', 'h1', 'P${id}', 'K${id}', ${email ? `'${email}'` : 'NULL'}, 1, 1${extra ? ', ' + extra.split('=')[1] : ''})`)
  fam('ok', 'ok@x.org')
  fam('none', null)
  fam('stopped', 'stopped@x.org', 'mail_stopped_at=5')
  fam('bounced', 'bounced@x.org', 'email_bounced_at=5')
  fam('told', 'told@x.org')
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 'Au parc', 5000000000, 1, 1)`)
  const inv = (id: string, f: string, sent: number | null = null) => r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, sent_at, created_at, updated_at) VALUES ('i-${id}', 'e1', '${f}', 'tok${id}2345', ${sent ?? 'NULL'}, 1, 1)`)
  inv('ok', 'ok')
  inv('none', 'none')
  inv('stopped', 'stopped')
  inv('bounced', 'bounced')
  inv('told', 'told', 7)
  return r
}
const HOST = { householdId: 'h1', displayName: 'Marc', email: 'marc@x.org' }
const request = new Request('https://x.test/api/encounters', { method: 'POST' })

describe('sendEncounterInvitations (« envoyer tout de suite »)', () => {
  it('emails only the family that has an address, was not told, did not stop and did not bounce', async () => {
    const r = seed()
    const sent: { to: string[]; from: string; reply_to: string[]; headers: Record<string, string>; text: string }[] = []
    vi.stubGlobal('fetch', async (_u: string, init: { body: string }) => (sent.push(JSON.parse(init.body)), new Response('{"id":"x"}')))
    const env = { ...r.env, RESEND_API_KEY: 'k', MAIL_FROM: 'Viens jouer <noreply@x.test>' } as typeof r.env
    expect(await sendEncounterInvitations(env, request, HOST, 'e1')).toEqual({ sent: 1, skipped: 0 })
    expect(sent.map((m) => m.to[0])).toEqual(['ok@x.org'])
    expect(sent[0].from).toBe('Marc via Viens jouer <noreply@x.test>')
    expect(sent[0].reply_to).toEqual(['marc@x.org'])
    expect(sent[0].headers['List-Unsubscribe']).toContain('/api/r/tokok2345/stop-mail')
    expect(sent[0].text).toContain('/stop/')
    expect((r.db.prepare("SELECT sent_at FROM invitations WHERE id = 'i-ok'").get() as { sent_at: number | null }).sent_at).not.toBeNull()
    expect((r.db.prepare("SELECT COUNT(*) AS n FROM mail_sends WHERE household_id = 'h1'").get() as { n: number }).n).toBe(1)
    // a second call (a double tap, a retry) tells nobody again
    expect(await sendEncounterInvitations(env, request, HOST, 'e1')).toEqual({ sent: 0, skipped: 0 })
    expect(sent).toHaveLength(1)
  })
  it('gives the slot back when the send fails, so the page’s « Envoyer » still works', async () => {
    const r = seed()
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 500 }))
    const env = { ...r.env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof r.env
    expect(await sendEncounterInvitations(env, request, HOST, 'e1')).toEqual({ sent: 0, skipped: 0 })
    expect((r.db.prepare("SELECT sent_at FROM invitations WHERE id = 'i-ok'").get() as { sent_at: number | null }).sent_at).toBeNull()
  })
  it('never sends for another household’s rencontre, and nothing when mail is not wired', async () => {
    const r = seed()
    vi.stubGlobal('fetch', async () => new Response('{"id":"x"}'))
    const env = { ...r.env, RESEND_API_KEY: 'k', MAIL_FROM: 'a@b.c' } as typeof r.env
    expect(await sendEncounterInvitations(env, request, { ...HOST, householdId: 'h2' }, 'e1')).toEqual({ sent: 0, skipped: 0 })
    expect(await sendEncounterInvitations(r.env, request, HOST, 'e1')).toEqual({ sent: 0, skipped: 0 })
  })
})
