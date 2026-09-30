import { expect, test } from '@playwright/test'

test('loads the app with the input and the empty state, CSP-clean', async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = []
    ;(window as unknown as { __cspViolations: string[] }).__cspViolations = violations
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    })
  })

  await page.goto('/')

  await expect(page).toHaveTitle('Todo')
  await expect(page.getByRole('heading', { level: 1, name: 'Todo' })).toBeVisible()
  await expect(page.getByLabel('New task')).toHaveAttribute('placeholder', 'What needs doing?')
  await expect(page.getByText('Nothing waiting. Type a task above and press Enter.')).toBeVisible()

  const violations = await page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  )
  expect(violations).toEqual([])
})
