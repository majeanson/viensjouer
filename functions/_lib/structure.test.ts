import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Structural rules of the house, held by the build the way Babillard holds its own (write-rule, csrfExempt,
// swallow-rule). Each one was written against a mistake that is easy to make and invisible to a stubbed test.
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name).replace(/\\/g, '/')]))
const read = (f: string) => readFileSync(f, 'utf8')
// Code without its comments, so a rule about calls is not tripped by a sentence that mentions one.
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const handlers = walk('functions/api').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
const routes = read('worker/routes.ts')

describe('every endpoint is routed', () => {
  it('has a row in the route table for each handler file', () => {
    // Adding an endpoint needs BOTH the handler and a row in worker/routes.ts (CLAUDE.md): file path is not routing.
    const missing = handlers.filter((f) => !routes.includes(`'../${f.replace(/\.ts$/, '')}'`))
    expect(missing).toEqual([])
  })
})

describe('who may call an endpoint', () => {
  // Endpoints that are deliberately NOT behind a signed-in session. Each is reachable by one of: an address (a
  // door), a code in the path (the code IS the credential, behind the rate limit and the lockout), or nothing
  // at all (health). Adding to this list is a decision, so it is written down with the reason.
  const PUBLIC: Record<string, string> = {
    'functions/api/health.ts': 'liveness and which optional features exist; no data',
    'functions/api/join.ts': 'a second parent joins with a one-use invitation token',
    'functions/api/demo.ts': 'the sandbox door: mints a throwaway household',
    'functions/api/feed.ts': 'the host calendar feed: a 24-character secret in the path',
  }
  const byCode = (f: string) => /^functions\/api\/(r|w|auth)\//.test(f)

  it('puts every other handler behind authed() or on the written list', () => {
    const open = handlers.filter((f) => !byCode(f) && !PUBLIC[f] && !/authed\(/.test(read(f)))
    expect(open, 'a handler with no auth guard: wrap it in authed() or add it to PUBLIC with the reason').toEqual([])
  })

  it('keeps the list honest: every listed file exists and really is open', () => {
    for (const f of Object.keys(PUBLIC)) {
      expect(handlers, f).toContain(f)
      expect(read(f), `${f} is listed as public but uses authed()`).not.toMatch(/authed\(/)
    }
  })

  it('rate-limits and locks out every endpoint a code opens', () => {
    for (const f of handlers.filter((f) => /^functions\/api\/(r|w)\//.test(f))) {
      const src = read(f)
      expect(src, `${f} must call overAuthLimit`).toMatch(/overAuthLimit\(/)
      expect(src, `${f} must call lockedOut`).toMatch(/lockedOut\(/)
    }
  })
})

describe('the client', () => {
  const client = walk('src').filter((f) => /\.(ts|tsx)$/.test(f))

  it('reaches /api only through api()', () => {
    const strays = client.filter((f) => f !== 'src/lib/api.ts' && /\bfetch\(/.test(code(f)))
    expect(strays, 'use api() from src/lib/api.ts: it carries the CSRF token and the error shape').toEqual([])
  })

  it('never opens a browser confirm() or alert()', () => {
    // Undo toasts instead (src/lib/toast.tsx). prompt() stays as the last-resort copy-to-clipboard fallback.
    const dialogs = client.filter((f) => /(^|[^.\w])(confirm|alert)\(/.test(code(f)))
    expect(dialogs).toEqual([])
  })
})

describe('what a stranger can aim the sender at', () => {
  // Signup is open and a friend family's address is free text, so every mail a HOST's action causes must go through
  // the household's daily budget (mailBudget.ts). The two sends that do not are listed with the reason.
  const NOT_BUDGETED: Record<string, string> = {
    'functions/api/auth/forgot.ts': 'only to an address that already has an account, limited per address and per target',
    'functions/api/test-mail.ts': 'only to the signed-in parent’s own address, a few a day',
  }
  it('counts every host-caused email against the household budget', () => {
    const senders = handlers.filter((f) => /\bsendMail\(/.test(code(f)) && !NOT_BUDGETED[f])
    expect(senders.length).toBeGreaterThan(0)
    for (const f of senders) expect(code(f), `${f} sends mail without mailRoom/recordMail`).toMatch(/mailRoom\([\s\S]*recordMail\(/)
  })
  it('keeps the budget list honest', () => {
    for (const f of Object.keys(NOT_BUDGETED)) expect(handlers, f).toContain(f)
  })
})

describe('the code lockout', () => {
  it('guards the secret-in-the-path doors too (the feed and the link preview)', () => {
    for (const f of ['functions/api/feed.ts', 'worker/preview.ts']) {
      const src = read(f)
      expect(src, `${f} must call overAuthLimit`).toMatch(/overAuthLimit\(/)
      expect(src, `${f} must call lockedOut`).toMatch(/lockedOut\(/)
    }
  })
})

describe('workflows', () => {
  const wfDir = '.github/workflows'
  const wfs = readdirSync(wfDir).filter((f) => f.endsWith('.yml'))
  const name = (src: string) => src.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')

  it('reports a red scheduled run: every scheduled workflow is listed in scheduled-red.yml', () => {
    const watcher = read(`${wfDir}/scheduled-red.yml`)
    for (const f of wfs.filter((f) => f !== 'scheduled-red.yml' && /^\s*schedule:/m.test(read(`${wfDir}/${f}`)))) {
      expect(watcher, `${f} runs on a schedule but scheduled-red.yml does not watch it`).toContain(`'${name(read(`${wfDir}/${f}`))}'`)
    }
  })

  it('never puts attacker-shaped text from the triggering run inside a run: script', () => {
    const src = read(`${wfDir}/scheduled-red.yml`)
    const scripts = [...src.matchAll(/run: \|\n((?:[ ]{10,}.*\n?)+)/g)].map((m) => m[1])
    expect(scripts.length).toBeGreaterThan(0)
    for (const s of scripts) expect(s).not.toMatch(/\$\{\{/)
  })
})

describe('the deploy gate', () => {
  it('waits for the real walk (the only test that runs the SQL), not just the unit tests', () => {
    const ci = read('.github/workflows/ci.yml')
    expect(ci).toMatch(/deploy:[\s\S]*?needs: \[ci, real\]/)
    expect(ci).toMatch(/real:[\s\S]*?npm run e2e:real/)
  })
})

describe('accounts that exist', () => {
  it('no door confirms that an email already has an account', () => {
    const leaks = handlers.filter((f) => /existe déjà|already exists|already has an account/i.test(code(f)))
    expect(leaks, 'answer with ACCOUNT_UNAVAILABLE (functions/_lib/json.ts) instead').toEqual([])
  })
})
