---
title: 'E2E harness against the test profile'
type: 'feature'
ticket: '5'
created: '2026-09-30'
status: done
baseline_revision: '7e465776890dda273e64e314d37fae0794d6b7d0'
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

**Problem:** The Playwright suite targets the app stack on `:8081`, so it can't seed tasks, move time, or run isolated from real data. Every UI story from 1.9 on needs a shared harness for seeding, the two clocks, failure injection, CSP and axe.

**Approach:** Point the suite at the test profile (`:8082`). Add one `e2e/fixtures.ts` that every spec imports `test`/`expect` from. It provides `seed()`, `reset()` and `advance(ms)`, installs `page.clock` before any navigation, fails a test on a CSP violation, and exposes an API-failure injector and an axe helper. A sample spec proves each piece.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8, AD-14, AD-19 and NFR-1.
- **Fixtures:**
  - An auto fixture calls `POST /api/test/reset` before each test.
  - For any test that uses `page`, the fixture calls `page.clock.install()` before the spec's first `goto`, and registers a `securitypolicyviolation` listener with `addInitScript`. At teardown it fails the test when any violation was recorded, listing each violated directive and blocked URI.
- **Helpers:**
  - `seed({text, addedAgoMs, completedAgoMs?})` posts to `/api/test/tasks` and returns the Task.
  - `advance(ms)` calls `page.clock.fastForward(ms)` and adds `ms` to a per-test server offset, which it posts to `/api/test/clock` as the new absolute value. The offset starts at 0 because reset clears it.
  - `failApi(page, {method, path, status, code})` fulfils matching `/api/**` requests with the `{detail, code}` error body (AD-5). Default: `503`, `service_unavailable`.
  - `expectNoA11yViolations(page)` runs `@axe-core/playwright` with the `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` tags, and fails on any violation of `critical` impact, listing each rule id and target.
- **Runner:** `workers: 1`. The default base URL is `http://127.0.0.1:8082`, and `E2E_BASE_URL` still overrides it. Specs move time only with `fastForward`/`runFor`; `setFixedTime` and `pauseAt` are never used.
- **Existing specs:** `smoke.spec.ts` and `headers.spec.ts` import from the fixtures, pass against `:8082`, and drop the hand-rolled CSP listener.

**Decisions (2026-10-01, user):** The full plan is approved despite its roughly 2,100 tokens.

**Never:**
- Backend, compose or frontend source changes. The harness uses the existing AD-14 router as it is.
- Raw SQL, or any seeding path other than `/api/test/*`.
- Browser-side stubs of `Date.now()`; time moves only through `page.clock`.
- Running against `:8081`, or anything that resets the app stack's data.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Seed and load | reset, then `seed({text:'old', addedAgoMs: 90_000_000})`, then `goto('/')` | the list shows `old`; the returned Task's `added_at` is about 25 h before now | — |
| Advance both clocks | installed clock, then `advance(3_600_000)` | the browser's `Date.now()` moves forward ≥ 1 h; a task added through `POST /api/tasks` afterwards has `added_at` ≈ wall + 1 h | — |
| Cumulative advance | `advance(1h)` then `advance(1h)` | server offset is 2 h, browser is +2 h | — |
| Isolation | the previous test advanced and seeded | the next test starts with no tasks and offset 0 | — |
| Inject 503 | `failApi(page, {method:'GET', path:'/api/tasks'})`, then `goto('/')` | the page's `GET /api/tasks` receives `503 {"detail", "code":"service_unavailable"}`; the empty state doesn't render | — |
| CSP violation | a spec appends an inline `<script>` to the page | the test fails at teardown, naming `script-src-elem` (or `script-src`) | proved with `test.fail()` |
| Axe | `goto('/')` on the empty list | `expectNoA11yViolations` passes | a critical violation fails with rule ids |

</frozen-after-approval>

## Code Map

- `e2e/playwright.config.ts` -- `workers: 1`, `fullyParallel: false`, `baseURL` from `E2E_BASE_URL` (default `:8081`, change it to `:8082`), a single Chromium project. Add an optional `E2E_BROWSER_CHANNEL` (for example `chrome`) passed as `use.channel`: on this machine `playwright install chromium` times out, and the system Chrome is the workaround.
- `e2e/tests/smoke.spec.ts` -- the walking-skeleton smoke, with an inline CSP listener through `addInitScript` and `window.__cspViolations`. Move that listener into the fixture and keep the page assertions.
- `e2e/tests/headers.spec.ts` -- `request`-only header checks. Change only the import.
- `e2e/package.json` / `package-lock.json` -- add `@axe-core/playwright` (4.13.x) as a devDependency. `e2e/tsconfig.json` -- `include` has `tests/**/*.ts` and the config; add `fixtures.ts`.
- `backend/app/routers/testing.py` -- the contract (read only): `POST /api/test/clock {"offset_ms"}` → 204, where the offset is absolute and in `[0, ~100 y]`; `POST /api/test/tasks {"text","added_ago_ms","completed_ago_ms"}` → 201 Task; `POST /api/test/reset` → 204. Every body has `extra="forbid"`, so send snake_case keys exactly.
- `backend/app/exceptions.py` -- `ServiceUnavailable` is `503`, `service_unavailable`; error bodies are `{detail, code}`.
- `frontend/src/App.svelte` -- on mount it calls `GET /api/tasks`, shows the empty-state text or a `ul[aria-label=Tasks]` of `li` texts, and on error shows neither. It is the only UI the sample spec can observe.
- `README.md` "End-to-end tests" (around line 136) and `.env.example` `E2E_BASE_URL` -- still say `:8081` and `docker compose up`. Switch them to the test profile.

## Tasks & Acceptance

**Execution:**
- [x] `e2e/package.json`, `package-lock.json`, `tsconfig.json`, `playwright.config.ts` -- add axe; include `fixtures.ts`; default base URL `:8082`; optional `E2E_BROWSER_CHANNEL` -- runner targets the test profile
- [x] `e2e/fixtures.ts` -- the extended `test` (auto reset, clock install, CSP teardown check, `seed`, `advance`) plus the exported `failApi`, `expectNoA11yViolations` and `expect` -- the shared harness
- [x] `e2e/tests/smoke.spec.ts`, `e2e/tests/headers.spec.ts` -- import from `../fixtures`, and drop the inline CSP code -- one harness for every spec
- [x] `e2e/tests/harness.spec.ts` -- one test per matrix row, the CSP row wrapped in `test.fail()` -- proves the harness
- [x] `README.md`, `.env.example` -- E2E runs against `COMPOSE_PROFILES=test docker compose up -d --build --wait`, the `:8082` default, `E2E_BROWSER_CHANNEL`, and one worker -- operability

**Acceptance Criteria:**
- Given the test stack is up, when `npm test` runs in `e2e/`, then every spec passes, and the CSP row reports as an expected failure.
- Given the app stack on `:8081` has tasks, when the suite runs, then those tasks are unchanged.
- Given `npx tsc --noEmit` in `e2e/`, then it reports no errors.

## Implementation Notes

- 2026-10-01: specs import `'../fixtures.ts'` (not `'../fixtures'`). Under `module: nodenext`, an ESM relative import needs an extension, so `tsconfig.json` also sets `allowImportingTsExtensions` (allowed with `noEmit`).
- 2026-10-01: `AxeBuilder` is a named import. Under `nodenext` the default import resolves to the CJS module object, and TypeScript rejects `new` on it.
- 2026-10-01: `test.fail()` does count a fixture-teardown failure (JSON reporter: expected `failed`, actual `failed`, message `script-src-elem blocked inline`). The `test.fail()` row proves only that check. Two normal tests prove the listener: one for a violation, one for a violation followed by a `reload()`.
- 2026-10-01 (review): violations are collected Node-side, through `page.exposeBinding('__reportCsp')` into a per-page `WeakMap`, so they survive navigations. `cspViolations(page)` returns that live array, and the teardown check needs no `evaluate`. `advance` now posts the server offset before it calls `fastForward`.
- 2026-10-01: `resetTestData` asserts `204`. Against `:8081` the reset is a `404`, so the suite fails before it touches any data (checked by hand).
- 2026-10-01: the axe failure path was checked with a throwaway spec (an `<img>` with no alt, which failed with `image-alt: img`). That spec was deleted afterwards.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 3 · low 25 · false 4 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 11 patches and 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The `test.fail()` CSP row also accepts a body failure, so a broken listener still reports green; its comment overclaims (BH, VG, ECH ×2) | medium | patch | Removing `addInitScript(cspListener)` makes the poll time out, and `test.fail()` counts that as the expected failure. Patch: a normal test asserts the listener recorded the violation; the comment now claims only the teardown check. |
| 2 | Violations in an earlier document are lost after `goto`/`reload`, because the init script replaces `window.__cspViolations` (BH, VG, ECH, IA) | medium | patch | The fixture's own docs ask for a reload after a late seed. Patch: collect Node-side through `exposeBinding` into a per-page array, plus a reload test. |
| 3 | Teardown's bare `catch` skips the CSP check on any `evaluate` error (BH, VG, ECH) | low | patch | Fixed by #2: teardown no longer evaluates. |
| 4 | The axe failure path is unpinned; it was checked only with a throwaway spec (VG, IA) | medium | patch | A casing slip in the impact filter would leave the only test green. Patch: `rejects.toThrow(/image-alt/)` on an injected `<img>` with no alt. |
| 5 | `seed`'s `completedAgoMs` mapping is never exercised (VG) | low | patch | A `completed_ago_ms: null` regression would pass. Patch: seed a completed task and check `completed_at`. |
| 6 | `advance` moves the browser clock before the server offset (BH, ECH) | low | patch | Direct reorder: post the offset, then `fastForward`. |
| 7 | The isolation pair isn't serial, so the second test passes vacuously alone (BH) | low | patch | `test.describe.configure({ mode: 'serial' })`. |
| 8 | Some specs read `.json()` without asserting the status (BH) | low | patch | Status asserts added. |
| 9 | `E2E_*` in `.env.example` read as if `.env` sets them, but nothing loads `.env` into Playwright (BH) | low | patch | Docs now say to set them in the shell. |
| 10 | No `typecheck` script (BH) | low | patch | `"typecheck": "tsc --noEmit"`, and the README uses it. |
| 11 | The reset failure message hard-codes `:8082` (BH) | low | patch | It now names `baseURL`. |
| 12 | `E2E_BASE_URL ?? …` keeps an empty string (ECH) | low | patch | `||`. |
| 13 | Nothing checks that `failApi` passes non-matching requests through (VG, IA) | low | defer | VG disposition: defer. The first mutation-failure story asserts it (deferred-work.md). |
| 14 | No CI runs typecheck or E2E (BH, VG) | low | reject | Pre-existing; the repo has no CI, and this story doesn't add it. |
| 15 | `failApi` has no once/abort option (BH) | low | reject | No consumer yet; the fix adds parameters. |
| 16 | Axe fails only on `critical` (BH, IA) | false | reject | NFR-1 and deliverables require "zero critical violations"; this matches. |
| 17 | `seed` doesn't validate `completedAgoMs <= addedAgoMs` locally (BH) | low | reject | The server returns 422 with a clear message in the assertion. |
| 18 | There is no callable `reset()` (IA, ECH) | low | reject | An auto reset runs before every test; no planned spec needs a mid-test reset, and exposing one adds surface. Raised to the user. |
| 19 | No test checks the page's own requests against the shifted server clock (IA) | low | reject | No UI uses time yet; epic-age-nudge specs will. |
| 20 | Isolation from :8081 rests on a manual check (IA) | low | reject | The reset 204 assert runs in every test and 404s on :8081; re-checked in verification. |
| 21 | The fixtures-import rule isn't enforced (IA) | low | reject | e2e has no linter; adding one is out of proportion. |
| 22 | Self-tests, not a UI consumer, prove the harness (IA) | low | reject | Consumers start at 1.9 by design. |
| 23 | iframe/worker violations aren't read (ECH) | low | reject | The app has no iframes or workers; with #2, frames report through the binding. |
| 24 | `advance` with a negative or fractional ms (ECH) | false | reject | The server's 422 fails the test loudly through the status assert. |
| 25 | `failApi` with 204/304 and a body (ECH) | false | reject | No caller passes those; the defaults are 503. |
| 26 | `failApi` with a trailing-slash path (ECH) | low | reject | The app calls exact paths. |
| 27 | `context.newPage()`/popups get no clock or CSP (ECH) | low | reject | The app opens no popups; specs use the `page` fixture. |
| 28 | Smoke loses its own CSP assert (VG context) | false | reject | The fixture's teardown check covers it, now proven by #1. |

## Design Notes

- **Why the helper tracks the offset:** the server takes an absolute offset (AD-14 set/clear), but `advance(ms)` is additive. The fixture keeps `offsetMs` per test, which is safe because reset zeroes it and there is one worker.
- **Clock and seeding order:** `page.clock.install()` with no `time` starts at the real wall time, which matches the server at offset 0. `seed()` runs before `goto` or is followed by a reload (AD-14).
- **CSP check at teardown:** read the violations with `page.evaluate` after `use()`. If the page is already closed, skip the check rather than throw. Confirm that `test.fail()` counts a teardown failure; if it doesn't, the CSP row asserts on an exported `cspViolations(page)` instead, and the auto check stays.

```ts
export const test = base.extend<{ seed: Seed; advance: (ms: number) => Promise<void> }>({
  page: async ({ page }, use) => { await page.addInitScript(cspListener); await page.clock.install(); await use(page); await assertNoCsp(page) },
})
```

## Verification

**Commands:**
- `COMPOSE_PROFILES=test docker compose up -d --build --wait` -- expected: `db-test`, `backend-test` and `frontend-test` are healthy
- `cd e2e && npm ci && npx tsc --noEmit && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green, with the CSP row as an expected failure
- `curl -s http://127.0.0.1:8081/api/tasks` before and after the run -- expected: identical
