// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Env } from './env'

// Real SQL, not a recording fake: every migration applied to an in-memory SQLite, behind the few D1 methods purge.ts uses.
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
export function realDb() {
  const db = new DatabaseSync(':memory:')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'))
  const stmt = (sql: string, binds: unknown[] = []) => ({
    sql,
    bind: (...b: unknown[]) => stmt(sql, b),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(binds as never[])).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...(binds as never[])) }),
    first: async () => db.prepare(sql).get(...(binds as never[])) ?? null,
  })
  const DB = { prepare: (sql: string) => stmt(sql), batch: async (ss: { sql: string; run: () => Promise<unknown>; all: () => Promise<unknown> }[]) => {
      // Like D1: one result per statement (the rows of a SELECT, the change count of the rest).
      const out: unknown[] = []
      for (const x of ss) out.push(['select', 'with'].some((w) => x.sql.trim().toLowerCase().startsWith(w)) ? await x.all() : await x.run())
      return out
    } }
  const deleted: string[] = []
  const PHOTOS = { delete: async (k: string) => void deleted.push(k) }
  return { db, env: { DB, PHOTOS } as unknown as Env, deleted }
}

