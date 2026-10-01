---
title: 'Age colour function for light and dark'
type: 'feature'
ticket: '2'
created: '2026-10-01'
status: 'built'
baseline_revision: '9003529130f33f63b7a4c2153361fc8afe317d2b'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Open tasks need the age colour (CAP-4, FR-9). DESIGN.md defines the colour by a formula, which it marks normative, not by a lookup table. The epic needs both themes now, while light alone is shown until epic 3.

**Approach:** Add pure `ageColour(timestamp, now, done, theme)` to `lib/age.ts`. It implements DESIGN's OKLCH gradient with gamut reduction and the 3:1 contrast nudge, and returns a `#RRGGBB` string, or `null` for completed tasks. Lock it to DESIGN's reference stops with unit tests. Entry 3 renders it.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** DESIGN.md "Age gradient" and "Contrast", FR-9, and AD-8 (pure: no clock, no DOM).
- **Signature:** `ageColour(timestamp: string, now: number, done: boolean, theme: 'light' | 'dark'): string | null`.
  - Age is `max(0, now − Date.parse(timestamp))`, so a future timestamp gets the fresh colour.
  - `done` returns `null`.
- **Gradient:**
  - `t` is 0 for an age under 1 h, 1 at 24 h or more, and `(hours − 1) / 23` in between, linear in time.
  - L and C interpolate linearly. The hue decreases linearly from 155 to 25.
  - Endpoints: light fresh `oklch(0.58 0.13 155)`, light overdue `oklch(0.56 0.17 25)`, dark fresh `oklch(0.74 0.14 155)`, dark overdue `oklch(0.68 0.16 25)`.
- **Gamut:** when a colour is outside sRGB, reduce its chroma in fixed 0.002 steps, keeping L and H, until it fits.
- **Contrast nudge:** when the colour falls below 3:1 against either the theme's `surface` or its `hover`, move L away from the background (darker for light, lighter for dark) in small steps until both reach 3:1 or more. With DESIGN's endpoints this never triggers, but it stays tested.
- **Reference values:** a `THEME_SURFACES` constant holds light `surface #FFFFFF`, `hover #F4F6F9` and dark `surface #151B24`, `hover #1B222D`, with a comment that they are copied from DESIGN.md's tokens. A unit test checks the light pair against `--color-surface` and `--color-hover` in `app.css`, so the copies can't drift. Epic 3's dark CSS tokens must match the dark pair.
- **Tests:**
  - Every DESIGN reference stop (1, 3, 6, 12, 18, 23 and 24 h or more, light and dark) is within ±2/255 per channel.
  - A sweep over 0–30 h in 15-minute steps, in both themes, keeps at least 3:1 against surface and hover. Across the same sweep the hue never increases.
  - The nudge path works when fed a low-contrast background through an exported helper.
  - `done` returns `null`, and a future timestamp gives the fresh colour.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):** The gamut rule changed from bisection to fixed 0.002 chroma steps. Bisection lands on the exact gamut edge and misses light 12 h by 6/255; the fixed step reproduces all 14 DESIGN stops. The stop tolerance is each sRGB channel within ±2/255 of the stored DESIGN hex, in both themes. This resolves the entry's unknown.

**Never:**
- UI or CSS changes. `TaskRow` and the age bar are entry 3's job.
- A lookup table standing in for the formula, or `oklch()` in CSS (a decision made at inception).
- A clock read, `Date.now()` or `new Date()`.
- Dark tokens in `app.css` (epic 3).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Fresh | age 30 min, light | `#249057` (within tolerance) | — |
| Mid | age 12 h, light / dark | about `#8F7506` / `#C19E00` | — |
| Overdue | age 25 h, light / dark | `#C43F3E` / `#EA6A64` | — |
| All stops | each DESIGN stop, both themes | each channel within ±2/255 | — |
| Contrast | 0–30 h sweep, both themes | ≥ 3:1 on surface and hover | — |
| Nudge | helper fed a colour and a background giving under 3:1 | L moved until ≥ 3:1 | — |
| Done | `done = true` | `null` | — |
| Future | timestamp after now | fresh colour | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/age.ts` -- the 2.1 `ageLabel(timestamp, now, done)` and its constants (`MINUTE`, `HOUR`, `DAY`). Pure. Its header says colour arrives in 2.2/2.3. Add `ageColour` and the OKLCH helpers here, or in a sibling `lib/oklch.ts` imported by `age.ts`.
- `frontend/src/lib/age.test.ts` -- the boundary tables for `ageLabel`. Add the colour suites.
- `frontend/src/app.css` -- `--color-surface: #FFFFFF` and `--color-hover: #F4F6F9` on `:root`. Read it with Node's `fs` from a test in `frontend/tests/` (node environment). `src/` tests can't use Node types.
- DESIGN.md frontmatter `colors` -- the stop hexes `age-1h` … `age-24h` and `*-dark`, plus `surface-dark` and `hover-dark`.
- Conversion maths: OKLab ↔ linear sRGB (Björn Ottosson's matrices), the sRGB transfer functions, and WCAG relative luminance for contrast. The main session's prototype, which used a 0.001 chroma step, matched 13 of 14 stops exactly; light 12 h came out `#8F7502` against `#8F7506`.
- `docs/ai-log.md` -- append the section for this story.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/age.ts` -- `ageColour`, OKLCH → sRGB, chroma reduction in fixed 0.002 steps, contrast nudge, `THEME_SURFACES` -- the formula
- [x] `frontend/src/lib/age.test.ts` -- the stop, sweep, hue, nudge, done and future tests -- locks it to DESIGN
- [x] `frontend/tests/theme-surfaces.test.ts` -- the light `THEME_SURFACES` match `app.css` -- drift guard
- [x] `docs/ai-log.md` -- the section for this story (Ticket 2.2)

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.

## Implementation Notes

- The OKLCH helpers stay in `lib/age.ts`. A sibling `oklch.ts` failed `tsc -p tsconfig.node.json`: the drift test pulls `age.ts` into the nodenext project, which requires file extensions on relative imports, and `src/` imports never use them.
- `nudgeContrast(colour, backgrounds, theme)` is the exported nudge helper. `hexToOklch`, `hexToRgb` and `contrastRatio` are exported for the tests.

## Plan Change Log

- 2026-10-01 (implementation, touches the frozen **Gamut** rule; signed off by the user): chroma is reduced in fixed 0.002 steps instead of by bisection. Bisection to the exact gamut edge gives light 12 h `#8F7500`, 6/255 off `#8F7506` on blue, which breaks the frozen ±2/255 decision. No bisection margin fits both light 12 h (blue 6) and dark 12 h (blue 0). A 0.002 step reproduces all 14 DESIGN stops exactly. The Design Note's reasoning is reversed: the stored stop sits inside the edge, not on it. Signed off by the user (2026-10-01); the frozen rule now reads "fixed 0.002 steps".

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 1 · medium 1 · low 13 · false 0 · maybe-false 0. One frozen-rule conflict found during implementation was settled by the user (the 0.002 gamut step) before review. There are no intent_gap or bad_plan entries from review, so there is no loopback: 9 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | An unparseable timestamp hangs the dark theme forever in `nudgeContrast` (NaN L never exits) and returns `#NANNANNAN` in light (ECH, BH, VG) | high | patch | A non-finite age counts as 0 (fresh, matching `ageLabel`'s "now"); the loop exits on a non-finite L. Tested in both themes. |
| 2 | Nothing proves the nudge stays idle on the real path, so the formula between stops is unlocked (BH, IA) | medium | patch | Across the 0–30 h sweep in both themes, `ageColour` equals `toHex(fitGamut(interpolated))`, with the interpolation written out independently in the test. |
| 3 | `hexToRgb` mis-parses anything that isn't `#RRGGBB` (BH, ECH ×2) | low | patch | Throws; tested. |
| 4 | `fitGamut` passes negative chroma through, flipping the hue (ECH) | low | patch | Clamped to ≥ 0; tested. |
| 5 | The dark run-out exit is untested; the light nudge asserts only one background (BH) | low | patch | Both added. |
| 6 | Docstrings: "L, C and H linear" ignores the gamut step; "exactly" overstates the ±2/255 lock; exports unexplained (BH ×3) | low | patch | Reworded; exports marked as for tests and story 2.3. |
| 7 | `expectNear` uses `actual!` (BH) | low | patch | Clear failure on `null`. |
| 8 | The theme-surfaces guard reads only the first `:root` block, 6-digit hex only (BH, ECH ×2) | low | patch | Every `:root` block, with 3-digit hex normalised. |
| 9 | The ai-log has a "Nothing yet" placeholder; the plan task line still says bisection (BH, ECH) | low | patch | Filled in; the task line corrected by the main session. |
| 10 | The rendered colour isn't exercised (IA) | low | reject | Intent: "Entry 3 renders it". |
| 11 | The dark surface pair has no CSS guard (BH, IA) | low | reject | No dark CSS until epic 3; the touch point is recorded in epic 3's Notes. |
| 12 | The gamut step is fitted to the samples (IA) | low | reject | User decision (2026-10-01), recorded in Decisions and the Change Log. |
| 13 | The nudge returns under 3:1 silently when L runs out (ECH, IA) | low | reject | Unreachable with DESIGN's backgrounds; the run-out is tested in both themes. |
| 14 | Unknown theme at runtime (ECH) | low | reject | TypeScript types it as `'light' \| 'dark'`; all callers are typed. |
| 15 | Achromatic input gives a noisy hue in `hexToOklch` (ECH) | low | reject | Test helper only; no age colour is achromatic. |

## Design Notes

- **Why a fixed step:** chroma reduction keeps L and H, and with them the hue the eye reads as "age". A fixed 0.002 step stops just inside the gamut edge, which is where DESIGN's rendered stops sit. Exact-edge bisection would miss light 12 h by 6/255 on blue.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
