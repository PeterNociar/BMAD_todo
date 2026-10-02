---
title: 'Age bar and live overdue'
type: 'feature'
ticket: '3'
created: '2026-10-01'
status: done
baseline_revision: 'c13749a2d1dc7d422085e349ba8b757ff1c1feed'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ageColour` (2.2) exists but nothing shows it. CAP-4's live overdue cue, UJ-3, and the age parts of CAP-5 and CAP-7 are unproven in the browser.

**Approach:** Add the 3 px age bar on open rows, coloured by `ageColour(…, 'light')` through `style.setProperty`. It is recomputed with the label from one `clock.now` snapshot. Prove the live behaviour end to end with a server-only clock-skew fixture.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8, AD-14, FR-7, FR-9, FR-10, FR-15, EXPERIENCE "Age Nudge" and "Overdue transition (live)", and DESIGN `components.age-bar` / `age-bar: 3px`.
- **Bar:**
  - An `aria-hidden` element on the left edge of open rows only, 3 px wide and full row height, in the slot TaskRow's 15 px left inset already leaves.
  - Its colour comes from a `--age-colour` custom property, set with `element.style.setProperty` in an effect. Never use an inline `style` attribute: the CSP is `default-src 'self'`.
  - Completed rows render no bar.
  - The theme argument is `'light'`. A comment says epic 3 switches it (the touch point is recorded in epic 3's Notes).
- **One snapshot:** the label and the colour are derived from the same read of `clock.now` in TaskRow.
- **Live overdue:** with the page open, a task crossing 24 h shows the overdue colour and `1d` within 60 s, at the same list index. Nothing is written to either live region, and focus doesn't move.
- **Skew fixture:**
  - `e2e/fixtures.ts` gains `skewServer(ms)`, which moves only the server clock. It shares one offset counter with `advance()`, so the two never desync.
  - Its docstring calls it the single, deliberate exception to AD-8's "move both clocks together".
- **Time zone:** the same seeded data, viewed in two browser contexts with different `timezoneId`s, gives identical labels, bar colours and order.
- **Future timestamp:** a task added through the UI while the server is ahead of the browser shows `now` and the fresh colour.
- **Tick and untick:** a 2-day task that is ticked shows `done now` and no bar. Unticked, it returns to its original index with `2d` and the overdue colour.
- **Coverage:** axe reports no critical violations, and the 70% gate holds.

**Decisions (2026-10-01, user):** The plan is approved at about 1,650 tokens.

**Never:**
- The hold timer, the sticky held row, or toast placement (entries 4 and 5).
- Dark tokens, or passing `'dark'` (epic 3).
- Changes to `lib/age.ts` beyond a bug that this story exposes, recorded in Implementation Notes.
- Announcing age changes, or moving a row on a timer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Bar colour | an open task aged 12 h | the bar's computed background equals `ageColour` at 12 h, light (`rgb(143, 117, 6)`) | — |
| No bar when done | a completed task | no bar element | — |
| UJ-3 crossing | seed 23 h 59 m 30 s plus an older and a newer task; input focused; `advance(60_000)` | that row reads `1d` with overdue `rgb(196, 63, 62)`; its index is unchanged; no live-region writes (MutationObserver); input still focused | — |
| Time zone | the same seed viewed under `UTC` and `Pacific/Kiritimati` | labels, colours and order are identical | — |
| Future | `skewServer(+1 h)`, then add a task via the UI | `now` and fresh `rgb(36, 144, 87)` | — |
| Tick 2-day | seed 3 d, 2 d, 1 h; tick the 2 d task | `done now`, no bar | — |
| Untick | untick it | back at index 1, `2d`, overdue colour | — |
| CSP | every spec | no violation (fixture) | — |
| A11y | axe at 1280 px with open and done rows | no critical violations | — |

</frozen-after-approval>

## Code Map

- `frontend/src/components/TaskRow.svelte` -- `const age = $derived(ageLabel(row.completed_at ?? row.added_at, clock.now, done))` (around line 16). The header comment says the bar's slot (left padding) stays empty for now; replace that line. `.task-row` keeps its DESIGN padding, with 15 px on the left (3 px bar + 12). Read `clock.now` once into a `$derived` and feed both `ageLabel` and `ageColour`. Set `--age-colour` with an `$effect` on a `bind:this` element, as App does for `--sticky-height` via `style.setProperty`.
- `frontend/src/lib/age.ts` -- `ageColour(timestamp, now, done, theme): string | null` (`#RRGGBB`). It treats a future or unparseable timestamp as fresh.
- `frontend/src/App.svelte` -- the keyed `<li data-task-row>` with `animate:flip`. Leave it alone.
- `e2e/fixtures.ts` around lines 116–126: the `advance` fixture keeps `let offsetMs = 0` and posts `/api/test/clock {offset_ms}`, then `page.clock.fastForward`. Lift the counter into a shared fixture so `skewServer` and `advance` both add to it. `resetTestData` zeroes the server at the start of each test.
- `e2e/tests/age.spec.ts` (2.1) -- the label specs and the MutationObserver "not live" pattern. Put this story's specs in a new `e2e/tests/age-bar.spec.ts`, or extend `age.spec.ts`.
- `docs/ai-log.md` -- append the section for this story.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/TaskRow.svelte`, `TaskRow.test.ts` -- the bar, one snapshot, `setProperty`, none when done; unit-test its presence, its colour and its update on `clock` -- the cue
- [x] `e2e/fixtures.ts` -- the shared offset and `skewServer` -- the AD-8 exception
- [x] `e2e/tests/age-bar.spec.ts` -- one test per matrix row -- end-to-end proof
- [x] `docs/ai-log.md` -- the section for this story (Ticket 2.3)

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes.

## Implementation Notes

- 2026-10-01: The bar is an absolutely positioned `[data-age-bar]` span (new `--space-age-bar: 3px` token in `app.css`); `.task-row` became `position: relative`. Its colour derives from `added_at` (a completed row renders no bar). No change to `lib/age.ts`: the story exposed no bug.
- 2026-10-01: The fixture's page set-up moved into an exported `preparePage(page)`, so the time-zone test's own contexts get the fake clock and the CSP check. The shared offset lives in a `serverClock` fixture used by `advance` and `skewServer`.
- 2026-10-01: The CSP matrix row has no test of its own; the fixture's teardown check covers every spec, including the two time-zone pages.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 14 · false 0 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 10 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Exact E2E colour checks against a colour that moves every second can tip a channel (BH, ECH) | medium | patch | The `near()`/`expectBarColour()` helpers allow ±2 per channel on every bar-colour assertion. |
| 2 | The UJ-3 seed was 30 s from the boundary (flaky), and its colour assertion couldn't see a change: the bar is already overdue at 23 h 59 m 30 s (ECH, VG) | medium | patch | Seeded at 23 h 59 m; the comment says honestly that the label proves the live recompute here, and the TaskRow unit test proves the recolour. |
| 3 | Time-zone seeds near label boundaries across sequential views; "mid" colour unpinned; contexts missed device settings; CSP check skippable (BH, ECH ×3) | low | patch | Mid-unit seeds with slack, "mid" pinned to `rgb(146, 115, 2)`, `devices['Desktop Chrome']` contexts, CSP check and close in `finally`. |
| 4 | `skewServer`/`advance` sum untested; the docstring invites a negative offset the server rejects (`ge=0`); non-integer ms gives an opaque 422 (BH, ECH ×2) | low | patch | Guards with clear errors; the docstring fixed; a skew-plus-advance test (`added_at` 2 h ahead, browser shows `now`). |
| 5 | `bar` typed `undefined`, but `bind:this` sets `null` (BH) | low | patch | `HTMLSpanElement \| null`. |
| 6 | No CSS fallback before the effect runs (BH) | low | patch | `var(--age-colour, transparent)`. |
| 7 | A unit test name overclaims "never writes a style attribute" (BH) | low | patch | Renamed; the E2E CSP check is named as the real proof. |
| 8 | The untick unit test's "recoloured" reuses the same colour (BH) | low | patch | Clock moved 12 h between tick and untick; a new element with `#C43F3E`. |
| 9 | ai-log "Nothing surfaced" before review; ambiguous wording (BH ×2) | low | patch | Review and What AI missed filled in; reworded. |
| 10 | Redundant untick assertion and duplicated set-up (BH) | low | patch | Folded into the shared set-up. |
| 11 | No forced-colours decision for the bar (BH) | low | reject | The label carries the age (FR-10); the bar is decorative and `aria-hidden`. |
| 12 | The skew fixture isn't used in the live crossing or tick tests (IA) | low | reject | The ticket scopes skew to the future-timestamp row; AD-8 keeps both clocks together everywhere else. |
| 13 | Visibility, focus, pageshow and wake triggers not shown in E2E (IA) | low | reject | Pinned by `clock.test.ts` (1.6); the ticket's verify asks for the timer crossing. |
| 14 | The snapshot is structural, not observed (IA) | low | reject | One `$derived` read feeds both values; the tests show both agree after each tick. |
| 15 | A mid-session time-zone change isn't covered (IA) | low | reject | Playwright can't change a live context's zone; two contexts prove independence. |
| 16 | E2E runs on the test profile, not the app profile (IA) | low | reject | The app profile has no test router to seed and move time (AD-14). |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: green
