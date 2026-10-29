// « Importer une liste »: many friend families in one go (POST /api/families { import: [...] }). The client has already
// read the paste (src/lib/importList.ts); this re-checks every row, because the server never trusts the client, and
// refuses the whole list on one bad row (nothing half-imported).
import { newId, nowSec } from './ids'

const MAX_IMPORT = 40
export interface ImportRow {
  parentName: string
  childFirstName: string
  email: string | null
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const clip = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

export function cleanImportRows(raw: unknown): ImportRow[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_IMPORT) return null
  const out: ImportRow[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const parentName = clip(r?.parentName, 60)
    const childFirstName = clip(r?.childFirstName, 40)
    const email = r?.email == null || r.email === '' ? null : clip(r.email, 120)?.toLowerCase() ?? ''
    if (!parentName || !childFirstName || (email !== null && !EMAIL.test(email))) return null
    out.push({ parentName, childFirstName, email })
  }
  return out
}

/** One batch; a family already in the book with the same child and parent names (live) is skipped, not doubled. */
export async function insertFamilies(db: D1Database, householdId: string, rows: ImportRow[]): Promise<{ added: number; skipped: number }> {
  const { results } = await db.prepare('SELECT lower(parent_name) AS p, lower(child_first_name) AS c FROM friend_families WHERE household_id = ? AND deleted_at IS NULL').bind(householdId).all<{ p: string; c: string }>()
  const have = new Set(results.map((x) => `${x.p}|${x.c}`))
  const ts = nowSec()
  const stmts: D1PreparedStatement[] = []
  for (const r of rows) {
    const key = `${r.parentName.toLowerCase()}|${r.childFirstName.toLowerCase()}`
    if (have.has(key)) continue
    have.add(key)
    stmts.push(
      db
        .prepare('INSERT INTO friend_families (id, household_id, parent_name, email, child_first_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(newId(), householdId, r.parentName, r.email, r.childFirstName, ts, ts),
    )
  }
  if (stmts.length) await db.batch(stmts)
  return { added: stmts.length, skipped: rows.length - stmts.length }
}
