import { defineConfig, devices } from '@playwright/test'

// The QA run (story 3.8): the accessibility sweep and the performance check behind
// docs/qa-accessibility.md and docs/qa-performance.md. Kept apart from `npm test` (which runs
// ./tests) and started with `npm run qa`. Same target, browser channel and single worker as
// playwright.config.ts: both specs reset and seed the test stack (AD-14).
const channel = process.env.E2E_BROWSER_CHANNEL || undefined

// One id per run, set once in the runner and inherited by every worker (a worker restarted after
// a failure keeps it): the a11y sweep's summary counts only cells written by this run.
process.env.QA_RUN_ID ||= new Date().toISOString()

export default defineConfig({
  testDir: './qa',
  fullyParallel: false,
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
