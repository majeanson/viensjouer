// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { realDb } from './testDb'
import { LINK_RETIRE_SEC, REMOVED_GRACE_SEC, purgeRemoved, retireLinks } from './purge'

const NOW = 2_000_000_000
const OLD = NOW - REMOVED_GRACE_SEC - 10
const RECENT = NOW - 3600
const count = (db: DatabaseSync, table: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n)

function seed(db: DatabaseSync) {
  db.exec(`INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'H', 1, 1)`)
  const child = (id: string, del: number | null, photo: string | null) =>
    db.prepare(`INSERT INTO children (id, household_id, first_name, photo_key, created_at, updated_at, deleted_at) VALUES (?, 'h1', 'X', ?, 1, 1, ?)`).run(id, photo, del)
  child('c-old', OLD, 'face-old')
  child('c-used', OLD, null)
  child('c-recent', RECENT, null)
  const enc = (id: string, child: string, del: number | null, starts: number, cover: string | null) =>
    db.prepare(`INSERT INTO encounters (id, household_id, child_id, kind, title, starts_at, cover_key, created_at, updated_at, deleted_at) VALUES (?, 'h1', ?, 'park', 't', ?, ?, 1, 1, ?)`).run(id, child, starts, cover, del)
  enc('e-gone', 'c-old', OLD, NOW, 'cover-gone')
  enc('e-undo', 'c-recent', RECENT, NOW, null)
  enc('e-live-old', 'c-used', null, NOW - LINK_RETIRE_SEC - 10, null)
  enc('e-live-new', 'c-used', null, NOW, null)
  const inv = (id: string, e: string, fam: string, token: string) =>
    db.prepare(`INSERT INTO invitations (id, encounter_id, friend_family_id, token, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)`).run(id, e, fam, token)
  inv('i-gone', 'e-gone', 'f-old', 'lune-miel')
  inv('i-old', 'e-live-old', 'f-used', 'pain-nuit')
  inv('i-new', 'e-live-new', 'f-used', 'tuque-sel')
  const fam = (id: string, del: number | null) =>
    db.prepare(`INSERT INTO friend_families (id, household_id, parent_name, child_first_name, created_at, updated_at, deleted_at) VALUES (?, 'h1', 'P', 'K', 1, 1, ?)`).run(id, del)
  fam('f-old', OLD)
  fam('f-used', OLD)
  fam('f-free', OLD)
  db.prepare(`INSERT INTO souvenirs (id, encounter_id, media_key, author_kind, author_label, created_at) VALUES ('s1', 'e-gone', 'photo-gone', 'host', 'H', 1)`).run()
}

describe('purgeRemoved', () => {
  it('migrations load (the seed below depends on their columns)', () => {
    const { db } = realDb()
    seed(db)
    expect(count(db, 'encounters')).toBe(4)
  })

  it('deletes what was removed over a month ago, with its blobs, and keeps what is recent or still named', async () => {
    const { db, env, deleted } = realDb()
    seed(db)
    await purgeRemoved(env, NOW)
    const ids = (t: string) => (db.prepare(`SELECT id FROM ${t} ORDER BY id`).all() as { id: string }[]).map((r) => r.id)
    expect(ids('encounters')).toEqual(['e-live-new', 'e-live-old', 'e-undo'])
    expect(ids('invitations')).toEqual(['i-new', 'i-old'])
    expect(count(db, 'souvenirs')).toBe(0)
    expect(deleted.sort()).toEqual(['cover-gone', 'face-old', 'photo-gone'])
    // c-old: nothing points at it any more, gone. c-used: a live rencontre does. c-recent: inside the grace.
    expect(ids('children')).toEqual(['c-recent', 'c-used'])
    // f-used is named by live invitations, f-old's only invitation went with its rencontre, f-free was never named.
    expect(ids('friend_families')).toEqual(['f-used'])
  })

  it('blanks the contact details of a removed family or child it has to keep, and keeps their names', async () => {
    const { db, env } = realDb()
    seed(db)
    db.exec("UPDATE friend_families SET email = 'a@b.c', phone = '555', allergies = 'nuts', notes = 'dog', child_birthdate = '2020-01-01' WHERE id = 'f-used'")
    db.exec("UPDATE children SET birthdate = '2020-01-01', nap_start = '13:00' WHERE id = 'c-used'")
    await purgeRemoved(env, NOW)
    const f = db.prepare("SELECT parent_name, child_first_name, email, phone, allergies, notes, child_birthdate FROM friend_families WHERE id = 'f-used'").get() as Record<string, unknown>
    expect(f).toMatchObject({ parent_name: 'P', child_first_name: 'K', email: null, phone: null, allergies: null, notes: null, child_birthdate: null })
    const c = db.prepare("SELECT first_name, birthdate, nap_start FROM children WHERE id = 'c-used'").get() as Record<string, unknown>
    expect(c).toMatchObject({ first_name: 'X', birthdate: null, nap_start: null })
  })

  it('is safe to run twice', async () => {
    const { db, env } = realDb()
    seed(db)
    await purgeRemoved(env, NOW)
    await purgeRemoved(env, NOW)
    expect(count(db, 'encounters')).toBe(3)
  })
})

describe('retireLinks', () => {
  it('frees the words of a rencontre that ended long ago, keeps the row and the others', async () => {
    const { db, env } = realDb()
    seed(db)
    await retireLinks(env, NOW)
    const tok = (id: string) => (db.prepare('SELECT token FROM invitations WHERE id = ?').get(id) as { token: string }).token
    expect(tok('i-old')).toBe('old-i-old')
    expect(tok('i-new')).toBe('tuque-sel')
    expect(tok('i-gone')).toBe('lune-miel')
    await retireLinks(env, NOW) // idempotent
    expect(tok('i-old')).toBe('old-i-old')
  })
})
