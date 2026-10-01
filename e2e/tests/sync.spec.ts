/**
 * Background polling (story 3.2, AD-10): the E2E rows of its matrix. The test's `request`
 * context plays the other device, writing straight to the API; the idle tab picks the change
 * up on its next 30 s poll, which the page clock drives through `advance`. CSP-clean is checked
 * by the fixture at teardown (AD-19).
 */
import { expect, test, type Advance, type Task } from '../fixtures.ts'
import type { Page } from '@playwright/test'

const POLL_MS = 30_000
const HOUR = 3_600_000

const input = (page: Page) => page.getByLabel('New task')
/** Each row's task text, without its age label (story 2.1). */
const rowTexts = (page: Page) =>
  page.getByRole('list', { name: 'Tasks' }).getByRole('listitem').locator('.text')

/** Moves both clocks one poll interval on and waits for the poll's `GET /api/tasks` to answer. */
async function nextPoll(page: Page, advance: Advance): Promise<void> {
  const polled = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/tasks',
  )
  await advance(POLL_MS)
  expect((await polled).status()).toBe(200)
}

test('a task added on another device appears on the next poll; focus stays on the input', async ({
  page,
  request,
  seed,
  advance,
}) => {
  await seed({ text: 'already here', addedAgoMs: HOUR })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(rowTexts(page)).toHaveText(['already here'])
  await input(page).focus()
  await expect(input(page)).toBeFocused()

  const response = await request.post('/api/tasks', { data: { text: 'from the phone' } })
  expect(response.status()).toBe(201)

  await nextPoll(page, advance)

  await expect(rowTexts(page)).toHaveText(['already here', 'from the phone'])
  await expect(input(page)).toBeFocused()
})

test('a task deleted on another device is gone after the next poll and stays gone', async ({
  page,
  request,
  seed,
  advance,
}) => {
  const doomed: Task = await seed({ text: 'deleted elsewhere', addedAgoMs: 2 * HOUR })
  await seed({ text: 'kept', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rowTexts(page)).toHaveText(['deleted elsewhere', 'kept'])

  const response = await request.delete(`/api/tasks/${doomed.id}`)
  expect(response.status()).toBe(204)

  await nextPoll(page, advance)
  await expect(rowTexts(page)).toHaveText(['kept'])

  await nextPoll(page, advance)
  await expect(rowTexts(page)).toHaveText(['kept'])
})
