---
title: 'Frontend pure core: api client, sort mirror and clock'
type: 'feature'
ticket: '6'
created: '2026-10-01'
status: 'built'
baseline_revision: '0c45d2aae00b2c2e350053cf151b3c9a680e5605'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The store (entry 1.8) needs three pure building blocks that don't exist yet: an API client for all five task calls with the AD-5 error mapping, a frontend copy of the canonical order, and the one frontend clock. Today `lib/api.ts` has only `listTasks()`, and it throws a bare `Error`.

**Approach:** Extend `lib/api.ts` to the five AD-3 calls. Each one rejects with an `ApiError` carrying a client `code`, mapped status-first, with a 10 s timeout. Add `lib/sort.ts`, locked to `contracts/ordering-cases.json`, and `lib/clock.svelte.ts` with `clock.now` and `clock.sample()` and its refresh triggers.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-3, AD-4, AD-5, AD-6 and AD-8.
- **api.ts:**
  - Exports `listTasks`, `addTask(text)`, `tickTask(id)`, `untickTask(id)` and `deleteTask(id)`, plus the `Task` type and `ApiError` (`code: string`, `status: number | null`).
  - URLs are relative `/api/...`, and the `id` is passed through `encodeURIComponent`. `addTask` sends `{"text": text}` as given, with `content-type: application/json`.
  - Errors are mapped in this order:
    1. A fetch rejection, or 10 s passing before the body has been read, gives `network_error` with `status: null`.
    2. Status 413 gives `text_too_long`.
    3. Status 502, 503 or 504 gives `unavailable`.
    4. Any other non-2xx status gives the body's `code` when it is a string.
    5. A non-JSON body, or a JSON body without a string `code`, gives `unavailable`.
    6. A 2xx response whose JSON can't be read also gives `unavailable`.
  - The timeout uses `AbortController` with global `setTimeout`, cleared when the call settles, so `vi.useFakeTimers()` drives it.
- **sort.ts:**
  - `sortTasks(tasks)` returns a new array and never mutates its input.
  - Its input is a `Sortable` = `{ id: string | null; key: string; added_at: string; completed_at: string | null }`.
  - Order: open tasks by `added_at` ascending, then completed tasks by `completed_at` descending. Timestamps are compared as `Date.parse` numbers.
  - Ties: between two ids, by `id` ascending. A task with an id sorts before one without. Between two tasks without an id, by `key` ascending.
- **clock.svelte.ts:**
  - `clock.now` is reactive epoch ms. `clock.sample()` reads `Date.now()`, sets `now` and returns it.
  - `now` refreshes every 30 s, on `visibilitychange` when the page becomes visible, on window `focus` and on `pageshow`.
  - It is the only `Date.now()` call site in `src/` apart from tests, and ESLint enforces that.
- **Tests:** Vitest runs every `ordering-cases.json` case through `sortTasks`, with `key` set to `id`. The frontend coverage gate stays at 70% or above.

**Decisions (2026-10-01, user):** The full plan is approved despite its roughly 2,250 tokens.

**Never:**
- Store logic in `api.ts`: no retries, no treating 404 as success (AD-11 is the store's job, entry 1.8), no trimming or length checks.
- A copy of the fixture file inside `frontend/`, or a second sort anywhere.
- A test-only hook in the clock, or `setFixedTime`-style stubs. Tests use `vi.useFakeTimers()` with `vi.setSystemTime()` and re-import the module.
- Changes to `App.svelte` beyond what keeping `listTasks` working requires, or to the store, toasts or components.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Calls | each of the five calls succeeds | the right method and URL; `addTask` sends the JSON body; resolves `Task[]` / `Task` / `void` (204) | — |
| Fetch fails | `fetch` rejects | `ApiError{code:'network_error', status:null}` | — |
| Timeout | `fetch` never settles, 10 s pass | aborted; `network_error` | — |
| 413 from nginx | HTML body | `text_too_long` | — |
| 503 with JSON | `{"code":"service_unavailable"}` | `unavailable` (status wins) | — |
| 502 / 504 | any body | `unavailable` | — |
| JSON code | 404 `{"code":"task_not_found"}`, 422 `{"code":"text_too_long"}` | that code | — |
| Bad error body | 500 with non-JSON, or JSON without `code` | `unavailable` | — |
| Ordering fixtures | every case in `contracts/ordering-cases.json` | ids in `expected` order | — |
| Pending ties | same `added_at`; an id-less task among confirmed ones | confirmed tasks first by `id`; id-less tasks by `key` | — |
| 30 s tick | fake timers at T; advance 30 s | `clock.now` = T + 30 s; unchanged before that | — |
| Visible again | time moves, then `visibilitychange` with `visible` | `now` updates; with `hidden` it doesn't | — |
| focus / pageshow | time moves, then the event fires | `now` updates | — |
| sample() | time moves | returns `Date.now()` and `now` equals it | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/api.ts` -- the `Task` type and `listTasks()`, which throws `Error('GET /api/tasks failed with status N')`. Keep the name and signature so `App.svelte` and `App.test.ts` stay as they are.
- `frontend/src/lib/api.test.ts` -- stubs `fetch` with `vi.stubGlobal`, and expects `'/api/tasks'` as the only fetch argument. Replace the `toThrow('503')` test with the ApiError matrix. Every call now passes an init object (at least `signal`), so check the URL and init separately.
- `frontend/src/App.svelte` / `App.test.ts` -- they call `listTasks()` and mock `./lib/api`. Don't touch them.
- `contracts/ordering-cases.json` (repo root) -- `{description, cases: [{name, tasks: [{id,text,added_at,completed_at}], expected: [id]}]}`, with 7 cases including `same_ms_open_tie` and `cross_group_tie`. `backend/tests/test_ordering.py` reads the same file.
- `frontend/tsconfig.app.json` -- extends `@tsconfig/svelte` (`moduleResolution: bundler`, with no `resolveJsonModule`), and its `types` doesn't include `node`. Add `"resolveJsonModule": true`, and import the fixture in `sort.test.ts` as `../../../contracts/ordering-cases.json`. The Docker build runs only `vite build`, which never sees test files.
- `frontend/vite.config.ts` -- Vitest on jsdom, with coverage over `src/lib/**` and `src/components/**` and 70% thresholds.
- `frontend/eslint.config.js` -- a flat config. Add `no-restricted-properties` for `Date.now` on `src/**`, with an override that turns it off for `src/lib/clock.svelte.ts` and `**/*.test.ts`.
- `docs/ai-log.md` -- append-only, one section per ticket, using the existing headings (Agents, Prompt that worked, MCP servers, Test generation, Debugging with AI, What AI missed, Review). Ticket 5 has no section yet.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/api.ts`, `api.test.ts` -- the five calls, `ApiError` and the mapping order; one test per api matrix row -- AD-3/AD-5 client
- [x] `frontend/src/lib/sort.ts`, `sort.test.ts`, `tsconfig.app.json` -- `sortTasks` plus the fixture-driven `it.each` and the pending-tie cases -- AD-6 mirror
- [x] `frontend/src/lib/clock.svelte.ts`, `clock.test.ts` -- `clock.now` and `sample()`, the interval and the three listeners; tests per clock matrix row -- AD-8
- [x] `frontend/eslint.config.js` -- the `Date.now` restriction -- AD-8 "only call site"
- [x] `docs/ai-log.md` -- append `## Ticket 5 — E2E harness against the test profile` (from that plan's notes and triage) and `## Ticket 6 — Frontend pure core` -- epic touch point

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given a `Date.now()` added to any non-test file in `src/` other than the clock, when `npm run lint` runs, then it fails.

## Implementation Notes

- 2026-10-01: `api.ts` races both `fetch` and `response.text()` against the abort signal. A hand-built `Response` with a stalled body ignores the fetch signal, so racing is what makes the "body not read within 10 s" case reject. 413 and 502/503/504 return without reading the body; 204 resolves without reading it.
- 2026-10-01: `sortTasks` is generic (`<T extends Sortable>(tasks: readonly T[]) => T[]`) so the store can pass its own row type and get it back.
- 2026-10-01: the ESLint rule is checked on `.svelte` files too (a throwaway component with `Date.now()` failed lint and was deleted).
- 2026-10-01: mutation checks, all reverted: flipped id tie-break, 503 or 413 dropped from the status rules, timeout not cleared. Each made the matching tests fail.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 22 · false 1 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches and 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | No test proves `clock.now` is reactive; a plain `let` would pass every test (BH, IA) | medium | patch | AD-8 age rendering depends on it. Patch: `clock.svelte.test.ts` runs an `$effect` in `$effect.root` and asserts a re-run after the 30 s tick; it fails with a plain `let`. |
| 2 | The lint rule bans only the literal `Date.now`; `new Date()` and `Date()` also read the wall clock (BH, VG, ECH, IA) | low | patch | `no-restricted-syntax` for a no-argument `new Date()` and a bare `Date()` call, with the same override. `globalThis.Date.now` and aliases are left: unlikely in everyday code. |
| 3 | api test gaps: the stalled-body test lacks the pending/abort asserts; no check that GET/PUT/DELETE send no headers or body; no empty non-2xx body (BH) | low | patch | Assertions added, plus 500 `''` → `unavailable`. |
| 4 | `covers every fixture case` only checks `length >= 7` (BH) | low | patch | It now asserts that `same_ms_open_tie` and `cross_group_tie` exist. |
| 5 | The Ticket 6 ai-log entry is missing the standard headings and the review (BH) | low | patch | Headings and the review summary added; the process aside removed. |
| 6 | No automated test pins the lint rule, and there is no CI (BH, VG) | low | defer | VG disposition: defer; see deferred-work.md. |
| 7 | Clock listeners and interval are never torn down (HMR, resetModules) (BH, ECH, IA) | low | reject | Dev-only and harmless: `sample()` is idempotent; the fix adds HMR plumbing. |
| 8 | Importing the clock without a DOM throws (ECH) | low | reject | The app is a browser SPA (AD-1) and tests run in jsdom. |
| 9 | `Date.parse` NaN breaks the total order (BH, ECH) | low | reject | Timestamps are always `.sssZ` from the server (AD-7), or `toISOString()` from the store. |
| 10 | 2xx bodies are cast, not shape-checked; a 204 on a non-DELETE resolves `undefined` (BH, ECH) | low | reject | The server contract is fixed and tested (AD-3); validation would add a layer with no demonstrated failure. |
| 11 | `ApiError` drops the underlying cause; the broad catch hides programming errors (BH) | low | reject | No consumer needs it; `fetch` rejections are network failures by contract. |
| 12 | The unread body on 413/5xx keeps the stream open (ECH) | low | reject | The browser releases it on GC; no observed harm. |
| 13 | An empty, `.` or `..` id builds the wrong URL (ECH) | low | reject | Calls take only server UUIDs (AD-4). |
| 14 | `clock.now` can go backwards when the wall clock steps (ECH) | low | reject | AD-8 clamps negative ages to "now". |
| 15 | No test feeds `clock.sample()` through `sortTasks` (IA) | low | reject | ms → `.sssZ` conversion belongs to the store (entry 1.8). |
| 16 | Pending tie rules are outside the fixture file (IA) | low | reject | The fixture is shared with the backend, which has no pending tasks; the rules are pinned by `sort.test.ts`. |
| 17 | Server codes pass through unmapped (IA) | false | reject | AD-5: "otherwise the JSON `code`". |
| 18 | Real-browser fetch abort is not exercised (IA) | low | reject | `controller.abort()` is the standard path; the E2E stories cover the browser. |

## Design Notes

- **Tie rule:** the AD-6 server rule (ties by `id`) holds for every pair of confirmed tasks. Putting id-less tasks after confirmed ones, and ordering them by `key`, keeps the comparator a total order. Comparing `id` with `key` would mix two orders and could be intransitive.
- **Clock tests:** the module installs its interval and listeners when it is imported. Each test calls `vi.useFakeTimers()`, `vi.setSystemTime(T)`, `vi.resetModules()`, then `await import('./clock.svelte')`. Fake `document.visibilityState` with `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })`.

```ts
export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number | null) { super(code) }
}
```

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green, coverage ≥ 70%
- Add `Date.now()` to `src/lib/sort.ts` temporarily and run `npm run lint` -- expected: `no-restricted-properties` error; revert
