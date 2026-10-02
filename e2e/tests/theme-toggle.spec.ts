/**
 * The header theme toggle (story 3.5, CAP-11), against the test profile: one test per row of
 * the plan's I/O matrix. The OS scheme comes from Playwright's `colorScheme` and, for a live
 * flip, `page.emulateMedia`. Desktop Chrome has `hover: hover`, so a click is a laptop pointer
 * activation. CSP-clean is checked by the fixture at teardown for every test (AD-19).
 */
import {
  expect,
  expectNoA11yViolations,
  recordThemeAtBody,
  test,
  themeAtBody,
} from '../fixtures.ts'
import type { Locator, Page } from '@playwright/test'

/** DESIGN bg-dark `#0E131A` and bg `#F2F4F7`, as computed CSS colours. */
const BG_DARK = 'rgb(14, 19, 26)'
const BG_LIGHT = 'rgb(242, 244, 247)'
const TO_DARK = 'Switch to dark theme'
const TO_LIGHT = 'Switch to light theme'

const toggle = (page: Page) => page.getByRole('button', { name: /^Switch to (dark|light) theme$/ })
const input = (page: Page) => page.getByLabel('New task')

const dataTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const storedTheme = (page: Page) => page.evaluate(() => localStorage.getItem('theme'))

/** Emulates the OS scheme and waits until the page's media query reports it. */
async function setOsScheme(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme })
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
    .toBe(scheme === 'dark')
}

async function open(page: Page): Promise<void> {
  await page.goto('/')
  await expect(input(page)).toBeFocused()
}

/** Retrying: the name, exactly one filled segment (the current theme), and the page tokens. */
async function expectTheme(page: Page, mode: 'light' | 'dark'): Promise<void> {
  await expect(toggle(page)).toHaveAccessibleName(mode === 'dark' ? TO_LIGHT : TO_DARK)
  await expect(toggle(page).locator('.seg.on')).toHaveCount(1)
  await expect(toggle(page).locator(`.seg[data-segment="${mode}"]`)).toHaveClass(/\bon\b/)
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    mode === 'dark' ? BG_DARK : BG_LIGHT,
  )
}

test.describe('on a light OS', () => {
  test.use({ colorScheme: 'light' })

  test('first visit: light, named "Switch to dark theme", the sun active', async ({ page }) => {
    await open(page)

    await expect(toggle(page)).toHaveCount(1)
    await expect(toggle(page)).not.toHaveAttribute('aria-pressed')
    await expectTheme(page, 'light')
    expect(await dataTheme(page)).toBeNull()
  })

  test('a click applies and stores dark, flips the name, and focus returns to the input', async ({
    page,
  }) => {
    await open(page)

    await toggle(page).click()

    await expect(input(page)).toBeFocused()
    expect(await dataTheme(page)).toBe('dark')
    expect(await storedTheme(page)).toBe('dark')
    await expectTheme(page, 'dark')
  })

  test('Enter or Space flips the theme and focus stays on the toggle', async ({ page }) => {
    await open(page)
    await page.keyboard.press('Shift+Tab')
    await expect(toggle(page)).toBeFocused()

    await page.keyboard.press('Enter')
    await expectTheme(page, 'dark')
    await expect(toggle(page)).toBeFocused()

    await page.keyboard.press('Space')
    await expectTheme(page, 'light')
    await expect(toggle(page)).toBeFocused()
    expect(await storedTheme(page)).toBe('light')
  })

  test('survives a reload: dark is set before <body> exists, and the toggle shows dark', async ({
    page,
  }) => {
    await recordThemeAtBody(page)
    await open(page)
    expect(await themeAtBody(page)).toBeNull()
    await toggle(page).click()
    await expectTheme(page, 'dark')

    await page.reload()
    await expect(input(page)).toBeFocused()

    expect(await themeAtBody(page)).toBe('dark')
    await expectTheme(page, 'dark')
  })

  test('tab order: Shift+Tab from the input reaches the toggle', async ({ page }) => {
    await open(page)

    await page.keyboard.press('Shift+Tab')

    await expect(toggle(page)).toBeFocused()
  })

  test('storage that throws on write: the theme flips for the session, no error', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('blocked', 'QuotaExceededError')
      }
    })
    await open(page)

    await toggle(page).click()

    await expectTheme(page, 'dark')
    expect(await dataTheme(page)).toBe('dark')
    expect(await storedTheme(page)).toBeNull()
    expect(errors).toEqual([])
  })
})

test.describe('on a dark OS', () => {
  test.use({ colorScheme: 'dark' })

  test('first visit: dark, named "Switch to light theme", the moon active', async ({ page }) => {
    await open(page)

    await expectTheme(page, 'dark')
    expect(await dataTheme(page)).toBeNull()
  })
})

// The stored choice ends up different from the OS, so following the system would show.
for (const [os, stored, flip] of [
  ['light', 'dark', ['dark', 'light']],
  ['dark', 'light', ['light', 'dark']],
] as const) {
  test.describe(`no way back on a ${os} OS`, () => {
    test.use({ colorScheme: os })

    test(`stored ${stored} stays ${stored} when the OS flips to ${flip.join(' then ')}`, async ({
      page,
    }) => {
      await open(page)
      await toggle(page).click()
      await expectTheme(page, stored)
      expect(await storedTheme(page)).toBe(stored)

      for (const scheme of flip) {
        await setOsScheme(page, scheme)
        await expectTheme(page, stored)
      }
      expect(await dataTheme(page)).toBe(stored)
      expect(await storedTheme(page)).toBe(stored)
    })
  })
}

for (const mode of ['light', 'dark'] as const) {
  test.describe(`a11y under the ${mode} theme`, () => {
    test.use({ colorScheme: mode })

    for (const width of [320, 1280]) {
      test(`no critical axe violations at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto('/')
        await expect(toggle(page)).toBeVisible()
        await expectTheme(page, mode)

        await expectNoA11yViolations(page)
      })
    }
  })
}

// Fills, box-shadows and the inset hairline drop under forced colours, so outlines carry the
// state: the active segment's `CanvasText` outline (ThemeToggle) and App's transparent input
// ring, which forced colours repaint. jsdom ignores media queries, so only E2E can pin these.
test.describe('under forced colours', () => {
  test.use({ forcedColors: 'active' })

  const outline = (locator: Locator) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el)
      return { style: style.outlineStyle, width: style.outlineWidth }
    })

  test('the active segment has a 1 px solid outline and the other none', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)

    await expect(toggle(page).locator('.seg.on')).toHaveCount(1)
    expect(await outline(toggle(page).locator('.seg.on'))).toEqual({ style: 'solid', width: '1px' })
    expect((await outline(toggle(page).locator('.seg:not(.on)'))).style).toBe('none')
  })

  test('the focused input keeps a visible outline', async ({ page }) => {
    await open(page)

    // `solid` is App's own ring (Chrome's default focus ring is `auto`), and it has a width.
    const { style, width } = await outline(input(page))
    expect(style).toBe('solid')
    expect(width).not.toBe('0px')
  })
})
