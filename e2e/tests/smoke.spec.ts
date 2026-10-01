import { expect, test } from '../fixtures.ts'

// CSP-clean is checked by the fixture at teardown (AD-19).
test('loads the app with the input and the empty state, CSP-clean', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Todo')
  await expect(page.getByRole('heading', { level: 1, name: 'Todo' })).toBeVisible()
  await expect(page.getByLabel('New task')).toHaveAttribute('placeholder', 'What needs doing?')
  await expect(page.getByText('Nothing waiting. Type a task above and press Enter.')).toBeVisible()
})
