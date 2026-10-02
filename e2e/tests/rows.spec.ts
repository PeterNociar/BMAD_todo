/**
 * List rows (story 1.10): tick, untick and delete, one test per row of its E2E matrix, against
 * the test profile. CSP-clean is checked by the fixture at teardown for every test (AD-19).
 */
import { expect, expectNoA11yViolations, failApi, settled, test, type Seed } from '../fixtures.ts'
import type { Locator, Page } from '@playwright/test'

const ACTION_FAILED = "Couldn't update that task. It's back as it was."
const HOUR = 3_600_000
const ID = '[0-9a-f-]{36}'

const input = (page: Page) => page.getByLabel('New task')
const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rows = (page: Page) => list(page).getByRole('listitem')
/** Each row's task text, without its age label (story 2.1). */
const rowTexts = (page: Page) => rows(page).locator('.text')
const toast = (page: Page) => page.locator('[data-toast-kind]')
const tick = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" done`, exact: true })
const untick = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" not done`, exact: true })
const del = (page: Page, text: string) =>
  page.getByRole('button', { name: `Delete "${text}"`, exact: true })
const row = (page: Page, text: string) => rows(page).filter({ has: del(page, text) })

/** Three open tasks, oldest first, plus one completed an hour ago. */
async function seedList(seed: Seed): Promise<void> {
  await seed({ text: 'one', addedAgoMs: 4 * HOUR })
  await seed({ text: 'two', addedAgoMs: 3 * HOUR })
  await seed({ text: 'three', addedAgoMs: 2 * HOUR })
  await seed({ text: 'old done', addedAgoMs: 5 * HOUR, completedAgoMs: HOUR })
}

test('tick: the row moves to the top of the completed tasks, filled and muted, focus on the input', async ({
  page,
  seed,
}) => {
  await seedList(seed)
  await page.goto('/')
  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])

  const done = settled(page, 'PUT', new RegExp(`^/api/tasks/${ID}/tick$`))
  await tick(page, 'two').click()

  await expect(rowTexts(page)).toHaveText(['one', 'three', 'two', 'old done'])
  await expect(untick(page, 'two')).toBeVisible()
  await expect(row(page, 'two').locator('.fill')).toHaveCount(1)
  await expect(row(page, 'two').locator('.text')).toHaveCSS('color', 'rgb(91, 102, 118)')
  await expect(row(page, 'two').locator('.text')).toHaveCSS('text-decoration-line', 'none')
  await expect(row(page, 'one').locator('.text')).toHaveCSS('color', 'rgb(24, 32, 44)')
  await expect(input(page)).toBeFocused()
  expect((await done).status()).toBe(200)

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['one', 'three', 'two', 'old done'])
})

test('untick: the row returns to its original open position', async ({ page, seed }) => {
  await seedList(seed)
  await page.goto('/')
  await tick(page, 'two').click()
  await expect(rowTexts(page)).toHaveText(['one', 'three', 'two', 'old done'])

  const undone = settled(page, 'PUT', new RegExp(`^/api/tasks/${ID}/untick$`))
  await untick(page, 'two').click()

  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])
  await expect(tick(page, 'two')).toBeVisible()
  await expect(input(page)).toBeFocused()
  expect((await undone).status()).toBe(200)

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])
})

test('delete: gone at once with no dialog, and still gone after a reload', async ({
  page,
  seed,
}) => {
  await seedList(seed)
  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs += 1
    void d.dismiss()
  })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(4)

  const deleted = settled(page, 'DELETE', new RegExp(`^/api/tasks/${ID}$`))
  await row(page, 'two').hover()
  await del(page, 'two').click()

  await expect(rowTexts(page)).toHaveText(['one', 'three', 'old done'])
  await expect(input(page)).toBeFocused()
  expect((await deleted).status()).toBe(204)
  expect(dialogs).toBe(0)

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['one', 'three', 'old done'])
})

test('tick rollback: a 503 puts the row back open in place, with the action toast', async ({
  page,
  seed,
}) => {
  await seedList(seed)
  const tasks = await page.request.get('/api/tasks')
  const two = ((await tasks.json()) as { id: string; text: string }[]).find(
    (t) => t.text === 'two',
  )!
  await failApi(page, { method: 'PUT', path: `/api/tasks/${two.id}/tick` })
  await page.goto('/')

  await tick(page, 'two').click()

  await expect(toast(page)).toHaveText(ACTION_FAILED)
  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])
  await expect(tick(page, 'two')).toBeVisible()
})

test('untick rollback: a 503 on a done task leaves it done, with the action toast', async ({
  page,
  seed,
}) => {
  await seedList(seed)
  const tasks = await page.request.get('/api/tasks')
  const done = ((await tasks.json()) as { id: string; text: string }[]).find(
    (t) => t.text === 'old done',
  )!
  await failApi(page, { method: 'PUT', path: `/api/tasks/${done.id}/untick` })
  await page.goto('/')

  await untick(page, 'old done').click()

  await expect(toast(page)).toHaveText(ACTION_FAILED)
  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])
  await expect(untick(page, 'old done')).toBeVisible()
})

test('delete rollback: a 503 brings the row back where it was, with the action toast', async ({
  page,
  seed,
}) => {
  await seedList(seed)
  const tasks = await page.request.get('/api/tasks')
  const two = ((await tasks.json()) as { id: string; text: string }[]).find(
    (t) => t.text === 'two',
  )!
  await failApi(page, { method: 'DELETE', path: `/api/tasks/${two.id}` })
  await page.goto('/')

  await row(page, 'two').hover()
  await del(page, 'two').click()

  await expect(toast(page)).toHaveText(ACTION_FAILED)
  await expect(rowTexts(page)).toHaveText(['one', 'two', 'three', 'old done'])
})

test('keyboard only: Tab + Space ticks, Down moves rows, Tab + Enter deletes; focus returns', async ({
  page,
  seed,
}) => {
  await seed({ text: 'one', addedAgoMs: 3 * HOUR })
  await seed({ text: 'two', addedAgoMs: 2 * HOUR })
  await seed({ text: 'three', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(3)
  await expect(input(page)).toBeFocused()

  await page.keyboard.press('Tab')
  await expect(tick(page, 'one')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(rowTexts(page)).toHaveText(['two', 'three', 'one'])
  await expect(input(page)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'two')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'three')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(del(page, 'three')).toBeFocused()
  await expect(del(page, 'three')).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  await expect(rowTexts(page)).toHaveText(['two', 'one'])
  await expect(input(page)).toBeFocused()
})

test('arrows: Down, Down, Up, Up on row 1, then Esc from a row', async ({ page, seed }) => {
  await seed({ text: 'one', addedAgoMs: 2 * HOUR })
  await seed({ text: 'two', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(2)
  await expect(input(page)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'one')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'two')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(tick(page, 'one')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(input(page)).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'one')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(input(page)).toBeFocused()
})

test('delete reveal (laptop): hidden at rest, shown on hover and on focus within', async ({
  page,
  seed,
}) => {
  await seed({ text: 'one', addedAgoMs: 2 * HOUR })
  await seed({ text: 'two', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(2)
  await page.mouse.move(0, 0)

  await expect(del(page, 'one')).toHaveCSS('opacity', '0')
  await expect(del(page, 'one')).toHaveCSS('pointer-events', 'none')

  await row(page, 'one').hover()
  await expect(del(page, 'one')).toHaveCSS('opacity', '1')
  await expect(del(page, 'one')).toHaveCSS('pointer-events', 'auto')
  await expect(row(page, 'one').locator('.task-row')).toHaveCSS(
    'background-color',
    'rgb(244, 246, 249)',
  )
  await expect(del(page, 'two')).toHaveCSS('opacity', '0')

  await page.mouse.move(0, 0)
  await expect(del(page, 'one')).toHaveCSS('opacity', '0')
  await input(page).press('ArrowDown')
  await expect(tick(page, 'one')).toBeFocused()
  await expect(del(page, 'one')).toHaveCSS('opacity', '1')
  await expect(del(page, 'two')).toHaveCSS('opacity', '0')
})

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('touch delete: always visible, and the hit areas span the row height', async ({
    page,
    seed,
  }) => {
    await seed({ text: 'one', addedAgoMs: HOUR })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(1)

    await expect(del(page, 'one')).toHaveCSS('opacity', '1')
    await expect(del(page, 'one')).toHaveCSS('pointer-events', 'auto')

    const rowBox = (await row(page, 'one').boundingBox())!
    for (const control of [tick(page, 'one'), del(page, 'one')]) {
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
      expect(Math.abs(box.y - rowBox.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(box.y + box.height - (rowBox.y + rowBox.height))).toBeLessThanOrEqual(1)
    }

    await del(page, 'one').tap()
    await expect(rows(page)).toHaveCount(0)
    await expect(input(page)).not.toBeFocused()
  })
})

test('names: Mark "milk" done and Delete "milk", then Mark "milk" not done', async ({
  page,
  seed,
}) => {
  await seed({ text: 'milk', addedAgoMs: HOUR })
  await page.goto('/')

  await expect(tick(page, 'milk')).toHaveAccessibleName('Mark "milk" done')
  await expect(del(page, 'milk')).toHaveAccessibleName('Delete "milk"')

  await tick(page, 'milk').click()
  await expect(untick(page, 'milk')).toHaveAccessibleName('Mark "milk" not done')
})

/**
 * XSS probe (story 3.8 security review, NFR-5, AD-13): markup in task text, seeded through the
 * API so it reaches the page exactly as stored, renders as literal text. No element is created
 * from it, no handler runs, and the fixture's teardown check finds no CSP violation.
 */
test('markup in task text renders as literal text and never runs', async ({ page, seed }) => {
  const payloads = ['<img src=x onerror=alert(1)>', '<script>alert(2)</script>', '"><b>bold</b>']
  for (const [i, text] of payloads.entries()) await seed({ text, addedAgoMs: (3 - i) * HOUR })
  const dialogs: string[] = []
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message())
    void dialog.dismiss()
  })
  await page.goto('/')

  await expect(rowTexts(page)).toHaveText(payloads)
  await expect(list(page).locator('img, script, b')).toHaveCount(0)
  await expect(del(page, payloads[0]!)).toHaveAccessibleName(`Delete "${payloads[0]}"`)
  expect(dialogs).toEqual([])
})

test('long text: a 300-character word wraps at 320 px, with no horizontal scroll', async ({
  page,
  seed,
}) => {
  const word = 'x'.repeat(300)
  await page.setViewportSize({ width: 320, height: 800 })
  await seed({ text: word, addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(1)

  const text = row(page, word).locator('.text')
  const box = (await text.boundingBox())!
  expect(box.height).toBeGreaterThan(40)
  expect(box.x + box.width).toBeLessThanOrEqual(320)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
  await expect(del(page, word)).toBeInViewport()
})

test('sticky clearance: a row control focused from below the fold clears the sticky header', async ({
  page,
  seed,
}) => {
  for (let i = 0; i < 30; i += 1) await seed({ text: `task ${i}`, addedAgoMs: (40 - i) * HOUR })
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(30)
  await expect(input(page)).toBeFocused()

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.keyboard.press('ArrowDown')
  await expect(tick(page, 'task 0')).toBeFocused()

  const header = (await page.getByRole('banner').boundingBox())!
  const box = (await tick(page, 'task 0').boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height - 1)

  // The margin itself tracks the header: a start-aligned scroll (the case Chrome's own focus
  // scroll happens to avoid by centring) still lands the control below the header.
  const margin = await tick(page, 'task 0').evaluate((el) =>
    parseFloat(getComputedStyle(el).scrollMarginTop),
  )
  expect(Math.abs(margin - header.height)).toBeLessThanOrEqual(1)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await tick(page, 'task 0').evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const after = (await tick(page, 'task 0').boundingBox())!
  expect(after.y).toBeGreaterThanOrEqual(header.y + header.height - 1)
})

/** A row's vertical extent in viewport coordinates. */
interface Span {
  top: number
  bottom: number
}

/** What a click did to the rows: their animations, and which rows changed position. */
interface RowMotion {
  /** The duration of every row animation (a row can be animated again by a re-render). */
  durations: number[]
  /** One entry per animated row: its box before the click and after the move. */
  animated: { from: Span; to: Span }[]
  /** Every row whose box moved between the click and the end of its animations. */
  moved: { from: Span; to: Span; animated: boolean }[]
  /** `innerHeight` at click time. */
  viewport: number
}

/**
 * Clicks `button` in the page and reports the row animations (targets inside `[data-task-row]`)
 * it starts. From just before the click, every `Element.animate()` call is recorded and
 * `document.getAnimations()` is sampled at once and on every frame, so an animation that has
 * already finished on a slow runner is still counted. Sampling stops at the first frame with a
 * row animation, or after 1 s (the reduced-motion case, which gets none). Every row's box is read
 * just before the click and again once the animations have finished, to list the rows that moved;
 * it throws if row animations are still running 2 s after sampling stops.
 */
async function rowMotionAfterClick(button: Locator): Promise<RowMotion> {
  const handle = await button.elementHandle()
  return handle!.evaluate(async (el) => {
    const span = (r: DOMRect) => ({ top: r.top, bottom: r.bottom })
    const boxes = () =>
      new Map(
        [...document.querySelectorAll('[data-task-row]')].map((row) => [
          row,
          span(row.getBoundingClientRect()),
        ]),
      )
    // Durations are read when an animation is first seen: Svelte may detach a finished
    // animation's effect (`effect` becomes null) before sampling ends.
    const seen = new Map<Animation, { duration: number; row: Element }>()
    const record = (a: Animation) => {
      if (seen.has(a)) return
      const target = (a.effect as KeyframeEffect | null)?.target
      const duration = Number(a.effect?.getComputedTiming().duration ?? 0)
      const row = target instanceof Element ? target.closest('[data-task-row]') : null
      if (row !== null && duration > 0) seen.set(a, { duration, row })
    }
    const sample = () => {
      for (const a of document.getAnimations()) record(a)
    }
    const viewport = innerHeight
    const before = boxes()
    const animate = Element.prototype.animate
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element['animate']>) {
      const animation = animate.apply(this, args)
      record(animation)
      return animation
    }
    try {
      ;(el as HTMLButtonElement).click()
      sample()
      const deadline = performance.now() + 1_000
      while (seen.size === 0 && performance.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        sample()
      }
    } finally {
      Element.prototype.animate = animate
    }
    // Final boxes are read without the slide's transform, once no row animation is left. (A
    // re-render, e.g. on the server's response, can restart a slide after recording stopped.)
    const settleBy = performance.now() + 2_000
    const animating = () =>
      document.getAnimations().some((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target
        return target instanceof Element && target.closest('[data-task-row]') !== null
      })
    while (animating()) {
      if (performance.now() >= settleBy) throw new Error('row animations did not settle within 2 s')
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const after = boxes()
    const animatedRows = new Set([...seen.values()].map((s) => s.row))
    const moved: { from: Span; to: Span; animated: boolean }[] = []
    for (const [row, from] of before) {
      const to = after.get(row)
      if (to && (to.top !== from.top || to.bottom !== from.bottom))
        moved.push({ from, to, animated: animatedRows.has(row) })
    }
    const durations = [...seen.values()].map((s) => s.duration)
    const animated = [...animatedRows].map((row) => ({
      from: before.get(row) ?? { top: NaN, bottom: NaN },
      to: after.get(row) ?? { top: NaN, bottom: NaN },
    }))
    return { durations, animated, moved, viewport }
  })
}

/** The durations of the row animations a click on `button` starts (see `rowMotionAfterClick`). */
async function animationsAfterClick(button: Locator): Promise<number[]> {
  return (await rowMotionAfterClick(button)).durations
}

test('motion: tick slides the rows for about 200 ms', async ({ page, seed }) => {
  await seed({ text: 'one', addedAgoMs: 2 * HOUR })
  await seed({ text: 'two', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(2)

  const durations = await animationsAfterClick(tick(page, 'one'))

  expect(durations.length).toBeGreaterThan(0)
  for (const d of durations) expect(d).toBe(200)
  await expect(rowTexts(page)).toHaveText(['two', 'one'])
})

test('motion: only rows on screen slide', async ({ page, seed }) => {
  for (let i = 0; i < 40; i += 1) await seed({ text: `task ${i}`, addedAgoMs: (50 - i) * HOUR })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(40)

  // The first open row drops to the end of the list and every other row moves up one slot.
  const { durations, animated, moved, viewport } = await rowMotionAfterClick(tick(page, 'task 0'))

  const onScreen = (s: { top: number; bottom: number }) => s.bottom > 0 && s.top < viewport
  expect(animated.length).toBeGreaterThan(0)
  expect(moved).toHaveLength(40)
  expect(animated.length).toBeLessThan(moved.length)
  for (const d of durations) expect(d).toBe(200)
  // Off-screen rows never slide, and every moved row on screen (before or after) does.
  for (const a of animated) {
    expect(onScreen(a.from) || onScreen(a.to), JSON.stringify(a)).toBe(true)
  }
  for (const m of moved) {
    if (onScreen(m.from) || onScreen(m.to)) expect(m.animated, JSON.stringify(m)).toBe(true)
  }
  await expect(rowTexts(page).last()).toHaveText('task 0')
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('reduced motion: rows move with no transition', async ({ page, seed }) => {
    await seed({ text: 'one', addedAgoMs: 2 * HOUR })
    await seed({ text: 'two', addedAgoMs: HOUR })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(2)

    expect(await animationsAfterClick(tick(page, 'one'))).toEqual([])
    await expect(rowTexts(page)).toHaveText(['two', 'one'])
  })
})

test('reduced motion: a change after load applies to the next tick', async ({ page, seed }) => {
  await seed({ text: 'one', addedAgoMs: 2 * HOUR })
  await seed({ text: 'two', addedAgoMs: HOUR })
  await page.goto('/')
  await expect(rows(page)).toHaveCount(2)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await animationsAfterClick(tick(page, 'one'))).toEqual([])
  await expect(rowTexts(page)).toHaveText(['two', 'one'])
})

for (const width of [320, 1280]) {
  test(`a11y at ${width} px: no critical violations with long text and completed rows`, async ({
    page,
    seed,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await seed({ text: 'y'.repeat(300), addedAgoMs: 2 * HOUR })
    await seed({
      text: 'https://example.com/a/very/long/url/that/must/break/anywhere/x',
      addedAgoMs: HOUR,
    })
    await seed({
      text: 'finished one',
      addedAgoMs: 3 * HOUR,
      completedAgoMs: HOUR,
    })
    await page.goto('/')
    await expect(rows(page)).toHaveCount(3)
    await expect(untick(page, 'finished one')).toBeVisible()

    await expectNoA11yViolations(page)
    await row(page, 'finished one').hover()
    await expectNoA11yViolations(page)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })
}
