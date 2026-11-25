import { execSync } from 'node:child_process'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { headersFileSource } from './functions/_lib/securityHeaders'

// SPA build. `npm run cf:dev` (wrangler dev, :8787) serves dist/ + the Worker; plain
// `vite` is the HMR loop with /api proxied to that wrangler instance.
// /version.json: the commit this bundle was built from, so DevHub can tell
// whether production serves the last deploy. A 'post' hook, and the last
// plugin, so it runs after anything that lists the bundle (a service
// worker's precache): the file must never be served from a cache.
function versionJson(): Plugin {
  return {
    name: 'version-json',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler() {
        let sha = process.env.GITHUB_SHA ?? ''
        if (!sha) {
          try {
            sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
          } catch {
            sha = 'unknown'
          }
        }
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ sha, builtAt: new Date().toISOString() }) })
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      // Cloudflare serves a request that matches a real file WITHOUT invoking the Worker,
      // so `/` would carry no security headers at all. `_headers` is the layer that reaches
      // those responses; it is generated from the SAME list the Worker applies.
      name: 'emit-headers-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: '_headers', source: headersFileSource() })
      },
    },
    versionJson(),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
