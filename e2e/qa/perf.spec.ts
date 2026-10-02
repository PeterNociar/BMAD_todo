/**
 * The performance check behind docs/qa-performance.md (story 3.8, NFR-2), on the test profile's
 * production build (nginx + the Vite bundle) with 500 tasks seeded through AD-14. Chrome
 * DevTools is driven through the Chrome DevTools Protocol (a CDP session), not Lighthouse.
 *
 * Clocks. The fixture installs `page.clock` (AD-8), which replaces `performance.now`,
 * `performance.mark` (a stub whose entries all start at 0), `requestAnimationFrame` and the
 * page's Resource Timing buffer (left empty). So:
 * - API timings come from Playwright's `request.timing()`, which reads CDP Network timing.
 * - Every render and feedback sample is traced with CDP `Tracing` (devtools.timeline, as
 *   DevTools › Performance records). The page drops `console.timeStamp` markers (not faked)
 *   at the input (or the GET response) and when the change is in the DOM and laid out; the
 *   trace adds the end of the first renderer `Paint` after it and the longest main-thread task.
 *   The pass/fail figure is input → paint, on the trace clock.
 * - The same spans are also taken in the page with `performance.now()` deltas: the installed
 *   clock flows at the real rate (1 ms resolution) until a test calls `fastForward`/`runFor`,
 *   which this spec does only between samples. The faked rAF can't mark a frame, so these
 *   in-page figures stop at a forced layout (`offsetHeight`) and exclude paint.
 *
 * Background poll. The app's 30 s `GET /api/tasks` poll is kept out of the numbers: API probes
 * carry a unique `?qa=<n>` tag and are matched by it, and a traced span that sees an untagged
 * GET it didn't expect is dropped, replaced and counted (`droppedForPoll` in the results).
 *
 * Gate. Every NFR-2 target (API, 500-row render, and feedback under both motion settings) is
 * asserted, so a regression fails `npm run qa`. Default-motion feedback met its target once only
 * rows on screen slide (`lib/motion.ts`).
 *
 * The check runs twice: with the default motion, and with `prefers-reduced-motion: reduce`
 * (rows move with no slide), which isolates what the row animation costs.
 * Each run writes `docs/qa-artifacts/perf-results<suffix>.json`, plus one tick trace
 * (`perf-tick-trace<suffix>.json`) and one load trace (`perf-load-trace<suffix>.json`) to open
 * in DevTools › Performance; the suffix is empty for the default run and `-reduced-motion`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { CDPSession, Page, Request } from '@playwright/test'
import { expect, HOLD_MS, settled, test } from '../fixtures.ts'

const OUT_DIR = fileURLToPath(new URL('../../docs/qa-artifacts/', import.meta.url))

const TASKS = 500
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const API_SAMPLES = 25
/** At least 20, so the nearest-rank p95 is not simply the maximum. */
const RENDER_SAMPLES = 20
const FEEDBACK_SAMPLES = 20
/** Extra attempts allowed per measure, for samples dropped because a background poll hit them. */
const SPARE_ATTEMPTS = 10

/** NFR-2 targets, in ms. */
const TARGET = { api: 300, render: 200, feedback: 100 }

const input = (page: Page) => page.getByLabel('New task')
const rows = (page: Page) => page.locator('li[data-task-row]')
const tickButton = (page: Page, text: string) =>
  page.getByRole('button', { name: `Mark "${text}" done`, exact: true })
const deleteButton = (page: Page, text: string) =>
  page.getByRole('button', { name: `Delete "${text}"`, exact: true })

/** Every 10th task (index 3 mod 10, 50 in all) has a long text with a URL. */
const isLong = (i: number) => i % 10 === 3
const taskText = (i: number) =>
  isLong(i)
    ? `perf task ${i}: a longer task text that wraps on a phone, with a URL https://example.com/${'x'.repeat(60)}`
    : `perf task ${i}`

/**
 * 100 of 500 completed: every 5th index, except that index 3 mod 50 (a long task) takes the place
 * of index 0 mod 50. So 10 long tasks are completed and 40 are open. Ages: 1 minute to 10 days.
 */
const isCompleted = (i: number) => (i % 5 === 0 && i % 50 !== 0) || i % 50 === 3
function addedAgo(i: number): number {
  // A fixed permutation of 0..499 (7919 is prime to 500), so ages are mixed, not by index.
  return MINUTE + Math.round((((i * 7919) % TASKS) / TASKS) * 10 * DAY)
}

type Stats = { n: number; p50: number; p95: number; min: number; max: number; mean: number }

/** Nearest-rank percentiles. */
function stats(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b)
  const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
  const round = (v: number) => Math.round(v * 10) / 10
  return {
    n: sorted.length,
    p50: round(rank(0.5)),
    p95: round(rank(0.95)),
    min: round(sorted[0]!),
    max: round(sorted[sorted.length - 1]!),
    mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  }
}

/** Total request time (request start → response end) from CDP Network timing. */
function requestMs(request: Request): number {
  const { responseEnd } = request.timing()
  // -1 means Chrome reported no timing for this request: never record it as a sample.
  if (!(responseEnd >= 0)) throw new Error(`no timing for ${request.method()} ${request.url()}`)
  return responseEnd
}

let probeCount = 0

/**
 * Runs one API call from the page and returns its timing. The URL carries a unique `?qa=<n>`
 * tag (the API ignores query strings), so the app's own background poll of `GET /api/tasks`
 * can never be taken for the probe.
 */
async function timedFetch(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ms: number; status: number; json: unknown }> {
  probeCount += 1
  const url = `${path}?qa=${probeCount}`
  const finished = page.waitForEvent('requestfinished', {
    predicate: (r) => r.method() === method && r.url().endsWith(url),
    timeout: 10_000,
  })
  let result: { status: number; json: unknown }
  try {
    result = await page.evaluate(
      async ({ method, url, body }) => {
        const response = await fetch(url, {
          method,
          headers: body === undefined ? {} : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const text = await response.text()
        return { status: response.status, json: text ? JSON.parse(text) : null }
      },
      { method, url, body },
    )
  } catch (error) {
    // The fetch failed: let the waiter settle quietly so this error, not a timeout, surfaces.
    finished.catch(() => undefined)
    throw error
  }
  return { ms: requestMs(await finished), ...result }
}

/**
 * Counts the app's own `GET /api/tasks` requests (the first load and the 30 s background poll;
 * never the tagged probes). A traced span that sees one it didn't expect is dropped: a 500-row
 * re-render inside it would inflate its paint and longest task.
 */
function watchPolls(page: Page): { count: () => number } {
  let count = 0
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (r.method() === 'GET' && url.pathname === '/api/tasks' && !url.searchParams.has('qa')) {
      count += 1
    }
  })
  return { count: () => count }
}

/**
 * When a feedback span ends: the held row's delete button has `label` (an add), a tick button
 * has `label` (a tick), or no delete button has `label` any more (a delete). Plain data, not a
 * function: the page's CSP has no 'unsafe-eval', so the page can't build one from a string.
 */
type Done = { until: 'held' | 'present' | 'absent'; label: string }

declare global {
  interface Window {
    __qa?: {
      expected: number
      getResponseAt?: number
      rowsAt?: number
      start?: number
      end?: number
      arm: (kind: 'keydown' | 'pointerdown', done: Done) => void
    }
  }
}

/**
 * Runs in the page before its own scripts (after the fixture's clock): marks the moment the
 * first `GET /api/tasks` resolves and the moment `expected` rows are in the DOM and laid out,
 * and sets up `arm` for the feedback spans. Both moments are also `console.timeStamp` markers
 * for the trace.
 */
function renderProbe(expected: number): void {
  const now = () => performance.now()
  const layout = () => void document.documentElement.offsetHeight
  const qa: NonNullable<Window['__qa']> = {
    expected,
    arm(kind, { until, label }) {
      const named = (selector: string) =>
        [...document.querySelectorAll(selector)].some((b) => b.getAttribute('aria-label') === label)
      const done = () =>
        until === 'held'
          ? named('li.held [data-row-control="delete"]')
          : until === 'present'
            ? named('[data-row-control="tick"]')
            : !named('[data-row-control="delete"]')
      qa.start = undefined
      qa.end = undefined
      const onInput = () => {
        if (qa.start !== undefined) return
        qa.start = now()
        console.timeStamp('qa:input')
      }
      window.addEventListener(kind, onInput, { capture: true, once: true })
      const observer = new MutationObserver(() => {
        if (qa.start === undefined || !done()) return
        layout()
        qa.end = now()
        console.timeStamp('qa:dom-done')
        observer.disconnect()
      })
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      })
    },
  }
  window.__qa = qa
  const realFetch = window.fetch.bind(window)
  window.fetch = async (resource, init) => {
    const response = await realFetch(resource, init)
    const url = new URL(
      String(resource instanceof Request ? resource.url : resource),
      location.href,
    )
    const method = (init?.method ?? 'GET').toUpperCase()
    if (qa.getResponseAt === undefined && method === 'GET' && url.pathname === '/api/tasks') {
      qa.getResponseAt = now()
      console.timeStamp('qa:get-response')
    }
    return response
  }
  new MutationObserver((_, observer) => {
    if (qa.getResponseAt === undefined) return
    if (document.querySelectorAll('li[data-task-row]').length < qa.expected) return
    layout()
    qa.rowsAt = now()
    console.timeStamp('qa:rows-in-dom')
    observer.disconnect()
  }).observe(document, { childList: true, subtree: true })
}

type TraceEvent = {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: { data?: { message?: string; type?: string } }
}

/** Records a CDP trace around `action` (devtools.timeline, as DevTools › Performance does). */
async function trace(cdp: CDPSession, action: () => Promise<void>): Promise<TraceEvent[]> {
  const events: TraceEvent[] = []
  const onData = ({ value }: { value: object[] }) => events.push(...(value as TraceEvent[]))
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'blink.user_timing',
        'v8.execute',
        'loading',
      ],
    },
  })
  await action()
  const complete = new Promise<void>((resolve) =>
    cdp.once('Tracing.tracingComplete', () => resolve()),
  )
  await cdp.send('Tracing.end')
  await complete
  cdp.off('Tracing.dataCollected', onData)
  return events
}

/** The `console.timeStamp` marker named `message`, on the trace clock (µs). */
function marker(events: TraceEvent[], message: string): TraceEvent {
  const found = events.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === message)
  expect(found, `${message} marker in the trace`).toBeTruthy()
  return found!
}

const ms = (us: number) => Math.round(us / 100) / 10

/**
 * The end (µs) of the first renderer `Paint` that starts at or after `fromTs`: a complete
 * event (`ph: 'X'` with `dur`), or a begin event paired with its end. Fails on anything else,
 * rather than read a paint as zero-length.
 */
function firstPaintEnd(events: TraceEvent[], from: TraceEvent): number {
  const paint = events
    .filter((e) => e.name === 'Paint' && e.pid === from.pid && e.ts >= from.ts && e.ph !== 'E')
    .sort((a, b) => a.ts - b.ts)[0]
  expect(paint, 'a Paint after the change').toBeTruthy()
  if (paint!.ph === 'X') {
    expect(paint!.dur, 'the Paint event has a duration').toEqual(expect.any(Number))
    return paint!.ts + paint!.dur!
  }
  expect(paint!.ph, 'a Paint is a complete (X) or begin (B) event').toBe('B')
  const end = events
    .filter(
      (e) =>
        e.name === 'Paint' &&
        e.ph === 'E' &&
        e.pid === paint!.pid &&
        e.tid === paint!.tid &&
        e.ts >= paint!.ts,
    )
    .sort((a, b) => a.ts - b.ts)[0]
  expect(end, 'the end event of a begin-only Paint').toBeTruthy()
  return end!.ts
}

/**
 * Reads one traced span: `from` → `domDone` (the change in the DOM and laid out), → the end of
 * the first renderer `Paint` after `domDone` (the change on screen). Also the longest
 * main-thread task inside that span (from `from` to the paint), and the longest one after it
 * until the trace ends (the confirmed response's re-render and the settle).
 */
function readTrace(events: TraceEvent[], from: string, domDone: string) {
  const start = marker(events, from)
  const dom = marker(events, domDone)
  const paintEnd = firstPaintEnd(events, dom)
  const tasks = events.filter(
    (e) => e.name === 'RunTask' && e.pid === start.pid && e.tid === start.tid && e.ts >= start.ts,
  )
  const longest = (list: TraceEvent[]) => ms(Math.max(0, ...list.map((t) => t.dur ?? 0)))
  return {
    domMs: ms(dom.ts - start.ts),
    paintMs: ms(paintEnd - start.ts),
    longestTaskMs: longest(tasks.filter((t) => t.ts < paintEnd)),
    longestTaskAfterPaintMs: longest(tasks.filter((t) => t.ts >= paintEnd)),
  }
}

const METRICS = ['JSHeapUsedSize', 'LayoutCount', 'RecalcStyleCount', 'ScriptDuration'] as const
type Metrics = Record<(typeof METRICS)[number], number>

async function metrics(cdp: CDPSession): Promise<Metrics> {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(
    METRICS.map((name) => [name, metrics.find((m) => m.name === name)?.value ?? NaN]),
  ) as Metrics
}

/** Quiet time after each traced span, so its trailing work lands in the trace. */
const SETTLE_MS = 750

type Span = {
  inPageMs: number
  domMs: number
  paintMs: number
  longestTaskMs: number
  longestTaskAfterPaintMs: number
}

/**
 * Collects `want` samples from `attempt`, which returns null for a sample hit by a background
 * poll. Gives up after `SPARE_ATTEMPTS` drops. Returns the kept samples and the drop count.
 */
async function sampleUntil(
  want: number,
  attempt: (i: number) => Promise<Span | null>,
): Promise<{ spans: Span[]; dropped: number }> {
  const spans: Span[] = []
  let dropped = 0
  for (let i = 0; spans.length < want; i += 1) {
    expect(dropped, 'samples dropped for a background poll').toBeLessThanOrEqual(SPARE_ATTEMPTS)
    const span = await attempt(i)
    if (span) spans.push(span)
    else dropped += 1
  }
  return { spans, dropped }
}

/**
 * One feedback sample, traced: arms the in-page span, runs `act`, waits for the change and for
 * `settledResponse` (the action's API call), then a quiet `SETTLE_MS`, so every sample starts
 * from an idle page.
 */
async function feedback(
  page: Page,
  cdp: CDPSession,
  kind: 'keydown' | 'pointerdown',
  done: Done,
  act: () => Promise<void>,
  settledResponse: Promise<{ status: () => number }>,
  expectedStatus: number,
  polls: { count: () => number },
): Promise<{ span: Span | null; events: TraceEvent[] }> {
  let inPageMs = NaN
  const pollsBefore = polls.count()
  const events = await trace(cdp, async () => {
    await page.evaluate(({ kind, done }) => window.__qa!.arm(kind, done), { kind, done })
    await act()
    await expect.poll(() => page.evaluate(() => window.__qa!.end ?? null)).not.toBeNull()
    inPageMs = await page.evaluate(() => window.__qa!.end! - window.__qa!.start!)
    expect((await settledResponse).status()).toBe(expectedStatus)
    await page.waitForTimeout(SETTLE_MS)
  })
  if (polls.count() !== pollsBefore) return { span: null, events }
  return { span: { inPageMs, ...readTrace(events, 'qa:input', 'qa:dom-done') }, events }
}

const column = (spans: Span[], key: keyof Span) => spans.map((s) => s[key])

for (const motion of ['no-preference', 'reduce'] as const) {
  const suffix = motion === 'reduce' ? '-reduced-motion' : ''
  test.describe(`motion: ${motion}`, () => {
    test.use({ reducedMotion: motion })
    // The feedback gate reads the results the measurement writes: skip it if that failed.
    test.describe.configure({ mode: 'serial' })

    test(`NFR-2 with 500 tasks (motion: ${motion}): API, first render and action feedback`, async ({
      page,
      seed,
      browser,
    }) => {
      test.setTimeout(10 * 60_000)
      mkdirSync(OUT_DIR, { recursive: true })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.addInitScript(renderProbe, TASKS)
      const polls = watchPolls(page)

      const results: Record<string, unknown> = {
        measuredAt: new Date().toISOString(),
        reducedMotion: motion,
        baseURL: test.info().project.use.baseURL,
        machine: {
          cpu: cpus()[0]?.model,
          logicalCores: cpus().length,
          memoryGiB: Math.round(totalmem() / 2 ** 30),
          browser: `${browser.browserType().name()} ${browser.version()}`,
          viewport: '1280x800',
        },
      }

      await test.step(`seed ${TASKS} tasks through AD-14`, async () => {
        for (let i = 0; i < TASKS; i += 1) {
          const added = addedAgo(i)
          await seed({
            text: taskText(i),
            addedAgoMs: added,
            completedAgoMs: isCompleted(i) ? Math.round(added / 2) : undefined,
          })
        }
        const all = Array.from({ length: TASKS }, (_, i) => i)
        results.seeded = {
          total: TASKS,
          completed: all.filter(isCompleted).length,
          longText: all.filter(isLong).length,
          longTextOpen: all.filter((i) => isLong(i) && !isCompleted(i)).length,
          longTextCompleted: all.filter((i) => isLong(i) && isCompleted(i)).length,
        }
      })

      let loads: Span[] = []
      const dropped: Record<string, number> = {}
      await test.step(`first load renders ${TASKS} rows (${RENDER_SAMPLES} traced loads)`, async () => {
        let lastEvents: TraceEvent[] = []
        const kept = await sampleUntil(RENDER_SAMPLES, async () => {
          const pollsBefore = polls.count()
          const events = await trace(cdp, async () => {
            await page.goto('/')
            await expect(rows(page)).toHaveCount(TASKS)
            await expect.poll(() => page.evaluate(() => window.__qa?.rowsAt ?? null)).not.toBeNull()
            await page.waitForTimeout(SETTLE_MS)
          })
          // The load's own GET is expected; a second one is a poll inside the span.
          if (polls.count() - pollsBefore !== 1) return null
          lastEvents = events
          const inPageMs = await page.evaluate(
            () => window.__qa!.rowsAt! - window.__qa!.getResponseAt!,
          )
          return { inPageMs, ...readTrace(events, 'qa:get-response', 'qa:rows-in-dom') }
        })
        loads = kept.spans
        dropped.render = kept.dropped
        writeFileSync(
          `${OUT_DIR}perf-load-trace${suffix}.json`,
          JSON.stringify({ traceEvents: lastEvents }),
        )
        results.metricsAfterLoad = await metrics(cdp)
      })

      const api: Record<string, number[]> = {
        GET: [],
        POST: [],
        'PUT tick': [],
        'PUT untick': [],
        DELETE: [],
      }
      await test.step(`API timings with ${TASKS} tasks (${API_SAMPLES} each)`, async () => {
        for (let i = 0; i < API_SAMPLES; i += 1) {
          const got = await timedFetch(page, 'GET', '/api/tasks')
          expect(got.status).toBe(200)
          expect((got.json as unknown[]).length).toBe(TASKS)
          api.GET!.push(got.ms)
        }
        const ids: string[] = []
        for (let i = 0; i < API_SAMPLES; i += 1) {
          const created = await timedFetch(page, 'POST', '/api/tasks', { text: `api probe ${i}` })
          expect(created.status).toBe(201)
          ids.push((created.json as { id: string }).id)
          api.POST!.push(created.ms)
        }
        for (const id of ids) {
          const ticked = await timedFetch(page, 'PUT', `/api/tasks/${id}/tick`)
          expect(ticked.status).toBe(200)
          api['PUT tick']!.push(ticked.ms)
        }
        for (const id of ids) {
          const unticked = await timedFetch(page, 'PUT', `/api/tasks/${id}/untick`)
          expect(unticked.status).toBe(200)
          api['PUT untick']!.push(unticked.ms)
        }
        for (const id of ids) {
          const deleted = await timedFetch(page, 'DELETE', `/api/tasks/${id}`)
          expect(deleted.status).toBe(204)
          api.DELETE!.push(deleted.ms)
        }
      })

      // Back to exactly 500 rows (the probes are deleted) for the feedback spans.
      await page.goto('/')
      await expect(rows(page)).toHaveCount(TASKS)
      await expect(input(page)).toBeFocused()
      const before = await metrics(cdp)

      let enter: Span[] = []
      await test.step(`Enter → held row visible, ${FEEDBACK_SAMPLES} adds`, async () => {
        const kept = await sampleUntil(FEEDBACK_SAMPLES, async (i) => {
          const text = `feedback add ${i}`
          await input(page).fill(text)
          const { span } = await feedback(
            page,
            cdp,
            'keydown',
            { until: 'held', label: `Delete "${text}"` },
            () => input(page).press('Enter'),
            settled(page, 'POST', /^\/api\/tasks$/),
            201,
            polls,
          )
          // Between samples, never inside one: end the hold so the next add starts from a settled
          // list (the page clock only; no age crosses a boundary in 3 s that matters here).
          await page.clock.runFor(HOLD_MS)
          await expect(page.locator('li.held')).toHaveCount(0)
          await page.waitForTimeout(SETTLE_MS)
          return span
        })
        enter = kept.spans
        dropped.enter = kept.dropped
      })

      /** Open tasks to act on, short and long texts alike, in index order. */
      const openTexts = Array.from({ length: TASKS }, (_, i) => i)
        .filter((i) => !isCompleted(i))
        .map(taskText)
      let nextOpen = 0

      let tick: Span[] = []
      await test.step(`tick click → row shows done, ${FEEDBACK_SAMPLES} ticks`, async () => {
        let lastEvents: TraceEvent[] = []
        const kept = await sampleUntil(FEEDBACK_SAMPLES, async () => {
          const text = openTexts[nextOpen++]!
          const { span, events } = await feedback(
            page,
            cdp,
            'pointerdown',
            { until: 'present', label: `Mark "${text}" not done` },
            () => tickButton(page, text).click(),
            settled(page, 'PUT', /\/tick$/),
            200,
            polls,
          )
          if (span) lastEvents = events
          return span
        })
        tick = kept.spans
        dropped.tick = kept.dropped
        writeFileSync(
          `${OUT_DIR}perf-tick-trace${suffix}.json`,
          JSON.stringify({ traceEvents: lastEvents }),
        )
      })

      let del: Span[] = []
      await test.step(`delete click → row gone, ${FEEDBACK_SAMPLES} deletes`, async () => {
        const kept = await sampleUntil(FEEDBACK_SAMPLES, async () => {
          const text = openTexts[nextOpen++]!
          // The × is revealed on row hover (laptop), as a user's pointer would do on the way.
          await rows(page)
            .filter({ has: deleteButton(page, text) })
            .hover()
          const { span } = await feedback(
            page,
            cdp,
            'pointerdown',
            { until: 'absent', label: `Delete "${text}"` },
            () => deleteButton(page, text).click(),
            settled(page, 'DELETE', /^\/api\/tasks\/[^/]+$/),
            204,
            polls,
          )
          return span
        })
        del = kept.spans
        dropped.delete = kept.dropped
      })
      const after = await metrics(cdp)
      results.metricsAroundFeedback = {
        before,
        after,
        delta: Object.fromEntries(METRICS.map((m) => [m, after[m] - before[m]])),
        actions:
          enter.length +
          tick.length +
          del.length +
          dropped.enter! +
          dropped.tick! +
          dropped.delete!,
      }

      const verdict = (samples: number[], target: number) => {
        const s = stats(samples)
        return { ...s, target, pass: s.p95 < target }
      }
      const spanReport = (spans: Span[], target: number) => ({
        inPage: stats(column(spans, 'inPageMs')),
        traceToDom: stats(column(spans, 'domMs')),
        traceToPaint: verdict(column(spans, 'paintMs'), target),
        longestTask: stats(column(spans, 'longestTaskMs')),
        longestTaskAfterPaint: stats(column(spans, 'longestTaskAfterPaintMs')),
      })
      results.api = Object.fromEntries(
        Object.entries(api).map(([k, v]) => [k, verdict(v, TARGET.api)]),
      )
      results.render = spanReport(loads, TARGET.render)
      results.feedback = {
        enterToHeldRow: spanReport(enter, TARGET.feedback),
        tickToDone: spanReport(tick, TARGET.feedback),
        deleteToGone: spanReport(del, TARGET.feedback),
      }
      results.traces = {
        load: `docs/qa-artifacts/perf-load-trace${suffix}.json`,
        tick: `docs/qa-artifacts/perf-tick-trace${suffix}.json`,
      }
      results.droppedForPoll = dropped
      results.samples = { api, loads, enter, tick, delete: del }
      writeFileSync(`${OUT_DIR}perf-results${suffix}.json`, `${JSON.stringify(results, null, 2)}\n`)
      console.log(JSON.stringify({ ...results, samples: undefined }, null, 2))

      // The gate: a regression fails `npm run qa`. The feedback targets are checked by the
      // next test.
      for (const [call, samples] of Object.entries(api)) {
        expect(stats(samples).p95, `API ${call} p95`).toBeLessThan(TARGET.api)
      }
      expect(stats(column(loads, 'paintMs')).p95, '500-row render p95').toBeLessThan(TARGET.render)
    })

    /**
     * NFR-2 feedback with 500 rows, gated under both motion settings. Default motion used to miss
     * it (every moved row ran `animate:flip`); now only rows on screen slide (`lib/motion.ts`), and
     * docs/qa-performance.md (Issue 1) keeps the before and after figures.
     */
    test(`NFR-2 feedback under 100 ms with 500 rows (motion: ${motion})`, () => {
      const results = JSON.parse(readFileSync(`${OUT_DIR}perf-results${suffix}.json`, 'utf8')) as {
        feedback: Record<string, { traceToPaint: { p95: number } }>
      }
      for (const [action, report] of Object.entries(results.feedback)) {
        expect.soft(report.traceToPaint.p95, `${action} p95`).toBeLessThan(TARGET.feedback)
      }
    })
  })
}
