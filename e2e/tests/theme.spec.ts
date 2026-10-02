/**
 * The dark theme and the pre-paint theme script (story 3.4, CAP-11), against the test profile.
 * The OS scheme comes from Playwright's `colorScheme`; a stored choice is put in localStorage
 * by an init script, which runs before the page's own scripts, so public/theme-init.js finds
 * it. CSP-clean is checked by the fixture at teardown for every test (AD-19).
 */
import { expect, test } from '../fixtures.ts'
import type { Locator, Page } from '@playwright/test'

const HOUR = 3_600_000
/** DESIGN bg-dark `#0E131A` and bg `#F2F4F7`, as computed CSS colours. */
const BG_DARK = 'rgb(14, 19, 26)'
const BG_LIGHT = 'rgb(242, 244, 247)'
/** DESIGN text-primary-dark `#E4E9EF`. */
const TEXT_DARK = 'rgb(228, 233, 239)'
/** `ageColour(…, 'dark')` and `ageColour(…, 'light')` for a 1 h task: DESIGN age-1h-dark and age-1h. */
const FRESH_DARK = 'rgb(85, 196, 131)'
const FRESH_LIGHT = 'rgb(36, 144, 87)'
/** Per-channel tolerance: the colour moves continuously with real time between seed and read. */
const CHANNEL_TOLERANCE = 2

const rows = (page: Page) => page.getByRole('list', { name: 'Tasks' }).getByRole('listitem')
const bar = (page: Page) => rows(page).first().locator('[data-age-bar]')

function channels(rgb: string): number[] {
  const match = /^rgba?\((\d+), (\d+), (\d+)/.exec(rgb)
  if (!match) throw new Error(`Not an rgb() colour: ${rgb}`)
  return match.slice(1, 4).map(Number)
}

/** True when every channel of `actual` is within ±2 of `expected`. */
function near(actual: string | null, expected: string): boolean {
  if (actual === null || !/^rgba?\(/.test(actual)) return false
  const [a, e] = [channels(actual), channels(expected)]
  return a.every((v, i) => Math.abs(v - e[i]) <= CHANNEL_TOLERANCE)
}

/** Polls the bar's computed background until each channel is within ±2 of `expected`. */
async function expectBarColour(el: Locator, expected: string): Promise<void> {
  await expect
    .poll(async () => {
      const actual = await el.evaluate((e) => getComputedStyle(e).backgroundColor)
      return near(actual, expected) ? expected : actual
    })
    .toBe(expected)
}

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

/** The `data-theme` attribute on `<html>`, or null. */
const dataTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'))

/**
 * Stores `value` under the `'theme'` key before the page's scripts run, and records `data-theme`
 * on `<html>` at the moment `<body>` is inserted (`window.__themeAtBody`).
 */
async function storeThemeBeforeLoad(page: Page, value: string): Promise<void> {
  await page.addInitScript((stored) => {
    try {
      localStorage.setItem('theme', stored)
    } catch {
      // about:blank and other opaque origins have no storage.
    }
    const w = window as unknown as { __themeAtBody?: string | null }
    const observer = new MutationObserver(() => {
      if (!document.body) return
      w.__themeAtBody = document.documentElement.getAttribute('data-theme')
      observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  }, value)
}

const themeAtBody = (page: Page) =>
  page.evaluate(() => (window as unknown as { __themeAtBody?: string | null }).__themeAtBody)

test.describe('on a dark OS', () => {
  test.use({ colorScheme: 'dark' })

  test('nothing stored: dark tokens and the dark age colour, with no data-theme', async ({
    page,
    seed,
  }) => {
    await seed({ text: 'fresh', addedAgoMs: HOUR })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(1)

    expect(await dataTheme(page)).toBeNull()
    expect(await bodyBackground(page)).toBe(BG_DARK)
    expect(await page.evaluate(() => getComputedStyle(document.body).color)).toBe(TEXT_DARK)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'dark',
    )
    await expectBarColour(bar(page), FRESH_DARK)
  })

  test('stored light: light tokens and the light age colour, the media query overridden', async ({
    page,
    seed,
  }) => {
    await storeThemeBeforeLoad(page, 'light')
    await seed({ text: 'fresh', addedAgoMs: HOUR })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(1)

    expect(await themeAtBody(page)).toBe('light')
    expect(await bodyBackground(page)).toBe(BG_LIGHT)
    await expectBarColour(bar(page), FRESH_LIGHT)
  })

  test('an invalid stored value counts as nothing stored', async ({ page }) => {
    await storeThemeBeforeLoad(page, 'blue')
    await page.goto('/')
    await expect(page.getByLabel('New task')).toBeVisible()

    expect(await themeAtBody(page)).toBeNull()
    expect(await bodyBackground(page)).toBe(BG_DARK)
  })

  test('storage that throws on read: the system theme applies, no error escapes', async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException('blocked', 'SecurityError')
      }
    })
    await page.goto('/')
    await expect(page.getByLabel('New task')).toBeVisible()

    expect(await dataTheme(page)).toBeNull()
    expect(await bodyBackground(page)).toBe(BG_DARK)
    expect(errors).toEqual([])
  })
})

test.describe('on a light OS', () => {
  test.use({ colorScheme: 'light' })

  test('stored dark: data-theme is set before <body> exists, and dark tokens apply', async ({
    page,
    seed,
  }) => {
    await storeThemeBeforeLoad(page, 'dark')
    await seed({ text: 'fresh', addedAgoMs: HOUR })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(1)

    expect(await themeAtBody(page)).toBe('dark')
    expect(await dataTheme(page)).toBe('dark')
    expect(await bodyBackground(page)).toBe(BG_DARK)
    await expectBarColour(bar(page), FRESH_DARK)
  })

  test('nothing stored: light tokens', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('New task')).toBeVisible()

    expect(await dataTheme(page)).toBeNull()
    expect(await bodyBackground(page)).toBe(BG_LIGHT)
  })
})

test('the pre-paint script is the first script in <head>, loaded from its own file', async ({
  request,
}) => {
  const html = await (await request.get('/')).text()
  const head = html.slice(0, html.indexOf('</head>'))
  const firstScript = /<script\b[^>]*>/.exec(head)?.[0]
  expect(firstScript).toBe('<script src="/theme-init.js">')
  expect(head.indexOf('theme-init.js')).toBeLessThan(head.indexOf('rel="stylesheet"'))

  const script = await request.get('/theme-init.js')
  expect(script.status()).toBe(200)
  expect(script.headers()['content-type']).toContain('javascript')
})

test('index.html preloads the three latin woff2 faces, and each is served', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const links = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map((m) => m[0])
  expect(links).toHaveLength(3)

  const hrefs = links.map((link) => /href="([^"]+)"/.exec(link)?.[1])
  for (const [i, face] of [
    'inter-latin-400-normal',
    'inter-latin-600-normal',
    'jetbrains-mono-latin-400-normal',
  ].entries()) {
    expect(hrefs[i]).toMatch(new RegExp(`^/assets/${face}-[\\w-]+\\.woff2$`))
    expect(links[i]).toContain('as="font"')
    expect(links[i]).toContain('type="font/woff2"')
    expect(links[i]).toMatch(/\bcrossorigin\b/)
  }
  for (const href of hrefs) {
    const font = await request.get(href!)
    expect(font.status(), href).toBe(200)
  }
})

test('the browser fetches each preloaded face exactly once, with 200, CSP-clean', async ({
  page,
}) => {
  // Every woff2 response per path: a preload whose URL or mode (crossorigin) didn't match the
  // @font-face request would show up as a second download, or as an unpreloaded path.
  const fonts = new Map<string, number[]>()
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.endsWith('.woff2')) fonts.set(path, [...(fonts.get(path) ?? []), response.status()])
  })
  await page.goto('/')
  const hrefs = await page
    .locator('link[rel="preload"][as="font"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!))
  expect(hrefs).toHaveLength(3)

  // Wait for the page's fonts to finish loading, so any second request has been made.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await expect.poll(() => [...fonts.keys()].sort()).toEqual([...hrefs].sort())
  for (const href of hrefs) expect(fonts.get(href), href).toEqual([200])
})
