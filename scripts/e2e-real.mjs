// The REAL walk: the built app, the real Worker (`wrangler dev --local`) and a real local D1 + R2, no stubs.
// A host and an invited parent in two browsers. Everything else in e2e/ stubs the API; this is what proves
// the stack agrees with itself (the kind of bug a stub cannot see: a bad column, a route not in the table).
//   npm run e2e:real
// It never touches production, wipes only .wrangler/state, and always stops the server it started.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const PORT = 8790
const URL = `http://127.0.0.1:${PORT}`
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { shell: true, stdio: 'inherit', ...opts })

console.log('building…')
if (run('npm', ['run', 'build'], { stdio: 'ignore' }).status !== 0) {
  console.error('build failed')
  process.exit(1)
}
// The same Worker config with the brute-force bounds lifted: the walks open many links from ONE address in a minute (production keeps
// 30 per address and 6 per target). The copy is generated here and removed on exit; nothing else changes.
const CONFIG = 'wrangler.e2e.toml'
writeFileSync(CONFIG, readFileSync('wrangler.toml', 'utf8').replace('limit = 30,', 'limit = 3000,').replace('limit = 6,', 'limit = 600,'))
rmSync('.wrangler/state', { recursive: true, force: true })
run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'viensjouer', '--local', '-c', CONFIG], { stdio: 'ignore' })

// The secret is passed explicitly so this also runs on a machine with no .dev.vars (CI).
const server = spawn('npx', ['wrangler', 'dev', '-c', CONFIG, '--port', String(PORT), '--local', '--var', 'SESSION_SECRET:real-walk-secret-with-at-least-32-characters', '--var', 'ENVIRONMENT:development'], { shell: true, stdio: 'ignore', detached: process.platform !== 'win32' })
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  rmSync(CONFIG, { force: true })
  // wrangler starts workerd as a child: kill the whole tree, not just the shell (a leaked server sits on RAM).
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else try { process.kill(-server.pid) } catch { server.kill() }
}
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

let ready = false
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch(`${URL}/api/health`)).ok
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
  }
}
if (!ready) {
  stop()
  console.error('wrangler dev did not come up')
  process.exit(1)
}

const result = run('npx', ['playwright', 'test', '-c', 'playwright.real.config.ts', ...process.argv.slice(2)], { env: { ...process.env, REAL_URL: URL } })
stop()
process.exit(result.status ?? 1)
