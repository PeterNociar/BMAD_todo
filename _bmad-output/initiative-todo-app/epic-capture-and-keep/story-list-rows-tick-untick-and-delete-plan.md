---
title: 'List rows: tick, untick and delete'
type: 'feature'
ticket: '10'
created: '2026-10-01'
status: 'built'
baseline_revision: '6af555cfea5a562003810104b97ed84c97b2089f'
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

**Problem:** The list is still 1.9's plain text, so a task can't be ticked, unticked or deleted from the UI. The store (1.8, 1.12) and the focus helpers (1.7) for these actions are ready.

**Approach:** Replace 1.9's text-only `<li>` with a `TaskRow` component per DESIGN.md's Ledger row. Each row has:
- a tick ring, with a filled check when the task is done;
- the wrapping task text;
- a delete ×, revealed on hover on a laptop and always visible on touch.

Rows are keyed by client `key` and slide with `animate:flip`, honouring reduced motion. Arrow keys and Esc are wired through `lib/focus`, and focus returns to the input after each action. Prove the behaviour with E2E on the test profile.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-4, AD-9, AD-13, AD-17 and AD-18. Follow DESIGN.md: task-row, tick-ring and delete-button components, Layout & Spacing, Colors, and the focus ring. Follow EXPERIENCE: Task row, Tick ring, Delete button, Interaction Primitives (Keyboard, Laptop vs phone, Motion), and Accessibility Floor.
- **Row (`components/TaskRow.svelte`):**
  - `<li data-task-row>` holds the tick `<button data-row-control="tick">`, the text, and the delete `<button data-row-control="delete">`.
  - The text is plain interpolation only. It wraps anywhere, and long URLs break.
  - Completed rows show the filled check and muted text, with no strike-through.
  - There is no age label or bar until epic 2. The row keeps the DESIGN padding: 15 px left, made up of the 3 px bar slot plus 12 px.
- **Names:** "Mark "X" done" and "Mark "X" not done" on the tick, and "Delete "X"" on the delete. X is the task text. Icons are `aria-hidden`.
- **Actions:**
  - Tick calls `tasks.tick(key)` or `tasks.untick(key)`, depending on the row state. Delete calls `tasks.remove(key)`.
  - After each action the row calls `returnToInput()`. That function is hover-gated, so on a phone focus stays put.
  - The store raises the announcements and toasts; the component never does.
- **Delete visibility:**
  - Under `(hover: hover)`, the delete has opacity 0 and `pointer-events: none` until the row is hovered or has focus within it. It stays in the Tab order.
  - Otherwise it is always visible.
- **Hit areas:** at least 24×24 px. On touch, the tick and delete hit areas span the full row height without changing their visual size.
- **Hover:** on a laptop, a hovered row takes the `hover` tint.
- **Motion:** `animate:flip` runs for about 200 ms ease-out on tick, untick and the reorder after a delete. A deleted row goes at once, with no out-transition. Under `prefers-reduced-motion: reduce` the duration is 0, read through `matchMedia` when the animation runs.
- **Keyboard:** `onRowKeydown` is the list's delegated `keydown` handler. Down from the input already goes through `onInputKeydown`.
- **Sticky clearance:** a focused row control is never hidden under the sticky header. Controls get `scroll-margin-top: var(--sticky-height)`, and App sets that variable from a `ResizeObserver` on the header.
- **States:** 1.9's skeleton, empty state, loading and `aria-busy` behaviour is unchanged. `<ul aria-label="Tasks">` stays.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):**
- The rule that toasts sit below a held row is left to epic 2, which owns the hold. It is logged in deferred-work.
- The main session may run the app-profile down/up check (volume kept, never `-v`).
- The full plan is approved despite its roughly 2,400 tokens.

**Never:**
- Age labels, age bars or colours, the hold timer, or the rule that toasts sit below a held row (epic 2 owns the hold).
- Store, api, toast or focus module changes, beyond a bug that 1.10 exposes and that is noted in Implementation Notes.
- A confirmation dialog, undo, a strike-through, or `{@html}`.
- `.focus()` outside `lib/focus.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Tick | seed 3 open tasks; tick the middle one | it moves to the top of the completed tasks, with the filled check and muted text; focus is on the input | — |
| Untick | untick it | it returns to its original open position | — |
| Delete | delete a task, then reload | gone at once, with no dialog; still gone after the reload | — |
| Tick rollback | `failApi` PUT `/tick` 503 | the row is open again in place; the toast reads "Couldn't update that task. It's back as it was." | — |
| Untick rollback | `failApi` PUT `/untick` 503 on a done task | done again; the same toast | — |
| Delete rollback | `failApi` DELETE 503 | the row reappears where it was; the same toast | — |
| Keyboard only | Tab to a tick, then Space; Down to the next row; Tab to delete, then Enter | tick and delete work; focus returns to the input | — |
| Arrows | Down from the input, Down, Up, Up on row 1, Esc | first tick, second tick, first tick, input, input | — |
| Delete reveal | laptop: a row not hovered; hover it; focus within it | hidden; visible; visible | — |
| Touch delete | `hasTouch`/`isMobile` context | delete always visible | — |
| Names | a row "milk" | buttons named `Mark "milk" done` and `Delete "milk"`; after the tick, `Mark "milk" not done` | — |
| Long text | a 300-character word, at 320 px | wraps; no horizontal scroll | — |
| Reduced motion | `reducedMotion: 'reduce'` | rows move with no transition | — |
| A11y | axe at 320 and 1280 px, with long text and completed rows | no critical violations | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.svelte` -- around lines 116–120: `{#each tasks.rows as row (row.key)} <li class="row">{row.text}</li>` inside `<ul aria-label="Tasks">`. Swap in `<TaskRow {row} />`, add `animate:flip` on the keyed `li` (the animate directive must sit on the each block's direct child, so `TaskRow` renders inside the `li`, or the `li` lives in App), and put `onkeydown={onRowKeydown}` on the `ul`. The `.row` styles (lines 229–240) are shared with the skeleton rows, so keep the skeleton's.
- `frontend/src/lib/tasks.svelte.ts` -- `tasks.rows` (`{key, id, text, added_at, completed_at}`), `tick(key)`, `untick(key)` and `remove(key)`. They announce and toast themselves, and an op that matches the current view is a no-op.
- `frontend/src/lib/focus.ts` -- `onRowKeydown(e)` (Up/Down keep the control type; Esc and Up from row 1 go to the input), `returnToInput()`, and the `data-task-row`/`data-row-control` contract. The safety net already returns focus when a focused row is removed.
- `frontend/src/app.css` -- tokens: `--color-check-ring`, `--color-check-fill`, `--color-surface`, `--color-delete`, `--color-hover`, `--color-divider`, `--color-text-muted`, the spacing scale and `--radius-sm`.
- `frontend/src/App.test.ts` -- the real store over a mocked `./lib/api`, with `stubHover`. Add row tests there, or in a new `components/TaskRow.test.ts`.
- `e2e/tests/capture.spec.ts` -- patterns for `seed`, `failApi`, `expectNoA11yViolations` and the touch context (`test.use({ hasTouch: true, isMobile: true })`). Put the new specs in `e2e/tests/rows.spec.ts`. The toast is located with `[data-toast-kind]`.
- `docs/ai-log.md` -- append `## Ticket 10`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/TaskRow.svelte`, `TaskRow.test.ts` -- the row, its names, actions, focus return, delete reveal and styles -- the Ledger row
- [x] `frontend/src/App.svelte`, `App.test.ts` -- the each block with `TaskRow` and `animate:flip` (reduced motion read when the animation runs), `onRowKeydown` on the list, and the `--sticky-height` observer -- wiring
- [x] `e2e/tests/rows.spec.ts` -- one test per matrix row -- end-to-end proof
- [x] `docs/ai-log.md` -- `## Ticket 10 — List rows`

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when `npm test` runs in `e2e/`, then every spec passes.
- Given the app profile, when it is run with `docker compose down` then `docker compose up -d` with the volume kept, then the tasks and their times survive (a manual check, run by the main session with the user's OK).

## Implementation Notes

- The keyed `<li data-task-row>` lives in `App.svelte` and `TaskRow` renders inside it, because `animate:flip` must sit on the each block's direct child. The hover tint and the delete reveal hang off TaskRow's root `.task-row` div, which fills the `li`.
- `frontend/vitest-setup.ts` stubs `Element.prototype.getAnimations` (absent in jsdom; Svelte's flip calls it when a keyed row leaves). No store, api, toast or focus module changed.
- `--sticky-height` is set on `.page` through `style.setProperty` (CSSOM), so the CSP stays clean (AD-19).
- On touch the stretched buttons keep the ring and glyph on the first text line (padding-top), per DESIGN's first-line alignment, rather than centring them in a wrapped row.
- `rows.spec.ts` adds a sticky-clearance test and a normal-motion companion (a 200 ms animation exists) next to the reduced-motion test.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 16 · false 4 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 7 patches, no new deferrals (toasts below a held row was already deferred to epic 2).

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `@media not (hover: hover)` is dropped by older iOS Safari, so touch hit areas are lost (BH) | medium | patch | `@media (hover: none)`. |
| 2 | Nothing checks that reduced motion is read when each animation runs (VG, BH) | low | patch | E2E switches to reduced motion after load and expects no row animations. |
| 3 | `ResizeObserver` watches the content box, so the sticky height goes stale at the breakpoint (ECH) | low | patch | `{ box: 'border-box' }`, reading `borderBoxSize`; tested. |
| 4 | `--line` hard-codes the body type (BH) | low | patch | `--line-height-body` token. |
| 5 | The sticky-height test leaks its stub and spy on failure (BH, ECH ×2) | low | patch | Cleaned up in `try/finally`. |
| 6 | Motion tests count unrelated animations; the selector breaks on quotes; the `settled()` docstring is wrong (BH) | low | patch | Filtered to `[data-task-row]`, a locator handle, the docstring fixed. |
| 7 | The ai-log test count is wrong; no review entry (BH) | low | patch | Corrected from a real run (18 tests × 5); review entry added. |
| 8 | Double-click sends tick then untick (ECH) | false | reject | EXPERIENCE: "last user intent wins; requests are applied in order". |
| 9 | Focus not returned on touch (IA, BH) | false | reject | EXPERIENCE › Touch focus: no focus return on phone. |
| 10 | Long or quoted text in the accessible names (BH) | low | reject | The `Mark "X" done` / `Delete "X"` patterns are verbatim EXPERIENCE copy. |
| 11 | Raw RGB values in the E2E (BH) | low | reject | Cosmetic; a token change would fail loudly. |
| 12 | Uneven unit rollback coverage; keyboard edges untested (BH) | low | reject | All three rollbacks are covered in E2E; the last-row and modifier edges are pinned in `focus.test.ts` (1.7). |
| 13 | Clicking a hidden delete, and untick/delete slides, aren't measured (IA) | low | reject | Computed `pointer-events: none` is asserted; flip is the same code path for every reorder. |
| 14 | No E2E acts on a row before its POST settles (IA) | low | reject | Covered by the 1.8/1.12 store tests; key and id handling is unchanged here. |
| 15 | Hybrid devices (touch laptop, iPad with a trackpad) (IA) | low | reject | `(hover: hover)` is the single laptop-vs-phone test (AD-18, UX). |
| 16 | The sticky-clearance work goes beyond the intent's wording (IA) | low | reject | Required by EXPERIENCE's Accessibility Floor (SC 2.4.11), which the plan binds. |
| 17 | deferred-work.md and the plan aren't in the review diff (BH) | false | reject | Excluded by design; both are committed with this change. |
| 18 | The touch focus assertion looks accidental (BH) | false | reject | Deliberate (EXPERIENCE); noted in the ai-log. |

**Manual check (main session, 2026-10-01):** app profile rebuilt; a task added and ticked; `docker compose down` then `up -d --wait` with `todo_db-data` kept. The task came back with identical text, `added_at` and `completed_at`, and the temporary task was then deleted.

## Design Notes

- **Flip and reduced motion:** `animate:flip={{ duration: () => (reduced() ? 0 : 200), easing: cubicOut }}`, where `reduced()` reads `matchMedia('(prefers-reduced-motion: reduce)').matches`. Svelte's `flip` accepts a duration function, `(len) => ms`.
- **Delete reveal:** `@media (hover: hover) { .delete { opacity: 0; pointer-events: none } li:hover .delete, li:focus-within .delete { opacity: 1; pointer-events: auto } }`.
- **Touch hit areas:** make the buttons `align-self: stretch`, with negative block margins into the row padding, so the hit box fills the row height while the 16 px ring and 12 px glyph stay centred.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
- Manual (app profile, with the user's OK): `docker compose up -d --build`, add and tick tasks, then `docker compose down && docker compose up -d --wait` -- expected: same tasks, same times; never `down -v`
