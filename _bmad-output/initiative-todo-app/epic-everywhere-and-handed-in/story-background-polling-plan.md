---
title: 'Background polling'
type: 'feature'
ticket: '2'
created: '2026-10-01'
status: 'built'
baseline_revision: '5eb9101117688e32a243398a0d0aeaf9391d703d'
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

**Problem:** The store reads the server only on load, on Retry and after a failed mutation. A task added or deleted on the phone never reaches an idle laptop tab without a reload. CAP-10 and AD-10 need background sync.

**Approach:** Add the AD-10 poll inside `lib/tasks.svelte.ts`, with its own `visibilitychange` listener (no `App.svelte` change). It builds on 1.12's `refresh()`/merge and 3.1's silent-when-ready rule. Record the failed-poll decision in the spec and architecture Open Questions.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-9, AD-10 and AD-11.
- **Start:** polling starts at the first successful GET (the state first reaching `ready`), never before. It runs once per store.
- **Cadence:** a poll every 30 s (`POLL_MS = 30_000`, exported) while `document.visibilityState === 'visible'`.
- **Hidden:** the poll stops while the tab is hidden; no GET is sent.
- **Visible again:** one immediate GET, then the 30 s cadence restarts from that moment.
- **Skips:** a poll tick or a visible-refetch is skipped, not queued, while a GET is in flight or any add's POST is in flight (an entry with `confirmed === null`). In-flight tick, untick or delete ops do not block a poll.
- **Failure:** a failed poll is silent: the list is kept, no toast, no alert, and the next tick tries again (3.1's rule, user decision).
- **Merge:** polls go through `refresh()` and the existing merge, so keys, the hold and pending ops are kept, focus never moves, and nothing is announced.
- **`dispose()`:** the store gains `dispose()`, which clears the poll timer and removes its listener. Tests call it; the app singleton never does.
- **Docs:** the spec's Open Questions entry and the architecture's Open Questions item 1 move out as resolved: "Decided (2026-10-01, user): a failed background poll after the first successful load stays silent; the list is kept and the next 30 s tick retries."
- **Coverage:** the 70% gate holds.

**Never:**
- Changes to `App.svelte`, `api.ts`, `toasts.svelte.ts`, `focus.ts` or `clock.svelte.ts`.
- Polling before the first successful load, or a GET queued by a poll.
- A toast, alert or announcement from a poll.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No poll before ready | `loading`, or `load_failed`; 60 s pass | no extra GET | — |
| Cadence | `ready`, visible; 30 s, then 60 s | one GET at 30 s, one at 60 s | — |
| Picks up a remote add | a poll returns a new task | it appears (key = id); held row and focus untouched; no announce | — |
| Picks up a remote delete | a poll omits a task stamped ≤ S | it is removed; a held row deleted elsewhere loses the hold | — |
| Hidden pause | hidden for 90 s | no GET | — |
| Visible refetch | hidden → visible | one GET at once, the next 30 s later | — |
| Skip: GET in flight | a GET is in flight when a tick fires | no second or queued GET from that tick | — |
| Skip: POST in flight | an add's POST is in flight at tick or visible | skipped; the next tick polls | — |
| Op in flight | a tick op in flight at tick time | the poll is sent | — |
| Silent failure | a poll fails `unavailable` | list kept, `ready`, no toast or alert; the next tick polls | — |
| dispose | `dispose()`, then 60 s and a visibility change | no GET | — |
| E2E: other device adds | idle tab, input focused; API POST; `advance(30 s)` | the row appears; focus still on the input | — |
| E2E: other device deletes | API DELETE; `advance(30 s)`, then again | the row is gone and stays gone | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/tasks.svelte.ts`
  - `createTasks()` (l.97) holds the state.
  - `runGet()` (around l.296): the success path sets `ready`; start polling there the first time.
  - `refresh()` (l.334) uses `getInFlight` for the in-flight check. Do not call `refresh()` from a poll when it is non-null, because `refresh()` would queue.
  - An add's POST is in flight when `entries.some(e => e.confirmed === null)`.
  - The return object (around l.440) gets `dispose`. The header comment gains a polling sentence.
- `frontend/src/lib/clock.svelte.ts` -- the existing `visibilitychange` pattern to copy (`document.visibilityState === 'visible'`). Don't change it.
- `frontend/src/lib/clock.test.ts:8,42` -- how tests stub `document.visibilityState` (`Object.defineProperty`, `configurable`) and dispatch `visibilitychange`. Reuse it.
- `frontend/src/lib/tasks.svelte.test.ts`
  - `beforeEach` (l.80) creates the store, and `afterEach` (l.94) should call `store.dispose()`.
  - Fake timers for `setTimeout`/`setInterval` as in the hold tests (l.1025).
  - `control()` deferreds and the `lists[n]` GETs.
- `e2e/fixtures.ts` -- `advance(ms)` moves the browser and server clocks. The page clock drives `setInterval`.
- `e2e/tests/harness.spec.ts:59` -- `request.post('/api/tasks', {data: {text}})` is the "other device". DELETE is `request.delete('/api/tasks/<id>')`.
- New `e2e/tests/sync.spec.ts`.
- `_bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md:106` and `architecture-todo-app/architecture-todo-app.md:388` -- the Open Questions to resolve.
- `docs/ai-log.md` -- append `## Ticket 3.2 — Background polling`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/tasks.svelte.ts` -- `POLL_MS`, start on first ready, the visibility listener, the skips, `dispose()`, the header comment -- AD-10 polling
- [x] `frontend/src/lib/tasks.svelte.test.ts` -- `dispose()` in `afterEach`; one test per store matrix row -- proves the cadence and the skips
- [x] `e2e/tests/sync.spec.ts` -- the two E2E rows, with the API as the other device -- end-to-end proof
- [x] spec and architecture Open Questions -- record the decision -- the ticket's doc owner
- [x] `docs/ai-log.md` -- the Ticket 3.2 section

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes, including the existing ones that `advance` the clock past 30 s.

## Implementation Notes

- The `visibilitychange` listener is added in `startPolling()` (first successful GET), not in `createTasks()`, so the never-loaded module singleton in tests registers nothing.
- A first load that lands while hidden starts no interval; the next visible change polls and starts it.
- Open Questions in the spec and architecture now read "None open." with a `### Resolved` list holding the decision.
- Verified: check, lint, Prettier, 388 Vitest tests (99.26% statements), build; e2e typecheck and 78/78 Playwright tests on the rebuilt test stack.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 9 · false 5 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `App.test.ts` `resetTasks()` never disposes the old store, so the polling intervals and listeners leak into later tests and call the shared mocked `listTasks` (VG, ECH) | medium | patch | `resetTasks()` disposes `current` first. |
| 2 | The polling suite leaves its `visibilityState` stub on `document` (ECH, BH) | low | patch | `afterEach` deletes the own property. |
| 3 | `getQueued !== null` in `poll()` is unreachable (BH, VG) | low | patch | Dropped: `getQueued` is set only while `getInFlight` is set, and they clear in back-to-back microtasks that no timer or visibility event can interleave. The ai-log bullet is fixed. |
| 4 | The skipped visible-refetch tests don't check that the cadence restarts at the visible event (BH) | low | patch | Assert that the next GET is 30 s after the event. |
| 5 | The header comment reads "polls once at once" (BH) | low | patch | Reworded. |
| 6 | Vite HMR orphans a polling store in dev (ECH) | low | reject | Dev only, and the orphan sends harmless GETs; `clock.svelte.ts` has the same pre-existing pattern. |
| 7 | No test of a pending delete or untick surviving a poll merge (BH) | low | reject | Polls run through 1.12's merge. "Keeps pending ops applied and queued across a merge" (l.600) and "keeps a task deleted after S gone when a stale GET still lists it" (l.559) pin it. |
| 8 | Alt-tabbing sends a GET on every return to visible (BH) | low | reject | AD-10: "fetches immediately when it becomes visible again"; an in-flight GET already blocks a burst. |
| 9 | EXPERIENCE.md is not updated (BH, IA) | low | reject | The intent names the spec and architecture Open Questions only. |
| 10 | E2E is thin (hidden/visible, no announce, focus on delete), and the second delete poll proves little (BH, IA) | low | reject | Those rules are mutation-checked in the unit suite (VG traced each one); the E2E rows match the frozen matrix. |
| 11 | `dispose()` leaves the hold timer and an in-flight GET running (BH) | false | reject | Its contract is to stop polling, and it does; only tests call it. |
| 12 | The plan isn't in the review diff, and `ticket: '2'` doesn't match "3.2" (BH) | false | reject | The plan is left out by design. `ticket` is the entry id within the epic. |
| 13 | Most poll rules are proven only at the unit surface (IA) | false | reject | Descriptive; the unit tests are mutation-checked (VG). |
| 14 | The surface grew with `dispose()` (IA) | false | reject | It is in the frozen rules. |
| 15 | Open Questions closed rather than kept open (IA) | false | reject | The frozen rule says "move out as resolved". |

## Design Notes

- **Skip, don't queue:** a skipped tick costs at most 30 s of staleness, while a queued GET behind a POST would race the POST's own merge for no gain. AD-10 says "a poll tick is skipped while any POST is in flight".
- **`setInterval` while visible:** clear it on hidden. On visible, poll once and start a fresh interval, so the next tick is 30 s after the visible-refetch.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
