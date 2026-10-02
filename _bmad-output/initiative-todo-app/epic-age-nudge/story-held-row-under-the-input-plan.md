---
title: 'Held row under the input'
type: 'feature'
ticket: '5'
created: '2026-10-01'
status: done
baseline_revision: '5e278965b17fbd7484ee61dd9d8a370389e6d3fe'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The store now holds a new task first for 3 s (2.4). With a full screen of older tasks, though, the held row is the list's first row, which may be scrolled off-screen, so CAP-2 fails. Toasts also overlay the held row (deferred from 1.10).

**Approach:**
- Keep the held row visible directly under the sticky input regardless of scroll, as a sticky first row. Use `overflow: clip` instead of `hidden` on `.list`, so sticky works and the DOM order stays the same.
- Let the row settle with the existing `animate:flip`, instantly under reduced motion, and never scroll the page to follow it unless a control in that row has focus.
- Place toasts 8 px below the held row.
- Prove it with E2E on a long, scrolled list.

## Boundaries & Constraints

**Always:**
- **Rules that bind:**
  - EXPERIENCE: "Age Nudge and New-Task Hold", "Toast" (placement, never over a held task), Motion, and Accessibility Floor (the focused control is never hidden; `scroll-margin-top`).
  - DESIGN: Layout & Spacing ("sticky top: … the held new task stay[s] visible directly below the input regardless of scroll") and `toast.offsetTop`.
  - AD-18: focus moves only through `lib/focus.ts`.
- **Held row:**
  - The `li` whose key is `tasks.heldKey` (always `rows[0]`) is `position: sticky`, with `top: var(--sticky-height)`, a `surface` background and a z-index above other rows and below toasts.
  - `.list` uses `overflow: clip`, which keeps the rounded corners clipped.
  - There is no extra highlight.
- **Settling:**
  - When the hold ends, the row takes its sorted place through the existing `animate:flip` (200 ms, 0 under reduced motion).
  - The page's scroll position doesn't change.
  - If a control in the held row has focus when the hold ends, focus stays on it and the row is scrolled into view below the sticky header with `scrollIntoView({ block: 'nearest' })`. That is a scroll, not a focus move.
- **Toasts:**
  - With a held row, the toast stack's top edge sits 8 px (`--space-3`) below the held row's bottom. Otherwise it sits where the list's top edge would be, as now.
  - App measures the held row's height with a `ResizeObserver` (border box) into `--held-height`, through `setProperty` (CSP), and the toast offset uses it.
  - Toasts never cover the input.
- **Clearance:**
  - Row controls' `scroll-margin-top` covers the sticky header, the held row when there is one, and the visible toast stack. Measure the toast stack like the held row, into `--toast-height`.
  - A control focused below the fold is never hidden under them.
- **Coverage:** axe reports no critical violations at 320 and 1280 px, and the 70% gate holds.

**Decisions (2026-10-01, approved by the user, resolving the entry's unknown):** The plan is approved at about 1,950 tokens. `overflow: clip` on `.list` instead of rendering the held row outside the list. It keeps one `ul` and one DOM order, and a keyed `{#each}` with flip. `clip` doesn't create a scroll container, so `position: sticky` on the first `li` works. Every supported browser has it: Chrome 90+, Safari 16+, Firefox 81+.

**Never:**
- Changes to the store's hold rules or timer (2.4), or to the age modules.
- A second list, or a row that is moved in the DOM to fake stickiness.
- Programmatic page scrolling when no held-row control has focus.
- `.focus()` outside `lib/focus.ts`, inline `style` attributes, or dark tokens.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Visible on add | 30 seeded open tasks; page scrolled to the bottom; type, then Enter | the new row's box sits directly below the header, inside the viewport; `scrollY` unchanged | — |
| Settles | then 3 s pass (`page.clock.runFor`) | the row is the last open task in the DOM; `scrollY` unchanged | — |
| Reduced motion | `reducedMotion: 'reduce'` | the settle has no row animations | — |
| Normal motion | default | the settle animates for about 200 ms | — |
| Focused held control | Tab to the held row's tick, then 3 s pass | the tick keeps focus and is fully visible below the sticky header | — |
| Toast below held | a task is held; another row's tick fails (`failApi` 503) | the toast's top is at least the held row's bottom + 8 px − 1 | — |
| No held row | no hold; an action fails | the toast is at the list top, as before | — |
| Clearance | a row control focused below the fold while a task is held and a toast shows | the control is not covered by the header, the held row or the toast | — |
| A11y | axe at 320 and 1280 px with a held row and a toast | no critical violations | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.svelte`
  - Around lines 152–171: `<div class="list">` holds `<ul aria-label="Tasks" onkeydown={onRowKeydown}>`, which holds `{#each tasks.rows as row (row.key)} <li class="task" data-task-row animate:flip={slide}><TaskRow {row} /></li>`. Add `class:held={row.key === tasks.heldKey}`.
  - `.list { overflow: hidden; … }` (around line 258).
  - `.top` is sticky at `top: 0`. `.toasts` is `position: absolute; top: 100%` inside the header.
  - The `--sticky-height` observer around lines 63–80 uses a border-box `ResizeObserver` with `setProperty` on `.page`; reuse that pattern for `--held-height` and `--toast-height`.
  - `slide` is the flip parameters, and it reads reduced motion when the animation runs.
- `frontend/src/components/TaskRow.svelte` -- the row controls carry `scroll-margin-top: var(--sticky-height)`. Extend it to `calc(var(--sticky-height) + var(--held-height, 0px) + var(--toast-height, 0px))`.
- `frontend/src/lib/tasks.svelte.ts` -- `tasks.heldKey`; `HOLD_MS = 3_000`. The held row is `rows[0]` while held.
- `frontend/src/components/ToastLayer.svelte` -- `.toast-layer` is a flex column with an 8 px gap.
- `e2e/fixtures.ts` -- `seed`, `failApi`, `expectNoA11yViolations`, the `page.clock` installed by the fixture (the hold's `setTimeout` runs on it, so `page.clock.runFor(3_000)` ends the hold).
- `e2e/tests/rows.spec.ts` -- an `animationsAfterClick`-style helper that counts row animations. Reuse it for the motion rows.
- `docs/ai-log.md` -- append the section for this story.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/App.svelte` -- the held class and sticky CSS, `overflow: clip`, the `--held-height` and `--toast-height` observers, the toast offset, and scroll-into-view on settle when focus is inside -- the held row
- [x] `frontend/src/components/TaskRow.svelte` -- the extended `scroll-margin-top` -- clearance
- [x] `frontend/src/App.test.ts` -- the held class follows `heldKey`, and the observers set the properties -- unit cover
- [x] `e2e/tests/hold.spec.ts` -- one test per matrix row -- end-to-end proof
- [x] `docs/ai-log.md` -- the section for this story (Ticket 2.5)

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes.

## Implementation Notes

- `overflow-anchor: none` on `.list`: without it Chrome's scroll anchoring shifted `scrollY` by one row when the held row was inserted (the "Visible on add" test failed on a mutation run).
- Svelte's keyed `{#each}` moves the settling row with `before()`, which blurs a focused control. An `$effect.pre` records the control in the held row that has keyboard focus (`:focus-visible`; a tapped control is left alone). After the DOM update, `keepFocus()` (new, in `lib/focus.ts`, AD-18) restores it with `preventScroll`, then `scrollIntoView({ block: 'nearest' })` scrolls that control. Without the restore the "Focused held control" test fails.
- `--held-height` is the held row's border box plus `--space-3` (0 with nothing held). The toast anchor's `top` is `calc(100% + var(--held-height, 0px))`, and the controls' clearance includes the gap too.
- The held row resets `--held-height` and `--toast-height` to 0 for its own controls, so focusing its tick never asks for a scroll to clear a sticky row of itself.
- The fixture clock also flows in real time, so each E2E test checks `li.held` is still present when it measures.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 14 · false 0 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 8 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | On touch, ticking the held row leaves the tapped tick focused, so the settle effect restores it and scrolls the page to the done row (VG, ECH) | medium | patch | Restore and scroll only when the control `matches(':focus-visible')`, which is EXPERIENCE's "keyboard focus". Unit-tested both ways; removing the condition fails the tap test. |
| 2 | The clearance E2E focused the last row, which can't scroll under the header, so it passed with any `scroll-margin-top` (BH) | medium | patch | Now "task 15" with rows below it; its top is within 2 px of header + held + 8 + toast. |
| 3 | Tabbing into the held row was never checked not to scroll (VG) | low | patch | `scrollY` is asserted unchanged after Tab while held. |
| 4 | The real no-follow case (sorted place off-screen, focus elsewhere) was untested (IA) | low | patch | New "no follow" test from the top of a 30-row list: the settled row is off-screen and `scrollY` unchanged. |
| 5 | Safari < 16 drops `overflow: clip` with no fallback (ECH) | low | patch | `overflow: hidden; overflow: clip;`. |
| 6 | `keepFocus` has no direct test (BH) | low | patch | `focus.test.ts` covers connected, already active and disconnected. |
| 7 | Test leaks: stubs, fake timers, and assigning `scrollIntoView` (BH) | low | patch | `afterEach` cleanup; `vi.spyOn` over a `beforeAll` no-op. |
| 8 | Comments: "row scrolled into view" (it's the control) and an unproven flip-start claim; the static no-ResizeObserver fallback undocumented; ai-log incomplete (BH ×3, ECH) | low | patch | Reworded; the claim dropped; the fallback documented; ai-log filled in. |
| 9 | E2E races real time instead of pausing the clock (BH) | low | reject | AD-8 forbids `pauseAt`/`setFixedTime`; every test asserts the hold is still on when it measures, so a slow run fails loudly. |
| 10 | `overflow-anchor: none` is list-wide with no cross-browser cover (BH, IA) | low | reject | The full E2E suite (ticks, deletes, rollbacks) still passes; E2E is Chrome-only by design. |
| 11 | The no-ResizeObserver fallback is static (BH, ECH) | low | reject | Every supported browser has ResizeObserver; documented. |
| 12 | Short viewports could be mostly covered by the sticky stack (BH) | low | reject | Header + held row + one toast fits a landscape phone; the stack ends with the 3 s hold. |
| 13 | The held `li` is found by class query (BH) | low | reject | Cosmetic; the class is set in the same flush, and the tests pin it. |
| 14 | No E2E scrolling during the hold, and the stuck-to-sorted slide isn't measured (IA) | low | reject | Sticky is continuous CSS; the motion tests pin flip timing, and "visible on add" plus "no follow" pin the scrolled cases. |
| 15 | The toast gap is about 7 px when the held row isn't stuck (IA) | low | reject | The list's 1 px top border; within the matrix's −1 tolerance; exactly 8 px when stuck. |
| 16 | The load-failure toast isn't tested with a held row (IA) | low | reject | It can't appear before epic 3. |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: green
