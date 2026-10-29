// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from '../../_lib/testDb'
import { onRequestGet } from './[token]'
import { REPLY_CARD_KEYS, REPLY_YOU_KEYS } from '../../../src/lib/replyCard'

// The page's idea of the card (src/lib/replyCard.ts) against what the Worker really sends, on a real database. A field added
// or dropped on one side only fails here, which tsc cannot see (the server builds the answer by hand).
function seed() {
  const r = realDb()
  r.db.exec(`INSERT INTO households (id, name, tz, created_at, updated_at) VALUES ('h1', 'H', 'America/Toronto', 1, 1)`)
  r.db.exec(`INSERT INTO parents (email, household_id, display_name, password_hash, created_at) VALUES ('a@b.c', 'h1', 'Marie', 'x', 1)`)
  r.db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1)`)
  r.db.exec(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, email, created_at, updated_at) VALUES ('f1', 'h1', 'Julie', 'Léa', 'j@x.org', 1, 1)`)
  r.db.exec(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, created_at, updated_at) VALUES ('e1', 'h1', 'c1', 'park', 'Au parc', 5000000000, 1, 1)`)
  r.db.exec(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES ('i1', 'e1', 'f1', 'abcd2345', 1, 1)`)
  return r
}

describe('GET /api/r/<code>', () => {
  it('sends exactly the fields the page declares, and exactly the “you” fields', async () => {
    const res = (await onRequestGet({ env: seed().env, request: new Request('https://x.test/api/r/abcd2345'), params: { token: 'abcd2345' } } as never)) as Response
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown> & { you: Record<string, unknown> }
    expect(Object.keys(body).sort()).toEqual(Object.keys(REPLY_CARD_KEYS).sort())
    expect(Object.keys(body.you).sort()).toEqual(Object.keys(REPLY_YOU_KEYS).sort())
  })
})
