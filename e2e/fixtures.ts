/**
 * The shared E2E harness. Every spec imports `test` and `expect` from here, never from
 * `@playwright/test` directly.
 *
 * - Before each test, an auto fixture calls `POST /api/test/reset` (tasks deleted, server
 *   clock offset back to 0). Against a stack without the AD-14 router (the app stack on
 *   :8081) that call is a 404 and the test fails before touching any data.
 * - For any test that uses `page`: `page.clock.install()` runs before the spec's first
 *   `goto` (AD-8), and a `securitypolicyviolation` listener is registered with
 *   `addInitScript`. At teardown the test fails if any violation was recorded (AD-19).
 * - `seed(...)` seeds through `POST /api/test/tasks`. Call it before `goto`, or reload
 *   afterwards (AD-14).
 * - `advance(ms)` moves the browser clock (`fastForward`) and the server clock together.
 *   Time only ever moves with `fastForward`/`runFor`; never `setFixedTime` or `pauseAt`.
 */
import { AxeBuilder } from '@axe-core/playwright'
import { test as base, expect, type Page } from '@playwright/test'

export { expect }

/** The AD-3 Task as it comes over the wire. */
export type Task = {
  id: string
  text: string
  added_at: string
  completed_at: string | null
}

export type SeedInput = {
  text: string
  /** How long before the server's now (offset included) the task was added. */
  addedAgoMs: number
  /** How long ago it was completed; omit for an open task. Must be <= `addedAgoMs`. */
  completedAgoMs?: number
}

export type Seed = (input: SeedInput) => Promise<Task>
export type Advance = (ms: number) => Promise<void>

type HarnessFixtures = {
  resetTestData: void
  seed: Seed
  advance: Advance
}

export type CspViolation = { directive: string; blockedUri: string }

declare global {
  interface Window {
    __reportCsp?: (violation: CspViolation) => Promise<void>
  }
}

/** Violations reported by each page, collected Node-side so they survive navigations. */
const violationsByPage = new WeakMap<Page, CspViolation[]>()

/** Runs in the page before any of its own scripts, on every navigation. */
function cspListener(): void {
  document.addEventListener('securitypolicyviolation', (event) => {
    void window.__reportCsp?.({ directive: event.violatedDirective, blockedUri: event.blockedURI })
  })
}

/**
 * The live array of CSP violations this page has reported, across every document it has
 * loaded. A spec that triggers a violation on purpose clears it (`length = 0`) afterwards.
 */
export function cspViolations(page: Page): CspViolation[] {
  let violations = violationsByPage.get(page)
  if (!violations) {
    violations = []
    violationsByPage.set(page, violations)
  }
  return violations
}

function assertNoCspViolations(page: Page): void {
  const listed = cspViolations(page).map(
    (v) => `${v.directive} blocked ${v.blockedUri || '(none)'}`,
  )
  expect(listed, `CSP violations:\n${listed.join('\n')}`).toEqual([])
}

export const test = base.extend<HarnessFixtures>({
  resetTestData: [
    async ({ request, baseURL }, use) => {
      const response = await request.post('/api/test/reset')
      const message = `POST /api/test/reset on ${baseURL} (is it the test profile?)`
      expect(response.status(), message).toBe(204)
      await use()
    },
    { auto: true },
  ],

  page: async ({ page }, use) => {
    const violations = cspViolations(page)
    await page.exposeBinding('__reportCsp', (_source, violation: CspViolation) => {
      violations.push(violation)
    })
    await page.addInitScript(cspListener)
    await page.clock.install()
    await use(page)
    assertNoCspViolations(page)
  },

  seed: async ({ request, resetTestData: _ }, use) => {
    await use(async ({ text, addedAgoMs, completedAgoMs }) => {
      const response = await request.post('/api/test/tasks', {
        data: { text, added_ago_ms: addedAgoMs, completed_ago_ms: completedAgoMs ?? null },
      })
      expect(response.status(), `seed: ${await response.text()}`).toBe(201)
      return (await response.json()) as Task
    })
  },

  advance: async ({ page, request, resetTestData: _ }, use) => {
    // The server takes an absolute offset; reset set it to 0 for this test.
    let offsetMs = 0
    await use(async (ms) => {
      // Server first, so timers that fire during the jump already see the new server time.
      offsetMs += ms
      const response = await request.post('/api/test/clock', { data: { offset_ms: offsetMs } })
      expect(response.status(), `advance: ${await response.text()}`).toBe(204)
      await page.clock.fastForward(ms)
    })
  },
})

export type FailApiOptions = {
  method: string
  /** The exact URL path, e.g. `/api/tasks`. */
  path: string
  status?: number
  code?: string
  detail?: string
}

/**
 * Fulfils every matching `/api/**` request with the AD-5 error body `{detail, code}`.
 * Defaults to `503 service_unavailable`. Other requests go through untouched.
 */
export async function failApi(
  page: Page,
  options: FailApiOptions,
): Promise<void> {
  const { method, path, status = 503, code = 'service_unavailable' } = options
  const detail = options.detail ?? 'Injected failure'
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== method.toUpperCase() || url.pathname !== path) {
      await route.fallback()
      return
    }
    await route.fulfill({ status, contentType: 'application/json', json: { detail, code } })
  })
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** Runs axe on the current page and fails on any violation of `critical` impact. */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  const critical = results.violations
    .filter((violation) => violation.impact === 'critical')
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ')
      return `${violation.id}: ${targets}`
    })
  expect(critical, `Critical axe violations:\n${critical.join('\n')}`).toEqual([])
}
