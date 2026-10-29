// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { realDb } from './testDb'
import { lastGuestIds } from './lastGuests'

const NOW = 2_000_000_000

function seed(db: ReturnType<typeof realDb>['db']) {
  db.exec(`INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'H', 1, 1), ('h2', 'Other', 1, 1)`)
  db.exec(`INSERT INTO children (id, household_id, first_name, created_at, updated_at) VALUES ('c1', 'h1', 'Noé', 1, 1), ('c2', 'h1', 'Zoé', 1, 1)`)
  const fam = (id: string, kid: string, del: number | null, hh = 'h1') =>
    db.prepare(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, created_at, updated_at, deleted_at) VALUES (?, ?, 'P', ?, 1, 1, ?)`).run(id, hh, kid, del)
  fam('fa', 'Anna', null)
  fam('fb', 'Boris', null)
  fam('fc', 'Cléo', 999) // removed since
  fam('fz', 'Zed', null)
  const enc = (id: string, child: string, starts: number, status = 'confirmed', del: number | null = null) =>
    db.prepare(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, status, created_at, updated_at, deleted_at) VALUES (?, 'h1', ?, 'park', 't', ?, ?, 1, 1, ?)`).run(id, child, starts, status, del)
  enc('e-old', 'c1', NOW - 90_000)
  enc('e-last', 'c1', NOW - 10_000)
  enc('e-cancelled', 'c1', NOW - 5_000, 'cancelled')
  enc('e-deleted', 'c1', NOW - 4_000, 'confirmed', 5)
  enc('e-future', 'c1', NOW + 10_000)
  enc('e-other-child', 'c2', NOW - 1_000)
  const inv = (id: string, e: string, fam: string) => db.prepare(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)`).run(id, e, fam, `t-${id}`)
  inv('i1', 'e-old', 'fz')
  inv('i2', 'e-last', 'fb')
  inv('i3', 'e-last', 'fa')
  inv('i4', 'e-last', 'fc')
  inv('i5', 'e-cancelled', 'fz')
  inv('i6', 'e-deleted', 'fz')
  inv('i7', 'e-future', 'fz')
  inv('i8', 'e-other-child', 'fz')
}

describe('lastGuestIds', () => {
  it('is the families of the child’s latest past, live, non-cancelled rencontre, minus removed families, by name', async () => {
    const { db, env } = realDb()
    seed(db)
    expect(await lastGuestIds(env, 'h1', 'c1', NOW)).toEqual(['fa', 'fb'])
    expect(await lastGuestIds(env, 'h1', 'c2', NOW)).toEqual(['fz'])
  })
  it('is empty with no past rencontre, and never reaches another household', async () => {
    const { db, env } = realDb()
    seed(db)
    expect(await lastGuestIds(env, 'h1', 'c1', 1)).toEqual([])
    expect(await lastGuestIds(env, 'h2', 'c1', NOW)).toEqual([])
  })
})
