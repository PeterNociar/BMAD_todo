---
title: 'User-journey E2E suite'
type: 'feature'
ticket: '7'
created: '2026-10-02'
status: 'built'
baseline_revision: 'a63179ad4e4fe1a32c62fb0c63434cc169c6b0b3'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The E2E suite proves each story's rules in isolation, but no test walks a user's whole journey. The epic's Done when 5 and `deliverables.md` require at least 5 E2E tests covering UJ-1 to UJ-3. CAP-9 (load failure) and CAP-10 (sync) also need journey-level proof.

**Approach:** Add a new `e2e/tests/journeys.spec.ts` with five journey tests on the test profile:
- UJ-1;
- UJ-2, including its failure path;
- UJ-3;
- load-failure Retry;
- cross-device sync.

Each test follows EXPERIENCE › Key Flows step by step. It drives the app only through the UI and the 1.5 fixtures (`seed`, `advance`, `failApi`, `expectNoA11yViolations`, `preparePage`). No app code changes.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8 (time moves only through `advance` and `page.clock.runFor`, never `pauseAt` or `setFixedTime`), AD-14, and AD-19 (the fixture fails a test on any CSP violation).
- **Size:** each journey is one `test()` with `test.step(...)` per Key Flows step, and its title names the UJ.
- **Accessibility:** every journey ends with `expectNoA11yViolations(page)`, so no critical axe violations at its end state.
- **Locators:** by role and accessible name only (rows by their `Delete "<text>"` button, as in `hold.spec.ts`). No CSS classes except `li.held` and `[data-age-bar]`, which existing specs already use for those states.
- **The five journeys:**
  1. **UJ-1, jot mid-meeting.**
     - Seed about 8 older tasks. Focus is in the input on load.
     - Type and press Enter. The input clears and keeps focus.
     - The new task is the held row under the input, with "now" and a green bar (±2/255, `age-bar.spec.ts` constants).
     - After `runFor(3_000)` it settles at the bottom of the open tasks.
     - **Failure path, in the same test:** with `POST /api/tasks` failed, the add rolls back, the "Couldn't save new task." toast shows, and the text is back in the empty input. Clear the failure (the 3.1 `failApi` return), press Enter again, and it saves.
  2. **UJ-2, clear the backlog.**
     - Seed two overdue tasks (2 d, 1 d) and two fresher ones.
     - Tick the first red task: it shows "done now", moves to the top of the completed tasks, and focus returns to the input.
     - Untick it: it goes back to its place near the top, still red, still "2d".
     - Tick it again.
     - **Failure path:** with `PUT …/tick` failed on a second task, the row returns as it was and the "Couldn't update that task. It's back as it was." toast shows. Clear the failure.
     - Delete every remaining task through its `×`. The run ends on the empty state.
  3. **UJ-3, overdue live.**
     - Seed a task 23 h 59 m old. It shows "23h" and is not yet red.
     - `advance(60_000)`. Without a reload, the label reads "1d", the bar is overdue red, the row hasn't moved, and focus is unchanged.
  4. **Load failure.**
     - With `GET /api/tasks` failed, `goto`. The Retry toast shows, with no empty state and no list.
     - Clear the failure and press Retry. The seeded list shows, the toast is gone, and focus is on the input.
  5. **Cross-device sync.**
     - The laptop is `page`. The phone is a second context opened with `preparePage` (as `age-bar.spec.ts:160` does), with a phone viewport.
     - The phone adds a task through its UI.
     - The idle laptop tab shows it after `advance(30_000)` on the laptop page, with focus unchanged.
     - The phone deletes a task, and it is gone from the laptop after the next poll.
     - Run the phone context's CSP check.
- **Repeatability:** the suite passes 3 times in a row (`--repeat-each 3`) on the rebuilt test stack. A step that waits on time uses the existing guards (the `stillHeld` pattern from `hold.spec.ts`) or `expect.poll`, never a fixed `waitForTimeout`.
- **Shared helpers:** small helpers are allowed inside the spec. Move one to `fixtures.ts` only if a second spec already has the same helper.

**Never:**
- Changes to `frontend/` or `backend/`.
- Seeding or reading through `request` inside a journey after `goto`. The other device is a browser context, not the API.
- Retries (`test.describe.configure({ retries })`), `waitForTimeout`, or a paused clock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| UJ-1 | 8 seeded tasks; type, Enter | held row with "now" and green; the input is empty and focused; it settles after 3 s | — |
| UJ-1 failure | POST failed; Enter | rollback, add toast, text restored; retry after clear saves | — |
| UJ-2 | tick, untick, tick, delete all | "done now", back to "2d" in place, empty state at the end; focus in the input | — |
| UJ-2 failure | tick PUT failed | the row returns as it was; action toast | — |
| UJ-3 | 23 h 59 m old; advance 60 s | "1d", overdue red, same position, no reload | — |
| Load failure | GET failed on load; clear; Retry | toast with no list or empty state, then the list, the toast gone, focus on the input | — |
| Sync | the phone context adds, then deletes | the laptop shows the add, then loses the delete, each after one 30 s poll; focus unchanged | — |
| Repeat | `--repeat-each 3` | 15/15 green; no CSP or critical axe violations | — |

</frozen-after-approval>

## Code Map

- `_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md` › Key Flows -- the UJ-1, UJ-2 and UJ-3 step lists and their failure paths; mirror them in `test.step` names.
- `e2e/fixtures.ts`:
  - `test` and `expect`;
  - `seed({text, addedAgoMs, completedAgoMs?})`;
  - `advance(ms)`, which moves the browser and server clocks together;
  - `failApi(page, {method, path})`, which returns a clear function;
  - `expectNoA11yViolations`;
  - `preparePage`, for a second context, whose returned check is called at the end.
- `frontend/src/lib/api.ts:81-97` -- the op endpoints: `PUT /api/tasks/{id}/tick`, `PUT …/untick`, `DELETE /api/tasks/{id}`, and `POST`/`GET /api/tasks`.
- `e2e/tests/hold.spec.ts:14-45` -- `HOLD_MS`, the `row`/`del` locators, and the `stillHeld` guard. Copy the pattern; don't import from another spec.
- `e2e/tests/age-bar.spec.ts:13-55` -- the colour constants (`FRESH`, `OVERDUE`) and `expectBarColour` with ±2.
- `e2e/tests/age-bar.spec.ts:155-175` -- a second browser context with `preparePage` and its CSP check.
- `e2e/tests/sync.spec.ts` -- `nextPoll`, which waits for the poll's `GET` response after `advance(30_000)`.
- `e2e/tests/load-failure.spec.ts` -- the toast and Retry locators.
- `e2e/tests/capture.spec.ts` / `rows.spec.ts` -- the toast copy and `[data-toast-kind]` locators for the add and action failures.
- `docs/ai-log.md` -- append `## Ticket 3.7 — User-journey E2E suite`.

## Tasks & Acceptance

**Execution:**
- [x] `e2e/tests/journeys.spec.ts` -- the five journeys, with steps -- Done when 5, CAP-9, CAP-10
- [x] `docs/ai-log.md` -- the Ticket 3.7 section

**Acceptance Criteria:**
- Given the rebuilt test stack, when `npm run typecheck`, `npm run format:check` and `E2E_BROWSER_CHANNEL=chrome npm test` run in `e2e/`, then all pass.
- Given the same stack, when `npx playwright test tests/journeys.spec.ts --repeat-each 3` runs, then 15/15 pass.

## Implementation Notes

- Locators: row order comes from the `Delete "<text>"` button names; age labels from `getByText(label, { exact: true })` inside the row. Toasts use `[data-toast-kind]`, as the Code Map says.
- UJ-2 seeds one completed task, so "top of the completed tasks" is a real check. It dismisses the action toast before the deletes: the toast covers the top row's ×, and a mouse over it holds it open.
- UJ-3 "not yet red" is checked through the "23h" label only. At 23 h 59 m `ageColour` already returns the overdue hex `#C43F3E`.
- UJ-3 "no reload": a `window` flag set before `advance` is still there afterwards.
- CAP-10 phone: `devices['Pixel 7']`, plus the phone's axe check as well as its CSP check.
- Verified: typecheck, format:check, the full E2E suite (112 passed), and `journeys.spec.ts --repeat-each 3` (15/15).

## Plan Change Log

## Review Triage Log

- Coordinator review, 9 findings, all patched:
  - the CAP-10 pre-poll read is one-shot;
  - "30m" also accepts "31m";
  - the shared helpers moved to `fixtures.ts`;
  - docblock fixes;
  - UJ-1 checks the list fills the screen (viewport 1280×360);
  - UJ-2 has its climax step;
  - UJ-3 checks that nothing is announced;
  - the phone's CSP check runs in `finally`;
  - two more axe checks on populated states.

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 21 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 11 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The CAP-10 pre-poll check retries, so it can't prove the change came only via the poll, and the laptop's own 30 s poll can race it on a slow run (BH, ECH) | medium | patch | A one-shot read, with a slow-run message. |
| 2 | The "30m" label check fails if more than ~30 s of real time passes after the seed (ECH) | medium | patch | Tolerates 30m or 31m. |
| 3 | Helpers copied into a third spec, against the plan's own move rule (BH) | low | patch | `channels`/`near`/`expectBarColour`, `settled`, `stillHeld` and `nextPoll` moved to `fixtures.ts` and imported. |
| 4 | Stale docblock names; `seedOlder` miscounts; a redundant position re-check (BH) | low | patch | Fixed. |
| 5 | UJ-1's "older tasks fill the screen" is unproven (BH, IA) | low | patch | The oldest row is asserted to be outside the viewport. |
| 6 | UJ-2's climax, "top no longer red", is unasserted (BH, IA) | low | patch | The top open row's bar is asserted not to be overdue. |
| 7 | UJ-3's "nothing is announced" is unasserted (BH, IA) | low | patch | Live regions empty, no toast. |
| 8 | The phone's CSP check is skipped on earlier failures, and the step title overclaims (BH) | low | patch | Moved to `finally`; retitled. |
| 9 | Axe runs only on near-empty end states (BH) | low | patch | Also on UJ-2's populated list and with UJ-1's toast showing. |
| 10 | UJ-1's second failure clause (other text being typed stays) (BH, IA) | low | reject | `capture.spec.ts` (1.9) covers the restore-only-into-empty rule. |
| 11 | UJ-1 rollback doesn't prove the optimistic row appeared first (BH) | low | reject | `capture.spec.ts` pins the optimistic row and its rollback; a delayed route would add timing for no new rule. |
| 12 | The UJ-2 keyboard and phone variants and the skeleton flash are not walked (BH, IA) | low | reject | `rows.spec.ts` (keyboard, touch) and `capture.spec.ts` (skeleton) cover them; the plan scopes the journey. |
| 13 | UJ-3's tab-return recompute and sleep/wake path are untested (BH, IA) | low | reject | `age-bar.spec.ts` and the clock tests cover visibility and wake. |
| 14 | Key Flows' "red-orange at 23h" vs the overdue hex at 23 h 59 m (BH, IA) | false | reject | DESIGN's `age-23h` (#C44231) and `age-24h` (#C43F3E) are near-identical by design; the label carries the crossing. The plan's "not yet red" is checked through the "23h" label. |
| 15 | The phone clock never moves, and the phone's polling is unexercised (BH) | low | reject | The phone is only the writer; laptop polling is the CAP-10 claim. |
| 16 | No failed-Retry case; the Retry GET isn't asserted (BH, IA) | low | reject | 3.1's store and App tests cover a failed Retry; the list rendering proves the GET. |
| 17 | `page.clock.runFor` moves only the browser clock (ECH) | low | reject | AD-8 and the fixture docs allow `runFor` for the hold; a 3–6 s skew can't change any label in these journeys. |
| 18 | Only 3 of the 5 tests are UJ tests; the observations go beyond "UI only" (IA) | false | reject | The ticket names the five (UJ-1 to UJ-3 plus load failure and sync); the restriction is on driving, and assertions may observe. |
| 19 | The ECH claim about driving through the UI only (ECH) | false | reject | As #18. |

## Verification

**Commands:**
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && npm run format:check && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
- `cd e2e && E2E_BROWSER_CHANNEL=chrome npx playwright test tests/journeys.spec.ts --repeat-each 3` -- expected: 15 passed
