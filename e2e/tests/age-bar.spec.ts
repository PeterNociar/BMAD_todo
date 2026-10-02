/**
 * The age bar and the live overdue cue (story 2.3): one test per row of its E2E matrix, against
 * the test profile. Time moves through `advance` (page and server together, AD-8/AD-14), except
 * the future-timestamp test, which uses `skewServer`, the one deliberate exception. CSP-clean is
 * checked by the fixture at teardown for every test (AD-19), including the pages the time-zone
 * test opens itself; the bar's colour reaching CSS at all proves the CSSOM path survives the CSP.
 */
import {
  expect,
  expectBarColour,
  expectNoA11yViolations,
  near,
  preparePage,
  settled,
  test,
} from '../fixtures.ts'
import { devices, type Page } from '@playwright/test'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** `ageColour(…, 'light')`, as computed CSS colours (DESIGN age-1h, age-12h, age-24h). */
const FRESH = 'rgb(36, 144, 87)'
const AGE_12H = 'rgb(143, 117, 6)'
/** 12 h 30 m (`#927302`). */
const AGE_12H30 = 'rgb(146, 115, 2)'
const OVERDUE = 'rgb(196, 63, 62)'
const input = (page: Page) => page.getByLabel('New task')
const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rows = (page: Page) => list(page).getByRole('listitem')
const rowTexts = (page: Page) => rows(page).locator('.text')
const ageLabels = (page: Page) => rows(page).locator('.age')
const row = (page: Page, text: string) =>
  rows(page).filter({
    has: page.getByRole('button', { name: `Delete "${text}"`, exact: true }),
  })
const bar = (page: Page, text: string) => row(page, text).locator('[data-age-bar]')

/** Starts recording every write to the two live regions; `liveWrites` reads them back. */
async function watchLiveRegions(page: Page): Promise<void> {
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
}

function liveWrites(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __liveWrites: string[] }).__liveWrites)
}

test('bar colour: a 12 h task has a 3 px full-height bar on the left edge in the 12 h colour', async ({
  page,
  seed,
}) => {
  await seed({ text: 'half day', addedAgoMs: 12 * HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['12h'])

  const el = bar(page, 'half day')
  await expect(el).toHaveCount(1)
  await expect(el).toHaveAttribute('aria-hidden', 'true')
  await expectBarColour(el, AGE_12H)

  const barBox = (await el.boundingBox())!
  const rowBox = (await row(page, 'half day').locator('.task-row').boundingBox())!
  expect(barBox.width).toBeCloseTo(3, 1)
  expect(barBox.height).toBeCloseTo(rowBox.height, 1)
  expect(barBox.x).toBeCloseTo(rowBox.x, 1)
  expect(barBox.y).toBeCloseTo(rowBox.y, 1)
  // It sits in the 15 px inset, clear of the tick ring.
  const tickBox = (await row(page, 'half day').locator('.tick').boundingBox())!
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(tickBox.x)
})

test('no bar when done: a completed task renders no bar element', async ({ page, seed }) => {
  await seed({ text: 'open', addedAgoMs: 2 * HOUR })
  await seed({ text: 'closed', addedAgoMs: 3 * HOUR, completedAgoMs: HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['2h', 'done 1h'])

  await expect(bar(page, 'open')).toHaveCount(1)
  await expect(bar(page, 'closed')).toHaveCount(0)
})

test('UJ-3: a task crossing 24 h turns overdue and reads 1d in place, unannounced, focus kept', async ({
  page,
  seed,
  advance,
}) => {
  await seed({ text: 'older', addedAgoMs: 2 * DAY })
  // A full minute before the boundary, so a slow stack can't cross before the `23h` check.
  await seed({ text: 'crossing', addedAgoMs: 23 * HOUR + 59 * MINUTE })
  await seed({ text: 'newer', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['2d', '23h', '1h'])
  await expect(input(page)).toBeFocused()

  // Tag the row's element, to prove the same element is still there afterwards (no remount).
  await row(page, 'crossing').evaluate((el) => el.setAttribute('data-uj3', ''))
  await watchLiveRegions(page)

  await advance(MINUTE)

  await expect(row(page, 'crossing').locator('.age')).toHaveText('1d')
  // At 23 h 59 m the colour is already within a unit of overdue, so this check can't see a
  // change: here the live recompute is proved by the label, and the live recolour by the
  // TaskRow unit test (12 h → 24 h on `clock.sample()`).
  await expectBarColour(bar(page, 'crossing'), OVERDUE)
  await expect(rowTexts(page)).toHaveText(['older', 'crossing', 'newer'])
  await expect(rows(page).nth(1)).toHaveAttribute('data-uj3', '')
  expect(await liveWrites(page)).toEqual([])
  await expect(input(page)).toBeFocused()
})

test('time zone: the same seed reads identically under UTC and Pacific/Kiritimati', async ({
  browser,
  baseURL,
  seed,
}) => {
  // Every age is mid-unit, with minutes of slack either side, across two sequential views.
  await seed({ text: 'two days', addedAgoMs: 2 * DAY + 30 * MINUTE })
  await seed({ text: 'mid', addedAgoMs: 12 * HOUR + 30 * MINUTE })
  await seed({ text: 'fresh', addedAgoMs: 12 * MINUTE + 30_000 })
  await seed({ text: 'done', addedAgoMs: 5 * HOUR, completedAgoMs: 3 * HOUR + 30 * MINUTE })

  async function view(timezoneId: string) {
    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      baseURL,
      timezoneId,
    })
    const page = await context.newPage()
    let checkCsp: (() => void) | undefined
    try {
      checkCsp = await preparePage(page)
      await page.goto('/')
      await expect(rows(page)).toHaveCount(4)
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe(
        timezoneId,
      )
      return await rows(page).evaluateAll((items) =>
        items.map((li) => {
          const el = li.querySelector('[data-age-bar]')
          return {
            text: li.querySelector('.text')?.textContent ?? null,
            label: li.querySelector('.age')?.textContent ?? null,
            bar: el ? getComputedStyle(el).backgroundColor : null,
          }
        }),
      )
    } finally {
      // Let any late CSP report arrive, then check and close even if an assertion failed.
      await page.waitForTimeout(100).catch(() => {})
      try {
        checkCsp?.()
      } finally {
        await context.close()
      }
    }
  }

  const utc = await view('UTC')
  const kiritimati = await view('Pacific/Kiritimati') // UTC+14
  const expected = [
    { text: 'two days', label: '2d', bar: OVERDUE },
    { text: 'mid', label: '12h', bar: AGE_12H30 },
    { text: 'fresh', label: '12m', bar: FRESH },
    { text: 'done', label: 'done 3h', bar: null },
  ]
  for (const seen of [utc, kiritimati]) {
    expect(seen.map(({ text, label }) => ({ text, label }))).toEqual(
      expected.map(({ text, label }) => ({ text, label })),
    )
    seen.forEach((r, i) => {
      const want = expected[i].bar
      if (want === null) expect(r.bar).toBeNull()
      else expect(near(r.bar, want), `${r.text}: ${r.bar} vs ${want}`).toBe(true)
    })
  }
  expect(kiritimati.map(({ text, label }) => ({ text, label }))).toEqual(
    utc.map(({ text, label }) => ({ text, label })),
  )
})

test('future: with the server an hour ahead, a task added in the UI reads now, in fresh', async ({
  page,
  skewServer,
}) => {
  await skewServer(HOUR)
  await page.goto('/')
  await expect(page.getByText('Nothing waiting.', { exact: false })).toBeVisible()

  const created = settled(page, 'POST', /^\/api\/tasks$/)
  await input(page).fill('ahead')
  await input(page).press('Enter')
  const response = await created
  expect(response.status()).toBe(201)

  // The confirmed added_at really is in the browser's future.
  const { added_at } = (await response.json()) as { added_at: string }
  const browserNow = await page.evaluate(() => Date.now())
  expect(Date.parse(added_at) - browserNow).toBeGreaterThan(55 * MINUTE)

  await expect(row(page, 'ahead').locator('.age')).toHaveText('now')
  await expect(row(page, 'ahead').locator('[data-age-words]')).toHaveText(', added just now')
  await expectBarColour(bar(page, 'ahead'), FRESH)
})

test('shared counter: skewServer(1 h) then advance(1 h) puts the server 2 h ahead', async ({
  page,
  skewServer,
  advance,
}) => {
  await page.goto('/')
  await expect(page.getByText('Nothing waiting.', { exact: false })).toBeVisible()
  await skewServer(HOUR)
  await advance(HOUR)

  const created = settled(page, 'POST', /^\/api\/tasks$/)
  await input(page).fill('counted')
  await input(page).press('Enter')
  const response = await created
  expect(response.status()).toBe(201)

  // advance kept the skew: the server is 2 h past the real wall clock, the browser 1 h.
  const { added_at } = (await response.json()) as { added_at: string }
  const ahead = Date.parse(added_at) - Date.now()
  expect(ahead).toBeGreaterThan(2 * HOUR - MINUTE)
  expect(ahead).toBeLessThan(2 * HOUR + MINUTE)
  await expect(row(page, 'counted').locator('.age')).toHaveText('now')
})

test('tick 2-day: the ticked task reads done now and has no bar', async ({ page, seed }) => {
  await seed({ text: 'three days', addedAgoMs: 3 * DAY })
  await seed({ text: 'two days', addedAgoMs: 2 * DAY })
  await seed({ text: 'an hour', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['3d', '2d', '1h'])
  await expectBarColour(bar(page, 'two days'), OVERDUE)

  const ticked = settled(page, 'PUT', /\/tick$/)
  await page.getByRole('button', { name: 'Mark "two days" done', exact: true }).click()
  expect((await ticked).status()).toBe(200)

  await expect(rowTexts(page)).toHaveText(['three days', 'an hour', 'two days'])
  await expect(row(page, 'two days').locator('.age')).toHaveText('done now')
  await expect(bar(page, 'two days')).toHaveCount(0)
})

test('untick: it returns to index 1 with 2d and the overdue colour', async ({ page, seed }) => {
  await seed({ text: 'three days', addedAgoMs: 3 * DAY })
  await seed({ text: 'two days', addedAgoMs: 2 * DAY })
  await seed({ text: 'an hour', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['3d', '2d', '1h'])

  const ticked = settled(page, 'PUT', /\/tick$/)
  await page.getByRole('button', { name: 'Mark "two days" done', exact: true }).click()
  expect((await ticked).status()).toBe(200)
  await expect(bar(page, 'two days')).toHaveCount(0)

  const unticked = settled(page, 'PUT', /\/untick$/)
  await page.getByRole('button', { name: 'Mark "two days" not done', exact: true }).click()
  expect((await unticked).status()).toBe(200)

  await expect(rowTexts(page)).toHaveText(['three days', 'two days', 'an hour'])
  await expect(rowTexts(page).nth(1)).toHaveText('two days')
  await expect(row(page, 'two days').locator('.age')).toHaveText('2d')
  await expectBarColour(bar(page, 'two days'), OVERDUE)
})

test('a11y: no critical axe violations at 1280 px with open and done rows', async ({
  page,
  seed,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await seed({ text: 'overdue', addedAgoMs: 2 * DAY })
  await seed({ text: 'midway', addedAgoMs: 12 * HOUR })
  await seed({ text: 'fresh', addedAgoMs: 5 * MINUTE })
  await seed({ text: 'finished', addedAgoMs: 3 * HOUR, completedAgoMs: HOUR })
  await page.goto('/')
  await expect(ageLabels(page)).toHaveText(['2d', '12h', '5m', 'done 1h'])
  await expect(list(page).locator('[data-age-bar]')).toHaveCount(3)

  await expectNoA11yViolations(page)
})
