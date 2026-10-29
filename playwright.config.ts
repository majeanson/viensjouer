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
  use: { baseURL: `http://localhost:${PORT}`, locale: 'fr-CA', reducedMotion: 'reduce' },
  // Two engines. Chromium runs everything. WebKit (the engine under every iPhone browser) runs only the layout checks tagged
  // @webkit: date and time pickers, nothing bleeding off a 320 px screen. A bug that only the iPhone's engine shows (the
  // pickers spilling out of their card) cannot be seen from Chromium alone.
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'webkit', use: { ...devices['iPhone 13'] }, grep: /@webkit/ },
  ],
  webServer: { command: `npx vite --port ${PORT} --strictPort`, port: PORT, reuseExistingServer: false, timeout: 60_000 },
})
