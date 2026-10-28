import { defineConfig, devices } from '@playwright/test'

// The e2e boots its own Vite and STUBS every /api/* call (page.route), so it needs no D1,
// no secrets and no wrangler — it proves the SCREENS. The Worker itself is proven by the
// real-runtime walks recorded in STATE.md (wrangler dev + a local D1).
//
// Phone-sized by default: the reply page is opened from a text message, on a phone, by
// someone who has never seen the app.
const PORT = 5199

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, ...devices['iPhone 13'], defaultBrowserType: 'chromium', locale: 'fr-CA', reducedMotion: 'reduce' },
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: false, timeout: 60_000 },
})
