import { describe, expect, it } from 'vitest'
import type { Env } from './env'
import { TOKEN_GRACE_SEC, tidy } from './lifecycle'

// A recording stand-in for D1: what matters here is WHICH rows the tidy-up reaches for and with what cutoff.
function fakeEnv() {
  const calls: { sql: string; binds: unknown[] }[] = []
  const stmt = (sql: string) => ({
    bind: (...binds: unknown[]) => {
      const s = { sql, binds, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }
      return s
    },
  })
  const DB = {
    prepare: stmt,
    batch: async (stmts: { sql: string; binds: unknown[] }[]) => {
      for (const s of stmts) calls.push({ sql: s.sql, binds: s.binds })
      return []
    },
  }
  // statements run directly (not batched) are recorded through run()/all() as well
  const record = DB.prepare
  DB.prepare = (sql: string) => {
    const s = record(sql)
    return { bind: (...b: unknown[]) => { const x = s.bind(...b); const run = x.run; const all = x.all; x.run = async () => { calls.push({ sql, binds: b }); return run() }; x.all = async () => { calls.push({ sql, binds: b }); return all() }; return x } }
  }
  return { env: { DB } as unknown as Env, calls }
}

describe('tidy', () => {
  it('deletes tokens a week after they stopped working, the old mail ledger, and looks for aged sandboxes', async () => {
    const { env, calls } = fakeEnv()
    const now = 2_000_000_000
    await tidy(env, now)
    const sqls = calls.map((c) => c.sql)
    expect(sqls.some((s) => /DELETE FROM password_resets WHERE expires_at < \?/.test(s))).toBe(true)
    expect(sqls.some((s) => /DELETE FROM parent_invites WHERE expires_at < \?/.test(s))).toBe(true)
    expect(sqls.some((s) => /DELETE FROM mail_sends WHERE created_at < \?/.test(s))).toBe(true)
    expect(sqls.some((s) => /kind = 'demo'/.test(s))).toBe(true)
    expect(calls.find((c) => /password_resets/.test(c.sql))!.binds).toEqual([now - TOKEN_GRACE_SEC])
  })
})
