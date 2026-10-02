# QA report: performance

- **Date:** 2026-10-02 (runs at 11:46 and 11:49 UTC). Re-measured for story 3.10; the first figures (story 3.8, runs at 10:48 and 10:52 UTC) are kept under Issue 1.
- **Commit measured:** the commit that lands story 3.10 (row motion within NFR-2, on top of `dfe918f`). The test stack was rebuilt from that tree. The only change that reaches the running app is the row slide: `animate:slideRow` (`frontend/src/lib/motion.ts`) in place of `animate:flip`.
- **Target build:** the compose `test` profile on `:8082`: the production Vite bundle behind nginx, FastAPI and Postgres 18, all local. Data: 500 tasks seeded through the AD-14 router.
- **Machine:** Intel Core i9-10885H @ 2.40 GHz (16 logical cores), 63 GiB RAM, Linux. Google Chrome 154.0.8037.57 (Playwright `channel: 'chrome'`, reported as `chromium 154.0.8037.57`), headless, 1280×800, no CPU or network throttling.
- **Tooling:** Playwright plus the Chrome DevTools Protocol (a CDP session: `Tracing`, `Performance.getMetrics`, Network timing). Lighthouse was not used (user decision, 2026-10-02).

## Commands

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
cd e2e
E2E_BROWSER_CHANNEL=chrome npm run qa       # both QA specs; or, for this report alone:
E2E_BROWSER_CHANNEL=chrome npx playwright test -c playwright.qa.config.ts qa/perf.spec.ts
```

The spec is `e2e/qa/perf.spec.ts`. It runs the whole check twice, once with default motion and once with `prefers-reduced-motion: reduce`. It writes these files:

- `docs/qa-artifacts/perf-results.json` and `docs/qa-artifacts/perf-results-reduced-motion.json` are **committed**. They hold every figure below and each raw sample.
- `docs/qa-artifacts/perf-tick-trace*.json` (the last kept tick) and `perf-load-trace*.json` (the last kept load) are gitignored, at 1–4 MB each. Open them in DevTools › Performance › Load profile.

The run: `40 passed (6.1m)`, with no expected failures. That is 36 accessibility cells, 2 measurement tests, and 2 feedback gates.

## Setup (in the spec's order)

1. `POST /api/test/reset` (the fixture), then 500 tasks through `seed()`. Ages are spread from 1 minute to 10 days in a fixed shuffled order.
   - 100 tasks are completed and 400 open.
   - 50 tasks (every 10th) have a long text with a URL: 40 of them open, 10 completed. Both groups are among the rows acted on.
2. **First render:** full page loads of the 500-task list until 20 are kept.
3. **API:** 25 sequential `fetch` calls from the page for each call type, through nginx:
   - `GET /api/tasks` (each answer checked to hold 500 tasks);
   - then `POST`, `PUT …/tick`, `PUT …/untick` and `DELETE`, on 25 probe tasks created by the POSTs and deleted at the end.
   - Each probe URL carries a unique `?qa=<n>` tag, which the API ignores. The timing is read from that exact request, so the app's own background poll can never be taken for a probe.
4. **Feedback:** after a reload with exactly 500 rows:
   - adds (type, then Enter), until 20 are kept;
   - ticks (click a ring), until 20 are kept;
   - deletes (hover the row, click its ×), until 20 are kept.

   The ticked and deleted rows are open tasks in index order, short and long texts alike. Each sample waits for its API call and then 750 ms of quiet, so it starts from an idle page. After each add, `page.clock.runFor(3000)` ends the hold, between samples and never inside one.

**Samples dropped for the background poll.** The app polls `GET /api/tasks` every 30 s. A 500-row re-render inside a traced span would inflate its paint and longest-task figures. So the spec counts the app's own GETs (untagged) during each span. A load span must see exactly its own one, and a feedback span must see none. Any other sample is dropped and replaced, with up to 10 replacements per measure. Dropped in this run:

| Run            | Render | Enter | Tick | Delete |
| -------------- | ------ | ----- | ---- | ------ |
| Default motion | 0      | 0     | 1    | 1      |
| Reduced motion | 0      | 0     | 1    | 1      |

## Clocks: which source each figure uses

The fixture installs Playwright's fake clock (AD-8) before the first navigation. In the page, it replaces `performance.now`, `performance.mark` (a stub whose entries all start at 0), `requestAnimationFrame` and the Resource Timing buffer (left empty). So none of those can time the app directly.

| Figure                                   | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API timings                              | **CDP Network timing**, through Playwright's `request.timing().responseEnd` (request start → response end). The spec throws, rather than record a sample, if Chrome reports no timing (`-1`). Resource Timing is empty under the fake clock.                                                                                                                                                                                                                              |
| Render and feedback, **pass/fail**       | **CDP trace clock.** The page drops `console.timeStamp` markers, which the fake clock doesn't touch. One goes at the input event, or when the `GET` resolves; another when the change is in the DOM and laid out. The end is the end of the first renderer `Paint` after that: a complete (`X`) event with its duration, or a begin event paired with its end. The spec fails on anything else.                                                                           |
| Render and feedback, in-page cross-check | `performance.now()` deltas. The installed clock flows at the real rate, in 1 ms steps, until `fastForward`/`runFor` is called, and that happens only between samples. A `MutationObserver` ends the span once the change is in the DOM and a forced layout (`offsetHeight`) has run. It agrees with the trace's "input → DOM" within 1 ms at the median, which confirms the trace and page clocks match. It stops before paint, because the faked rAF can't mark a frame. |

What the spans include and leave out:

- A feedback span starts when the page's own `keydown`/`pointerdown` listener runs (capture phase), so the OS-to-renderer input delay is not included.
- The **render span starts when the `GET /api/tasks` response resolves**, that is when its headers arrive. So it **includes downloading the body and parsing the JSON** for 500 tasks, as well as building and laying out the rows.
- Every span ends at the end of the renderer's `Paint`. Compositor and GPU presentation are not included.

**Longest task.** "Longest task in the span" covers main-thread tasks that start between the span's start and the end of its paint. "Longest task after paint" covers the rest of the trace: the re-render when the server's response is applied, and the 750 ms of settle.

## Results against NFR-2

NFR-2: feedback within 100 ms for every action; API under 300 ms locally; with 500 tasks, the list renders in under 200 ms and every action still gives feedback within 100 ms. A target counts as met when its **p95** is under it. Percentiles are nearest-rank. With 20 samples, p95 is the 19th smallest value, so a single outlier (the maximum, also shown) does not decide it. With 25 API samples it is the 24th.

### Default motion (what users get)

| NFR-2 target                 | Measure                           | n   | p50 (ms) | p95 (ms) | max (ms) | Target | Result   |
| ---------------------------- | --------------------------------- | --- | -------- | -------- | -------- | ------ | -------- |
| API < 300 ms                 | `GET /api/tasks` (500 tasks)      | 25  | 23.3     | 37.7     | 42.2     | 300    | **pass** |
|                              | `POST /api/tasks`                 | 25  | 11.1     | 21.0     | 27.8     | 300    | **pass** |
|                              | `PUT /api/tasks/{id}/tick`        | 25  | 12.0     | 15.1     | 16.7     | 300    | **pass** |
|                              | `PUT /api/tasks/{id}/untick`      | 25  | 11.6     | 18.7     | 20.7     | 300    | **pass** |
|                              | `DELETE /api/tasks/{id}`          | 25  | 9.4      | 13.0     | 17.8     | 300    | **pass** |
| 500 rows render < 200 ms     | `GET` resolved → 500 rows painted | 20  | 139.6    | 164.4    | 167.4    | 200    | **pass** |
| Feedback < 100 ms (500 rows) | Enter → held row painted          | 20  | 76.4     | 94.5     | 95.5     | 100    | **pass** |
|                              | tick click → row painted as done  | 20  | 47.7     | 62.7     | 63.5     | 100    | **pass** |
|                              | delete click → row gone, painted  | 20  | 54.4     | 74.3     | 93.7     | 100    | **pass** |

Supporting figures from the same run (p50 / p95):

| Measure                                        | Render        | Enter       | Tick        | Delete      |
| ---------------------------------------------- | ------------- | ----------- | ----------- | ----------- |
| Start → change in the DOM and laid out (trace) | 113.9 / 131.3 | 45.8 / 56.7 | 24.4 / 32.2 | 25.8 / 42.4 |
| The same, in-page                              | 114 / 131     | 46 / 57     | 25 / 32     | 26 / 42     |
| Longest task in the span                       | 108.8 / 130.4 | 36.4 / 51.1 | 17.4 / 28.8 | 18.4 / 39.9 |
| Longest task after paint                       | 103.7 / 180.9 | 38.7 / 43.8 | 40.1 / 55.6 | 38.3 / 41.1 |

### Reduced motion (`prefers-reduced-motion: reduce`, same spec)

| NFR-2 target             | Measure                           | n   | p50 (ms) | p95 (ms) | max (ms) | Target | Result   |
| ------------------------ | --------------------------------- | --- | -------- | -------- | -------- | ------ | -------- |
| API < 300 ms             | `GET`                             | 25  | 20.1     | 33.2     | 34.2     | 300    | **pass** |
|                          | `POST`                            | 25  | 9.6      | 12.1     | 18.7     | 300    | **pass** |
|                          | `PUT tick`                        | 25  | 10.7     | 13.0     | 27.7     | 300    | **pass** |
|                          | `PUT untick`                      | 25  | 10.2     | 11.4     | 11.8     | 300    | **pass** |
|                          | `DELETE`                          | 25  | 8.5      | 12.4     | 16.3     | 300    | **pass** |
| 500 rows render < 200 ms | `GET` resolved → 500 rows painted | 20  | 142.0    | 180.2    | 253.2    | 200    | **pass** |
| Feedback < 100 ms        | Enter → held row painted          | 20  | 70.9     | 87.7     | 96.0     | 100    | **pass** |
|                          | tick → row painted as done        | 20  | 42.8     | 57.5     | 57.7     | 100    | **pass** |
|                          | delete → row gone, painted        | 20  | 46.9     | 63.6     | 68.4     | 100    | **pass** |

The longest tasks with reduced motion, p50 / p95:

| Window      | Add            | Tick           | Delete         |
| ----------- | -------------- | -------------- | -------------- |
| In the span | 29.0 / 38.7 ms | 12.4 / 24.7 ms | 13.3 / 21.2 ms |
| After paint | 29.9 / 65.6 ms | 39.0 / 46.1 ms | 33.2 / 43.6 ms |

### Gate

`npm run qa` fails if any NFR-2 target regresses. The measurement test asserts that every API p95 is under 300 ms and the 500-row render p95 is under 200 ms, in both runs. A second test, "NFR-2 feedback under 100 ms with 500 rows", checks the three feedback p95s against 100 ms. It is a plain test under both motion settings. Under default motion it was marked `test.fail()` until story 3.10 fixed issue 1; the mark is gone, and the test passes. The gate is measured on this machine, and Enter's p95 clears 100 ms by only about 5.5 ms (94.5 ms), so a slower or throttled machine can fail it without a code change.

### CDP `Performance.getMetrics`

Snapshots taken right before the first feedback sample and right after the last, including dropped samples: 62 actions in each run. The counters are per document, and the reload before the feedback set resets them.

| Metric             | Default: before | Default: after | Reduced motion: before | Reduced motion: after |
| ------------------ | --------------- | -------------- | ---------------------- | --------------------- |
| `JSHeapUsedSize`   | 69.9 MB         | 23.0 MB        | 42.3 MB                | 64.2 MB               |
| `LayoutCount`      | 2               | 1,407          | 2                      | 315                   |
| `RecalcStyleCount` | 7               | 2,781          | 8                      | 532                   |
| `ScriptDuration`   | 0.07 s          | 3.39 s         | 0.06 s                 | 3.03 s                |

Loading the 500-row list took 2 layouts and 7–8 style recalculations.

## Issues found

### 1. Action feedback missed NFR-2 with 500 rows under default motion (fixed in story 3.10)

**Before and after.** Default motion, 500 rows, p50 / p95 / max from input to paint. Before is story 3.8 (runs at 10:48 and 10:52 UTC); after is this run:

| Action | Before (ms)           | After (ms)         |
| ------ | --------------------- | ------------------ |
| Enter  | 179.7 / 201.8 / 216.8 | 76.4 / 94.5 / 95.5 |
| Tick   | 75.4 / 118.8 / 132.7  | 47.7 / 62.7 / 63.5 |
| Delete | 109.8 / 168.4 / 189.0 | 54.4 / 74.3 / 93.7 |

Before the fix:

- Every action changed the DOM fast: the p95 from input to DOM was 51 ms or less for all three actions.
- The paint that showed the change came late, all three p95s over 100 ms.
- Inside the span, before that paint, the longest task was 147 / 52 / 79 ms at the median (Enter / tick / delete).
- After the paint, when the server's response was applied, came a second long task: 438 / 167 / 271 ms at the median. Any input in that window waited behind it.
- Over 64 actions, Chrome ran 23,484 layouts and 24,923 style recalculations. That is about 370 per action, roughly one per row.

**Cause.** The row slide, `animate:flip` on the keyed `{#each}` in `frontend/src/App.svelte`. On every list change Svelte measures each row's box before and after the update, and `flip` then built an animation (`getComputedStyle`, `clientWidth`/`clientHeight`, `element.animate()`) for every row that moved. With 500 rows that is a few hundred animations per action, each adding style and layout invalidation, and the response re-render ran the same path again. An add moves every row, so adds were the worst case; a delete moves every row below it. The reduced-motion run isolated this: the same code and data with the slide's duration at 0 passed every feedback target, and server time was never the cause.

**Fix.** Only rows a person can see slide. `slideRow` in `frontend/src/lib/motion.ts` returns `{ duration: 0 }`, so neither `flip` nor `element.animate()` runs, for a row whose old and new boxes are both outside the viewport (visible means `bottom > 0 && top < innerHeight`). Rows on screen, including one sliding into or out of view, keep the 200 ms ease-out slide, and reduced motion stays instant. At 1280×800 that is about 20 animated rows per action instead of a few hundred.

**After (this run).** Every feedback p95 is under 100 ms (table above). Over 62 actions Chrome ran 1,405 layouts and 2,774 style recalculations, about 23 and 45 per action, against about 5 and 8 per action with reduced motion (313 and 524 over 62 actions). The longest task after paint fell from 438 / 167 / 271 ms to 39 / 40 / 38 ms at the median. Enter has the least margin: p95 94.5 ms, max 95.5 ms. The E2E `rows.spec.ts` › "motion: only rows on screen slide" pins the rule, and the default-motion feedback gate is now a plain test.

### 2. First render passes, with some margin (observation)

From `GET` resolved to 500 rows painted takes 140 / 164 ms (p50 / p95) with default motion, and 142 / 180 ms with reduced motion, where one sample reached 253 ms (the maximum, not the p95). Both include the body download and JSON parse. One main-thread task builds and lays out all 500 rows, 91–213 ms of it. A slower machine, or CPU throttling, could miss the 200 ms target. This build was not measured under throttling.

### 3. Heap figures vary between runs (no finding)

The JS heap snapshots move in both directions between runs. In story 3.8's runs the default-motion heap once rose from 23 to 46 MB over the feedback samples and once fell from 30.0 to 23.9 MB; in this run it fell from 69.9 to 23.0 MB, while the reduced-motion heap rose from 42.3 to 64.2 MB. No forced GC or heap snapshot was taken, so these numbers show when garbage collection happened, not a leak. A heap snapshot would be needed to say more.

## Not measured

- CPU or network throttling, phones, and browsers other than Chrome.
- Time to first byte and full page-load metrics (FCP, LCP). The spec times from when `GET /api/tasks` resolves, which is what NFR-2's "renders" refers to.
- Input-to-renderer and compositor-to-screen latency (see Clocks above).
