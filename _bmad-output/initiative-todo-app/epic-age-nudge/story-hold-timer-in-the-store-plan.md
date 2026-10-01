---
title: 'Hold timer in the store'
type: 'feature'
ticket: '4'
created: '2026-10-01'
status: 'built'
baseline_revision: '0c0b1a4a2c10d574622946dd075f20457a86db74'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The store's `heldKey` (FR-4, CAP-2) takes the hold on add and drops it on tick, delete, a failed add, bury and a merge drop (1.8, 1.12). With no timer, though, the newest task stays held, and first, forever.

**Approach:** Add only the 3 s hold timer in `lib/tasks.svelte.ts`, using a global `setTimeout`:
- One helper sets or clears the hold. It cancels any running timer whenever the hold changes, and every existing `heldKey` write goes through it.
- When the timer fires, it releases only the key it was started for, so an older timer never clears a newer hold.
- The countdown starts only once `loadState` is `ready`. A hold taken while loading starts its 3 s when the load succeeds, and a list that never loads (epic 3's `load_failed`) keeps it.
- Untick still keeps the hold.

Prove it with Vitest fake timers, keeping every existing hold test green.

</frozen-after-approval>

## Suggested Review Order

1. `frontend/src/lib/tasks.svelte.ts` -- `setHeld`, the timer start in `refresh`'s ready transition, and the replaced `heldKey` writes.
2. `frontend/src/lib/tasks.svelte.test.ts` -- the hold-timer suite.

## Implementation Notes

Oneshot: about 40 lines in one module plus its tests. The hold rules already exist; this adds only the timer.

- `setHeld(key)` cancels any running countdown, sets `heldKey` and calls `startHoldTimer()`. `releaseHold(key)` clears the hold only when `key` holds it. Every existing `heldKey` write goes through one of the two: `bury`, `enqueue` (tick and delete only; untick keeps the hold), `merge` drop, failed add and tombstoned POST. `add()` calls `setHeld(key)`.
- `startHoldTimer()` returns early while `loadState` isn't `ready`; `runGet` calls it after setting `ready`. The timer re-checks its own key before clearing, as a second guard.
- `HOLD_MS = 3_000` is exported for tests and story 2.5.
- Tests: a new "hold timer (FR-4)" suite fakes `setTimeout` and `clearTimeout`. Mutation checks: dropping the ready gate, or the `clearTimeout` in `setHeld`, each fails two tests.
- Verification: frontend check, lint, Prettier, coverage (319 tests) and build are green; E2E is 64/64 on the rebuilt test stack.

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green

## Review Triage Log

Quick lens (2026-10-01). Counts: high 0 · medium 0 · low 4 · false 0 · maybe-false 0. Three patched, one deferred.

- low · patch: the test "never lets an older timer end a newer hold" can't reach the key guard, because `setHeld` always cancels first. Renamed "restarts the countdown when a newer add takes the hold"; the guard is documented as a second guard.
- low · patch: nothing showed that untick keeps the hold and its countdown. A test now unticks the held task and checks it still releases at 3 s.
- low · patch: only tick and remove were shown to cancel the countdown. Added a failed add; the other paths share `setHeld(null)`.
- low · defer: `load()` on a ready list doesn't pause a running countdown. Unreachable before epic 3's retry; see deferred-work.md.

