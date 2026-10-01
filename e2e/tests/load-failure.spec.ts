/**
 * Load failure and Retry (story 3.1, FR-17, AD-10): the E2E row of its matrix. A failed first
 * `GET /api/tasks` raises the persistent Retry toast with the list hidden; once the failure is
 * cleared, Retry loads the list, closes the toast and focus lands on the input. CSP-clean is
 * checked by the fixture at teardown (AD-19).
 */
import { expect, expectNoA11yViolations, failApi, test } from '../fixtures.ts'
import type { Page } from '@playwright/test'

const HOUR = 3_600_000
const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
const LOAD_FAILED = "Couldn't load your tasks."

const input = (page: Page) => page.getByLabel('New task')
const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rowTexts = (page: Page) => list(page).getByRole('listitem').locator('.text')
const loadToast = (page: Page) => page.locator('[data-toast-kind="load_failed"]')
const retry = (page: Page) => page.getByRole('button', { name: 'Retry' })

test('a failed load shows the Retry toast and no list; Retry loads it and focus returns to the input', async ({
  page,
  seed,
}) => {
  await seed({ text: 'older', addedAgoMs: 2 * HOUR })
  await seed({ text: 'newer', addedAgoMs: HOUR })
  const clear = await failApi(page, { method: 'GET', path: '/api/tasks' })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  await expect(loadToast(page)).toBeVisible()
  await expect(loadToast(page)).toContainText(LOAD_FAILED)
  await expect(retry(page)).toBeVisible()
  await expect(page.getByText(EMPTY_STATE)).toHaveCount(0)
  await expect(list(page)).toHaveCount(0)
  await expect(page.getByTestId('skeleton')).toHaveCount(0)
  await expectNoA11yViolations(page)

  await clear()
  await retry(page).click()

  await expect(rowTexts(page)).toHaveText(['older', 'newer'])
  await expect(loadToast(page)).toHaveCount(0)
  await expect(retry(page)).toHaveCount(0)
  await expect(input(page)).toBeFocused()
})
