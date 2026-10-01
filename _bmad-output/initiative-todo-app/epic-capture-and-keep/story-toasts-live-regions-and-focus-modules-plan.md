---
title: 'Toasts, live regions and focus modules'
type: 'feature'
ticket: '7'
created: '2026-10-01'
status: 'built'
baseline_revision: '3695b1d7544b01642c97227c51a14b513eb29e32'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The store (1.8) and the UI stories (1.9, 1.10) need a single owner for toasts and screen-reader announcements and a single owner for programmatic focus (AD-17, AD-18). Neither exists yet.

**Approach:**
- Add `lib/toasts.svelte.ts`, which provides the AD-17 API and owns the verbatim EXPERIENCE copy.
- Add `components/LiveRegions.svelte`, the only `aria-live` owner, and `components/ToastLayer.svelte`. ToastLayer shows at most 2 toasts, auto-dismisses after 5 s, and pauses while hovered or focused.
- Add `lib/focus.ts` with these functions:
  - `registerInput` and `returnToInput`, gated on `(hover: hover)`;
  - the focus safety net and type-to-focus;
  - row-navigation helpers, which 1.10 will wire.
- Mounting these in `App.svelte` is entry 1.9's job.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8, AD-17 and AD-18, and EXPERIENCE "Voice and Tone", "Toast", "Interaction Primitives" and "Accessibility Floor".
- **`toasts` items:** each item is `{id, kind, message, transient}`.
  - At most 2 are shown, newest first. This holds with the load-failure toast present too.
  - Adding a third drops the oldest transient one. The load-failure toast is never dropped.
- **`toasts` methods:**
  - `error(kind)`: `kind` is `'add_failed' | 'add_too_long' | 'action_failed'`. It pushes a transient toast with the verbatim copy and announces that copy in the polite region.
  - `showLoadFailure()` and `hideLoadFailure()`: both idempotent. `show` adds the persistent toast ("Couldn't load your tasks.") and announces it once in the alert region.
  - `announce(kind, taskText, { listEmpty })`: `kind` is `'added' | 'done' | 'undone' | 'deleted'`. The polite text is "Added: X", "Marked done: X", "Marked not done: X" or "Deleted: X". With `listEmpty: true` the empty-state text follows it ("Deleted: X. Nothing waiting. Type a task above and press Enter.").
  - `alert(text)`, `dismiss(id)`, and `hold(id)`/`release(id)`. Hold and release pause and resume the 5 s timer from the time that remained.
  - Timers use global `setTimeout`.
  - Export the copy as constants, for example `COPY.retryFailed`.
- **Live regions:** `politeText` and `alertText`.
  - Each new message clears the region, then sets the text on the next macrotask, so a repeated message is announced again.
  - A message is never announced twice for one call.
- **`LiveRegions.svelte`:** one `role="status"` (`aria-live="polite"`) and one `role="alert"`, both visually hidden and present, empty, from first paint. No other element anywhere has `aria-live`, `role="status"` or `role="alert"`, and toasts themselves are not live.
- **`ToastLayer.svelte`:**
  - It renders `toasts.items`. Each toast has a decorative error icon (`aria-hidden="true"`) and the message.
  - A transient toast has a close × button. The load-failure toast has a Retry button, which calls the `onretry` prop, and no ×.
  - `mouseenter`/`focusin` call `hold`, and `mouseleave`/`focusout` call `release`.
  - It never takes focus. Close and Retry are 24×24 hit boxes.
  - Styling follows the DESIGN.md toast treatment with the light-mode values, as `--color-*` custom properties on `:root` in `app.css`. Dark mode belongs to epic 3.
- **`focus.ts`:** it is the only code that calls `.focus()`. It exports:
  - `registerInput(el)`.
  - `returnToInput()`: calls `focus({ preventScroll: true })` only when `matchMedia('(hover: hover)').matches`. The same gate applies to the safety net and type-to-focus.
  - `installSafetyNet()`: when the focused element is removed from the DOM and focus falls to `body`, focus goes to the input.
  - `installTypeToFocus()`: when `activeElement` is `body` and a printable key is pressed without Ctrl, Meta or Alt, focus goes to the input and the character is inserted at the caret, exactly once.
  - `onInputKeydown(e)`: Down moves to the first row's tick ring.
  - `onRowKeydown(e)`: Up and Down move to the same control type in the previous or next row, using the DOM order at keypress. Up from the first row and Esc from any row go back to the input.
  - Both install functions return an uninstall function.
- **Row markup contract:** rows carry `data-task-row`, and their controls carry `data-row-control="tick" | "delete"`. Entry 1.10 renders this contract.
- **Coverage:** the 70% coverage gate holds. `src/components/**` is already in coverage.

**Decisions (2026-10-01, user):**
- The toast close × is a button named "Dismiss".
- Toasts are always newest first, so a later action-error toast sits nearest the input, above the load-failure toast.
- The full plan is approved despite its roughly 2,800 tokens.

**Never:**
- Changes to `App.svelte`, the store, or the api, sort or clock modules.
- A focus call outside `focus.ts`, or toast copy outside `toasts.svelte.ts`.
- Showing `detail` or `code` in a toast, echoing task text in a toast, or adding an exclamation mark.
- Single-character shortcuts. Type-to-focus fires only when `activeElement` is `body` or `null`.
- Dark-mode tokens, or theme work.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Error toast | `toasts.error('action_failed')` | ToastLayer shows "Couldn't update that task. It's back as it was." with the icon and ×; the polite region gets the same text once | — |
| Too long | `error('add_too_long')` | "Couldn't save new task. It's too long." | — |
| Auto-dismiss | fake timers, 5 s pass | toast removed; at 4.999 s still shown | — |
| Hover pause | `hold` at 3 s, wait 10 s, `release` | still shown while held; gone 2 s after release | — |
| Max two | three `error()` calls | two shown, newest first | — |
| Pinned load failure | `showLoadFailure()`, then two `error()` | the load toast plus the newest transient one; Retry calls `onretry`; no × | — |
| Idempotent | `showLoadFailure()` ×2, then `hideLoadFailure()` ×2 | one toast, one alert announcement, then none | — |
| Repeat announce | `announce('added','milk')` twice | polite region cleared between them, so each is announced | — |
| Last delete | `announce('deleted','milk',{listEmpty:true})` | "Deleted: milk. Nothing waiting. Type a task above and press Enter." | — |
| Touch | `(hover: hover)` false; `returnToInput()` | no focus change | — |
| Laptop return | `(hover: hover)` true | input focused, with `preventScroll` | — |
| Safety net | a focused button is removed | input focused | — |
| Type-to-focus | body focused, key `k` | input focused and holds `k` | Ctrl+K, Tab, or a focused control: nothing |
| Row nav | three rows, focus on row 2's delete; Down / Up / Up on row 1 / Esc | row 3's delete / row 1's delete / input / input | — |
| Input Down | focus in the input, Down | row 1's tick ring | no rows: nothing |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/` -- `api.ts`, `sort.ts` and `clock.svelte.ts` are the 1.6 modules; don't touch them. A runes module is a `.svelte.ts` file with `$state` at module level, reading its value through a getter (see `clock.svelte.ts`).
- `frontend/src/lib/clock.svelte.test.ts` -- testing reactivity: an `$effect` inside `$effect.root`, then `flushSync`. Import statically: `vi.resetModules()` gives the module a second copy of the Svelte runtime, so effects stop tracking it.
- `frontend/src/components/` -- doesn't exist yet. `vite.config.ts` already includes `src/components/**` in coverage and `src/**/*.test.ts` in tests.
- `frontend/src/App.test.ts` -- an example component test with `@testing-library/svelte` (`render`, `screen`); jest-dom is set up in `vitest-setup.ts`.
- `frontend/src/app.css` -- only `.visually-hidden` today. Add the `:root` custom properties for the toast (`error-bg`, `error-border`, `error-icon`, `accent`, `text-primary`, `shadow-toast`, and the `md` radius) from the DESIGN.md front matter.
- `frontend/eslint.config.js` -- the AD-8 ban on `Date.now`, `new Date()` and `Date()` covers `src/**`. Toast timing reads time only through `clock.sample()` (see Design Notes).
- jsdom has no `matchMedia`. Stub it per test with `vi.stubGlobal('matchMedia', …)`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/toasts.svelte.ts`, `toasts.svelte.test.ts` -- items, the stack rules, timers with hold/release, the copy, the live-region text and announce/alert -- AD-17 core
- [x] `frontend/src/components/LiveRegions.svelte`, `ToastLayer.svelte`, their `*.test.ts`, `app.css` -- the regions; the toasts with icon, ×, Retry and pause; the light tokens -- AD-17 UI
- [x] `frontend/src/lib/focus.ts`, `focus.test.ts` -- the six exports and the row contract -- AD-18
- [x] `docs/ai-log.md` -- append `## Ticket 7 — Toasts, live regions and focus modules` with the standard headings

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given ToastLayer and LiveRegions rendered together in a test, then the document has exactly one element with `aria-live="polite"` and one with `role="alert"`, and none inside the toasts.

## Implementation Notes

- `hold`/`release` nest: each holder (hover, focus) counts, and the timer resumes when the count reaches 0. An unbalanced `release` is a no-op.
- Each region keeps one pending message. A second call in the same tick joins its text to the pending one, separated by a space, so neither message is lost. `hideLoadFailure` cancels the pending alert and clears `alertText`.
- `installSafetyNet` tracks the last `focusin` target and runs its check both on `focusout` (no `relatedTarget`, via a microtask) and from a MutationObserver on `body`, because jsdom (and not every engine) fires no `focusout` on removal.
- Type-to-focus treats a single code point other than whitespace as printable, so Space keeps scrolling the page. It reads the caret before focusing and calls `preventDefault` so the character goes in only once.
- Row navigation (Esc, Up from the first row) focuses the input without the hover gate, because it is an explicit keyboard request. Down from the last row does nothing, but still prevents scrolling.
- `LiveRegions` is tested in its own file so that its first-paint test sees a fresh module. Each region holds an empty text node, so the tests assert `textContent === ''`.
- `ToastLayer` holds on `pointerenter`/`pointerleave` only for `pointerType === 'mouse'`, because a touch tap sends no leave. It also holds on `focusin`/`focusout`.
- `hold` clamps `remaining` to `[0, previous remaining]`, so a clock that steps back can't lengthen a toast.
- The safety net forgets an element that focus left to the body while it was still connected.
- Type-to-focus accepts AltGr characters (Ctrl+Alt with `AltGraph`).
- ESLint bans `.focus()` calls in `src/**` outside `lib/focus.ts` and tests (AD-18), merged with the AD-8 `no-restricted-syntax` entries.
- `ToastLayer` uses `svelte-ignore a11y_no_static_element_interactions` on the toast element, whose hover and focus handlers only pause the timer.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 26 · false 3 · maybe-false 1. There are no intent_gap or bad_plan entries, so there is no loopback: 11 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Two announcements in one tick overwrite each other before assistive tech reads the first (BH, ECH) | medium | patch | Each region has one pending message; a second same-tick call appends to it. Test: error then announce gives one joined message. |
| 2 | `hideLoadFailure` leaves the alert text, and a pending same-tick alert still fires (BH, ECH, VG) | low | patch | Hiding cancels the pending alert and clears `alertText`; tested. |
| 3 | The safety net keeps `lastFocused` after a blank-space click, so a later removal moves focus (BH, ECH) | low | patch | Cleared in the focusout microtask when the element is still connected and body is focused; tested. |
| 4 | On touch, a tap fires a synthetic `mouseenter`, so a tapped toast never auto-dismisses (BH) | low | patch | `pointerenter`/`pointerleave`, holding only for `pointerType === 'mouse'`; tested. |
| 5 | `remaining` can exceed 5 s if the clock steps back (BH, ECH) | low | patch | Clamped; tested. |
| 6 | AltGr characters are dropped by type-to-focus (BH) | low | patch | `getModifierState('AltGraph')` bypasses the modifier check; tested. |
| 7 | Single-owner focus isn't enforced (IA) | low | patch | ESLint bans `.focus()` outside `lib/focus.ts`, merged with the AD-8 selectors. |
| 8 | Up on row 1 on phone, last-row Down `defaultPrevented`, and `isComposing` in `onInputKeydown` untested (VG) | low | patch | Three tests added. |
| 9 | The dropped-timer test can't fail (BH, VG) | low | patch | It asserts the exact timer count. |
| 10 | The repeat-announce and alert tests depend on state from earlier tests (BH, VG) | low | patch | `primeRegions()` sets a known start. |
| 11 | The Ticket 7 ai-log entry predates review | low | patch | Review and "What AI missed" added. |
| 12 | A stationary pointer keeps the hold after a prepend moves the toast (ECH) | maybe-false | reject | Browsers fire boundary events on layout change when the pointer next moves; would be low if true. |
| 13 | `setRangeText` ignores `maxlength`/`beforeinput` (BH, ECH) | false | reject | The input has no `maxlength` (AD-12: the frontend never enforces the max). |
| 14 | `toasts.alert(text)` is untyped (BH) | false | reject | AD-17 specifies `alert(text)`; callers use `COPY.retryFailed`. |
| 15 | `focusInput` reports success on a disabled input (ECH) | low | reject | The input is never disabled (usable while loading, EXPERIENCE). |
| 16 | Navigation stalls on a row lacking the control (ECH) | low | reject | Every 1.10 row has both controls. |
| 17 | Esc/arrows taken from text fields inside a row; no `isComposing` there (BH, ECH) | low | reject | No inline editing in scope. |
| 18 | Retry/Dismiss names lack context; Retry has no busy state (BH) | low | reject | The message is adjacent; the store allows one GET in flight (AD-10). |
| 19 | ToastLayer has no placement (BH, IA) | low | reject | 1.9 mounts and places it under the input. |
| 20 | Retry goes through an `onretry` prop, not `tasks.retry()` (IA) | low | reject | The store doesn't exist yet; 1.9 wires the prop to `tasks.retry()`. |
| 21 | The empty-state suffix is built in the module, not the store (IA) | low | reject | Plan Always: the store decides with `listEmpty`, the module owns the copy. |
| 22 | API beyond AD-17 (`hold`/`release`, `TOAST_MS`, `onInputKeydown`, row contract) (IA) | low | reject | All in the plan; components and 1.10 need them. |
| 23 | The max-2 cap lives in the module (IA) | low | reject | One source of truth; ToastLayer renders `items`. |
| 24 | Esc and Up from row 1 focus the input on phone (IA) | low | reject | An explicit keyboard request; pinned by tests. |
| 25 | Exactly 5000 ms, not "about 5 s" (IA) | false | reject | 5 s is within "about 5 s". |
| 26 | Announce and focus checked only in jsdom (IA) | low | reject | 1.9's E2E and axe checks run them in a browser. |
| 27 | The live-region exclusivity test covers only these two components (IA) | low | reject | The plan's grep check and the 1.9 mount extend it. |

## Design Notes

- **Remaining time without the wall clock:** on `hold`, clear the timer and keep `remaining = deadline - clock.sample()`, where the deadline was set with `clock.sample()`. Fake timers move `Date.now`, so the 3 s / 10 s / 2 s row is testable. This reuses AD-8's one clock rather than adding a second time source.
- **Announcing twice:** a screen reader ignores a region whose text doesn't change. Clearing it and setting the text in a `setTimeout(…, 0)` makes "Added: milk" twice read twice.
- **Safety net:** on `focusout` with no `relatedTarget`, queue a microtask. If `document.activeElement` is `body` and the element that lost focus is no longer `isConnected`, call `returnToInput()`. Clicking blank space leaves the element connected, so focus stays where the user put it.
- **Type-to-focus:** call `preventDefault`, focus the input, then `setRangeText(key, start, end, 'end')` and dispatch an `input` event, so a bound value updates.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green, coverage ≥ 70%
- `grep -rn "aria-live\|role=\"status\"\|role=\"alert\"\|\.focus(" frontend/src --include=*.svelte --include=*.ts | grep -v test` -- expected: only `LiveRegions.svelte` and `focus.ts`
