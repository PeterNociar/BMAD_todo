---
title: 'QA reports'
type: 'chore'
ticket: '8'
created: '2026-10-02'
status: 'built'
baseline_revision: 'a1953b822a08593ca2116832c14065afe2d34960'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
  - '{project-root}/_bmad-output/initiative-todo-app/spec-todo-app/deliverables.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `deliverables.md` requires four QA reports in `docs/` against the finished app, and none exist yet:
- coverage (≥ 70%, meaningful);
- accessibility (zero critical violations);
- a security review with findings and fixes;
- a Chrome DevTools performance check.

These reports audit the whole app, so they run last.

**Approach:**
- **Measuring:** two new scripted Playwright specs do the measuring, and the reports record their output:
  - an accessibility sweep over every UI state;
  - a performance check through the Chrome DevTools Protocol on the test profile's production build, seeded with 500 tasks through AD-14 (user decision 2026-10-02: Playwright + CDP, no Lighthouse).
- **Coverage:** gathered from the three suites' own commands.
- **Security:** reviewed by reading the code and probing the running test stack. Findings are fixed in this story or recorded with a reason.

## Boundaries & Constraints

**Always:**
- **The four reports:** `docs/qa-coverage.md`, `docs/qa-accessibility.md`, `docs/qa-security.md` and `docs/qa-performance.md`. Each starts with the date, the commit it measured, and the exact commands that produced it, so it can be reproduced. Numbers are copied from real output, never estimated.
- **Coverage report:**
  - Backend: `pytest` with `--cov=app --cov-branch`.
  - Frontend: `npm run test:coverage`. Report statements, branches, functions and lines.
  - E2E: the spec and test count from `npx playwright test --list`.
  - Explain why the coverage is meaningful: map each NFR-7 behaviour to the specs that cover it, and list what is deliberately excluded and why.
- **Accessibility sweep (`e2e/qa/a11y.spec.ts`):**
  - **States** (the ones EXPERIENCE › State Patterns names):
    - empty;
    - loading skeleton;
    - a populated list with open, completed, overdue and long-text rows;
    - the held row;
    - an action-error toast;
    - an add-failure toast;
    - the load-failure toast;
    - Retry loading;
    - keyboard focus on a row control.
  - **Grid:** each state in light and dark, at 320 and 1280 px. Run `AxeBuilder` with the WCAG 2 A/AA and 2.1 A/AA tags and record every violation by impact, not only the critical ones.
  - **Pass condition:** zero critical violations.
  - **Report contents:** the grid, the per-impact counts, and each non-critical finding with its disposition. It also covers what axe can't check:
    - the forced-colors E2E from 3.6;
    - `prefers-reduced-motion`;
    - the keyboard-only journey from 3.7.
  - **Type-to-focus:** the report argues whether type-to-focus meets WCAG 2.1.4 (Character Key Shortcuts). It only acts when no control has focus, so it is not a shortcut that triggers an action. It cites the rule's text and `lib/focus.ts`.
- **Security report:** findings, each with its severity, evidence (file:line, or a curl against `:8082`), and status (fixed in this story, or accepted with a reason). It covers:
  - XSS: task text rendered as text (AD-13), with no `{@html}` or `innerHTML`;
  - injection: SQLModel parameterisation, and the text validation (AD-12);
  - the CSP and headers (AD-16, AD-19, 3.6's cache headers);
  - the gated test router (AD-14): it is absent from the app profile, so `:8081/api/test/*` returns 404;
  - secrets: `.env` is gitignored, `.env.example` has no real secrets, and nothing is baked into the images;
  - containers run as non-root;
  - the bind address (AD-16);
  - CORS and request-size limits;
  - dependency audit: `npm audit` for `frontend` and `e2e`, and a Python audit (`pip-audit` through `uvx` if it runs offline-safe, otherwise recorded as not run).
- **Performance check (`e2e/qa/perf.spec.ts`):**
  - **Setup:** reset, then seed 500 tasks through the fixture's `seed` (AD-14), with mixed ages and about 20% completed.
  - **Measurements:**
    - **API:** `GET /api/tasks` with 500 tasks, and the `POST`/`PUT`/`DELETE` timings from `Resource Timing` and `request.timing()` (p50/p95 over ≥ 20 samples).
    - **Initial render:** first load to 500 rows in the DOM, using `performance.mark` from the `GET` response to the rows rendered (`MutationObserver` plus `requestAnimationFrame`).
    - **Feedback:** keypress Enter to the held row visible, a tick click to the row's state change, and a delete to the row gone, each with 500 rows (p50/p95 over ≥ 10).
    - **CDP:** a `Performance.getMetrics` snapshot (`JSHeapUsedSize`, `LayoutCount`, `RecalcStyleCount`, `ScriptDuration`), and a `Tracing` capture of one tick saved under `docs/qa-artifacts/` (gitignored, path noted in the report).
  - **Fake clock:** the fixture clock is installed. Measure with `performance.now()` deltas inside the page only where the fake clock doesn't affect them, or else take timestamps from CDP. The report states which one each figure uses.
  - **Report contents:** each NFR-2 target with its measured p50/p95 and pass/fail, the machine (CPU, Chrome version), and any issues found.
- **Separate config:** both QA specs run from `e2e/playwright.qa.config.ts` (same base URL, Chrome channel and one worker, `testDir: './qa'`), so `npm test` stays unchanged. `e2e/package.json` gains `qa` (`playwright test -c playwright.qa.config.ts`).
- **Fixes:** a security or accessibility finding fixed here gets a regression test in the existing suites. All suites stay green.
- **Docs:** `docs:format:check` passes. `README.md` gets a short "QA reports" section linking the four files and `npm run qa`.

**Never:**
- Lighthouse or new heavy dependencies (`@axe-core/playwright` is already there).
- Running the QA specs against the app profile on `:8081`, except the security report's 404 probes and header probes.
- Lowering a target or a gate to make a report pass. A miss is reported as a miss, with its cause.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| A11y grid | 9 states × 2 themes × 2 widths | zero critical; every other violation listed with a disposition | a critical violation is fixed, or the story halts |
| 500 tasks | seeded through AD-14 | `GET` p95 < 300 ms; 500 rows rendered < 200 ms | a miss is reported with its cause |
| Feedback with 500 | Enter, tick, delete | each p95 < 100 ms | as above |
| Test router on app | `POST :8081/api/test/reset` | 404 | — |
| XSS probe | task text `<img src=x onerror=alert(1)>` | rendered as literal text; no CSP violation | — |
| Oversize body | a POST over the 64 KB nginx limit | 413 | — |
| Audit | `npm audit --omit=dev` | findings listed with their disposition | — |

</frozen-after-approval>

## Code Map

- `_bmad-output/initiative-todo-app/spec-todo-app/deliverables.md` -- the QA reports list. PRD NFR-2, NFR-5 and NFR-7 (`prd-todo-app.md:262-267`) give the targets and the coverage behaviours.
- `backend/pyproject.toml:35-37` -- pytest `addopts` already runs `--cov=app --cov-branch --cov-fail-under=70`. README › "Backend tests and lint" has the exact command and database setup.
- `frontend/package.json` -- `test:coverage`. `vite.config.ts` defines the coverage `include` (`src/lib/**`, `src/components/**`), which explains the exclusions (`App.svelte` and `main.ts` are covered by E2E).
- `e2e/playwright.config.ts` -- the base URL, `channel` from `E2E_BROWSER_CHANNEL`, one worker, `testDir: './tests'`. Copy it into `playwright.qa.config.ts`.
- `e2e/fixtures.ts` -- `test`, `seed`, `failApi`, `expectNoA11yViolations`, `AXE_TAGS`, `stillHeld`, `nextPoll`, `preparePage`. The sweep needs every violation, not only critical ones, so it uses `AxeBuilder` directly with the same tags.
- `e2e/tests/journeys.spec.ts`, `capture.spec.ts`, `rows.spec.ts`, `load-failure.spec.ts`, `theme-toggle.spec.ts` -- how to reach each state (`failApi` for toasts, a delayed route for the skeleton, `colorScheme` for dark).
- `frontend/src/lib/focus.ts` -- `installTypeToFocus`, the code the 2.1.4 argument cites.
- `frontend/nginx/default.conf.template` -- the headers, the CSP, `client_max_body_size 64k`, and the cache headers.
- `backend/app/` -- routers, the testing router gate (AD-14), and the request schema (AD-12). Grep `frontend/src` for `{@html` and `innerHTML`.
- `docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile` -- the non-root users, `APP_BIND` and the published ports.
- `.gitignore` -- add `docs/qa-artifacts/`.
- `docs/ai-log.md` -- append `## Ticket 3.8 — QA reports`.

## Tasks & Acceptance

**Execution:**
- [ ] `e2e/playwright.qa.config.ts`, `e2e/package.json` -- the QA runner
- [ ] `e2e/qa/a11y.spec.ts` -- the state × theme × width axe sweep -- accessibility evidence
- [ ] `e2e/qa/perf.spec.ts` -- the 500-task CDP check -- performance evidence
- [ ] `docs/qa-coverage.md` -- from the three suites' real output
- [ ] `docs/qa-accessibility.md` -- from the sweep, plus the 2.1.4 argument
- [ ] `docs/qa-security.md` -- the review, probes and audits; fixes with regression tests where needed
- [ ] `docs/qa-performance.md` -- from the perf spec
- [ ] `README.md`, `.gitignore`, `docs/ai-log.md` -- the QA section, the artifacts ignore, Ticket 3.8

**Acceptance Criteria:**
- Given the rebuilt test stack, when `npm run qa` runs in `e2e/`, then the a11y sweep passes with zero critical violations and the perf spec completes, writing the numbers its report quotes.
- Given all suites (backend pytest, frontend `test:coverage`, e2e `npm test`), when run after any fixes, then they pass with coverage ≥ 70%.
- Given `docs/`, when `npm run docs:format:check` runs in `frontend/`, then it passes, and each report names its commit and commands.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 4 · low 22 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 17 patches, 4 deferrals. The perf and a11y figures are re-measured after the patches.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The 30 s background poll can land inside an API sample or a feedback/render span (ECH) | medium | patch | API probes are tagged; spans that overlap a poll GET are dropped and counted; perf re-run. |
| 2 | The QA run can't fail on any perf regression; the NFR-2 miss is silent (BH, IA) | medium | patch | Today's passing targets are asserted; the known miss is an expected failure. |
| 3 | The longest-task window has no end bound (BH) | medium | patch | Bounded at the span's paint. |
| 4 | The a11y summary folds stale cells from earlier or partial runs (BH, ECH, VG) | medium | patch | The cell folder is cleared in `beforeAll`. |
| 5 | A negative `responseEnd`, a dangling `requestfinished` wait, and Paint B/E without `dur` (ECH) | low | patch | Guards that throw. |
| 6 | No open task has long text (BH) | low | patch | Data rule fixed. |
| 7 | The `holdGets` route is left pending on an early failure (BH, ECH) | low | patch | Released in `finally`. |
| 8 | Toast contrast can check zero elements, and the × glyph is never checked (BH, ECH) | low | patch | At least one element is asserted per toast state; the × is checked at 3:1 (SC 1.4.11). |
| 9 | The no-Content-Type, form and multipart CSRF claims are unpinned (BH) | low | patch | Backend cases added. |
| 10 | `backend/.dockerignore` lacks `**/.env.*` (ECH) | low | patch | Added and asserted. |
| 11 | p95 equals the max at n=10/15; the render span includes body download and parse; the Setup order is wrong (BH) | low | patch | Stated or raised; the report is corrected. |
| 12 | S-3's acceptance assumes Chrome's Local Network Access (BH) | low | patch | The Firefox/Safari limit is stated. |
| 13 | S-2's test checks the file's wording only (VG) | low | patch | Noted in the report. |
| 14 | The reports name an uncommitted build; the `:8081` probes hit the pre-3.8 build (IA) | low | patch | Reworded to "the commit adding this report", and the pre-3.8 probes are noted. |
| 15 | The evidence behind the reports is gitignored (IA) | low | patch | Only the traces stay ignored; the summary JSONs are committed. |
| 16 | The NFR-2 miss itself (`animate:flip` at 500 rows) | medium | defer | Out of this story's intent (reports, not perf fixes); deferred-work entry added; needs its own story. |
| 17 | Follow-ups untracked: the S-3 Host allowlist, S-4 pin or SRI, a base-image CVE scan (BH) | low | defer | Deferred-work entry added. |
| 18 | The dockerignore test isn't behavioural (VG) | low | defer | A real check needs a docker build in a suite; deferred-work entry added. |
| 19 | The QA a11y sweep enforces only critical violations (VG, IA) | low | reject | That is the deliverable's gate; other impacts are recorded, and today there are zero. |
| 20 | Not every combination is swept: stored theme, hover ×, toggle states, 360 px (IA) | low | reject | `theme-toggle.spec.ts` runs axe in both stored themes at 320 and 1280 px; 320 is stricter than 360. |
| 21 | DevTools MCP or the panel weren't used (IA) | false | reject | User decision 2026-10-02: Playwright + CDP. |
| 22 | Measurement under a faked clock (IA) | false | reject | The figures come from the CDP trace clock, as the report documents. |
| 23 | "Meaningful" coverage is argued, not measured (IA) | false | reject | That is what "meaningful" requires: the NFR-7 behaviour-to-test map. |

## Verification

**Commands:**
- `cd backend && <README pytest command>` -- expected: green, coverage ≥ 70%
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build && npm run docs:format:check` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && npm run format:check && E2E_BROWSER_CHANNEL=chrome npm test && E2E_BROWSER_CHANNEL=chrome npm run qa` -- expected: all green
