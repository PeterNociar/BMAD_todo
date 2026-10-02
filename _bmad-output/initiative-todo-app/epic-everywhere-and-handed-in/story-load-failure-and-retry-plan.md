---
title: 'Load failure and Retry'
type: 'feature'
ticket: '1'
created: '2026-10-01'
status: done
baseline_revision: '12bb0d7990386b4fc0f4ec9c76e3d804ac8d60dc'
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

**Problem:** A failed first `GET /api/tasks` leaves the store in `loading` forever: no toast, no Retry, and the toast's Retry button (already rendered for `load_failed`) has no store state to raise it. FR-17 and AD-10 require a persistent Retry toast with the list hidden. The 2.4 deferral (a reload during a hold doesn't pause the countdown) is also closed here.

**Approach:** Add `load_failed` to the store's `loadState` and a `retry()` action (AD-10). The store raises and hides the load-failure toast and the retry-failed alert (AD-17). `App.svelte` wires the toast's `onretry` to `tasks.retry()`. `e2e/fixtures.ts` `failApi` returns a function that clears the injected failure.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-9, AD-10, AD-17, AD-18; EXPERIENCE › State Patterns (Load error; Add while loading or after load error).
- **`LoadState`** = `'loading' | 'ready' | 'load_failed'`.
- **Failed GET while `loading`** → `load_failed`. On the first failure, call `toasts.showLoadFailure()`. If the toast is already up (a failed Retry), it stays and the store calls `toasts.alert(COPY.retryFailed)`. If another GET is queued behind the failed one, the state stays `loading` and the queued GET decides.
- **Failed GET while `ready` or `load_failed`** (a recovery GET) is silent: nothing changes.
- **Any successful GET** (first load, Retry, recovery) sets `ready` and calls `toasts.hideLoadFailure()`.
- **`retry()`** acts only in `load_failed`: it sets `loading` and requests a GET. A second click while `loading` is a no-op.
- **`rows` under `load_failed`:** only the held row, if there is one. The rest of the list stays hidden until a GET succeeds.
- **Hold countdown:** runs whenever `loadState !== 'loading'`, so a task added under `load_failed` counts down 3 s. Entering `loading` (Retry) cancels a running countdown, keeping `heldKey`. A full 3 s starts when that load settles (`ready` or `load_failed`).
- **App:** `onretry={() => tasks.retry()}`. No empty state and no skeleton under `load_failed`; Retry's `loading` shows the skeleton again (the existing delay effect). The focus safety net moves focus to the input when the Retry button disappears. No new focus code.
- **`failApi`** returns `() => Promise<void>`, which removes that route. Existing call sites stay valid.
- **Coverage:** the 70% gate holds.

**Never:**
- Polling, visibility handling or auto-retry (entry 2).
- Changes to `toasts.svelte.ts`, `ToastLayer.svelte`, `focus.ts` or `api.ts`.
- `.focus()` outside `lib/focus.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First load fails | GET → `unavailable` | `load_failed`; `showLoadFailure` once; `rows` empty | — |
| Retry succeeds | `load_failed`; `retry()`; GET → tasks | `loading` then `ready`; rows shown; `hideLoadFailure` | — |
| Retry fails | `load_failed`; `retry()`; GET fails | back to `load_failed`; toast kept; `alert(COPY.retryFailed)` | — |
| Retry while loading | `retry()` twice | one GET | — |
| Silent while ready | `ready`; recovery GET fails | list kept, no toast, no alert, stays `ready` | — |
| Recovery GET recovers | `load_failed`; an op fails `network_error`, recovery GET succeeds | `ready`; toast hidden | — |
| Queued GET decides | first GET fails while a recovery GET is queued, which succeeds | never `load_failed`; ends `ready`; no toast | — |
| Add under load_failed | `add('x')` | `rows` = [held x]; its 3 s ends the hold; then `rows` empty | — |
| Retry restarts countdown | held under `load_failed`, 2 s elapsed; `retry()`; GET settles | no hold end while `loading`; ends 3 s after it settles | — |
| E2E | GET failed on load; clear; Retry | Retry toast, no empty state, no list; then list, toast gone, focus on input | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/tasks.svelte.ts`
  - `LoadState` (l.30).
  - `rows` `$derived` (l.109) — add the `load_failed` filter.
  - `startHoldTimer` guard `loadState !== 'ready'` (l.131) → `=== 'loading'`.
  - `runGet` catch (l.285) holds the placeholder comment "Epic 3 adds load_failed…"; replace it with the failure rules. After `merge`, call `hideLoadFailure`.
  - `refresh`/`getQueued` (l.298) — `getQueued !== null` at failure time means a GET is queued behind.
  - `load()` (l.314) is used on mount and in `App.test.ts:444`; keep it.
  - Return object (l.373) — add `retry`.
- `frontend/src/lib/toasts.svelte.ts` -- `showLoadFailure`/`hideLoadFailure` (idempotent), `alert(text)`, `COPY.retryFailed`. Use these, don't change them.
- `frontend/src/lib/tasks.svelte.test.ts` -- `control()` per-call deferreds, `loaded()`, and spies on `toasts.error`/`announce`. Add spies for `showLoadFailure`, `hideLoadFailure` and `alert`, and use `vi.useFakeTimers` for the hold rows (see the existing `HOLD_MS` tests).
- `frontend/src/App.svelte` -- l.212 `onretry={() => void tasks.load()}` changes to `tasks.retry()`. `showEmpty` (l.46) is already `ready`-only and `showList` (l.47) needs no change.
- `frontend/src/App.test.ts` -- mocks `./lib/api` under the real store (l.80 waits for `ready`). Add the Retry wiring test.
- `e2e/fixtures.ts:188` `failApi` -- keep the handler in a const and return `() => page.unroute('**/api/**', handler)`.
- `e2e/tests/harness.spec.ts:116` -- the failed-GET test; it should stay green.
- New `e2e/tests/load-failure.spec.ts`. Reuse `rowTexts`-style locators, `[data-toast-kind="load_failed"]` and `getByRole('button', {name: 'Retry'})`.
- `docs/ai-log.md` -- append `## Ticket 3.1 — Load failure and Retry`, following the 2.x sections.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/tasks.svelte.ts` -- `load_failed`, `retry()`, the failure/success toast calls, the `rows` filter, the hold-countdown rule, and an updated header comment -- AD-10, FR-17
- [x] `frontend/src/lib/tasks.svelte.test.ts` -- one test per store matrix row -- proves the rules
- [x] `frontend/src/App.svelte`, `App.test.ts` -- `onretry` → `tasks.retry()`; a test that the GET fails, the Retry toast shows, no empty state, then a click on Retry renders the list and the toast is gone -- wiring
- [x] `e2e/fixtures.ts` -- `failApi` returns its clear function -- fixture owner
- [x] `e2e/tests/load-failure.spec.ts` -- the E2E matrix row, plus axe on the failed state -- end-to-end proof
- [x] `docs/ai-log.md` -- the Ticket 3.1 section

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes.

## Implementation Notes

- The store tracks whether it raised the load-failure toast in a reactive `loadFailureShown`. That flag tells a first failure (`showLoadFailure`) from a failed Retry (`alert(COPY.retryFailed)`). After review, it also gates the `rows` filter, so the list stays hidden through the Retry GET.
- `load()` cancels the running hold countdown as well as `retry()`, which is `load()` behind the `load_failed` guard.
- `App.svelte`'s skeleton-delay effect resets `skeletonDue` in its cleanup, so Retry keeps the 300 ms delay (review).
- The 2.4 deferral (deferred-work.md) is resolved by the countdown rule and its test; the entry itself is left as written.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 9 · false 7 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 9 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Rows hidden under `load_failed` reappear while the Retry GET is loading, then vanish again if it fails (BH, IA) | medium | patch | The `rows` filter tested `loadState === 'load_failed'`, but Retry sets `loading`. It now filters while the load-failure toast is up (reactive `loadFailureShown`); store test added. |
| 2 | The double-Retry test passes without the guard, and nothing pins `onretry` to `retry()` (VG) | medium | patch | The store test now settles the GET and asserts 2 calls; an App test double-clicks Retry. |
| 3 | `skeletonDue` stays true after a failed load that lasted over 300 ms, so Retry renders the skeleton before the effect resets it (ECH) | low | patch | Reset in the effect's cleanup. |
| 4 | A failed Retry and the held row under `load_failed` are tested only in the store (BH, IA) | low | patch | App tests added: the toast and alert text after a failed Retry, and the held row as the only row. |
| 5 | No test that a recovery GET failing under `load_failed` is silent (BH) | low | patch | Store test added. |
| 6 | The "queued GET fails too" test asserts too little (BH) | low | patch | Asserts that `alert` isn't called and the rows are empty. |
| 7 | Retry racing a recovery GET is untested (BH) | low | patch | Store test added. |
| 8 | The header comment's "never retries" contradicts `retry()` (BH) | low | patch | Now "never retries on its own". |
| 9 | The fixtures header doesn't mention that `failApi` returns a clear function (BH) | low | patch | Bullet added. |
| 10 | Retry gives no busy feedback, and extra clicks do nothing (BH) | low | reject | EXPERIENCE specifies no busy state; "Retry shows the skeleton again" is the feedback. |
| 11 | `retry()` resolves early when it does nothing (BH) | false | reject | The only caller (`App.svelte` `onretry`) ignores the promise. |
| 12 | A task added under `load_failed` disappears after its hold (BH) | false | reject | EXPERIENCE: "the list, including these tasks, stays hidden until Retry succeeds; the held task still shows for its hold". |
| 13 | A confirmed mutation under `load_failed` doesn't recover the list (BH) | false | reject | EXPERIENCE: "No auto-retry"; AD-10 recovers only through Retry or a recovery GET. |
| 14 | `loadFailureShown` duplicates the toast module's state (BH) | false | reject | AD-17: only the store raises or hides that toast, and it has no dismiss, so the two can't drift. |
| 15 | The AI log writes off the `rows.spec.ts` motion flake with no record (BH) | false | reject | deferred-work.md already has that entry, from 2.6. |
| 16 | The intent says "pause" but the code restarts a full 3 s (IA) | false | reject | The intent describes the bug; the frozen rule and the epic decision (2026-10-01) say cancel, then a full 3 s. |
| 17 | Any failing GET while `loading` counts, not only the first (IA) | false | reject | That is AD-10's rule, and Retry needs it. |
| 18 | The literal deferral (`load()` while `ready`) is untested; the E2E viewport size is unexplained (IA, BH) | low | reject | No caller reaches `load()` while `ready` before polling; the viewport comment is cosmetic. |

## Design Notes

- **Why "queued GET decides":** a recovery GET queued behind the failing first load may well succeed. Flashing the toast and an alert, then hiding them, would be noise.
- **Why filter `rows` in the store:** AD-9 makes `rows` the final render order, and it keeps App free of state rules. The `listEmpty` announce check already requires `ready`.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
