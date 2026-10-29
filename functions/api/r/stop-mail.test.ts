// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from '../../_lib/testDb'
import { onRequestGet, onRequestPost } from './stop-mail'
import { withUnsubscribe, invitationMail } from '../../_lib/mailCopy'

function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('f1', 'h1', 'Julie', 'Léa', 'j@x.org', 1, 1), ('f2', 'h1', 'Paul', 'Max', 'p@x.org', 1, 1)`)
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 't', 5000000000, 1, 1)`)
  r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('i1', 'e1', 'f1', 'abcd2345', 1, 1)`)
  r.db.exec(`INSERT INTO open_windows (id, household_id, child_id, starts_at, ends_at, created_at) VALUES ('w1', 'h1', 'c1', 1, 2, 1)`)
  r.db.exec(`INSERT INTO window_targets (id, window_id, friend_family_id, token, created_at) VALUES ('t1', 'w1', 'f2', 'wxyz2345', 1)`)
  return r
}
const call = (fn: typeof onRequestGet, env: ReturnType<typeof seed>['env'], token: string, init?: RequestInit) =>
  fn({ env, request: new Request(`https://x.test/api/r/${token}/stop-mail`, init), params: { token } } as never) as Promise<Response>
const stopped = (r: ReturnType<typeof seed>) => (r.db.prepare('SELECT id FROM friend_families WHERE mail_stopped_at IS NOT NULL ORDER BY id').all() as { id: string }[]).map((x) => x.id)

describe('/api/r/<code>/stop-mail', () => {
  it('stops one family by an invitation code, reads the state, and takes it back', async () => {
    const r = seed()
    expect(((await (await call(onRequestGet, r.env, 'abcd2345')).json()) as { stopped: boolean }).stopped).toBe(false)
    const post = (stop?: boolean) => call(onRequestPost, r.env, 'abcd2345', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(stop === undefined ? {} : { stop }) })
    expect((await post()).status).toBe(200)
    expect(stopped(r)).toEqual(['f1'])
    expect(((await (await call(onRequestGet, r.env, 'abcd2345')).json()) as { stopped: boolean }).stopped).toBe(true)
    await post(false)
    expect(stopped(r)).toEqual([])
  })
  it('also works from a window code, and from the mail app’s one-click POST (a form body, not JSON)', async () => {
    const r = seed()
    const res = await call(onRequestPost, r.env, 'wxyz2345', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })
    expect(res.status).toBe(200)
    expect(stopped(r)).toEqual(['f2'])
  })
  it('404s a code that does not exist and changes nothing', async () => {
    const r = seed()
    expect((await call(onRequestPost, r.env, 'zzzz9999', { method: 'POST' })).status).toBe(404)
    expect(stopped(r)).toEqual([])
  })
})

describe('withUnsubscribe', () => {
  it('adds the link, in the reader’s language, and the one-click headers', () => {
    const base = invitationMail('fr', { parent: 'Julie', host: 'Marc', hostChild: 'Noé', child: 'Léa', title: 'Parc', when: 'samedi', friendOnly: false, link: 'https://x.test/abcd-2345' })
    const m = withUnsubscribe('fr', 'https://x.test', 'abcd2345', base)
    expect(m.text).toContain('https://x.test/stop/abcd-2345')
    expect(m.html).toContain('href="https://x.test/stop/abcd-2345"')
    expect(m.headers['List-Unsubscribe']).toBe('<https://x.test/api/r/abcd2345/stop-mail>')
    expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(withUnsubscribe('en', 'https://x.test', 'abcd2345', base).text).toContain('No longer want email')
  })
})
