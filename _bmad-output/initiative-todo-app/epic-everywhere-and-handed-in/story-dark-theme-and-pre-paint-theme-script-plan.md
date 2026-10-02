---
title: 'Dark theme and pre-paint theme script'
type: 'feature'
ticket: '4'
created: '2026-10-02'
status: 'built'
baseline_revision: 'd30b06c0e84b584660de4875234d4b8530bf09fe'
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

**Problem:** The app ships only DESIGN's light palette. It ignores a dark OS setting, has no way to apply a stored theme before first paint, and `TaskRow` hard-codes `'light'` for the age colour. The webfonts aren't preloaded (deferred from 1.9). CAP-11 needs the dark theme, with no flash and CSP-clean.

**Approach:**
- **Palette:** add DESIGN's `-dark` twins as dark blocks in `app.css`.
- **Pre-paint script:** `public/theme-init.js`, loaded with a blocking `<script src>`, sets `data-theme` from `localStorage` before first paint (AD-19).
- **`lib/theme.svelte.ts`:** exposes the resolved theme and a setter, which entry 5's toggle will use.
- **`TaskRow`:** passes the resolved theme to `ageColour`.
- **Drift test:** guards both dark blocks against `THEME_SURFACES.dark`.
- **Font preload:** a small Vite plugin preloads the three latin woff2 faces.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-8, AD-19; DESIGN › Colors ("one CSS variable per light name, assigned the `-dark` twin's value under the dark theme"); EXPERIENCE › Theme toggle.
- **CSS (`app.css`):** every light `--color-*` token gets its dark value from DESIGN in two blocks with identical declarations:
  - `:root[data-theme='dark'] { … }`
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }`

  Both blocks also set `color-scheme: dark`; `:root` gets `color-scheme: light`. Literal hex values, no `var()` indirection. Components stay unchanged (they already read only `var(--color-*)`).
- **Storage key:** `'theme'`, with values `'light'` or `'dark'`. Anything else counts as nothing stored.
- **`public/theme-init.js`:** plain ES5, no module. Inside `try/catch`, it reads the key and, when the value is valid, sets `document.documentElement.dataset.theme`. It never sets the attribute when nothing valid is stored, so the media query decides.
- **`index.html`:** `<script src="/theme-init.js"></script>` in `<head>`, before any stylesheet or module script. No inline script.
- **`lib/theme.svelte.ts`:** exports `theme`, with:
  - **`current`:** `'light' | 'dark'`, reactive. It is the stored choice, otherwise the system setting from `matchMedia('(prefers-color-scheme: dark)')`.
  - **Live system changes:** followed while nothing is stored.
  - **Initial stored choice:** read from `document.documentElement.dataset.theme`, which `theme-init.js` set.
  - **`set(t)`:** sets `data-theme` and `current`, and stores `t` inside a `try/catch`. When storage throws, the choice lasts for the session only (still applied, just not persisted). Once a theme is set, system changes are ignored.
  - **No `matchMedia`:** the fallback is light.
- **`TaskRow.svelte`:** `ageColour(row.added_at, now, done, theme.current)`.
- **`tests/theme-surfaces.test.ts`:** parses both dark blocks and checks:
  - each block declares exactly the same `--color-*` names as `:root`;
  - the two blocks agree value for value;
  - `--color-surface` and `--color-hover` match `THEME_SURFACES.dark`.

  The light test stays.
- **Font preload:** a Vite plugin, build only, adds `<link rel="preload" as="font" type="font/woff2" crossorigin href="…">` for the emitted `inter-latin-400-normal`, `inter-latin-600-normal` and `jetbrains-mono-latin-400-normal` woff2 files to `index.html`. The build fails if any of the three is missing from the bundle.
- **Coverage:** the 70% gate holds. **CSP:** zero violations.

**Never:**
- The theme toggle button, or any `App.svelte` header change (entry 5).
- Inline `<script>` or `style` attributes. No `unsafe-inline`.
- Hard-coded colours in components. No change to `age.ts` values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| OS dark, nothing stored | `prefers-color-scheme: dark` | dark tokens (`body` bg `#0E131A`); `theme.current === 'dark'`; dark age colours | — |
| OS light, nothing stored | light | light tokens; `'light'` | — |
| Stored dark on light OS | `localStorage.theme = 'dark'` | `data-theme="dark"` already set when `<body>` is created; dark tokens | — |
| Stored light on dark OS | `'light'` | light tokens; no `data-theme` override by the media query | — |
| Invalid stored value | `'blue'` | treated as nothing stored | — |
| Storage throws on read | `getItem` throws | no attribute; the system theme applies; no console error escapes | caught |
| Live system change | nothing stored; OS flips | `current` follows | — |
| Live change after set | `set('light')`, then OS flips to dark | stays light | — |
| `set` with storage blocked | `setItem` throws | applied for the session; `current` updated | caught |
| Age colour follows theme | dark; a task 1 h old | the bar is `ageColour(…, 'dark')` (±2/255 in E2E) | — |
| Preload | `npm run build` | `dist/index.html` has 3 woff2 preloads that resolve with 200 | build error if one is missing |
| CSP | E2E in the dark scheme | no `securitypolicyviolation` | the fixture fails the test |

</frozen-after-approval>

## Code Map

- `frontend/src/app.css` -- the light tokens on `:root` (l.2–18). Its header comment says "Dark mode arrives with epic 3"; update it. `html` and `body` already use `var(--color-bg)`.
- `_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md:43-59` -- the dark hex values for `bg` through `error-icon` (16 tokens, matching the 16 light ones).
- `frontend/index.html` -- add the script tag in `<head>`.
- `frontend/public/` -- holds only `favicon.svg`; add `theme-init.js` here. Vite copies it verbatim to `dist/`.
- `frontend/src/lib/clock.svelte.ts` -- the module-level reactive singleton pattern (`$state`, getter object, listeners at module load) for `theme.svelte.ts` to follow. `lib/focus.ts` reads `matchMedia` guarded by `typeof matchMedia === 'function'`.
- `frontend/src/lib/age.ts:46-56` -- `Theme` and `THEME_SURFACES`. Import `Theme` from here; don't redefine it.
- `frontend/src/components/TaskRow.svelte:27` -- the `'light'` literal. `TaskRow.test.ts:231-235` asserts the light colour; add a dark case by setting the theme.
- `frontend/tests/theme-surfaces.test.ts` -- a node-env test with `rootToken()`'s `:root\s*\{([^}]*)\}` parse. The dark blocks need their own selector regexes; the media block nests braces.
- `frontend/vite.config.ts` -- `plugins: [svelte(), svelteTesting()]`. Put the plugin in `frontend/vite-plugins/preload-fonts.ts` (add it to `tsconfig.node.json` `include`), and use a `transformIndexHtml` post hook with `ctx.bundle`. Export a pure helper (bundle file names → tags) and unit-test it in `frontend/tests/preload-fonts.test.ts`.
- `frontend/src/main.ts` -- the three fontsource imports; their latin woff2 files are what the plugin targets.
- `e2e/tests/age-bar.spec.ts:13-55` -- the light colour constants and the `channels`/`near`/`expectBarColour` helpers to reuse. The dark stops are DESIGN `age-1h-dark` `#55C483` and `age-24h-dark` `#EA6A64`.
- `e2e/fixtures.ts` -- `seed`, and the CSP check at teardown. `test.use({ colorScheme: 'dark' })` and `page.addInitScript` (localStorage, plus a `MutationObserver` that records `data-theme` when `<body>` is inserted) are standard Playwright.
- New `e2e/tests/theme.spec.ts`.
- `docs/ai-log.md` -- append `## Ticket 3.4 — Dark theme and pre-paint theme script`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/app.css` -- the two dark blocks and `color-scheme` -- DESIGN dark palette
- [x] `frontend/public/theme-init.js`, `frontend/index.html` -- the pre-paint script and its tag -- AD-19 no flash
- [x] `frontend/src/lib/theme.svelte.ts` (+ `theme.svelte.test.ts`) -- resolved theme, live follow, `set` with storage fallback -- the matrix rows for the module
- [x] `frontend/src/components/TaskRow.svelte` (+ test) -- `theme.current` into `ageColour` -- dark age colours
- [x] `frontend/tests/theme-surfaces.test.ts` -- the dark-block parity and `THEME_SURFACES.dark` -- drift guard
- [x] `frontend/vite-plugins/preload-fonts.ts`, `vite.config.ts`, `tsconfig.node.json`, `tests/preload-fonts.test.ts` -- the preloads -- deferred from 1.9
- [x] `e2e/tests/theme.spec.ts` -- the OS-dark tokens and age colour, stored dark before `<body>`, stored light on a dark OS, the 3 preloads served, CSP-clean -- end-to-end proof
- [x] `docs/ai-log.md` -- the Ticket 3.4 section

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes.

## Implementation Notes

- `theme.svelte.ts` holds two `$state`s, the painted or set choice and the system theme; `current` is `chosen ?? system`. A live OS change only updates `system`, so once a choice exists it has no effect. It also exports `THEME_STORAGE_KEY`.
- `public/theme-init.js` uses `dataset.theme`. The ESLint override for it allows the unused `catch (e)` that ES5 requires. ES5 itself isn't lint-enforced, because the typescript-eslint parser ignores `ecmaVersion`.
- Added `frontend/tests/theme-init.test.ts`, which runs the real script under jsdom for the stored, invalid and throwing-read rows. It isn't in the Code Map. `tsconfig.tests.json` has no DOM lib, so the file references it.
- `preloadTags` requires exactly one woff2 per face, so a duplicate also fails the build. The tags go in with `injectTo: 'head'`, after Vite's own script and stylesheet tags.
- E2E: the invalid-value and throwing-`getItem` rows also run in the browser. The storage-throws test listens for `pageerror`.
- Verification: check, lint, Prettier, 422 Vitest tests (99.28% statements, 96.43% branches) and the build are green; `dist/index.html` has 3 preloads. After a test-stack rebuild, the e2e typecheck passes and 87/87 Playwright tests pass on the system Chrome.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 0 · low 13 · false 5 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 6 patches, 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The storage key is a literal in `theme-init.js` and in the module, and no test ties them together (BH, ECH) | low | patch | A test asserts that the script source reads `THEME_STORAGE_KEY`; the tests use the constant. |
| 2 | Only `surface` and `hover` are checked against a source of truth, so the other 14 dark hexes are unguarded (BH, IA) | low | patch | The drift test parses DESIGN.md's `-dark` keys and compares the full map. |
| 3 | The parity regex matches only hex values, so a non-hex token drops out of both name sets (ECH) | low | patch | The names are now matched with any value. |
| 4 | `media.addEventListener` throws at module load where only `addListener` exists (ECH) | low | patch | Falls back to `addListener`. |
| 5 | The preload fetch test keeps only the last status per path, so a double download would pass (BH) | low | patch | Counts the responses: exactly one per face. |
| 6 | The `TaskRow.test.ts` `afterEach` comment says "system default", but `set('light')` pins a choice (BH) | low | patch | Comment corrected. |
| 7 | `theme-init.js` has no cache policy (BH) | low | defer | Pre-existing: nginx sets no `Cache-Control` at all; deferred-work entry added. |
| 8 | `index.html` hard-codes `/theme-init.js` and ignores Vite's `base` (BH, ECH) | low | reject | `base` is `/`, and nginx serves at the root; nothing sets another base. |
| 9 | The canvas flashes light on a dark OS before the CSS arrives (BH) | false | reject | The built stylesheet is a render-blocking `<link>` in `<head>`, so the browser doesn't paint before it applies. |
| 10 | No dark `theme-color` meta for mobile browser chrome (BH) | low | reject | Not in DESIGN or EXPERIENCE; it would be a new feature. |
| 11 | No way back to following the OS after `set()` (BH, ECH) | false | reject | EXPERIENCE › Theme toggle: "there is no in-app way back to following the system". |
| 12 | Other open tabs don't follow a change (no `storage` listener) (BH, ECH) | low | reject | Not specified; the choice applies on each tab's next load. |
| 13 | No E2E for a live OS switch after load (BH) | low | reject | The unit tests cover live following and the `TaskRow` recolour; the dropped event-name risk is caught by the type checker (VG). |
| 14 | ES5 isn't enforced for `theme-init.js` (BH) | low | reject | Every supported browser runs ES2015+; ES5 is a self-imposed style. |
| 15 | An invalid `data-theme` on `<html>` paints light with dark age colours (ECH) | low | reject | Unreachable: only `theme-init.js` and `set()` write the attribute, and both validate it. |
| 16 | The plan isn't in the review diff (BH) | false | reject | Left out by design. |
| 17 | Nothing in production calls `theme.set` yet (BH) | false | reject | By design: entry 5's toggle uses it (the intent says so). |
| 18 | No-flash is proven by DOM state, not pixels; most tokens are checked only in CSS (IA) | false | reject | Descriptive; `data-theme` set before `<body>` exists implies it is set before any paint, and the drift test now pins every token. |

## Design Notes

- **Why literal hexes duplicated across two blocks:** the media query can't share a rule body with an attribute selector without `var()` chains, which the drift test can't resolve. The parity test turns the duplication into a guarded copy.
- **Why read `dataset.theme` and not storage at startup:** `theme-init.js` has already validated the value, so the module agrees with what was painted even when storage throws later.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build && grep -c 'rel="preload"' dist/index.html` -- expected: green, and 3
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
