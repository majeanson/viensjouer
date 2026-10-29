// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from '../../_lib/testDb'
import { onRequestGet } from './[token]'

// A reply link whose rencontre the host removed answers 410 with the host's first name (so the page can say who to
// ask); a code that never existed stays a plain 404.
function seed() {
  const { db, env } = realDb()
  db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
  db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('a@b.c', 'h1', 'Marie Tremblay', 'x', 1)`)
  db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at, deleted_at) VALUES ('e1', 'h1', 'c1', 'park', 't', 5000000000, 1, 1, 9)`)
  db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, created_at, updated_at) VALUES ('f1', 'h1', 'P', 'Léa', 1, 1)`)
  db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('i1', 'e1', 'f1', 'abcd2345', 1, 1)`)
  return env
}
const get = (env: ReturnType<typeof seed>, token: string) =>
  onRequestGet({ env, request: new Request('https://x.test/api/r/' + token), params: { token } } as never) as Promise<Response>

describe('GET /api/r/<token> on a removed rencontre', () => {
  it('says 410 with the host’s first name', async () => {
    const res = await get(seed(), 'abcd2345')
    expect(res.status).toBe(410)
    expect(((await res.json()) as { error: string }).error).toBe('Marie')
  })
  it('keeps 404 for a code that does not exist', async () => {
    expect((await get(seed(), 'zzzz9999')).status).toBe(404)
  })
})
