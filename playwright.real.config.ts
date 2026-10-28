import { defineConfig } from '@playwright/test'

// The real-stack walk (scripts/e2e-real.mjs boots the Worker and sets REAL_URL). Not part of `npm run e2e`.
export default defineConfig({
  testDir: 'e2e-real',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: process.env.REAL_URL ?? 'http://127.0.0.1:8790', locale: 'fr-CA', trace: 'retain-on-failure' },
})
