/**
 * Proves the shared harness in `../fixtures`: one test per row of the story-1.5 matrix.
 * Tests run in file order on one worker; the isolation row relies on the test before it.
 */
import {
  cspViolations,
  expect,
  expectNoA11yViolations,
  failApi,
  test,
  type Task,
} from '../fixtures.ts'
import type { Page } from '@playwright/test'

const HOUR = 3_600_000
const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
// Host and containers share one clock; this only absorbs request latency.
const TOLERANCE_MS = 30_000

function expectNear(actual: number, expected: number): void {
  const message = `${new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`
  expect(Math.abs(actual - expected), message).toBeLessThan(TOLERANCE_MS)
}

test('seed and load: a seeded task shows on the list with its added_at in the past', async ({
  page,
  seed,
}) => {
  const task = await seed({ text: 'old', addedAgoMs: 90_000_000 })

  expectNear(Date.parse(task.added_at), Date.now() - 90_000_000)
  expect(task.completed_at).toBeNull()

  const done = await seed({ text: 'done', addedAgoMs: 7_200_000, completedAgoMs: HOUR })
  expectNear(Date.parse(done.added_at), Date.now() - 7_200_000)
  expect(done.completed_at).not.toBeNull()
  expectNear(Date.parse(done.completed_at!), Date.now() - HOUR)

  await page.goto('/')
  await expect(page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')).toHaveText([
    'old',
    'done',
  ])
})

test('advance moves the browser clock and the server clock together', async ({
  page,
  request,
  advance,
}) => {
  await page.goto('/')
  const before = await page.evaluate(() => Date.now())

  await advance(HOUR)

  const after = await page.evaluate(() => Date.now())
  expect(after - before).toBeGreaterThanOrEqual(HOUR)

  const response = await request.post('/api/tasks', { data: { text: 'later' } })
  expect(response.status()).toBe(201)
  const task = (await response.json()) as Task
  expectNear(Date.parse(task.added_at), Date.now() + HOUR)
})

test('advance is cumulative: two 1 h steps leave both clocks 2 h ahead', async ({
  page,
  request,
  advance,
}) => {
  await page.goto('/')
  const before = await page.evaluate(() => Date.now())

  await advance(HOUR)
  await advance(HOUR)

  const after = await page.evaluate(() => Date.now())
  expect(after - before).toBeGreaterThanOrEqual(2 * HOUR)
  expectNear(after, Date.now() + 2 * HOUR)

  const response = await request.post('/api/tasks', { data: { text: 'two hours on' } })
  expect(response.status()).toBe(201)
  const task = (await response.json()) as Task
  expectNear(Date.parse(task.added_at), Date.now() + 2 * HOUR)
})

test.describe('isolation', () => {
  // Serial: the second test only means something right after the first has passed.
  test.describe.configure({ mode: 'serial' })

  test('a test that seeds and advances', async ({ page, seed, advance }) => {
    await seed({ text: 'left behind', addedAgoMs: 1_000 })
    await page.goto('/')
    await advance(5 * HOUR)
    await expect(page.getByRole('listitem')).toHaveText(['left behind'])
  })

  test('the next test starts with no tasks and the server offset at 0', async ({
    page,
    request,
  }) => {
    const list = await request.get('/api/tasks')
    expect(list.status()).toBe(200)
    expect(await list.json()).toEqual([])

    const response = await request.post('/api/tasks', { data: { text: 'now' } })
    expect(response.status()).toBe(201)
    const task = (await response.json()) as Task
    expectNear(Date.parse(task.added_at), Date.now())

    await page.goto('/')
    expectNear(await page.evaluate(() => Date.now()), Date.now())
    await expect(page.getByRole('listitem')).toHaveText(['now'])
  })
})

test('failApi: GET /api/tasks gets a 503 error body and the empty state never renders', async ({
  page,
}) => {
  await failApi(page, { method: 'GET', path: '/api/tasks' })

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/tasks',
  )
  await page.goto('/')
  const response = await responsePromise

  expect(response.status()).toBe(503)
  const body = (await response.json()) as { detail: unknown; code: unknown }
  expect(body.code).toBe('service_unavailable')
  expect(typeof body.detail).toBe('string')

  await expect(page.getByLabel('New task')).toBeVisible()
  await expect(page.getByText(EMPTY_STATE)).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Tasks' })).toHaveCount(0)
})

/** Waits for the page's `GET /api/tasks` response. */
function tasksGet(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/tasks',
  )
}

test('failApi: with POST /api/tasks failed, the seeded list still loads through GET', async ({
  page,
  seed,
}) => {
  await seed({ text: 'seeded', addedAgoMs: HOUR })
  await failApi(page, { method: 'POST', path: '/api/tasks' })

  const responsePromise = tasksGet(page)
  await page.goto('/')
  const response = await responsePromise

  // Same path, other method: passed through to the server.
  expect(response.status()).toBe(200)
  await expect(page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')).toHaveText([
    'seeded',
  ])

  // The matching request is still failed, so the route is live rather than absent.
  const postStatus = await page.evaluate(async () => {
    const posted = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'blocked' }),
    })
    return posted.status
  })
  expect(postStatus).toBe(503)
})

test('failApi: with GET /api/health failed, the seeded list still loads through GET', async ({
  page,
  seed,
}) => {
  await seed({ text: 'seeded', addedAgoMs: HOUR })
  await failApi(page, { method: 'GET', path: '/api/health' })

  const responsePromise = tasksGet(page)
  await page.goto('/')
  const response = await responsePromise

  // Same method, other path: passed through to the server.
  expect(response.status()).toBe(200)
  await expect(page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')).toHaveText([
    'seeded',
  ])

  // The matching request is still failed, so the route is live rather than absent.
  const healthStatus = await page.evaluate(async () => (await fetch('/api/health')).status)
  expect(healthStatus).toBe(503)
})

/** Appends an inline `<script>`, which `default-src 'self'` blocks. */
async function injectInlineScript(page: Page): Promise<void> {
  await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__inlineRan = true'
    document.body.append(script)
  })
}

const INLINE_SCRIPT_DIRECTIVE = /^script-src(-elem)?$/

test('the CSP listener records an inline-script violation', async ({ page }) => {
  await page.goto('/')
  await injectInlineScript(page)

  await expect
    .poll(() => cspViolations(page).map((v) => v.directive))
    .toEqual([expect.stringMatching(INLINE_SCRIPT_DIRECTIVE)])
  const inlineRan = await page.evaluate(() => (window as { __inlineRan?: boolean }).__inlineRan)
  expect(inlineRan).toBeUndefined()

  cspViolations(page).length = 0 // triggered on purpose; let teardown pass
})

test('a violation in an earlier document is still reported after a reload', async ({ page }) => {
  await page.goto('/')
  await injectInlineScript(page)
  await expect.poll(() => cspViolations(page).length).toBe(1)

  await page.reload()
  await expect(page.getByText(EMPTY_STATE)).toBeVisible()

  expect(cspViolations(page).map((v) => v.directive)).toEqual([
    expect.stringMatching(INLINE_SCRIPT_DIRECTIVE),
  ])
  cspViolations(page).length = 0 // triggered on purpose; let teardown pass
})

test('a CSP violation fails the test at teardown', async ({ page }) => {
  // Expected failure, and it proves only the fixture's teardown check: the violation is
  // left in place, so teardown must fail the test. That the listener records it is proved
  // by the two tests above.
  test.fail()

  await page.goto('/')
  await injectInlineScript(page)
  await expect.poll(() => cspViolations(page).length).toBe(1)
})

test('axe: the empty list has no critical WCAG 2.1 A/AA violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(EMPTY_STATE)).toBeVisible()

  await expectNoA11yViolations(page)
})

test('axe: a critical violation fails with its rule id', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(EMPTY_STATE)).toBeVisible()
  await page.evaluate(() => {
    const image = document.createElement('img')
    image.src = 'x'
    document.body.append(image)
  })

  await expect(expectNoA11yViolations(page)).rejects.toThrow(/image-alt/)
})
