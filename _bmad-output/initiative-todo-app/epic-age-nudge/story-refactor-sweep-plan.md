---
title: 'Refactor sweep'
type: 'refactor'
ticket: '6'
created: '2026-10-01'
status: done
baseline_revision: '1df5bd29be7c6655e0c74dc90bb8b28e50084e58'
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

**Problem:** The epic's build records show recurring friction, which the user chose to clean up in this sweep:
- `e2e/` has no Prettier config, so agents reformatted specs wholesale twice and had to restore them.
- The rtk test wrapper's `frontend/.vitest/` folder keeps showing as untracked.
- `lib/age.ts` now mixes labels, OKLCH maths and test-only exports.
- `hold.spec.ts` races a 3 s wall-clock hold, with ad-hoc guards.

**Approach:** Behaviour-preserving cleanups only:
- an e2e Prettier config with a `format:check`, and one formatting pass;
- ignore `.vitest/`;
- move the colour maths to `lib/oklch.ts`;
- a shared "still held" E2E guard with a clear failure message.

Confirm the epic's Done when still holds.

## Boundaries & Constraints

**Always:**
- **e2e Prettier:**
  - Add `prettier` as an `e2e` devDependency at the frontend's version.
  - Add `e2e/.prettierrc` with the frontend's options (`semi: false`, `singleQuote: true`, `printWidth: 100`), with no Svelte plugin.
  - Add `format` and `format:check` scripts.
  - Run `format` once on every e2e file. The commit body says the pass is mechanical.
- **`.vitest/`:** add it to `frontend/.gitignore`.
- **`lib/oklch.ts`:**
  - Move the OKLab/OKLCH conversion, `fitGamut`, `toHex`, `hexToRgb`, `hexToOklch`, `relativeLuminance` and `contrastRatio` into it.
  - `lib/age.ts` keeps `ageLabel`, `ageColour`, `nudgeContrast`, `THEME_SURFACES` and the endpoints, and imports from `./oklch`.
  - Colour tests that target the maths move to `oklch.test.ts`, and the rest stay in `age.test.ts`. No assertion is changed or dropped.
  - Make `tsc -p tsconfig.node.json` accept the extensionless sibling import that `frontend/tests/theme-surfaces.test.ts` pulls in, without changing `src/`'s import style. This was the blocker in 2.2.
- **Hold guard:**
  - Add a `stillHeld(page, text)` helper in `hold.spec.ts` (or `fixtures.ts`). It asserts the `li.held` row with that text is present, with the message "hold ended before the measurement: the run is too slow for the 3 s wall-clock hold (AD-8 forbids pausing the page clock)".
  - Every hold-time measurement uses it.
- **Done when:** the epic's Done when still holds, confirmed by the full suites, and by the app profile rebuilt and healthy on `:8081`.
- **deferred-work.md:** append "Resolved by entry 2.6" lines: the toasts-over-held-row entry (resolved by 2.5) and anything this sweep closes. Never edit existing entries.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):** Sweep scope: the e2e Prettier config, ignoring `.vitest/`, the `age.ts`/`oklch.ts` split, and the hold E2E guard.

**Never:**
- Behaviour changes, or a weakened or deleted test.
- Changes to the store, the components' behaviour, the backend or compose.
- Picking up deferred items that belong to epic 3 (font preload, `load()` re-entrancy, theme).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| e2e format | `cd e2e && npm run format:check` | clean | — |
| Untracked | `git status` after a `vitest` run through rtk | no `frontend/.vitest/` | — |
| Colour unchanged | every 2.2 colour test | still passes, assertions identical | — |
| Imports | `npm run check` (svelte-check plus `tsc -p tsconfig.node.json`) | 0 errors | — |
| Slow hold | a hold-time measurement after the hold ended | fails with the "too slow" message | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/age.ts` -- `ageLabel`, `ageColour`, `nudgeContrast`, `THEME_SURFACES`, the endpoints, `fitGamut` (0.002 chroma steps), `toHex`, `hexToRgb`, `hexToOklch`, `relativeLuminance`, `contrastRatio` and the OKLab matrices. The exports are commented as for tests and story 2.3.
- `frontend/src/lib/age.test.ts` -- the label tables, the stop, sweep, nudge and helper tests.
- `frontend/tests/theme-surfaces.test.ts` -- imports `THEME_SURFACES` from `../src/lib/age.ts` (with the extension). `tsconfig.node.json` includes `tests/**/*.ts` and needs explicit extensions on relative imports, which is why an extensionless `./oklch` inside `age.ts` failed in 2.2. Options: give that tsconfig `moduleResolution: "bundler"` (Vite resolves imports anyway), or keep the test importing from a file with no sibling imports.
- `frontend/.prettierrc` -- `semi: false`, `singleQuote: true`, `printWidth: 100`, `prettier-plugin-svelte`. `frontend/package.json` pins `prettier`.
- `e2e/package.json` -- scripts `test`, `typecheck`, `install:browsers`; no Prettier.
- `e2e/tests/hold.spec.ts` -- `held(page)`, and inline `expect(held(page)).toHaveCount(1)` checks before measurements.
- `frontend/.gitignore`.
- `_bmad-output/initiative-todo-app/deferred-work.md` -- the 1.10 entry about toasts over the held row.
- `docs/ai-log.md` -- append `## Ticket 2.6`.

## Tasks & Acceptance

**Execution:**
- [x] `e2e/package.json`, `e2e/package-lock.json`, `e2e/.prettierrc`, every e2e `.ts` file -- the config, the scripts and one formatting pass
- [x] `frontend/.gitignore` -- `.vitest/`
- [x] `frontend/src/lib/oklch.ts`, `age.ts`, `oklch.test.ts`, `age.test.ts`, `tsconfig.node.json` if needed -- the split
- [x] `e2e/tests/hold.spec.ts` -- `stillHeld` used at every hold-time measurement
- [x] `_bmad-output/initiative-todo-app/deferred-work.md` (append only), `docs/ai-log.md` -- records

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run format:check`, `npm run test:coverage` and `npm run build` run, then all pass with the same test count or more.
- Given `e2e/`, when `npm run format:check` and `npm run typecheck` run, then both are clean; and on the rebuilt test stack `npm test` passes every spec.
- Given the app profile rebuilt with `docker compose up -d --build --wait`, then all services are healthy and `:8081` serves the app.

## Implementation Notes

- The implementing subagent committed before review: `12e895a` (the mechanical e2e Prettier pass) and `709f3e6` (the split, the ignore and the guard). The review fixes are `aa0426f`, on top.
- tsconfig: `tsconfig.node.json` stays on `nodenext` for the Node-run configs; a new `tsconfig.tests.json` (bundler resolution) covers `tests/**/*.ts`, and `npm run check` runs both.
- Verification (main session): frontend check, lint, `format:check` and build are green, with 356 tests at 99.59% lines; e2e `format:check` and typecheck are clean; E2E 75/75 (one rows motion flake on the first run, deferred); `hold.spec.ts` with `--repeat-each=3` 33/33; the app profile is rebuilt and `:8081` returns 200.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 14 · false 1 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 8 patches and 1 deferral (a pre-existing flake seen during verification).

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The settle tests call `runFor(HOLD_MS)` without confirming the hold, so they could pass after it had ended (BH) | medium | patch | `stillHeld` runs before every `runFor`. |
| 2 | The `tsconfig.node.json` switch to bundler loosened checks for Node-run configs (BH, ECH, IA) | medium | patch | Node configs stay on `nodenext`; a new `tsconfig.tests.json` covers `tests/`, and `check` runs both. |
| 3 | `stillHeld` filtered by text while measurements read the unfiltered locator, dropped the count-1 check, waited 5 s, hard-coded "3 s" and blamed a slow run for any miss (BH ×3, ECH ×2) | low | patch | Count 1 plus the text, returns the filtered locator, 500 ms, the message built from `HOLD_MS` and reworded. |
| 4 | `fitGamut` loops forever on `c = Infinity` or a huge c; non-finite values give `#NANNANNAN` (ECH ×2) | low | patch | `assertFinite` plus a huge-chroma throw in `fitGamut` and `toHex`; tested. |
| 5 | `oklch.test.ts` too thin; `relativeLuminance` exported with no consumer (BH ×2, IA) | low | patch | Known contrasts, stop round-trip, negative-atan2 hue and the throws; `relativeLuminance` made internal. |
| 6 | `fitGamut`'s comment points to tests no longer beside it (BH) | low | patch | Names `age.test.ts`. |
| 7 | The `.vitest/` ignore doesn't say what writes it (BH) | low | patch | The comment names the rtk wrapper's report output. |
| 8 | ai-log lacks a before/after count; "verbatim" is ambiguous (BH) | low | patch | 329 before, 329 after the split, 356 printed after the fixes; "only comments changed". |
| 9 | `rows.spec` motion test flaked once under load (main-session verification) | low | defer | Pre-existing from 1.10; 10/10 alone and 75/75 on a rerun; see deferred-work.md. |
| 10 | `format:check` isn't enforced by CI or a hook (BH, IA) | low | reject | The repo has no CI (pre-existing); the config removes the root cause. |
| 11 | No shared root Prettier config (BH) | low | reject | Two short configs; the frontend needs its Svelte plugin. |
| 12 | `age.ts` doesn't re-export `Oklch` (BH) | low | reject | `nudgeContrast`'s callers are tests; they import the type from `./oklch`. |
| 13 | The test-only exports moved rather than resolved (IA) | low | reject | The intent's approach is to move the maths; exports are commented. |
| 14 | `.vitest/` ignored only under `frontend/` (IA) | low | reject | The intent names `frontend/.vitest/`; nothing else writes one. |
| 15 | The race in `hold.spec` remains (IA, BH) | low | reject | AD-8 forbids pausing; the intent asks for a clear guard. |
| 16 | No per-item Done-when trace (IA) | low | reject | No product code changed; the full suites and the app profile cover it. |
| 17 | The review diff omits the lockfile and deferred-work (BH, IA) | false | reject | By design; both are committed. |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run format:check && npm run test:coverage && npm run build` -- expected: green
- `cd e2e && npm ci && npm run format:check && npm run typecheck` -- expected: clean
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: green
