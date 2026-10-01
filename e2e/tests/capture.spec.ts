/**
 * The capture UI (story 1.9): one test per row of its E2E matrix, against the test profile.
 * CSP-clean is checked by the fixture at teardown for every test (AD-19).
 */
import { expect, expectNoA11yViolations, failApi, test } from '../fixtures.ts'
import type { Page } from '@playwright/test'

const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
const ADD_FAILED = "Couldn't save new task."
const HOUR = 3_600_000

const input = (page: Page) => page.getByLabel('New task')
const rows = (page: Page) => page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')
/** Each row's task text, without its age label (story 2.1). */
const rowTexts = (page: Page) => rows(page).locator('.text')
const skeleton = (page: Page) => page.getByTestId('skeleton')
/** The toast cards (not the live region, which may carry the same copy). */
const toast = (page: Page) => page.locator('[data-toast-kind]')

/** Records every `POST /api/tasks` the page sends. */
function recordPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/tasks') posts.push(r.url())
  })
  return posts
}

/** Waits for the first load to finish: the empty state or the list is on screen. */
async function loaded(page: Page): Promise<void> {
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
}

/**
 * Type right after load, with the race forced: the first `GET /api/tasks` is held until the
 * add's POST has returned 201. `stale` answers it with the pre-POST body (`[]`); `fresh` lets it
 * reach the server, so it lists the task. Either way the AD-10 merge keeps one row under its
 * optimistic key (the row element is never remounted), and the row survives a reload (1.12).
 */
for (const variant of ['stale', 'fresh'] as const) {
  test(`type right after load (${variant} GET): one row, kept, and still there after reload`, async ({
    page,
  }) => {
    let releaseGet!: () => void
    const getReleased = new Promise<void>((resolve) => (releaseGet = resolve))
    let held = false
    await page.route('**/api/tasks', async (route) => {
      if (route.request().method() !== 'GET' || held) return route.fallback()
      held = true
      await getReleased
      if (variant === 'stale') return route.fulfill({ status: 200, json: [] })
      return route.continue()
    })

    await page.goto('/')
    await expect(input(page)).toBeFocused()
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')

    const posted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/tasks',
    )
    await page.keyboard.type('buy milk')
    await page.keyboard.press('Enter')
    expect((await posted).status()).toBe(201)

    await expect(rowTexts(page)).toHaveText(['buy milk'])
    await expect(input(page)).toHaveValue('')
    await expect(input(page)).toBeFocused()
    const row = await rows(page).first().elementHandle()

    releaseGet()
    await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    await expect(rowTexts(page)).toHaveText(['buy milk'])
    expect(await row?.evaluate((el) => el.isConnected)).toBe(true)

    await page.reload()
    await expect(rowTexts(page)).toHaveText(['buy milk'])
  })
}

test('whitespace: no row, no request, and the input keeps its spaces', async ({ page }) => {
  const posts = recordPosts(page)
  await page.goto('/')
  await loaded(page)

  await input(page).fill('   ')
  await input(page).press('Enter')

  await expect(page.getByText(EMPTY_STATE)).toBeVisible()
  await expect(input(page)).toHaveValue('   ')
  expect(posts).toEqual([])
})

test('IME: Enter while composing adds nothing', async ({ page }) => {
  const posts = recordPosts(page)
  await page.goto('/')
  await loaded(page)

  await input(page).fill('かな')
  await input(page).dispatchEvent('keydown', {
    key: 'Enter',
    isComposing: true,
  })
  await input(page).dispatchEvent('keydown', { key: 'Enter', keyCode: 229 })

  await expect(input(page)).toHaveValue('かな')
  await expect(page.getByText(EMPTY_STATE)).toBeVisible()
  expect(posts).toEqual([])
})

test('paste newline: the input holds the text with spaces, and Enter adds it', async ({ page }) => {
  await page.goto('/')
  await loaded(page)

  await input(page).evaluate((el) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'a\nb')
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })

  await expect(input(page)).toHaveValue('a b')

  await input(page).press('Enter')
  await expect(rowTexts(page)).toHaveText(['a b'])
})

test('empty state: after a reset the page shows the empty-state copy', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText(EMPTY_STATE)).toBeVisible()
  await expect(page.getByRole('list', { name: 'Tasks' })).toHaveCount(0)
})

type SkeletonWindow = { skeletonAt?: number; getStartedAt?: number }

/**
 * Records when the first `GET /api/tasks` starts and when the skeleton first appears, both on
 * `document.timeline`: the fixture's page clock fakes `performance` (resource timing included).
 */
async function watchSkeleton(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as SkeletonWindow
    const now = () => Number(document.timeline.currentTime)
    const realFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), location.href)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (w.getStartedAt === undefined && method === 'GET' && url.pathname === '/api/tasks') {
        w.getStartedAt = now()
      }
      return realFetch(input, init)
    }
    new MutationObserver(() => {
      if (w.skeletonAt === undefined && document.querySelector('[data-testid="skeleton"]')) {
        w.skeletonAt = now()
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

const skeletonAt = (page: Page) =>
  page.evaluate(() => (window as unknown as SkeletonWindow).skeletonAt ?? null)

/** How long after the `GET /api/tasks` request started the skeleton appeared. */
const skeletonDelay = (page: Page) =>
  page.evaluate(() => {
    const { skeletonAt, getStartedAt } = window as unknown as SkeletonWindow
    return skeletonAt === undefined || getStartedAt === undefined ? null : skeletonAt - getStartedAt
  })

test('skeleton: a GET delayed 1.5 s shows three bars after about 300 ms, then the list', async ({
  page,
  seed,
}) => {
  await seed({ text: 'slow one', addedAgoMs: HOUR })
  await watchSkeleton(page)
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await route.fallback()
  })

  await page.goto('/')
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  await expect(skeleton(page)).toBeVisible()
  await expect(skeleton(page)).toHaveAttribute('aria-hidden', 'true')
  await expect(skeleton(page).locator('.bar')).toHaveCount(3)

  await expect(rowTexts(page)).toHaveText(['slow one'])
  await expect(skeleton(page)).toHaveCount(0)
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  const delay = await skeletonDelay(page)
  expect(delay).toBeGreaterThanOrEqual(250)
  expect(delay).toBeLessThanOrEqual(900)
})

test('skeleton: none for a fast GET', async ({ page, seed }) => {
  await seed({ text: 'fast one', addedAgoMs: HOUR })
  await watchSkeleton(page)
  await page.goto('/')
  await expect(rowTexts(page)).toHaveText(['fast one'])

  // Well past the 300 ms delay: the timer has fired and found the list loaded.
  await page.waitForTimeout(500)
  expect(await skeletonAt(page)).toBeNull()
})

test('survives reload: an added row is still there after a reload', async ({ page }) => {
  await page.goto('/')
  await loaded(page)

  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/tasks',
  )
  await input(page).fill('keep me')
  await input(page).press('Enter')
  expect((await posted).status()).toBe(201)

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['keep me'])
})

test('add fails: the row goes, the toast shows and the text returns', async ({ page, seed }) => {
  await seed({ text: 'already here', addedAgoMs: HOUR })
  await failApi(page, { method: 'POST', path: '/api/tasks' })
  await page.goto('/')

  // failApi lets the GET through: the seeded list still loads.
  await expect(rowTexts(page)).toHaveText(['already here'])

  await input(page).fill('x')
  await input(page).press('Enter')

  await expect(toast(page)).toHaveText(ADD_FAILED)
  await expect(rowTexts(page)).toHaveText(['already here'])
  await expect(input(page)).toHaveValue('x')
})

test('fail after typing on: the row goes, the toast shows and the new text is kept', async ({
  page,
}) => {
  let releasePost!: () => void
  const postReleased = new Promise<void>((resolve) => (releasePost = resolve))
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await postReleased
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      json: { detail: 'Injected failure', code: 'service_unavailable' },
    })
  })
  await page.goto('/')
  await loaded(page)

  await input(page).fill('first')
  await input(page).press('Enter')
  await expect(input(page)).toHaveValue('')
  await expect(rowTexts(page)).toHaveText(['first'])
  await page.keyboard.type('second')
  releasePost()

  await expect(toast(page)).toHaveText(ADD_FAILED)
  await expect(rows(page)).toHaveCount(0)
  await expect(input(page)).toHaveValue('second')
})

test('toast announced: the polite region carries the add-failure copy', async ({ page }) => {
  await failApi(page, { method: 'POST', path: '/api/tasks' })
  await page.goto('/')
  await loaded(page)

  await input(page).fill('x')
  await input(page).press('Enter')

  await expect(page.getByRole('status')).toContainText(ADD_FAILED)
})

test('laptop focus: the input is focused on load', async ({ page }) => {
  await page.goto('/')

  await expect(input(page)).toBeFocused()
})

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('phone focus: the input is not focused on load', async ({ page }) => {
    await page.goto('/')
    await loaded(page)

    await expect(input(page)).not.toBeFocused()
  })
})

for (const width of [320, 1280]) {
  test(`a11y at ${width} px: no critical violations, empty and with rows`, async ({
    page,
    seed,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.getByText(EMPTY_STATE)).toBeVisible()
    await expectNoA11yViolations(page)

    await seed({
      text: 'a task with a long-enough text to wrap on a phone screen',
      addedAgoMs: HOUR,
    })
    await seed({
      text: 'https://example.com/a/very/long/url/that/must/break/anywhere/x',
      addedAgoMs: 0,
    })
    await page.reload()
    await expect(rows(page)).toHaveCount(2)
    await expectNoA11yViolations(page)

    // No horizontal scroll at any width down to 320 px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
}
