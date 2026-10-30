// Runs knip with the parser's raw-transfer mode off. That mode reserves a huge ArrayBuffer up front and fails ("Array buffer
// allocation failed") on some machines (seen on Windows with Node 26); the normal mode is a little slower and never fails that way.
import { spawnSync } from 'node:child_process'

const r = spawnSync(process.execPath, ['node_modules/knip/bin/knip.js', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, KNIP_DISABLE_RAW_TRANSFER: '1' } })
process.exit(r.status ?? 1)
