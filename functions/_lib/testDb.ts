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
  const DB = { prepare: (sql: string) => stmt(sql), batch: async (ss: { run: () => Promise<unknown> }[]) => { for (const s of ss) await s.run(); return [] } }
  const deleted: string[] = []
  const PHOTOS = { delete: async (k: string) => void deleted.push(k) }
  return { db, env: { DB, PHOTOS } as unknown as Env, deleted }
}

