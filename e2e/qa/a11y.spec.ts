/**
 * The accessibility sweep behind docs/qa-accessibility.md (story 3.8). Every UI state that
 * EXPERIENCE › State Patterns names, in light and dark, at 320 and 1280 px: 9 × 2 × 2 = 36 axe
 * runs with the WCAG 2 A/AA and 2.1 A/AA tags (the same tags as `expectNoA11yViolations`).
 *
 * Unlike the suite's `expectNoA11yViolations`, which reports only critical violations, the
 * sweep records every violation with its impact, plus axe's "incomplete" (needs review) count.
 * Each run writes `docs/qa-artifacts/a11y/<theme>-<width>-<state>.json`, and `afterAll` folds
 * them into `docs/qa-artifacts/a11y-summary.json` and prints the grid. The pass condition is
 * the exhibit's: zero critical violations in every cell.
 *
 * Each state is reached the way the regular suite reaches it: `failApi` for the toasts, a held
 * `GET /api/tasks` for the skeleton, `colorScheme` for the dark theme (nothing stored, so the
 * app follows the OS). A state is asserted again after axe runs, so a toast or a hold that
 * ended mid-analysis can never pass as that state. CSP-clean is checked by the fixture.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { expect, failApi, stillHeld, test, type Seed } from '../fixtures.ts'

/** Same tags as `AXE_TAGS` in fixtures.ts. */
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const OUT_DIR = fileURLToPath(new URL('../../docs/qa-artifacts/', import.meta.url))
const CELL_DIR = `${OUT_DIR}a11y/`

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
const LONG_WORD = 'x'.repeat(300)
const LONG_TEXT =
  'a long task text that wraps over several lines on a phone screen, so the row grows taller ' +
  'and the age label stays on its first line: https://example.com/a/very/long/url/that/breaks'

const input = (page: Page) => page.getByLabel('New task')
const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rows = (page: Page) => list(page).getByRole('listitem')
const toast = (page: Page, kind: string) => page.locator(`[data-toast-kind="${kind}"]`)
const skeleton = (page: Page) => page.getByTestId('skeleton')
const busy = (page: Page, value: boolean) =>
  expect(page.getByRole('main')).toHaveAttribute('aria-busy', String(value))
const tick = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" done`, exact: true })

/** Open, completed, overdue and long-text rows (EXPERIENCE › State Patterns: a full list). */
async function seedPopulated(seed: Seed): Promise<{ openId: string }> {
  await seed({ text: 'renew the TLS cert', addedAgoMs: 2 * DAY + 30 * MINUTE })
  await seed({ text: LONG_WORD, addedAgoMs: 9 * HOUR })
  await seed({ text: LONG_TEXT, addedAgoMs: 5 * HOUR })
  const open = await seed({ text: 'book the team lunch', addedAgoMs: 2 * HOUR })
  await seed({ text: 'water the plants', addedAgoMs: 10 * MINUTE })
  await seed({ text: 'file expenses', addedAgoMs: 2 * DAY, completedAgoMs: 20 * HOUR })
  await seed({ text: 'reply to Dana', addedAgoMs: 3 * HOUR, completedAgoMs: 5 * MINUTE })
  return { openId: open.id }
}

/** Opens the app and waits for the first load to finish. */
async function open(page: Page): Promise<void> {
  await page.goto('/')
  await busy(page, false)
}

/** Run at the end of each test, pass or fail (`finally`). */
type Cleanups = (() => Promise<void>)[]

/**
 * Holds every `GET /api/tasks` until the test ends, then lets it through: the release goes on
 * `cleanups`, which the test runs in `finally`, so no route is left pending when the page closes.
 */
async function holdGets(page: Page, cleanups: Cleanups): Promise<void> {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  const handler = async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await released
    await route.fallback().catch(() => undefined)
  }
  await page.route('**/api/tasks', handler)
  cleanups.push(async () => {
    release()
    await page.unroute('**/api/tasks', handler)
  })
}

type State = {
  name: string
  /** The state shows one or more toasts, whose contrast is checked by hand. */
  toast?: true
  /** Puts the page in this state; returns the check that the state still holds after axe. */
  reach: (page: Page, seed: Seed, cleanups: Cleanups) => Promise<() => Promise<void>>
}

const STATES: State[] = [
  {
    name: 'empty',
    reach: async (page) => {
      await open(page)
      const check = () => expect(page.getByText(EMPTY_STATE, { exact: true })).toBeVisible()
      await check()
      return check
    },
  },
  {
    name: 'loading-skeleton',
    reach: async (page, seed, cleanups) => {
      await seed({ text: 'slow one', addedAgoMs: HOUR })
      await holdGets(page, cleanups)
      await page.goto('/')
      await busy(page, true)
      await expect(skeleton(page)).toBeVisible()
      return async () => {
        await busy(page, true)
        await expect(skeleton(page)).toBeVisible()
      }
    },
  },
  {
    name: 'populated',
    reach: async (page, seed) => {
      await seedPopulated(seed)
      await open(page)
      const check = () => expect(rows(page)).toHaveCount(7)
      await check()
      return check
    },
  },
  {
    name: 'held-row',
    reach: async (page, seed) => {
      await seedPopulated(seed)
      await open(page)
      await expect(rows(page)).toHaveCount(7)
      await input(page).fill('check SSO timeout setting')
      await input(page).press('Enter')
      await stillHeld(page, 'check SSO timeout setting')
      return async () => {
        await stillHeld(page, 'check SSO timeout setting')
      }
    },
  },
  {
    name: 'action-error-toast',
    toast: true,
    reach: async (page, seed) => {
      const { openId } = await seedPopulated(seed)
      await failApi(page, { method: 'PUT', path: `/api/tasks/${openId}/tick` })
      await open(page)
      await tick(page, 'book the team lunch').click()
      await expect(toast(page, 'action_failed')).toBeVisible()
      // A mouse over the toast pauses its 5 s timer, so it stays up for the whole analysis.
      await toast(page, 'action_failed').hover()
      return () => expect(toast(page, 'action_failed')).toBeVisible()
    },
  },
  {
    name: 'add-failure-toast',
    toast: true,
    reach: async (page, seed) => {
      await seedPopulated(seed)
      await failApi(page, { method: 'POST', path: '/api/tasks' })
      await open(page)
      await input(page).fill('ping Dana about the rollout')
      await input(page).press('Enter')
      await expect(toast(page, 'add_failed')).toBeVisible()
      await toast(page, 'add_failed').hover()
      return () => expect(toast(page, 'add_failed')).toBeVisible()
    },
  },
  {
    name: 'load-failure-toast',
    toast: true,
    reach: async (page, seed) => {
      await seedPopulated(seed)
      await failApi(page, { method: 'GET', path: '/api/tasks' })
      await open(page)
      const check = async () => {
        await expect(toast(page, 'load_failed')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
      }
      await check()
      return check
    },
  },
  {
    name: 'retry-loading',
    toast: true,
    reach: async (page, seed, cleanups) => {
      await seedPopulated(seed)
      const clear = await failApi(page, { method: 'GET', path: '/api/tasks' })
      await open(page)
      await expect(toast(page, 'load_failed')).toBeVisible()
      await clear()
      await holdGets(page, cleanups)
      await page.getByRole('button', { name: 'Retry' }).click()
      await busy(page, true)
      // EXPERIENCE › Load error: Retry shows the skeleton again (after its 300 ms delay).
      await expect(skeleton(page)).toBeVisible()
      return async () => {
        await busy(page, true)
        await expect(skeleton(page)).toBeVisible()
      }
    },
  },
  {
    name: 'row-control-focus',
    reach: async (page, seed) => {
      await seedPopulated(seed)
      await open(page)
      await expect(input(page)).toBeFocused()
      // Keyboard, so the tick ring matches :focus-visible and shows the focus ring.
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      const control = tick(page, LONG_WORD)
      const check = async () => {
        await expect(control).toBeFocused()
        expect(await control.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
      }
      await check()
      return check
    },
  },
]

/** WCAG 2.x relative luminance of an opaque `rgb(r, g, b)` computed colour. */
function luminance(rgb: string): number {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(rgb)
  if (!match) throw new Error(`Not an rgb() colour: ${rgb}`)
  if (match[4] !== undefined && Number(match[4]) !== 1) throw new Error(`Not opaque: ${rgb}`)
  const [r, g, b] = match.slice(1, 4).map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return Math.round(((hi! + 0.05) / (lo! + 0.05)) * 100) / 100
}

/** AA minimums: 4.5:1 for text (SC 1.4.3), 3:1 for a control's graphic (SC 1.4.11). */
const MIN_RATIO = { text: 4.5, graphic: 3 }

/**
 * Axe leaves toast text as "needs review": the toast overlays the list, so it cannot work out
 * the background. The colours are opaque tokens on the toast card itself, so the ratio is
 * computed here from computed styles: each toast's message and Retry label (text), and the
 * stroke of the close button's × glyph (a non-text graphic; the button has no background).
 */
async function toastContrast(page: Page): Promise<Cell['manualContrast']> {
  const pairs = await page.locator('[data-toast-kind]').evaluateAll((toasts) =>
    toasts.flatMap((card) => {
      const bg = getComputedStyle(card).backgroundColor
      const kind = card.getAttribute('data-toast-kind')
      const text = [...card.querySelectorAll('.message, button.retry')].map((el) => ({
        target: `[data-toast-kind="${kind}"] ${el.matches('button') ? '.retry' : '.message'}`,
        kind: 'text' as const,
        fg: getComputedStyle(el).color,
        bg,
      }))
      const glyph = [...card.querySelectorAll('button.close svg path')].map((el) => ({
        target: `[data-toast-kind="${kind}"] .close × glyph`,
        kind: 'graphic' as const,
        fg: getComputedStyle(el).stroke,
        bg,
      }))
      return [...text, ...glyph]
    }),
  )
  return pairs.map((pair) => ({ ...pair, ratio: contrast(pair.fg, pair.bg) }))
}

type Cell = {
  state: string
  theme: 'light' | 'dark'
  width: number
  violations: { id: string; impact: string | null; help: string; targets: string[] }[]
  /** Axe's "needs review" results: what it could not decide, with its reason per node. */
  incomplete: { id: string; impact: string | null; nodes: { target: string; reason: string }[] }[]
  /** Toast contrast, computed by hand where axe needs review (see `MIN_RATIO`). */
  manualContrast: {
    target: string
    kind: 'text' | 'graphic'
    fg: string
    bg: string
    ratio: number
  }[]
  /** This run's id (`QA_RUN_ID`, set by playwright.qa.config.ts): only this run's cells count. */
  runId: string
}

/** One id per `npm run qa`, shared by every worker (inherited from the runner's environment). */
const RUN_ID = process.env.QA_RUN_ID ?? 'unset'

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const

test.afterAll(() => {
  mkdirSync(CELL_DIR, { recursive: true })
  const cells: Cell[] = readdirSync(CELL_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(`${CELL_DIR}${file}`, 'utf8')) as Cell)
    .filter((cell) => cell.runId === RUN_ID)
  const byImpact = Object.fromEntries(
    IMPACTS.map((impact) => [
      impact,
      cells.reduce(
        (sum, cell) => sum + cell.violations.filter((v) => v.impact === impact).length,
        0,
      ),
    ]),
  )
  const rules = new Map<string, { impact: string | null; help: string; cells: string[] }>()
  for (const cell of cells) {
    for (const v of cell.violations) {
      const entry = rules.get(v.id) ?? { impact: v.impact, help: v.help, cells: [] }
      entry.cells.push(`${cell.theme}-${cell.width}-${cell.state}`)
      rules.set(v.id, entry)
    }
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    runId: RUN_ID,
    tags: AXE_TAGS,
    cells: cells.length,
    violationsByImpact: byImpact,
    rules: Object.fromEntries(rules),
    incompleteByRule: cells
      .flatMap((cell) => cell.incomplete)
      .reduce<Record<string, number>>(
        (acc, i) => ({ ...acc, [i.id]: (acc[i.id] ?? 0) + i.nodes.length }),
        {},
      ),
    incompleteNodes: cells.flatMap((cell) =>
      cell.incomplete.flatMap((i) =>
        i.nodes.map((n) => ({
          cell: `${cell.theme}-${cell.width}-${cell.state}`,
          rule: i.id,
          ...n,
        })),
      ),
    ),
    grid: cells.map((cell) => ({
      state: cell.state,
      theme: cell.theme,
      width: cell.width,
      ...Object.fromEntries(
        IMPACTS.map((impact) => [
          impact,
          cell.violations.filter((v) => v.impact === impact).length,
        ]),
      ),
      incomplete: cell.incomplete.reduce((sum, i) => sum + i.nodes.length, 0),
    })),
    manualContrast: cells.flatMap((cell) =>
      cell.manualContrast.map((m) => ({ cell: `${cell.theme}-${cell.width}-${cell.state}`, ...m })),
    ),
  }
  writeFileSync(`${OUT_DIR}a11y-summary.json`, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`a11y sweep: ${cells.length} cells, violations by impact ${JSON.stringify(byImpact)}`)
  console.table(summary.grid)
})

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    for (const width of [320, 1280]) {
      for (const state of STATES) {
        test(`${theme} ${width} px: ${state.name} has no critical violations`, async ({
          page,
          seed,
        }) => {
          const cleanups: Cleanups = []
          try {
            await page.setViewportSize({ width, height: 800 })
            const stillThere = await state.reach(page, seed, cleanups)
            const resolved = await page.evaluate(() =>
              matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
            )
            expect(resolved, 'the emulated OS scheme').toBe(theme)

            const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
            const manualContrast = await toastContrast(page)
            await stillThere()

            const cell: Cell = {
              state: state.name,
              theme,
              width,
              violations: results.violations.map((v) => ({
                id: v.id,
                impact: v.impact ?? null,
                help: v.help,
                targets: v.nodes.map((node) => node.target.join(' ')),
              })),
              incomplete: results.incomplete.map((i) => ({
                id: i.id,
                impact: i.impact ?? null,
                nodes: i.nodes.map((node) => ({
                  target: node.target.join(' '),
                  reason: [...node.any, ...node.all, ...node.none].map((c) => c.message).join(' '),
                })),
              })),
              manualContrast,
              runId: RUN_ID,
            }
            mkdirSync(CELL_DIR, { recursive: true })
            writeFileSync(
              `${CELL_DIR}${theme}-${width}-${state.name}.json`,
              `${JSON.stringify(cell, null, 2)}\n`,
            )

            const critical = cell.violations
              .filter((v) => v.impact === 'critical')
              .map((v) => `${v.id}: ${v.targets.join(', ')}`)
            expect(critical, `Critical axe violations:\n${critical.join('\n')}`).toEqual([])
            if (state.toast) {
              expect(manualContrast.length, 'toast elements checked by hand').toBeGreaterThan(0)
            }
            for (const { target, kind, ratio } of manualContrast) {
              expect(ratio, `${target} contrast`).toBeGreaterThanOrEqual(MIN_RATIO[kind])
            }
          } finally {
            for (const cleanup of cleanups) await cleanup()
          }
        })
      }
    }
  })
}
