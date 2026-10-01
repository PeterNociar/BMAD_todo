import { defineConfig, devices } from '@playwright/test'

// E2E_BROWSER_CHANNEL (e.g. "chrome") runs a system browser instead of the bundled
// Chromium, for machines where `playwright install chromium` cannot download.
const channel = process.env.E2E_BROWSER_CHANNEL || undefined

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  // One worker: every test shares the test stack's database and server clock offset (AD-14).
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    // The compose `test` profile (frontend-test). Never the app stack on :8081.
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:8082',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel } }],
})
