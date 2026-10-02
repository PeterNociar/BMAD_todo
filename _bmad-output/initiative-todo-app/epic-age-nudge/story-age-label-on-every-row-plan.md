---
title: 'Age label on every row'
type: 'feature'
ticket: '1'
created: '2026-10-01'
status: done
baseline_revision: '1c9382b17539fe8712f23021d97e03316574d036'
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

**Problem:** Rows show no age, which is the product's one idea (CAP-4). This story is the epic's tracer bullet, from the clock through a pure age module to the row and E2E.

**Approach:**
- Add pure `lib/age.ts` `ageLabel(timestamp, now)`, which returns the visible label and the spoken words.
- Render the label in `TaskRow` as the right-aligned mono age column, recomputed from `clock.now`.
- Prove it with unit boundaries and an E2E that moves time.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8 (one clock, pure age functions, negative ages clamped to now), FR-10, FR-15, and EXPERIENCE Voice and Tone (labels and words) and Accessibility Floor. DESIGN: `typography.age-label`, `components.age-label`, and Layout & Spacing.
- **`ageLabel(timestamp: string, now: number, done: boolean)`:** returns `{ label, words }`. The age is `now − Date.parse(timestamp)`, clamped to 0 or more, and rounded down:

  | Age | Open | Completed |
  |---|---|---|
  | < 60 s | label `now`, words `added just now` | label `done now`, words `completed just now` |
  | < 60 min | `Nm`, `added N minutes ago` | `done Nm`, `completed N minutes ago` |
  | < 24 h | `Nh`, `added N hours ago` | `done Nh`, `completed N hours ago` |
  | otherwise | `Nd`, `added N days ago` | `done Nd`, `completed N days ago` |

  - The words are singular for 1, e.g. `added 1 hour ago`.
  - It is pure: no clock reads, no DOM.
  - Entries 2 and 3 add colour to this module.
- **Row:** `TaskRow` passes `row.added_at` for open rows and `row.completed_at` for done rows, with `clock.now`. It renders the label between the text and the delete button:
  - The label is `aria-hidden`, JetBrains Mono 12 px (`--font-mono`), with tabular figures. It is right-aligned in a column at least `9ch` wide, coloured `text-secondary` on open rows and `text-muted` on done rows.
  - The words sit in a `.visually-hidden` span in the same row, so a screen reader reads the task text, then its age.
  - The row-contents order is tick, text, age, delete. Gaps follow DESIGN.
  - Labels are never inside a live region.
- **Tests:** Vitest covers every boundary in the table, plus a future timestamp. The epic 1 assertions that read a row's whole text are changed to target the task text, so they keep their intent; never delete them. TaskRow's "No age label or bar until epic 2" comment is replaced.
- **E2E:** `e2e/tests/age.spec.ts` on the test profile, using the 1.5 fixtures.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):** The plan is approved at about 1,700 tokens.

**Never:**
- Age colour or the age bar (entries 2 and 3), or the hold timer (entries 4 and 5).
- `Date.now()`, `new Date()` or `Date()`. Time comes from `clock.now` (lint enforces this).
- Changes to the store, api, sort, toasts, focus or clock modules.
- Announcing age changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Boundaries | ages 59 s, 60 s, 59 m 59 s, 1 h, 23 h 59 m, 24 h, 47 h, 3 d | `now`, `1m`, `59m`, `1h`, `23h`, `1d`, `1d`, `3d` | — |
| Words | 5 h open; 2 h done; 30 s open; 1 h open | `added 5 hours ago`; `completed 2 hours ago`; `added just now`; `added 1 hour ago` | — |
| Done labels | completed 2 h ago | `done 2h` | — |
| Future | timestamp 10 s after now | `now`, `added just now` | — |
| Live (E2E) | seed a 5 h task; `goto`; `advance(1 h)` | row shows `5h` with `added 5 hours ago` exposed; then `6h` with no reload | — |
| Wide label (E2E) | a task added 100 d ago, completed 100 d ago, at 320 px | `done 100d`; no horizontal scroll; axe has no critical violations | — |
| Not live | the label changes | the polite region doesn't change | — |

</frozen-after-approval>

## Code Map

- `frontend/src/components/TaskRow.svelte` -- `.task-row` flex: tick button, `<span class="text">`, delete button. `row: Row` (`{key, id, text, added_at, completed_at}`), `done = row.completed_at !== null`. The header comment at line 5 says there's no age yet. Touch hit areas use `@media (hover: none)`, and `--line` uses `--line-height-body`.
- `frontend/src/lib/clock.svelte.ts` -- `clock.now` (reactive epoch ms; refreshed every 30 s and on visible, focus and pageshow). Read it inside a `$derived` in TaskRow.
- `frontend/src/app.css` -- `--font-mono` (around line 44), `--color-text-secondary`, `--color-text-muted`, the spacing tokens and `.visually-hidden`. `@fontsource/jetbrains-mono/400.css` is already imported in `main.ts`.
- **Row-text assertions to retarget (about 40 matches):** `e2e/tests/rows.spec.ts`, `e2e/tests/capture.spec.ts`, `e2e/tests/harness.spec.ts`, `frontend/src/App.test.ts` and `frontend/src/components/TaskRow.test.ts` use `getByRole('listitem')` with `toHaveText([...])`. Point them at the task-text element, and keep each test's intent.
- `e2e/fixtures.ts` -- `seed({text, addedAgoMs, completedAgoMs})`, `advance(ms)` (moves page and server together), `expectNoA11yViolations`. Viewport via `page.setViewportSize`.
- `docs/ai-log.md` -- append the section for this story.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/age.ts`, `age.test.ts` -- `ageLabel`, with one test per boundary and words row -- AD-8 pure function
- [x] `frontend/src/components/TaskRow.svelte`, `TaskRow.test.ts` -- the age column, the hidden words, live from `clock.now`, the comment replaced -- the row
- [x] e2e and unit row-text assertions -- retarget them to the task text -- keep epic 1's suites meaningful
- [x] `e2e/tests/age.spec.ts` -- the live and wide-label rows -- end-to-end proof
- [x] `docs/ai-log.md` -- the section for this story (Ticket 2.1)

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 14 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 10 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The visual contract is untested: right-aligned, mono, tabular, 9ch, open/done colours, alignment across rows (VG, BH, IA) | medium | patch | `age.spec.ts` asserts each with `toHaveCSS`, a 9ch probe, and right edges within 0.5 px. |
| 2 | Task text and age words read as one run for screen readers ("aged added 5 hours ago") (BH) | medium | patch | The hidden span leads with ", ". Chromium's tree renders it "aged , added …" because the span is absolutely positioned; the comma still gives the pause, and this is noted in the test. |
| 3 | The wide-label E2E can't tell the added and completed timestamps apart (BH) | low | patch | Seeded as added 120 d and completed 100 d, so it expects `done 100d`. |
| 4 | No long-text plus label check at 320 px (BH) | low | patch | A 300-character word beside the label: no horizontal scroll, label visible. |
| 5 | The "not live" check samples the live region once (BH, ECH) | low | patch | A MutationObserver watches both regions for the whole `advance` window. |
| 6 | The `age.ts` header comment says "epic 2" (BH) | low | patch | Now says stories 2.2 and 2.3. |
| 7 | `0.75rem` and `9ch` are hard-coded (BH) | low | patch | `--font-size-age-label` and `--space-age-column-min` tokens added. |
| 8 | Tests leave `clock.now` frozen; the order test reads `className[0]` (BH) | low | patch | `clock.sample()` in `afterEach`; `classList.contains`. |
| 9 | The done table lacks the 0 s and 47 h cases (BH) | low | patch | Added. |
| 10 | Long inline locators in the harness spec (BH) | low | patch | `rowTexts` helper. |
| 11 | ai-log results unstated | low | patch | Real totals from the run: 269 Vitest tests at 98.49% statements; 55 E2E. |
| 12 | Found during verification: the 1.11 lint-rules test times out at 5 s under coverage (1 of 3 runs green) | low | patch | 30 s file timeout; then 5 consecutive coverage runs green. |
| 13 | A NaN timestamp reads "now" (BH, ECH) | low | reject | The server always sends `.sssZ` (AD-7); the same call was made in 1.6. |
| 14 | A 1000-day label exceeds 9ch (ECH) | low | reject | The longest label in practice is `done 100d` (DESIGN sizes the column for it). |
| 15 | The three-argument signature vs the intent's two (IA, ECH) | false | reject | The plan's Boundaries specify `ageLabel(timestamp, now, done)`; the intent summarises it. |
| 16 | Inconsistent test selectors (`.text` vs `data-age-words`) (BH) | low | reject | Cosmetic. |
| 17 | The plan isn't in the diff; `ticket: '1'` (BH) | false | reject | Excluded by design; `ticket` is the entry id within the epic, per the tree rules. |
| 18 | The touch layout's label alignment is unconfirmed (BH) | low | reject | The label keeps its first-line margin; touch only re-pads the buttons. |
| 19 | The clock refresh triggers aren't isolated in the row tests (IA) | false | reject | The E2E `advance` goes through the real 30 s interval; the triggers are pinned in `clock.test.ts` (1.6). |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: green
