/**
 * User journeys end to end (story 3.7): UJ-1 to UJ-3 from EXPERIENCE › Key Flows, plus the load
 * failure (CAP-9) and cross-device sync (CAP-10). Each journey is one test with a `test.step`
 * per Key Flows step, drives the app only through its UI after `goto`, and ends on an axe check.
 * Time moves only through `advance` and `page.clock.runFor` (AD-8); the hold is measured with
 * the shared `stillHeld` guard. CSP-clean is checked by the fixture at teardown,
 * and by the phone context's own check in the sync journey (AD-19).
 */
import {
  expect,
  expectBarColour,
  expectNoA11yViolations,
  failApi,
  HOLD_MS,
  near,
  nextPoll,
  preparePage,
  settled,
  stillHeld,
  test,
  type Seed,
} from '../fixtures.ts'
import { devices, type Page } from '@playwright/test'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
const ADD_FAILED = "Couldn't save new task."
const ACTION_FAILED = "Couldn't update that task. It's back as it was."
const LOAD_FAILED = "Couldn't load your tasks."

/** `ageColour(…, 'light')` as computed CSS colours (DESIGN age-1h and age-24h). */
const FRESH = 'rgb(36, 144, 87)'
const OVERDUE = 'rgb(196, 63, 62)'

const input = (page: Page) => page.getByLabel('New task')
const list = (page: Page) => page.getByRole('list', { name: 'Tasks' })
const rows = (page: Page) => list(page).getByRole('listitem')
const held = (page: Page) => list(page).locator('li.held')
const toast = (page: Page, kind: string) => page.locator(`[data-toast-kind="${kind}"]`)
const retry = (page: Page) => page.getByRole('button', { name: 'Retry' })
const tick = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" done`, exact: true })
const untick = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" not done`, exact: true })
const del = (page: Page, text: string) =>
  page.getByRole('button', { name: `Delete "${text}"`, exact: true })
const row = (page: Page, text: string) => rows(page).filter({ has: del(page, text) })
const bar = (page: Page, text: string) => row(page, text).locator('[data-age-bar]')
/** The row's visible age label (it is aria-hidden; the spoken form is longer, so never exact). */
const age = (page: Page, text: string, label: string | RegExp) =>
  row(page, text).getByText(label, { exact: true })

/** The task texts in list order, read from each row's `Delete "<text>"` button. */
function order(page: Page): Promise<string[]> {
  return list(page)
    .getByRole('button', { name: /^Delete "/ })
    .evaluateAll((buttons) =>
      buttons.map((b) => (b.getAttribute('aria-label') ?? '').replace(/^Delete "(.*)"$/, '$1')),
    )
}

async function expectOrder(page: Page, texts: string[]): Promise<void> {
  await expect.poll(() => order(page)).toEqual(texts)
}

/** Marks the current document, so a later `expectSameDocument` proves there was no reload. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    ;(window as unknown as { __journey?: boolean }).__journey = true
  })
}

async function expectSameDocument(page: Page): Promise<void> {
  const same = await page.evaluate(
    () => (window as unknown as { __journey?: boolean }).__journey === true,
  )
  expect(same, 'the page reloaded').toBe(true)
}

/** Opens the app and waits for the first load to finish. */
async function open(page: Page, width = 1280, height = 800): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.goto('/')
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false')
}

/** 8 open tasks, oldest first: "older task 0" (9 h 30 m) … "older task 7" (2 h 30 m). */
async function seedOlder(seed: Seed): Promise<string[]> {
  const texts: string[] = []
  for (let i = 0; i < 8; i += 1) {
    const text = `older task ${i}`
    await seed({ text, addedAgoMs: (9 - i) * HOUR + 30 * MINUTE })
    texts.push(text)
  }
  return texts
}

test('UJ-1: Peter jots down a task mid-meeting, and re-sends it after a failed save', async ({
  page,
  seed,
}) => {
  const older = await seedOlder(seed)
  const jotted = 'check SSO timeout setting'
  const retried = 'ping Dana about the rollout'

  await test.step('1. Peter switches to the already-open tab', async () => {
    // A short window, so eight older tasks fill the screen below the input.
    await open(page, 1280, 360)
    await expectOrder(page, older)
  })

  await test.step('2. the cursor is already in the input; he types the task', async () => {
    await expect(input(page)).toBeFocused()
    await page.keyboard.type(jotted)
    await expect(input(page)).toHaveValue(jotted)
  })

  await test.step('3. he presses Enter: the input clears and keeps focus', async () => {
    const created = settled(page, 'POST', /^\/api\/tasks$/)
    await page.keyboard.press('Enter')
    await expect(input(page)).toHaveValue('')
    await expect(input(page)).toBeFocused()
    expect((await created).status()).toBe(201)
  })

  await test.step('4. the task appears directly under the input, green and "now"', async () => {
    const fresh = await stillHeld(page, jotted)
    await expect(rows(page).first()).toHaveClass(/\bheld\b/)
    await expect(fresh.getByText('now', { exact: true })).toBeVisible()
    await expectBarColour(fresh.locator('[data-age-bar]'), FRESH)
    await expect(fresh).toBeInViewport()
    // Older tasks fill the screen: the bottom of the open list is below the fold.
    await expect(row(page, older[older.length - 1]!)).not.toBeInViewport()
    await stillHeld(page, jotted)
  })

  await test.step('5. climax: the task is on screen and the input is empty and ready', async () => {
    await stillHeld(page, jotted)
    await expect(input(page)).toHaveValue('')
    await expect(input(page)).toBeFocused()
  })

  await test.step('6. about 3 s later it settles at the bottom of the open tasks', async () => {
    await stillHeld(page, jotted)
    await page.clock.runFor(HOLD_MS)
    await expect(held(page)).toHaveCount(0)
    await expectOrder(page, [...older, jotted])
    await expect(input(page)).toBeFocused()
  })

  await test.step('failure: the save fails; the task goes, a toast shows, the text is back', async () => {
    const clear = await failApi(page, { method: 'POST', path: '/api/tasks' })
    const failed = settled(page, 'POST', /^\/api\/tasks$/)
    await page.keyboard.type(retried)
    await page.keyboard.press('Enter')
    expect((await failed).status()).toBe(503)

    await expect(toast(page, 'add_failed')).toHaveText(ADD_FAILED)
    await expect(row(page, retried)).toHaveCount(0)
    await expect(held(page)).toHaveCount(0)
    await expect(input(page)).toHaveValue(retried)
    await expect(input(page)).toBeFocused()
    await expectOrder(page, [...older, jotted])
    await expectNoA11yViolations(page)
    await clear()
  })

  await test.step('failure: Peter just presses Enter again, and it saves', async () => {
    const created = settled(page, 'POST', /^\/api\/tasks$/)
    await page.keyboard.press('Enter')
    expect((await created).status()).toBe(201)
    await expect(input(page)).toHaveValue('')
    await stillHeld(page, retried)
    await page.clock.runFor(HOLD_MS)
    await expect(held(page)).toHaveCount(0)
    await expectOrder(page, [...older, jotted, retried])
    await expect(input(page)).toBeFocused()
  })

  await expectNoA11yViolations(page)
})

test('UJ-2: Peter clears the backlog over coffee, through a wrong tick and a rejected one', async ({
  page,
  seed,
}) => {
  await seed({ text: 'renew the TLS cert', addedAgoMs: 2 * DAY + 30 * MINUTE })
  const second = await seed({ text: 'answer the vendor survey', addedAgoMs: DAY + 30 * MINUTE })
  await seed({ text: 'book the team lunch', addedAgoMs: 5 * HOUR + 30 * MINUTE })
  await seed({ text: 'water the plants', addedAgoMs: 30 * MINUTE + 30_000 })
  await seed({ text: 'file expenses', addedAgoMs: 2 * DAY, completedAgoMs: 20 * HOUR })
  const first = 'renew the TLS cert'
  const open1 = [first, second.text, 'book the team lunch', 'water the plants']

  await test.step('1. Peter opens the app in the morning; the list loads', async () => {
    await open(page)
    await expectOrder(page, [...open1, 'file expenses'])
    await expect(input(page)).toBeFocused()
  })

  await test.step('2. two red tasks, "2d" and "1d", sit at the top above fresher ones', async () => {
    await expect(age(page, first, '2d')).toBeVisible()
    await expect(age(page, second.text, '1d')).toBeVisible()
    await expectBarColour(bar(page, first), OVERDUE)
    await expectBarColour(bar(page, second.text), OVERDUE)
    await expect(age(page, 'book the team lunch', '5h')).toBeVisible()
    // Seeded 30 m 30 s ago, so a run slower than 30 s from seed reads "31m".
    await expect(age(page, 'water the plants', /^3[01]m$/)).toBeVisible()
  })

  await test.step('3. he ticks the first red task: "done now", top of the completed tasks, focus back in the input', async () => {
    const ticked = settled(page, 'PUT', /\/tick$/)
    await tick(page, first).click()
    expect((await ticked).status()).toBe(200)
    await expectOrder(page, [...open1.slice(1), first, 'file expenses'])
    await expect(age(page, first, 'done now')).toBeVisible()
    await expect(bar(page, first)).toHaveCount(0)
    await expect(untick(page, first)).toBeVisible()
    await expect(input(page)).toBeFocused()
    await expectNoA11yViolations(page)
  })

  await test.step('failure: wrong task; he unticks it and it returns to its place, still red, still "2d"', async () => {
    const unticked = settled(page, 'PUT', /\/untick$/)
    await untick(page, first).click()
    expect((await unticked).status()).toBe(200)
    await expectOrder(page, [...open1, 'file expenses'])
    await expect(age(page, first, '2d')).toBeVisible()
    await expectBarColour(bar(page, first), OVERDUE)
    await expect(input(page)).toBeFocused()
  })

  await test.step('3 (again). he ticks it again', async () => {
    const ticked = settled(page, 'PUT', /\/tick$/)
    await tick(page, first).click()
    expect((await ticked).status()).toBe(200)
    await expectOrder(page, [...open1.slice(1), first, 'file expenses'])
    await expect(age(page, first, 'done now')).toBeVisible()
    await expect(input(page)).toBeFocused()
  })

  await test.step('failure: the server rejects a tick; the row returns as it was, with the toast', async () => {
    const clear = await failApi(page, { method: 'PUT', path: `/api/tasks/${second.id}/tick` })
    const rejected = settled(page, 'PUT', /\/tick$/)
    await tick(page, second.text).click()
    expect((await rejected).status()).toBe(503)

    await expect(toast(page, 'action_failed')).toHaveText(ACTION_FAILED)
    await expect(tick(page, second.text)).toBeVisible()
    await expect(age(page, second.text, '1d')).toBeVisible()
    await expectBarColour(bar(page, second.text), OVERDUE)
    await expectOrder(page, [...open1.slice(1), first, 'file expenses'])
    await expect(input(page)).toBeFocused()
    await clear()
    // The toast sits over the top row's ×, and a mouse over it holds it open, so Peter
    // dismisses it before clearing the list.
    await toast(page, 'action_failed').getByRole('button', { name: 'Dismiss' }).click()
    await expect(toast(page, 'action_failed')).toHaveCount(0)
  })

  await test.step('4. the second task is no longer relevant; he deletes it with its ×, with no confirmation', async () => {
    const deleted = settled(page, 'DELETE', /^\/api\/tasks\/[^/]+$/)
    await del(page, second.text).click()
    await expect(row(page, second.text)).toHaveCount(0)
    expect((await deleted).status()).toBe(204)
    await expect(input(page)).toBeFocused()
  })

  await test.step('5. climax: the top of the list is no longer red', async () => {
    await expectOrder(page, [...open1.slice(2), first, 'file expenses'])
    const top = bar(page, open1[2]!)
    await expect
      .poll(async () => {
        const colour = await top.evaluate((e) => getComputedStyle(e).backgroundColor)
        return near(colour, OVERDUE)
      }, 'the top open row is still overdue red')
      .toBe(false)
  })

  await test.step('then he clears the rest of the list the same way', async () => {
    const remaining = await order(page)
    for (const text of remaining) {
      const deleted = settled(page, 'DELETE', /^\/api\/tasks\/[^/]+$/)
      await del(page, text).click()
      await expect(row(page, text)).toHaveCount(0)
      expect((await deleted).status()).toBe(204)
      await expect(input(page)).toBeFocused()
    }
  })

  await test.step('the run ends on the empty state', async () => {
    await expect(rows(page)).toHaveCount(0)
    await expect(page.getByText(EMPTY_STATE, { exact: true })).toBeVisible()
    await expect(input(page)).toBeFocused()
  })

  await expectNoA11yViolations(page)
})

test('UJ-3: a task goes overdue while the tab is open, in place and without a reload', async ({
  page,
  seed,
  advance,
}) => {
  const crossing = 'reply to the auditor'

  await test.step('1. the tab has been open all day; a task from yesterday reads "23h"', async () => {
    await seed({ text: 'renew the domain', addedAgoMs: 2 * DAY })
    // A full minute before the boundary, so a slow stack can't cross before the `23h` check.
    await seed({ text: crossing, addedAgoMs: 23 * HOUR + 59 * MINUTE })
    await seed({ text: 'standup notes', addedAgoMs: HOUR })
    await open(page)
    await expectOrder(page, ['renew the domain', crossing, 'standup notes'])
    // Not yet overdue: overdue starts at 24 h, which reads "1d". At 23 h 59 m the bar colour is
    // already the overdue hex (#C43F3E), so the label is the only visible difference.
    await expect(age(page, crossing, '23h')).toBeVisible()
    await expect(input(page)).toBeFocused()
    await markDocument(page)
  })

  await test.step('2–3. the page recomputes ages as the task crosses 24 hours', async () => {
    await advance(MINUTE)
  })

  await test.step('4. climax: without a refresh it turns overdue red and reads "1d", and does not move', async () => {
    await expect(age(page, crossing, '1d')).toBeVisible()
    await expectBarColour(bar(page, crossing), OVERDUE)
    await expectOrder(page, ['renew the domain', crossing, 'standup notes'])
    await expectSameDocument(page)
  })

  await test.step('5. nothing is announced and focus stays where it was', async () => {
    await expect(page.getByRole('status')).toHaveText('')
    await expect(page.getByRole('alert')).toHaveText('')
    await expect(page.locator('[data-toast-kind]')).toHaveCount(0)
    await expect(input(page)).toBeFocused()
  })

  await expectNoA11yViolations(page)
})

test('CAP-9 load failure: the Retry toast replaces the list, and Retry brings it back', async ({
  page,
  seed,
}) => {
  await seed({ text: 'older', addedAgoMs: 2 * HOUR })
  await seed({ text: 'newer', addedAgoMs: HOUR })

  const clear =
    await test.step('the first load fails: the Retry toast, no list, no empty state', async () => {
      const clear = await failApi(page, { method: 'GET', path: '/api/tasks' })
      await open(page)
      await expect(toast(page, 'load_failed')).toBeVisible()
      await expect(toast(page, 'load_failed')).toContainText(LOAD_FAILED)
      await expect(retry(page)).toBeVisible()
      await expect(page.getByText(EMPTY_STATE)).toHaveCount(0)
      await expect(list(page)).toHaveCount(0)
      return clear
    })

  await test.step('the server is back; Retry loads the list, closes the toast, focuses the input', async () => {
    await clear()
    await retry(page).click()
    await expectOrder(page, ['older', 'newer'])
    await expect(toast(page, 'load_failed')).toHaveCount(0)
    await expect(retry(page)).toHaveCount(0)
    await expect(input(page)).toBeFocused()
  })

  await expectNoA11yViolations(page)
})

test('CAP-10 sync: a task added and one deleted on the phone reach the idle laptop tab on its next poll', async ({
  page,
  browser,
  baseURL,
  seed,
  advance,
}) => {
  await seed({ text: 'deleted on the phone', addedAgoMs: 2 * HOUR })
  await seed({ text: 'already here', addedAgoMs: HOUR })
  const added = 'buy printer paper'

  const phoneContext = await browser.newContext({ ...devices['Pixel 7'], baseURL })
  let checkPhoneCsp: (() => void) | undefined
  try {
    const phone = await phoneContext.newPage()
    checkPhoneCsp = await preparePage(phone)

    await test.step('the laptop tab and the phone both show the list', async () => {
      await open(page)
      await expectOrder(page, ['deleted on the phone', 'already here'])
      await expect(input(page)).toBeFocused()
      await phone.goto('/')
      await expectOrder(phone, ['deleted on the phone', 'already here'])
    })

    await test.step('the phone adds a task through its UI', async () => {
      const created = settled(phone, 'POST', /^\/api\/tasks$/)
      await input(phone).click()
      await input(phone).fill(added)
      await input(phone).press('Enter')
      expect((await created).status()).toBe(201)
      await expect(row(phone, added)).toHaveCount(1)
    })

    await test.step('the idle laptop tab shows it after its next poll; focus unchanged', async () => {
      expect(await order(page), 'laptop polled before advance — slow run').toEqual([
        'deleted on the phone',
        'already here',
      ])
      await nextPoll(page, advance)
      await expectOrder(page, ['deleted on the phone', 'already here', added])
      await expect(input(page)).toBeFocused()
    })

    await test.step('the phone deletes a task with its ×', async () => {
      const deleted = settled(phone, 'DELETE', /^\/api\/tasks\/[^/]+$/)
      await del(phone, 'deleted on the phone').click()
      expect((await deleted).status()).toBe(204)
      await expect(row(phone, 'deleted on the phone')).toHaveCount(0)
    })

    await test.step('it is gone from the laptop after the next poll; focus unchanged', async () => {
      await nextPoll(page, advance)
      await expectOrder(page, ['already here', added])
      await expect(input(page)).toBeFocused()
    })

    await test.step('the phone has no critical axe violations', async () => {
      await expectNoA11yViolations(phone)
    })
  } finally {
    try {
      checkPhoneCsp?.()
    } finally {
      await phoneContext.close()
    }
  }

  await expectNoA11yViolations(page)
})
