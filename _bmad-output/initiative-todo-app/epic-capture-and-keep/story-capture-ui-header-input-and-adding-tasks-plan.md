---
title: 'Capture UI: header, input and adding tasks'
type: 'feature'
ticket: '9'
created: '2026-10-01'
status: done
baseline_revision: '43d662e0e097b868f485952283303b2aced8edcf'
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

**Problem:** The building blocks exist: the store (1.8), toasts, live regions and focus (1.7), and the E2E harness (1.5). The page, though, is still the walking skeleton, which calls `listTasks()` directly and has no way to add a task.

**Approach:** Rebuild `App.svelte` as the composition root:
- a sticky header and input per DESIGN.md, with self-hosted Inter and JetBrains Mono;
- `LiveRegions` and `ToastLayer` mounted;
- Enter wired to `tasks.add` with the trim and empty rules, and the failed text restored;
- focus on load and after actions through `lib/focus`;
- the loading skeleton, the empty state, and a plain text-only list of `tasks.rows`, which 1.10 replaces with the full rows.

Prove it with E2E specs on the test profile.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-9, AD-13, AD-16, AD-17, AD-18 and AD-19. Follow DESIGN.md (tokens, typography, Layout & Spacing, Components) for every element built here, and EXPERIENCE "Component Patterns", "State Patterns" and "Interaction Primitives" for the input, list, empty state and skeleton.
- **Tokens:** every DESIGN light colour is a `--color-*` custom property on `:root` in `app.css`, alongside the toast ones. Spacing and radius values used here also come from DESIGN, as rem at a 16 px root.
- **Fonts:** `@fontsource/inter` (400 and 600) and `@fontsource/jetbrains-mono` (400) are bundled by Vite with `font-display: swap`, backed by the DESIGN fallback stacks. No third-party origin is involved.
- **Layout:**
  - On a laptop, a centred column up to 640 px, with the page padding from DESIGN.
  - Below 600 px, the header and input sit 12 px from the edges and the list is full-bleed, with top and bottom hairlines only.
  - The header and input are sticky on a `bg` backing, and the list scrolls with the page.
  - There is no horizontal scroll down to 320 px.
- **Input:**
  - It keeps the 1.1 label, placeholder and attributes.
  - Enter adds the trimmed text, unless it is empty or an IME composition is active (`isComposing`, or key code 229).
  - Pasted line breaks become spaces.
  - On Enter the input clears at once and `tasks.add(text)` is called. A rejection with `{ text }` puts the text back only when the input is empty. A rejection with `{ text: null }` changes nothing.
  - `focus.onInputKeydown` is wired for Down.
- **Focus:** on mount, App calls `registerInput`, `installSafetyNet`, `installTypeToFocus` and `returnToInput()`. The uninstall functions run on destroy. `returnToInput()` also runs after each add. There are no other `.focus()` calls.
- **States:** `tasks.load()` runs on mount.
  - **Loading:** the list area is the skeleton: three static bars from DESIGN, `aria-hidden`. It appears only once loading has lasted more than 300 ms, timed with `setTimeout`. Before that the area stays empty. `aria-busy` is set while loading.
  - **Empty:** shown only when `ready` with no rows, with the 1.1 copy.
  - **Rows:** otherwise `<ul aria-label="Tasks">`, with one `<li>` of plain text per row, keyed by `row.key`.
  - Unconfirmed adds made while loading show above the skeleton.
- **Toasts:** `ToastLayer` sits directly under the input, overlaying the top of the list at input width. It never covers the input or takes focus. `onretry` calls `tasks.load()` until epic 3 adds `retry()`. `LiveRegions` renders once, at first paint.
- **Ownership:** only `tasks.svelte.ts` imports `lib/api.ts` from now on. App no longer calls `listTasks`.
- **E2E:** the `e2e/tests/capture.spec.ts` specs run against the test profile with the 1.5 fixtures, and `smoke.spec.ts` stays green.
- **Coverage:** the frontend coverage gate stays at 70% or above.

**Decisions (2026-10-01, user):**
- Fonts use metric-matched fallbacks with no preload. Fallback `@font-face` rules ("Inter Fallback" on Arial, "JetBrains Mono Fallback" on Courier New) use `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override`, so text doesn't jump when the webfont swaps in.
- `<link rel="preload">` is deferred.
- The full plan is approved despite its roughly 2,500 tokens.

**Never:**
- Tick, untick or delete controls, age labels or bars, row hover, animations, or the arrow-key wiring of rows (1.10, epic 2).
- The theme toggle, dark tokens, `theme-init.js`, the hold timer, polling or Retry (epic 3, epic 2).
- Inline `<script>`/`<style>` in `index.html`, `{@html}`, or a CDN font.
- Store, api, toast or focus module changes, beyond a bug fix that 1.9 exposes and that is noted in Implementation Notes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Type right after load | `goto('/')`, type "buy milk", Enter | a row "buy milk" shows; the input is empty and focused | — |
| Whitespace | "   " + Enter | no row, no request; the input keeps its spaces | — |
| IME | Enter while `isComposing` | nothing is added | — |
| Paste newline | paste "a\nb" | the input holds "a b" | — |
| Empty state | reset, then load | "Nothing waiting. Type a task above and press Enter." | — |
| Skeleton | GET delayed 1.5 s through `page.route` | three skeleton bars after about 300 ms, then the list; none for a fast GET | — |
| Survives reload | add, then reload | the row is still there | — |
| Add fails | `failApi` POST 503, add "x" | the row disappears; the toast "Couldn't save new task."; the input holds "x" again | — |
| Fail after typing on | POST fails while new text is typed | the toast shows; the new text is kept | — |
| Toast announced | add fails | the polite region contains the toast copy | — |
| Laptop focus | load on Desktop Chrome | the input is focused | — |
| A11y | `expectNoA11yViolations` at 320 px and 1280 px, empty and with rows | no critical violations | — |
| CSP | every spec | no violation (fixture) | — |

</frozen-after-approval>

## Code Map

- `frontend/src/App.svelte` -- the 1.1 skeleton: `onMount(listTasks)`, `header > h1`, a hidden label with input, and an empty state or `ul` keyed by `task.id`. Rewrite it as the composition root.
- `frontend/src/App.test.ts` -- mocks `./lib/api.listTasks`. Rewrite it to mock `./lib/api` underneath the real store, or to stub `tasks`. Keep the wordmark, label, placeholder, empty-state and "HTML as text" checks, and add Enter, trim and restore.
- `frontend/src/lib/tasks.svelte.ts` -- the `tasks` singleton: `rows` (`{key, id, text, added_at, completed_at}`), `loadState` (`loading | ready`, stays `loading` if the GET fails), `heldKey`, `load()`, and `add(text)`, which trims, ignores empty text and rejects with `{text}` or `{text: null}`.
- `frontend/src/lib/focus.ts` -- `registerInput`, `returnToInput` (hover-gated), `installSafetyNet()` and `installTypeToFocus()`, which return uninstall functions, and `onInputKeydown`. ESLint bans `.focus()` outside this file.
- `frontend/src/components/ToastLayer.svelte` (prop `onretry`) and `LiveRegions.svelte` -- unstyled positioning. The toast tokens are already in `app.css`.
- `frontend/src/app.css` -- `.visually-hidden` and the toast tokens on `:root`. Add the rest of the light palette, base `html`/`body` styles (`bg`, Inter, rem) and the font imports. `main.ts` imports `app.css`.
- `frontend/index.html` -- the title and `lang`. No inline code, because of the CSP (`default-src 'self'`).
- `e2e/fixtures.ts` -- `test`/`expect`, `seed`, `failApi(page, {method, path})`, `expectNoA11yViolations(page)`. Every test resets first, and the CSP check runs at teardown. Run with `E2E_BROWSER_CHANNEL=chrome` on this machine, against the stack rebuilt with `COMPOSE_PROFILES=test docker compose up -d --build --wait` (frontend-test bakes in the build).
- `e2e/tests/smoke.spec.ts` -- asserts the title, h1, label, placeholder and empty state. It must stay green.
- `docs/ai-log.md` -- append `## Ticket 9`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json`, `src/app.css`, `src/main.ts` -- the fontsource packages, the full light token set, base styles -- DESIGN typography and colours
- [x] `frontend/src/App.svelte`, `App.test.ts` -- the composition root as described; component tests for the Enter, trim, IME, paste, restore, skeleton-delay and empty-state rules -- the capture UI
- [x] `e2e/tests/capture.spec.ts` -- one test per E2E matrix row; viewports 320 and 1280 for axe -- proves it end to end
- [x] `docs/ai-log.md` -- `## Ticket 9 — Capture UI`, with the standard headings

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the test stack rebuilt on this code, when `npm test` runs in `e2e/`, then every spec passes.
- Given the app profile on `:8081`, when it is opened, then it looks like DESIGN's light laptop mockup for the header, input and empty state (manual check).

## Implementation Notes

- **Store comment only:** the `lib/tasks.svelte.ts` header comment said "apart from the composition root, the only caller of `lib/api.ts`". With App no longer calling `listTasks`, it now says the store is the only caller. No code changed.
- **`vite.config.ts`:** `build.assetsInlineLimit: 0`. Several fontsource subsets (for example `jetbrains-mono-cyrillic-ext-400`, 1.2 KB) are below Vite's 4 KB inlining limit, and a `data:` font URL would be blocked by `default-src 'self'` (AD-19). The built CSS and JS contain no `data:` URIs.
- **Fonts:** imported in `main.ts` (`@fontsource/inter/400.css`, `600.css` and `@fontsource/jetbrains-mono/400.css`), and added as runtime `dependencies`. The fallback metrics come from the fonts' hhea values: Inter on Arial is 107.4 / 90.2 / 22.48 / 0 %, and JetBrains Mono on Courier New is 134.59 / 75.79 / 22.29 / 0 %. The Liberation fonts are listed as metric-compatible `local()` sources for Linux.
- **Skeleton bars:** the widths are classes (`.bar-1` to `.bar-3`), not `style:` directives, so no inline style attribute reaches the CSP. The skeleton carries `data-testid="skeleton"`.
- **Skeleton delay:** an `$effect` on `loading` resets `skeletonDue` and starts the 300 ms timer on each transition into loading, and clears it on cleanup, so a later load (Retry) is delayed too.
- **Sticky block:** `.top` holds the header, the input and `.toasts` (`position: absolute; top: 100%`). It carries the 36 px top padding and the gap from the input to the list (18 px, or 14 px on phone) as its bottom padding, so the toast's top edge sits where the list's top edge is.
- **Landmarks:** the sticky block is the `<header>` (banner), holding the h1, the label, the input and the toast anchor. The list area is `main` with `aria-busy`.
- **Phone empty state:** the dashed empty-state box keeps the 12 px inset. Only the list goes full-bleed.
- **E2E:**
  - "Type right after load" waits for `aria-busy="false"` before typing, so the deferred 1.8/1.12 GET/POST race can't make it flaky.
  - The skeleton specs time the first appearance from the first `GET /api/tasks` start, both on `document.timeline` (a wrapped `fetch` and a `MutationObserver`). The fixture's page clock fakes `performance`, so resource timing is empty.
  - The toast assertions target `[data-toast-kind]`, because the polite region can carry the same copy.
- **Not covered by a test:** `onretry` → `tasks.load()`. The store never raises the load-failure toast before epic 3, so Retry can't appear yet.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 21 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 12 patches, no new deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Forced-colors mode removes the input's `box-shadow` ring, leaving no focus indicator (BH, ECH) | medium | patch | A transparent 2px outline is kept alongside the ring (WCAG 2.4.7). |
| 2 | The App-level safety net is untested; dropping it passes every test (VG) | medium | patch | App test: a failed add, Dismiss focused and clicked, focus lands on the input; after unmount it doesn't. |
| 3 | The skeleton delay is tied to mount, so a later `load()` flashes it at once (BH, ECH) | low | patch | An `$effect` on `loading` restarts the 300 ms timer; tested on the bars. |
| 4 | `add().catch` assigns `undefined` on a non-AddFailure rejection (BH, ECH) | low | patch | Restores only when `text` is a string. |
| 5 | Paste leaves U+2028/U+2029, and `\n\n` becomes two spaces (BH, ECH) | low | patch | Each run collapses to one space. |
| 6 | Input and toast anchor sit outside every landmark (BH) | low | patch | The sticky block is the `<header>`. |
| 7 | Paste then Enter, and paste over a selection, are untested (VG, BH) | low | patch | Unit (`addTask('pre a b')`) and E2E (row `a b`). |
| 8 | The E2E skeleton timing measures from navigation start with no upper bound (BH, ECH ×2) | low | patch | Measured from the first `GET /api/tasks` start: 250–900 ms. Resource timing is faked by `page.clock`, so `document.timeline` is used. |
| 9 | `assetsInlineLimit: 0` is unguarded (VG) | low | patch | `headers.spec.ts` asserts the built CSS has no `url(data:`. |
| 10 | The rollback E2E lacks the row-gone assertion; the IME E2E lacks the no-POST assertion (BH) | low | patch | Added. |
| 11 | No phone E2E for focus on load (BH) | low | patch | A `hasTouch`/`isMobile` spec asserts the input isn't focused. |
| 12 | Misnamed Down test, weak uninstall test, dead `setup()` (BH, ECH, VG) | low | patch | Renamed; `removeEventListener` spy; `setup()` inlined. |
| 13 | A failed first load leaves the skeleton and `aria-busy` up (BH, ECH ×2) | low | reject | User decision in 1.8: it stays `loading` until epic 3 adds Retry. |
| 14 | No `maxlength`; over 2000 chars loops on rollback (BH) | false | reject | AD-12: the frontend never enforces the max; the `add_too_long` toast explains it. |
| 15 | A second failed text is dropped (ECH) | false | reject | EXPERIENCE › Add rollback accepts this explicitly. |
| 16 | Concurrent `load()` from Retry (ECH) | low | reject | The load-failure toast can't appear before epic 3; 1.12 replaces `load`. |
| 17 | The whitespace E2E could miss a late POST (ECH) | low | reject | `add()` is synchronous up to `fetch`; no deferred POST path exists. |
| 18 | JetBrains Mono shipped but unused (BH, IA) | low | reject | The ticket asks for both fonts; the age labels in 1.10 and epic 2 consume it. |
| 19 | fontsource under `dependencies` (BH) | low | reject | Runtime-imported CSS; either list works for a Vite build. |
| 20 | Sticky header, DESIGN conformance and font rendering untested (IA) | low | reject | The plan makes these a manual acceptance check; screenshots were taken on :8082. |
| 21 | "Type right after load" waits for the load (IA, ECH) | low | reject | Deliberate: typing mid-load hits the 1.8 merge gap deferred to 1.12. |
| 22 | Focus "returned" vs kept after an add in E2E (IA) | low | reject | The unit test blurs first and proves the return. |
| 23 | Paste and mono skeleton timing details (IA) | low | reject | Covered by #7 and #8. |
| 24 | The review diff omits deferred-work.md (BH) | false | reject | It is excluded from the review diff by design; the preload entry exists. |
| 25 | Ticket 9 ai-log review | low | patch | Added. |

## Design Notes

- **Skeleton delay:** start a 300 ms timer on mount, and show the skeleton only if `loadState` is still `loading` when it fires. Clear the timer on destroy. Fake timers can drive it in component tests.
- **Restore rule:** capture the text before clearing the input. `add(text).catch(({ text }) => { if (text !== null && input.value === '') input.value = text })`, with `value` bound, so this is assigned through state.
- **Sticky stack:** wrap the header, input and the toast layer's anchor in one `position: sticky; top: 0` block on `bg`. The toast layer is `position: absolute` under the input, so it overlays the list.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green, coverage ≥ 70%
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
