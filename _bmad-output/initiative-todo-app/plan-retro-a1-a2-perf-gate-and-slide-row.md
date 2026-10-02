---
title: 'Retro A1 + A2: perf gate on same-run data, cheaper slideRow'
type: 'bugfix'
ticket: ''
created: '2026-10-02'
status: 'built'
baseline_revision: 'c6c48723a0a6af13cdad6aa8833b5654000bd372'
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

**Problem:** The epic 3 retrospective (`epic-everywhere-and-handed-in/epic-everywhere-and-handed-in-retrospective.md`) found two problems.

- **F11, the gate:** the NFR-2 feedback gate in `e2e/qa/perf.spec.ts` reads the committed `docs/qa-artifacts/perf-results*.json` from disk in a separate test. Run alone, or after the measurement test was filtered out, it passes on stale numbers.
- **F24, serial mode:** because the tests run in serial mode, an API or render failure hides a feedback failure in the same run.
- **F13, `slideRow`:** `slideRow` calls `matchMedia` for every moved row (about 500 per add) before its cheap viewport test, inside the measured feedback span.

**Approach:**

- **A1:** move the feedback asserts into the measurement test, so they check the in-memory results of this run. Make the API, render and feedback asserts all `expect.soft`, so one run reports every NFR-2 miss. Remove the separate gate test and the serial-mode config.
- **A2:** in `slideRow`, check the viewport before reduced motion, so off-screen rows never touch `matchMedia`. A unit test pins that. Caching a `MediaQueryList` is left out: the option the user chose didn't include it, and after the reorder only the ~20 on-screen rows query it.
- **Re-measure:** rebuild the test stack, run `npm run qa`, and refresh `docs/qa-performance.md` from that run, including the test count. Each motion setting now has one perf test, so the count drops from 40 to 38.
- **Docs:** add an ai-log section. Behaviour and the NFR-2 targets are unchanged.

</frozen-after-approval>

## Implementation Notes

The oneshot route was chosen because the change is about 90 lines: two small code edits plus one regenerated report. Both items were bundled in one plan because the user chose "two quick code fixes as one small story" (2026-10-02).

- **A2, red then green:** I added `motion.test.ts` › "never queries the motion setting for a row that stays off-screen". It failed against the old order, then passed (13 of 13) once `slideRow` tested the viewport first.
- **A1:** in `e2e/qa/perf.spec.ts`, the API, render and feedback asserts are now all `expect.soft` at the end of the measurement test, on this run's samples (`paintMs` p95, the same figure `traceToPaint` reports). I removed:
  - the separate "NFR-2 feedback under 100 ms" test, which read the JSON from disk;
  - the `serial` describe config;
  - the `readFileSync` import.

  I also updated the header comment.

## Verification

**Commands:**
- `cd frontend && npx vitest run src/lib/motion.test.ts && npm run check && npm run lint && npm run test:coverage && npm run build && npm run docs:format:check` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && npm run format:check && E2E_BROWSER_CHANNEL=chrome npm test && E2E_BROWSER_CHANNEL=chrome npm run qa` -- expected: all green; qa 38 passed

## Review Triage Log

### Quick review (2026-10-02)

The code changes meet the plan (A1, A2), and every figure in `qa-performance.md` matches the JSON. The 4 findings are all in the docs:

- **low, patched.** The Gate paragraph and the checklist's "Thin NFR-2 margins" quoted Enter's default-motion p95 (79.0 ms) as the feedback margin. The gate also asserts reduced motion, where Enter's p95 is 87.4 ms (max 98.5 ms), about 13 ms of margin. Both now name that figure.
- **low, patched.** The checklist's "Checks run" heading said "all on `7ae9b39`", but the perf row now reports a later run. The heading now reads "except where a row says otherwise", and the row names `c6c4872`.
- **low, patched.** The frontend count of 456 in `qa-coverage.md` and the checklist is the 3.9 snapshot on `7ae9b39` and stays accurate there. The ai-log claim of "refreshed stale figures" overstated what changed; it is reworded and notes this run's 457.
- **low, patched.** Issue 2 said the render margin was "about 10 ms"; it is 9.3 ms, now "about 9 ms", matching the Gate paragraph.
