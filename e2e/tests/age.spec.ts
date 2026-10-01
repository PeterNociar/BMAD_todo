/**
 * The age label on every row (story 2.1): one test per E2E row of its matrix, against the
 * test profile. Time moves only through `advance` (page and server together, AD-8/AD-14).
 * CSP-clean is checked by the fixture at teardown for every test (AD-19).
 */
import { expect, expectNoA11yViolations, test } from '../fixtures.ts'
import type { Locator, Page } from '@playwright/test'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const TEXT_SECONDARY = 'rgb(71, 82, 99)'
const TEXT_MUTED = 'rgb(91, 102, 118)'

const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rows = (page: Page) => list(page).getByRole('listitem')
const ageLabel = (page: Page) => rows(page).locator('.age')
const ageWords = (page: Page) => rows(page).locator('[data-age-words]')

/** The width of `9ch` in the label's own font. */
function nineCh(label: Locator): Promise<number> {
  return label.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.cssText = 'display: inline-block; width: 9ch'
    el.appendChild(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  })
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
}

test('live: a 5 h task reads 5h, then 6h after an hour, with no reload', async ({
  page,
  seed,
  advance,
}) => {
  await seed({ text: 'aged', addedAgoMs: 5 * HOUR })
  await page.goto('/')

  await expect(ageLabel(page)).toHaveText(['5h'])
  await expect(ageLabel(page)).toHaveAttribute('aria-hidden', 'true')
  await expect(ageWords(page)).toHaveText([', added 5 hours ago'])
  // Assistive tech meets the task text, a comma pause, then the age in words; never the short
  // label. (The hidden span is its own box, so the tree separates it from the text by a space.)
  await expect(rows(page)).toMatchAriaSnapshot(`
    - listitem:
      - button "Mark \\"aged\\" done"
      - text: aged , added 5 hours ago
      - button "Delete \\"aged\\""
  `)

  let loads = 0
  page.on('load', () => loads++)
  await advance(HOUR)

  await expect(ageLabel(page)).toHaveText(['6h'])
  await expect(ageWords(page)).toHaveText([', added 6 hours ago'])
  expect(loads).toBe(0)
})

test('visual: mono, tabular, right-aligned 9ch column, secondary open and muted done', async ({
  page,
  seed,
}) => {
  await seed({ text: 'open', addedAgoMs: 5 * MINUTE })
  await seed({ text: 'closed', addedAgoMs: 120 * DAY, completedAgoMs: 100 * DAY })
  await page.goto('/')
  await expect(ageLabel(page)).toHaveText(['5m', 'done 100d'])

  const [open, done] = [ageLabel(page).nth(0), ageLabel(page).nth(1)]
  for (const label of [open, done]) {
    await expect(label).toHaveCSS('text-align', 'right')
    await expect(label).toHaveCSS('font-family', /^"JetBrains Mono"/)
    await expect(label).toHaveCSS('font-size', '12px')
    await expect(label).toHaveCSS('font-variant-numeric', 'tabular-nums')
    const box = (await label.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual((await nineCh(label)) - 0.5)
  }
  await expect(open).toHaveCSS('color', TEXT_SECONDARY)
  await expect(done).toHaveCSS('color', TEXT_MUTED)

  // Labels of different lengths share one right edge.
  const [a, b] = [(await open.boundingBox())!, (await done.boundingBox())!]
  expect(Math.abs(a.x + a.width - (b.x + b.width))).toBeLessThan(0.5)
})

test('not live: neither live region is written while the label changes', async ({
  page,
  seed,
  advance,
}) => {
  await seed({ text: 'quiet', addedAgoMs: 23 * HOUR + 59 * MINUTE })
  await page.goto('/')
  await expect(ageLabel(page)).toHaveText(['23h'])

  const observed = await page.evaluate(() => {
    const writes: string[] = []
    ;(window as unknown as { __liveWrites: string[] }).__liveWrites = writes
    const regions = document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')
    for (const region of regions) {
      new MutationObserver((records) => {
        for (const record of records) writes.push(`${record.type}: ${region.textContent ?? ''}`)
      }).observe(region, { subtree: true, childList: true, characterData: true })
    }
    return regions.length
  })
  expect(observed).toBe(2)

  await advance(2 * MINUTE)
  await expect(ageLabel(page)).toHaveText(['1d'])

  const writes = await page.evaluate(
    () => (window as unknown as { __liveWrites: string[] }).__liveWrites,
  )
  expect(writes).toEqual([])
})

test('wide label: done 100d is from completed_at and fits at 320 px beside long text', async ({
  page,
  seed,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await seed({ text: 'w'.repeat(300), addedAgoMs: 3 * HOUR })
  await seed({ text: 'ancient', addedAgoMs: 120 * DAY, completedAgoMs: 100 * DAY })
  await page.goto('/')

  await expect(ageLabel(page)).toHaveText(['3h', 'done 100d'])
  await expect(ageWords(page)).toHaveText([', added 3 hours ago', ', completed 100 days ago'])
  await expect(ageLabel(page).nth(0)).toBeInViewport({ ratio: 1 })
  await expect(ageLabel(page).nth(1)).toBeInViewport({ ratio: 1 })
  await expectNoHorizontalScroll(page)
  await expectNoA11yViolations(page)
})
