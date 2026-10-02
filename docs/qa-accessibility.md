# QA report: accessibility

- **Date:** 2026-10-02
- **Commit measured:** the commit that adds this report (story 3.8, on top of `a1953b8`), with the test stack rebuilt from that tree.
- **Tool:** axe-core through `@axe-core/playwright` 4.13, with the tags `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` (the same tags as the suite's `expectNoA11yViolations`). Run in Google Chrome 154.0.8037.57 against the test profile's production build on `:8082`.
- **Gate:** zero critical violations (deliverables, PRD NFR-1). **Result: pass.** Across all 36 cells there are zero violations of any impact, not only zero critical ones.

## Commands

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
cd e2e
E2E_BROWSER_CHANNEL=chrome npm run qa              # both QA specs; or, for this report alone:
E2E_BROWSER_CHANNEL=chrome npx playwright test -c playwright.qa.config.ts qa/a11y.spec.ts
```

The sweep is `e2e/qa/a11y.spec.ts`. Each cell writes `docs/qa-artifacts/a11y/<theme>-<width>-<state>.json`, and the run combines them into `docs/qa-artifacts/a11y-summary.json`. That summary is committed; the per-cell files are gitignored. Each cell carries the run's id (`QA_RUN_ID`, set once per run in `playwright.qa.config.ts`), and the summary counts only cells from the current run, so stale files from an earlier or partial run are never folded in. The figures below come from the run of `npm run qa`: `40 passed (6.7m)`, of which 36 are this sweep, logging `a11y sweep: 36 cells, violations by impact {"critical":0,"serious":0,"moderate":0,"minor":0}`.

## The grid

There are 9 states, from EXPERIENCE › State Patterns. Each runs in 2 themes (OS `prefers-color-scheme` light or dark, with nothing stored, so the app follows the OS) at 2 widths (320 and 1280 px, 800 px tall). That makes 36 axe runs. After axe finishes, each state is checked again, so a toast or hold that ended during the analysis can't pass as that state.

| State                           | How it is reached                                                                         | Light 320 | Light 1280 | Dark 320 | Dark 1280 |
| ------------------------------- | ----------------------------------------------------------------------------------------- | --------- | ---------- | -------- | --------- |
| Empty                           | reset, load                                                                               | 0         | 0          | 0        | 0         |
| Loading skeleton                | `GET /api/tasks` held; skeleton visible after its 300 ms delay                            | 0         | 0          | 0        | 0         |
| Populated                       | 7 rows: open, completed, overdue (2 d), a 300-char word, a long sentence with a URL       | 0         | 0          | 0        | 0         |
| Held row                        | type and Enter on the populated list; `stillHeld` before and after axe                    | 0         | 0          | 0        | 0         |
| Action-error toast              | `failApi` on one task's `PUT …/tick`, click its ring; mouse on the toast pauses its timer | 0         | 0          | 0        | 0         |
| Add-failure toast               | `failApi` on `POST /api/tasks`, type and Enter                                            | 0         | 0          | 0        | 0         |
| Load-failure toast              | `failApi` on `GET /api/tasks`; the toast with Retry                                       | 0         | 0          | 0        | 0         |
| Retry loading                   | load failure, then Retry with the next GET held; skeleton back                            | 0         | 0          | 0        | 0         |
| Keyboard focus on a row control | Down Arrow twice from the input; the tick ring matches `:focus-visible`                   | 0         | 0          | 0        | 0         |

Each cell shows the violation count across every impact.

## Violations by impact

| Impact   | Count |
| -------- | ----- |
| Critical | 0     |
| Serious  | 0     |
| Moderate | 0     |
| Minor    | 0     |

No non-critical violations were found, so no disposition is needed.

### Needs review (axe "incomplete")

These are not violations. They are results that axe could not decide, so they were reviewed by hand. There are 22 nodes, all from the rule `color-contrast`, and all in the two transient-toast states (8 cells):

| Node                                                           | Cells                                 | Axe's reason                                                                            | Disposition                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The first one or two rows' `.text` and `.age`, under the toast | 20 nodes, all 8 toast cells           | "background color could not be determined because it is overlapped by another element"  | **Accepted, by design.** The toast overlays the top of the list (DESIGN toast placement; `.toasts` in `frontend/src/App.svelte`). While it is up, those rows are covered, not low-contrast. The same rows pass `color-contrast` in the Populated cells, where nothing covers them. |
| The toast message `p`                                          | 2 nodes, action-error toast at 320 px | "background color could not be determined because it partially overlaps other elements" | **Checked by hand: passes.** The sweep computes each toast's text contrast from its computed styles. Both colours are opaque tokens on the toast card. It asserts at least 4.5:1.                                                                                                  |

Contrast computed by the sweep (recorded per cell in `manualContrast`), in every cell where a toast shows. Each toast cell must check at least one element, so the check can't pass by finding nothing. Text must reach 4.5:1 (SC 1.4.3). The close button's × glyph, which is icon-only, is a non-text graphic and must reach 3:1 (SC 1.4.11); its stroke is `currentColor` and the button has no background.

| Toast text                                                                  | Light   | Dark    |
| --------------------------------------------------------------------------- | ------- | ------- |
| Message (`--color-text-primary` on `--color-error-bg`)                      | 14.31:1 | 11.15:1 |
| Retry button (`--color-accent` on `--color-error-bg`)                       | 5.76:1  | 5.88:1  |
| Close × glyph (`--color-accent` stroke on `--color-error-bg`, graphic, 3:1) | 5.76:1  | 5.88:1  |

## What axe can't check

Axe can't see motion, forced colours or keyboard flow. These are covered by E2E tests in the regular suite, and all of them passed in the same session (`E2E_BROWSER_CHANNEL=chrome npm test`: `114 passed`).

- **Forced colours (story 3.6):** `e2e/tests/theme-toggle.spec.ts` › "under forced colours" runs with `forcedColors: 'active'`. In it, the active theme segment keeps a 1 px solid `CanvasText` outline while the other segment has none, and the focused input keeps App's own `solid` outline (Chrome's default ring is `auto`), with a non-zero width. Fills and box-shadows drop in forced colours, so outlines carry the state.
- **`prefers-reduced-motion`:** the only motion in the app is the rows' `animate:flip` slide. Its duration is read when each animation runs (`frontend/src/App.svelte:30-35`), and it is 0 under `reduce`. Toasts have no transition. `e2e/tests/rows.spec.ts` › "reduced motion: rows move with no transition" and "a change after load applies to the next tick", and `e2e/tests/hold.spec.ts` › "reduced motion: the settle has no row animations", assert that no row animation runs. They also check that a live change to the setting applies at the next tick.
- **Keyboard-only use:** `e2e/tests/journeys.spec.ts` UJ-1 (story 3.7) captures, re-sends after a failure, and settles using only the keyboard: type, Enter, and focus that stays in the input. `e2e/tests/rows.spec.ts` › "keyboard only: Tab + Space ticks, Down moves rows, Tab + Enter deletes; focus returns" and "arrows: Down, Down, Up, Up on row 1, then Esc from a row" cover tick, untick, delete and row navigation without a pointer. Focus visibility under the sticky header (SC 2.4.11) is covered by `rows.spec.ts` › "sticky clearance" and `hold.spec.ts` › "clearance".

## Type-to-focus and WCAG 2.1.4 (Character Key Shortcuts)

EXPERIENCE › Interaction Primitives flags type-to-focus for this check. On a laptop, when no control has focus, typing a printable character moves focus to the input and inserts that character.

**The rule.** SC 2.1.4 (Level A): "If a keyboard shortcut is implemented in content using only letter (including upper- and lower-case letters), punctuation, number, or symbol characters, then at least one of the following is true: **Turn off** — a mechanism is available to turn the shortcut off; **Remap** — a mechanism is available to remap the shortcut to include one or more non-printable keyboard keys (e.g., Ctrl, Alt); **Active only on focus** — the keyboard shortcut for a user interface component is only active when that component has focus." The rule protects speech-input and keyboard users from triggering an action by accident with a single character.

**The code.** `installTypeToFocus` (`frontend/src/lib/focus.ts:81-98`):

- `focus.ts:86` ignores any key pressed with Ctrl, Meta or Alt (AltGr characters still count as typing).
- `focus.ts:87` acts only on a printable character, and only when `nothingFocused()` is true. That function (`focus.ts:30-33`) checks that `document.activeElement` is null or `body`. It also requires a registered input and `isLaptop()`, that is `(hover: hover)`.
- It then focuses the input and inserts that same character at the caret, once.

**Argument: it is not a character key shortcut, so 2.1.4 does not apply. If it were one, its effect is harmless.**

1. **It triggers no action.** A shortcut in 2.1.4's sense makes a key perform a function, such as delete or archive. Here the key does what a key always does in a text field: it types that character. Nothing is added (that needs Enter), ticked, deleted or navigated. A stray character from speech input ends up as visible, editable text in the input, which is the outcome 2.1.4 exists to keep benign.
2. **It is never active while a control has focus.** `nothingFocused()` is false whenever any control has focus: the input, a row's tick or ×, a toast's Retry or ×, or the theme toggle. So it can never take over a key meant for a focused component. This is close to the "active only on focus" exception, reversed: it is active only when _nothing_ has focus.
3. **Modified keys and non-printable keys pass through** (`focus.ts:86-87`), so browser and assistive-technology shortcuts are unaffected. It is also off on touch devices.
4. The app has no single-character shortcut that performs an action. EXPERIENCE rejected a `/` jump-to-input key for exactly this reason.

**Verdict: pass.** Unit tests for this behaviour are in `frontend/src/lib/focus.test.ts` (`describe('installTypeToFocus')`, line 145).

## Scope notes

- Axe checks the rendered DOM against WCAG 2.0 and 2.1 A/AA. It is not a full manual audit: screen-reader wording, announcement timing and zoom to 400% were not tested by hand in this story. Announcements are covered by E2E (`capture.spec.ts` › "toast announced", `age.spec.ts` › "not live").
- The sweep runs in Chrome only, which is the browser the suite targets.
