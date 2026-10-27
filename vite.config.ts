import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { headersFileSource } from './functions/_lib/securityHeaders'

// SPA build. `npm run cf:dev` (wrangler dev, :8787) serves dist/ + the Worker; plain
// `vite` is the HMR loop with /api proxied to that wrangler instance.
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
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
})
