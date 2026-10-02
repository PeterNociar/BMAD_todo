---
title: 'Theme toggle'
type: 'feature'
ticket: '5'
created: '2026-10-02'
status: 'built'
baseline_revision: '751fbf57383a4de9f19b25f7b8b2bf7fc5415dc3'
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

**Problem:** Entry 4 made the app follow the OS theme and apply a stored choice before first paint, but nothing in the UI lets the user choose. CAP-11 and EXPERIENCE › Theme toggle need a header control.

**Approach:** Add one two-state toggle to the header, on the right of the wordmark. It is a sun/moon pill per DESIGN › Components and the `theme-toggle` tokens, and it uses `theme.set()` from `lib/theme.svelte.ts`.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-18, AD-19; DESIGN › Components › Theme toggle and the `components.theme-toggle` tokens; EXPERIENCE › Theme toggle, Voice and Tone, and the tab order.
- **Markup:** one `<button type="button">` holding two `aria-hidden` segments, sun then moon, each with a 16 px stroke SVG. Copy the SVGs from `mockups/key-main-laptop.html`.
- **Name:** `aria-label` names the action. It is "Switch to dark theme" when `theme.current` is light, and "Switch to light theme" when it is dark. No `aria-pressed`.
- **Action:** `theme.set(theme.current === 'dark' ? 'light' : 'dark')`. The choice is stored. There is no third state and no way back to following the system.
- **Focus:**
  - **Pointer activation** (`click` with `event.detail > 0`) calls `returnToInput()`, which already does nothing on phones.
  - **Keyboard activation** (`detail === 0`) leaves focus on the toggle.
  - Focus moves only through `lib/focus.ts` (AD-18).
- **Tab order:** the toggle is in the header DOM before the input, so Shift+Tab from the input reaches it.
- **Look:**
  - **Pill:** `1px solid var(--color-divider)` border, `9999px` radius, `var(--space-1)` padding. Segments are 22×18 px with `1px 3px` padding and no gap.
  - **Active segment** (the current theme): `var(--color-surface)` fill, an inset `1px var(--color-divider)` hairline, and a `var(--color-text-primary)` icon. The other segment's icon is `var(--color-text-muted)`.
  - **Interaction states:** no hover state. Keyboard focus only gets the `2px var(--color-accent)` outline (`:focus-visible`), as `TaskRow` does.
  - **Forced colours:** under `forced-colors: active`, the active segment gets a `1px solid CanvasText` outline.
- **CSP:** no inline `style` attributes.

**Never:**
- Changes to `theme.svelte.ts`, `theme-init.js` or `app.css` tokens (entry 4 owns them).
- A hover state, a tooltip, or a "system" option.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| First visit, OS light | nothing stored | light; name "Switch to dark theme"; sun segment active | — |
| First visit, OS dark | nothing stored | dark; name "Switch to light theme"; moon active | — |
| Click | light | dark applied and stored; name flips; focus on the input (laptop) | — |
| Keyboard | focus on the toggle; Enter or Space | theme flips; focus stays on the toggle | — |
| Survives reload | toggled to dark on a light OS; reload | `data-theme="dark"` already set when `<body>` is created; the toggle shows dark | — |
| No way back | stored dark; OS flips to dark then light | stays dark | — |
| Tab order | focus in the input; Shift+Tab | the toggle is focused | — |
| Storage blocked | `setItem` throws; click | theme flips for the session; no error | handled by `theme.set` |
| a11y | light and dark, at 320 and 1280 px | no critical axe violations | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.svelte`
  - Lines 192–195 hold `<header class="top">` → `<div class="header"><h1 class="wordmark">Todo</h1></div>`. Add `<ThemeToggle />` after the `h1`.
  - `.header` (around l.273) is already `display: flex; justify-content: space-between`. A taller header changes `--sticky-height`, which the existing `ResizeObserver` measures.
- New `frontend/src/components/ThemeToggle.svelte` (+ `ThemeToggle.test.ts`). Follow `TaskRow.svelte`:
  - its `returnToInput` import and call (l.14, l.34–43);
  - its `button:focus-visible` outline (l.164–166).
- `frontend/src/lib/theme.svelte.ts` -- `theme.current` and `theme.set(t)`. `theme.svelte.test.ts` shows how to get a fresh module per case and fake `matchMedia`. For component tests, `vi.spyOn(theme, 'set')` or the real module under jsdom (no `matchMedia`, so light).
- `frontend/src/lib/focus.ts` -- `returnToInput()` is hover-gated. `installTypeToFocus` is already inactive while any control has focus.
- `_bmad-output/initiative-todo-app/ux-todo-app/mockups/key-main-laptop.html` -- `.toggle`/`.seg` CSS (l.65–67) and the sun/moon SVG paths in the header markup.
- `e2e/tests/theme.spec.ts` (from 3.4) -- the `colorScheme` use, `storeThemeBeforeLoad`, and the body-insertion `MutationObserver` helper. Reuse them, or move the helper to `fixtures.ts` if both specs need it.
- `e2e/fixtures.ts` -- `expectNoA11yViolations`. Use `page.emulateMedia({ colorScheme })` for the OS flip.
- New `e2e/tests/theme-toggle.spec.ts`.
- `docs/ai-log.md` -- append `## Ticket 3.5 — Theme toggle`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/components/ThemeToggle.svelte` -- the button, the segments, the name, pointer vs keyboard focus, and the CSS -- the toggle
- [x] `frontend/src/components/ThemeToggle.test.ts` -- the name per theme, `set` called with the other mode, `returnToInput` only when `detail > 0`, the active segment -- unit cover
- [x] `frontend/src/App.svelte` (+ an `App.test.ts` check that the toggle comes before the input in the DOM) -- the header placement
- [x] `e2e/tests/theme-toggle.spec.ts` -- one test per matrix row -- end-to-end proof
- [x] `docs/ai-log.md` -- the Ticket 3.5 section

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes, including the existing layout specs (the header grows).

## Implementation Notes

- The `<body>`-insertion observer moved to `e2e/fixtures.ts` as `recordThemeAtBody(page)` / `themeAtBody(page)`; `theme.spec.ts` now uses them.
- Segments carry `data-segment="light|dark"` for the tests.
- Results: 435 Vitest tests (99.29% statements); check, lint, Prettier, build green; e2e typecheck green; 99/99 E2E tests pass.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 12 · false 1 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches, 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The "no way back" E2E asserts before the media change is handled, and its dark→dark flip can't fail (ECH, BH, VG) | medium | patch | Waits for `matchMedia` to reflect each scheme; checks a stored theme that differs from the OS after the flip, in both directions. |
| 2 | `expectTheme` reads the active segment and the body background once, with no retry (ECH, BH) | low | patch | They now retry. |
| 3 | The keyboard unit test's `activeElement` check can't fail with `returnToInput` mocked (ECH, BH, VG) | low | patch | Dropped; `not.toHaveBeenCalled()` and the E2E test cover it. |
| 4 | The SVG is sized in rem inside a px segment, so it overflows at a larger default font (BH) | low | patch | Sized 16 px. |
| 5 | `themeAtBody` returns `undefined` when the recorder isn't installed (BH) | low | patch | Throws a clear error. |
| 6 | The forced-colors outline on the active segment is untested (VG) | low | defer | There is no forced-colors test anywhere in the repo; deferred-work entry added (fits entry 8's accessibility report). |
| 7 | Holding Enter auto-repeats and flips the theme repeatedly (ECH) | low | reject | Standard button behaviour; harmless. |
| 8 | A screen reader's synthesized click (`detail` 1) moves focus to the input (ECH) | low | reject | Same as every row control (`TaskRow` always calls `returnToInput`); tracking `pointerdown` would add state for an unproven case. |
| 9 | A keyboard flip isn't announced in a live region (BH) | low | reject | EXPERIENCE lists which messages are announced, and a theme change isn't one; the name flips. |
| 10 | The phone path (a tap leaves focus) is untested (BH, IA) | low | reject | `returnToInput`'s hover gate is covered in `focus.test.ts`; the toggle adds no new branch. |
| 11 | No unit test of the toggle following the system or a live OS change (BH) | low | reject | E2E covers a dark first visit; live following is `theme.svelte.test.ts`'s. |
| 12 | The storage-blocked E2E only catches `pageerror`, and the override is global (BH) | low | reject | `theme.set` catches and swallows, and there is no `console.error` path; the matrix row passes as written. |
| 13 | The keyboard E2E assumes the toggle sits right before the input; the header height and alignment aren't asserted (BH, IA) | low | reject | The App unit test pins the DOM order; the existing layout specs measure the sticky header and pass. |
| 14 | The look and right-edge placement are implemented but not asserted (IA) | false | reject | Descriptive; the CSS follows the tokens, and placement comes from the existing `space-between`. |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
