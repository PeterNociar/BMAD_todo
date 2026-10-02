# QA report: performance

- **Date:** 2026-10-02 (runs at 10:48 and 10:52 UTC)
- **Commit measured:** the commit that adds this report (story 3.8, on top of `a1953b8`). The test stack was rebuilt from that tree, and the only change that reaches the running app is the nginx clickjacking headers.
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

The run: `40 passed (6.7m)`. That is 36 accessibility cells, 2 measurement tests, and 2 feedback gates, one of which is the expected failure described under Gate below.

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
| Default motion | 0      | 1     | 1    | 2      |
| Reduced motion | 0      | 0     | 1    | 0      |

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
| API < 300 ms                 | `GET /api/tasks` (500 tasks)      | 25  | 19.1     | 23.4     | 35.3     | 300    | **pass** |
|                              | `POST /api/tasks`                 | 25  | 9.9      | 19.7     | 25.2     | 300    | **pass** |
|                              | `PUT /api/tasks/{id}/tick`        | 25  | 10.3     | 18.1     | 28.6     | 300    | **pass** |
|                              | `PUT /api/tasks/{id}/untick`      | 25  | 10.6     | 13.8     | 14.2     | 300    | **pass** |
|                              | `DELETE /api/tasks/{id}`          | 25  | 8.6      | 10.8     | 12.2     | 300    | **pass** |
| 500 rows render < 200 ms     | `GET` resolved → 500 rows painted | 20  | 134.2    | 150.4    | 164.7    | 200    | **pass** |
| Feedback < 100 ms (500 rows) | Enter → held row painted          | 20  | 179.7    | 201.8    | 216.8    | 100    | **fail** |
|                              | tick click → row painted as done  | 20  | 75.4     | 118.8    | 132.7    | 100    | **fail** |
|                              | delete click → row gone, painted  | 20  | 109.8    | 168.4    | 189.0    | 100    | **fail** |

Supporting figures from the same run (p50 / p95):

| Measure                                        | Render        | Enter         | Tick          | Delete        |
| ---------------------------------------------- | ------------- | ------------- | ------------- | ------------- |
| Start → change in the DOM and laid out (trace) | 115.8 / 131.7 | 41.4 / 51.3   | 19.9 / 26.0   | 20.6 / 37.0   |
| The same, in-page                              | 115 / 132     | 42 / 51       | 20 / 26       | 21 / 37       |
| Longest task in the span                       | 113.3 / 128.0 | 146.8 / 176.5 | 51.9 / 87.2   | 79.3 / 112.8  |
| Longest task after paint                       | 96.2 / 142.7  | 437.9 / 480.4 | 166.9 / 309.5 | 271.4 / 403.8 |

### Reduced motion (`prefers-reduced-motion: reduce`, same spec)

| NFR-2 target             | Measure                           | n   | p50 (ms) | p95 (ms) | max (ms) | Target | Result   |
| ------------------------ | --------------------------------- | --- | -------- | -------- | -------- | ------ | -------- |
| API < 300 ms             | `GET`                             | 25  | 19.7     | 25.9     | 35.9     | 300    | **pass** |
|                          | `POST`                            | 25  | 9.7      | 13.1     | 13.4     | 300    | **pass** |
|                          | `PUT tick`                        | 25  | 10.5     | 12.0     | 13.6     | 300    | **pass** |
|                          | `PUT untick`                      | 25  | 10.4     | 12.2     | 12.3     | 300    | **pass** |
|                          | `DELETE`                          | 25  | 8.5      | 10.4     | 11.6     | 300    | **pass** |
| 500 rows render < 200 ms | `GET` resolved → 500 rows painted | 20  | 130.6    | 173.7    | 187.4    | 200    | **pass** |
| Feedback < 100 ms        | Enter → held row painted          | 20  | 67.6     | 79.4     | 82.6     | 100    | **pass** |
|                          | tick → row painted as done        | 20  | 35.0     | 56.3     | 58.8     | 100    | **pass** |
|                          | delete → row gone, painted        | 20  | 42.2     | 50.2     | 54.0     | 100    | **pass** |

The longest tasks with reduced motion, p50 / p95:

| Window      | Add            | Tick           | Delete         |
| ----------- | -------------- | -------------- | -------------- |
| In the span | 23.8 / 31.9 ms | 10.6 / 23.9 ms | 11.1 / 30.9 ms |
| After paint | 33.1 / 42.7 ms | 36.7 / 44.6 ms | 26.4 / 40.1 ms |

### Gate

`npm run qa` now fails if a target that is met today regresses. The measurement test asserts that every API p95 is under 300 ms and the 500-row render p95 is under 200 ms, in both runs. A second test, "NFR-2 feedback under 100 ms with 500 rows", checks the three feedback p95s against 100 ms:

- **Reduced motion:** a plain test. It passes, and it will fail on a regression.
- **Default motion:** marked `test.fail()` ("known miss: animate:flip on 500 rows"). Playwright lists it as an expected failure (a red ✘ that still counts as passed), so the miss is visible on every run. Once issue 1 is fixed, the test reports "expected to fail, but passed" until the mark is removed.

### CDP `Performance.getMetrics`

Snapshots taken right before the first feedback sample and right after the last, including dropped samples: 64 actions with default motion, 61 with reduced motion. The counters are per document, and the reload before the feedback set resets them.

| Metric             | Default: before | Default: after | Reduced motion: before | Reduced motion: after |
| ------------------ | --------------- | -------------- | ---------------------- | --------------------- |
| `JSHeapUsedSize`   | 30.0 MB         | 23.9 MB        | 21.2 MB                | 24.0 MB               |
| `LayoutCount`      | 2               | 23,486         | 2                      | 309                   |
| `RecalcStyleCount` | 7               | 24,930         | 7                      | 519                   |
| `ScriptDuration`   | 0.07 s          | 11.61 s        | 0.05 s                 | 2.67 s                |

Loading the 500-row list took 2 layouts and 7 style recalculations.

## Issues found

### 1. Action feedback misses NFR-2 with 500 rows under default motion (fail)

**Evidence.**

- Every action changes the DOM fast: the p95 from input to DOM is 51 ms or less for all three actions.
- The paint that shows the change comes late. At p95: Enter 202 ms, tick 119 ms, delete 168 ms.
- Inside the span, before that paint, the longest task is 147 / 52 / 79 ms at the median.
- After the paint, when the server's response is applied, comes a second long task: 438 / 167 / 271 ms at the median, and up to 506 ms. Any input in that window waits behind it.
- Over 64 actions, Chrome ran 23,484 layouts and 24,923 style recalculations. That is about 370 per action, roughly one per row.

**Cause.** The row slide, `animate:flip` on the keyed `{#each}` in `frontend/src/App.svelte:234`. On every list change it measures each row's box before and after the update, and starts an animation for every row that moved. With 500 rows, that means a forced layout per row inside one long task.

- An add inserts the held row at the top, which moves every row, so adds are the worst case.
- A delete moves every row below it.
- The response re-render runs the same path again.

The reduced-motion run isolates this. The same code and data, with the slide's duration at 0 (`App.svelte:30-35`), drop to 307 layouts over 61 actions. The longest task falls to under 47 ms, and every feedback figure passes (p95: 79, 56 and 50 ms). Server time is not the cause: every API call answers within 26 ms at p95.

**Impact.** This doesn't show with a short list: the E2E motion tests use a few rows, and the slide is about 200 ms by design. At 500 rows, though, the visible change after an action takes 120–200 ms. The page then stays busy for up to half a second after the server answers.

**Status: reported, not fixed in this story.** The plan scopes performance to measuring and reporting. The architecture defers rendering optimisations "until NFR-2 fails" (architecture › Deferred), and it now fails at 500 rows. Two candidate follow-ups:

- skip `animate:flip` when the list is long, for example over 100 rows, or animate only the rows in the viewport;
- move the slide to a FLIP that batches all reads before any write.

Either needs its own ticket, with the motion E2E (`rows.spec.ts` › "motion", `hold.spec.ts` › "normal motion") kept green. The ticket that fixes it also removes `test.fail()` from the default-motion gate.

### 2. First render passes, with some margin (observation)

From `GET` resolved to 500 rows painted takes 134 / 150 ms (p50 / p95) with default motion, and 131 / 174 ms with reduced motion. Both include the body download and JSON parse. One main-thread task builds and lays out all 500 rows, 105–149 ms of it. A slower machine, or CPU throttling, could miss the 200 ms target. This build was not measured under throttling.

### 3. Heap figures vary between runs (no finding)

The JS heap snapshots move in both directions between runs. In an earlier run of this spec, the default-motion heap rose from 23 to 46 MB over the feedback samples; in this run it fell from 30.0 to 23.9 MB. No forced GC or heap snapshot was taken, so these numbers show when garbage collection happened, not a leak. A heap snapshot belongs in the follow-up for issue 1.

## Not measured

- CPU or network throttling, phones, and browsers other than Chrome.
- Time to first byte and full page-load metrics (FCP, LCP). The spec times from when `GET /api/tasks` resolves, which is what NFR-2's "renders" refers to.
- Input-to-renderer and compositor-to-screen latency (see Clocks above).
