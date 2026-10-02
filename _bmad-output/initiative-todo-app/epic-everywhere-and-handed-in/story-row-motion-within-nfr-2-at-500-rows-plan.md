---
title: 'Row motion within NFR-2 at 500 rows'
type: 'bugfix'
ticket: '10'
created: '2026-10-02'
status: done
baseline_revision: 'dfe918f710956b4064fb6eb5c4dcf3a8bd1d80a9'
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

**Problem:** Story 3.8 measured NFR-2 with 500 rows under default motion and found it misses: the p95s are Enter 202 ms, tick 119 ms and delete 168 ms, against a 100 ms target. The cause is `animate:flip` on the keyed `{#each}` (`App.svelte:234`), which builds a FLIP animation for every row that moves, about 370 layouts per action. Reduced motion already passes (79, 56 and 50 ms).

**Approach:** Only rows a person can see slide. The animate function returns a zero-duration config, so no animation and no `flip` work, for a row whose old and new boxes are both outside the viewport. The 200 ms ease-out slide stays exactly as it is for visible rows. Reduced motion stays instant. The QA gate becomes a plain test, and the performance report is re-measured.

## Boundaries & Constraints

**Always:**
- EXPERIENCE › Motion still holds for the rows on screen: about 200 ms, ease-out, on tick, untick, settle and delete. Under `prefers-reduced-motion: reduce` nothing moves, read at animation time, so a live change to the setting applies.
- "Visible" means the row's old or new box intersects the viewport: `bottom > 0 && top < innerHeight`. A row that slides into view or out of view still animates.
- Unit tests in `frontend/` cover the decision, and an E2E pins that an off-screen row gets no animation while visible rows get 200 ms ones.
- `npm run qa` passes with the default-motion feedback test as a plain test (the `test.fail` is removed). `docs/qa-performance.md` and its committed `perf-results*.json` are regenerated from that run. Numbers are copied from real output.
- All suites stay green, including the motion and reduced-motion tests in `rows.spec.ts` and `hold.spec.ts`.

**Never:**
- Lowering the NFR-2 targets, the sample counts or the gate.
- Replacing Svelte's `animate:` with a hand-rolled FLIP, adding dependencies, or using a row-count threshold. The viewport rule is what keeps motion for every visible row.
- Changing the store, sort order, focus behaviour or API.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Visible row moves | from or to intersects the viewport, default motion | `flip` config, duration 200, `cubicOut` | — |
| Off-screen row moves | from and to are both above or both below the viewport | `{ duration: 0 }`, and `flip` is not called | — |
| Slides into view | from is below the fold, to is on screen | animated | — |
| Reduced motion | any boxes | `{ duration: 0 }` | — |
| No `matchMedia` (jsdom) | — | treated as no preference | — |
| 500 rows, default motion | Enter, tick, delete | each feedback p95 < 100 ms | a miss is reported with its cause; the story does not hand-wave it |

</frozen-after-approval>

## Code Map

- `frontend/src/App.svelte:6-7,24-35,234` -- imports `flip` and `cubicOut`; `SLIDE_MS`, `reducedMotion()` and the `slide` params; `animate:flip={slide}`. Move the motion decision out, then use `animate:slideRow`.
- `frontend/node_modules/svelte/src/internal/client/dom/elements/transitions.js:84-130` -- Svelte 5.57 `animation()`. `measure()` and `apply()` read `getBoundingClientRect` for every row, which is cheap because the reads are batched. `apply()` calls the animate fn only when the box moved, and `animate()` returns a no-op for `duration: 0`. So returning `{ duration: 0 }` avoids both `flip`'s `getComputedStyle`/`clientWidth` reads and the `element.animate()` writes. Don't patch Svelte.
- `frontend/src/lib/` -- one module per concern, with `*.test.ts` beside it (vitest, jsdom, `vitest-setup.ts`). Add `motion.ts` here.
- `e2e/tests/rows.spec.ts:355-436` -- `animationsAfterClick` records every row `Element.animate()` call. The motion tests use 2 rows; the new off-screen test reuses this helper.
- `e2e/tests/hold.spec.ts:72-90,134-158` -- `animationsAfterSettle` and the settle motion tests, which use 5 rows (all visible). They must stay green unchanged.
- `e2e/qa/perf.spec.ts:24-31,674-689` -- the header comment and the `test.fail(motion === 'no-preference', …)` gate. Remove the mark and update both comments.
- `docs/qa-performance.md` -- the full report. Regenerate its tables from the new `docs/qa-artifacts/perf-results*.json`. Issue 1 becomes fixed: keep the before figures as history, add the after figures and the change. Update the Gate section.
- `docs/ai-log.md` -- append `## Ticket 3.10 — Row motion within NFR-2 at 500 rows`, in the style of the earlier entries.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/motion.test.ts`, then `frontend/src/lib/motion.ts` -- red first. Export `SLIDE_MS`, `prefersReducedMotion()` and `slideRow(node, { from, to })`, which returns `{ duration: 0 }` for reduced motion or a row that stays off-screen, and otherwise `flip(node, { from, to }, { duration: SLIDE_MS, easing: cubicOut })`. Cover every matrix row, spying that `flip` isn't reached in the zero cases (check the return shape and that no `getComputedStyle` call happens). -- the decision, tested in isolation
- [x] `frontend/src/App.svelte` -- drop the local motion code and use `animate:slideRow`. -- one call site
- [x] `e2e/tests/rows.spec.ts` -- add "motion: only rows on screen slide". Seed about 40 open rows at 1280×800, tick the first, and assert the recorded animations are all 200 ms, there is at least one, and there are fewer than the rows that moved (each animated target's box intersects the viewport at click time). -- pins the rule end to end
- [x] `e2e/qa/perf.spec.ts` -- remove `test.fail` and update the comments. -- the gate
- [x] Rebuild the test stack, then run `npm run qa`. Regenerate `docs/qa-performance.md` from the output, including the getMetrics, dropped-sample and longest-task tables. -- evidence
- [x] `docs/ai-log.md` -- add the Ticket 3.10 entry.

**Acceptance Criteria:**
- Given the rebuilt test stack, when `E2E_BROWSER_CHANNEL=chrome npm run qa` runs, then all tests pass with no expected failures, and the default-motion Enter, tick and delete p95s are each under 100 ms.
- Given a short list, when a row is ticked or a held row settles under default motion, then the existing E2Es still see 200 ms row animations. Under reduced motion they see none.
- Given `docs/qa-performance.md`, when it is read, then every figure matches the committed `perf-results*.json` from this run, and Issue 1 is recorded as fixed, with its before and after figures and the cause.

## Implementation Notes

- The new E2E checks each animated row's box **before or after** the move, not "at click time" only: a row sliding into view from below the fold is animated by the rule but starts off-screen. The before box is read just before the click, the after box once no row animation is left.
- `rowMotionAfterClick` waits until no row animation remains (not for the recorded animations' `finished`), and counts animated rows, not animations: the server-response re-render can abort a slide and restart it, inside or after the recording window. `animationsAfterClick` is now a thin wrapper, so the existing motion tests are unchanged in behaviour.
- `README.md`'s QA paragraph described the removed expected failure; one sentence updated.
- QA run (11:45–11:51 UTC): `40 passed (6.1m)`, no expected failures. Default-motion feedback p95: Enter 94.5, tick 62.7, delete 74.3 ms. Enter's margin is small.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

The review diff left out the regenerated `docs/qa-artifacts/*.json` data and this plan. The gate's p95s were checked against `perf-results.json` directly: 94.5, 62.7 and 74.3 ms.

Counts: high 0 · medium 0 · low 13 · false 2 · maybe-false 1. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches, 1 deferral, 10 rejections.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The new E2E has no completeness check: a visible moved row that loses its slide goes unnoticed; the only lower bound is `> 0` (BH, IA) | low | patch | Assert every moved row whose old or new box is on screen is among the animated rows. |
| 2 | `rowMotionAfterClick`'s 2 s settle loop runs out silently and reads boxes mid-slide (BH, ECH, VG) | low | patch | Throw when row animations are still running at the deadline. |
| 3 | `motion.ts` header says "tick, settle and delete"; the NFR-2 actions are add (Enter), tick and delete (BH) | low | patch | Correct the wording. |
| 4 | `TaskRow.svelte:3` still says `animate:flip` (VG) | low | patch | Name `animate:slideRow`. |
| 5 | Report: Issue 1 "After" sets per-action rates against reduced-motion totals; a "Before" label sits over a before/after table; the Gate section doesn't say Enter's 5.5 ms margin is specific to this machine (BH) | low | patch | Use the same unit on both sides, relabel the table, and add a margin note to Gate. |
| 6 | Heap figures are unexplained (default 69.9 MB before; reduced motion 42.3 → 64.2 MB), and the heap-snapshot follow-up was dropped (BH) | maybe-false | defer | Medium if it is a leak, so recorded as unverified. A heap snapshot before and after the feedback set would settle it; deferred-work entry added. |
| 7 | A row whose old and new boxes are on opposite sides of the viewport jumps instead of sweeping across (BH, ECH) | low | reject | The frozen Approach defines the rule exactly ("old and new boxes are both outside the viewport"). Only a remote reorder delivered by a poll can reach it. |
| 8 | The E2E checks before or after the move, not at click time as the task line said (ECH) | false | reject | The frozen Boundaries define visible as "old or new box", and the test asserts that rule. |
| 9 | Rows under the sticky header count as visible (BH, IA) | low | reject | It follows the Approach's viewport definition and errs toward more motion, never less. |
| 10 | EXPERIENCE.md and the architecture are not updated (BH) | low | reject | Nothing a person sees changes: rows on screen still slide. The architecture defers rendering optimisations "until NFR-2 fails", which is exactly this case. |
| 11 | The unit tests use `getComputedStyle` as a proxy for "flip reached" (BH) | low | reject | If `flip` changed, the visible-row test, which asserts the spy *was* called, would fail loudly rather than weaken silently. A `vi.mock` adds complexity for no gain. |
| 12 | The dropped-samples table changed without comment (BH) | low | reject | Per-run data; the spec counts and replaces dropped samples by design. |
| 13 | The Impact paragraph was removed from Issue 1 (BH) | low | reject | Cosmetic; the 500-row gate stays and is now plain. |
| 14 | The perf gate runs only by hand, and there is no CI (VG) | low | reject | Pre-existing and documented in the README. |
| 15 | Margin and flakiness on slower machines (BH, IA) | low | patch | Merged into #5's Gate note. |
| 16 | The review diff leaves out the evidence JSONs and the plan; the a11y-summary change isn't mentioned (BH) | false | reject | Left out on purpose when staging; the a11y change is timestamps only. |

## Design Notes

Reduced motion already shows that layout reads are not the cost. With `duration: 0`, Svelte still measures every row and still calls `flip` (5 layouts per action), and every target passes. The cost is the per-row `element.animate()`, and the style and layout invalidation it adds, multiplied by about 500 rows and run again when the server's response re-renders. With about 15–25 rows on screen at 800 px, the animated set shrinks by 20× or more.

If the default-motion p95 is still at or above 100 ms after this change, stop and report the figures. Don't widen the scope.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build && npm run docs:format:check` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && npm run format:check && E2E_BROWSER_CHANNEL=chrome npm test && E2E_BROWSER_CHANNEL=chrome npm run qa` -- expected: all green, no expected failures
