# QA report: test coverage

- **Date:** 2026-10-02
- **Commit measured:** the commit that adds this report (story 3.8, on top of `a1953b8`). Story 3.8 changed no app code except the nginx template (`frontend/nginx/default.conf.template`, the clickjacking fix in [qa-security.md](qa-security.md)). It also added tests: four backend cases, two frontend test files changed (`tests/nginx-template.test.ts`, the new `tests/dockerignore.test.ts`) and two E2E tests.
- **Machine:** Intel Core i9-10885H (16 logical cores), Linux, Python 3.14.3, Node 25.9 (the engines field asks for >= 24), Google Chrome 154.0.8037.57.
- **Gate:** at least 70% meaningful coverage (deliverables, PRD NFR-7). The backend and frontend commands below enforce 70% themselves and fail under it.

## Commands

```sh
# Backend: pytest addopts already add --cov=app --cov-branch --cov-report=term-missing --cov-fail-under=70
docker compose --profile test up -d --wait db-test
cd backend && uv sync && uv run pytest

# Frontend: coverage-v8 over src/lib/** and src/components/**, thresholds 70
cd frontend && npm ci && npm run test:coverage

# E2E: count of specs and tests, then the run itself against the test profile
COMPOSE_PROFILES=test docker compose up -d --build --wait
cd e2e && npx playwright test --list
E2E_BROWSER_CHANNEL=chrome npm test
```

## Results

### Backend (pytest + pytest-cov, branch coverage)

`122 passed in 4.97s`. `Required test coverage of 70% reached. Total coverage: 99.08%`.

| Scope               | Statements | Missed | Branches | Partial branches | Cover |
| ------------------- | ---------- | ------ | -------- | ---------------- | ----- |
| `app/` (20 modules) | 388        | 2      | 48       | 2                | 99%   |

The only lines not covered are `app/errors.py:127` and `:135`, two branches of the custom OpenAPI generator. Line 127 skips a path-item key that isn't an HTTP method, and FastAPI emits none. Line 135 rewrites FastAPI's default 422 on an operation that takes more than a path id, but every such route (`POST /api/tasks`) declares its own 422. All other modules are at 100%.

### Frontend (Vitest + coverage-v8)

`Test Files 21 passed (21)`, `Tests 444 passed (444)`.

| Metric     | Covered   | Percent |
| ---------- | --------- | ------- |
| Statements | 709 / 714 | 99.29%  |
| Branches   | 362 / 375 | 96.53%  |
| Functions  | 168 / 168 | 100%    |
| Lines      | 557 / 557 | 100%    |

The run lists the uncovered branches by file and line: `TaskRow.svelte:69`, `focus.ts:49,89-91,131,137`, `sort.ts:12`, `tasks.svelte.ts:164,197,446,457` and `toasts.svelte.ts:117`.

### E2E (Playwright, Chrome)

`npx playwright test --list`: `Total: 114 tests in 13 files`. `E2E_BROWSER_CHANNEL=chrome npm test`: `114 passed (1.5m)`.

| Spec              | Tests | Spec                   | Tests |
| ----------------- | ----- | ---------------------- | ----- |
| `age-bar.spec.ts` | 9     | `journeys.spec.ts`     | 5     |
| `age.spec.ts`     | 4     | `load-failure.spec.ts` | 1     |
| `capture.spec.ts` | 16    | `rows.spec.ts`         | 19    |
| `harness.spec.ts` | 13    | `smoke.spec.ts`        | 1     |
| `headers.spec.ts` | 9     | `sync.spec.ts`         | 2     |
| `hold.spec.ts`    | 11    | `theme.spec.ts`        | 9     |
|                   |       | `theme-toggle.spec.ts` | 15    |

The QA specs in `e2e/qa/` (40 tests, `npm run qa`) are not counted here. They are measurements, reported in [qa-accessibility.md](qa-accessibility.md) and [qa-performance.md](qa-performance.md).

## Why the coverage is meaningful

The percentages are high, but percentages alone don't show much. What matters is that each behaviour NFR-7 names is asserted end to end, through the real nginx, FastAPI and Postgres of the test profile, and again at the unit level where the logic lives. Time is controlled in every layer: an injected `Clock` and the AD-14 offset on the server, `page.clock` in the browser, and `vi.useFakeTimers()` in Vitest. So the age-dependent behaviour is tested without waiting.

| NFR-7 behaviour                                          | E2E (`e2e/tests/`)                                                                                                                                             | Unit / integration                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Add                                                      | `journeys` UJ-1, `capture` (survives reload, whitespace, IME, paste newline, type-before-load race), `hold`                                                    | `test_mutations.py` (POST, validation, 2000-char limit), `tasks.svelte.test.ts` (optimistic add, confirm, rollback)   |
| Complete (tick)                                          | `journeys` UJ-2, `rows` (tick, keyboard-only), `age-bar` (tick 2-day)                                                                                          | `test_mutations.py` (tick idempotent, 404), `tasks.svelte.test.ts` (op queues)                                        |
| Untick, including an overdue task returning to its place | `journeys` UJ-2 (wrong tick, untick, back in place, still red and "2d"), `rows` (untick), `age-bar` (untick returns to index 1 with 2d and the overdue colour) | `test_ordering.py`, `sort.test.ts` (both against `contracts/ordering-cases.json`)                                     |
| Delete                                                   | `journeys` UJ-2 (clears the list), `rows` (delete, keyboard Enter), `sync` (deleted elsewhere)                                                                 | `test_mutations.py` (204, 404 as success), `tasks.svelte.test.ts` (tombstones)                                        |
| Ordering                                                 | `journeys` (order read from the DOM after every step), `rows`, `hold` (settles last open)                                                                      | `test_ordering.py` + `sort.test.ts` on the shared fixture, including a same-millisecond tie                           |
| Age colours and labels                                   | `age-bar` (bar colour, UJ-3 crossing, time zones, server ahead), `age` (live 5h → 6h, not announced, `done 100d`), `theme` (dark age colour)                   | `age.test.ts`, `oklch.test.ts`, `TaskRow.test.ts`                                                                     |
| Empty state                                              | `capture` (empty state), `smoke`, `journeys` UJ-2 (ends empty)                                                                                                 | `App.test.ts`, `tasks.svelte.test.ts`                                                                                 |
| Error handling                                           | `capture` (add fails, fail after typing on), `rows` (tick, untick and delete rollback), `load-failure`, `journeys` CAP-9, `harness` (`failApi`)                | `test_errors.py`, `test_exceptions.py`, `api.test.ts` (status → code mapping, 413, timeouts), `toasts.svelte.test.ts` |
| UJ-3 (a task goes overdue with the tab open)             | `journeys` UJ-3, `age-bar` UJ-3                                                                                                                                | `clock.test.ts`, `age.test.ts`                                                                                        |
| Testable time                                            | `harness` (`advance` moves both clocks, reset clears the offset)                                                                                               | `test_clock.py`, `test_testing_router.py` (offset, gate)                                                              |

Story 3.8 adds two security regressions to the E2E suite: `rows.spec.ts` › "markup in task text renders as literal text and never runs" and `headers.spec.ts` › "another site cannot frame the app or /api/docs". `test_mutations.py` gains four cross-site-request cases (a JSON body as `text/plain`, form-encoded, multipart, or with no content type), `frontend/tests/nginx-template.test.ts` gains a test of the server-level headers, and the new `frontend/tests/dockerignore.test.ts` checks that no `.env` reaches an image build.

## What is deliberately excluded, and why

- **`frontend/src/App.svelte` and `frontend/src/main.ts`** are outside the coverage `include` (`vite.config.ts`: `src/lib/**`, `src/components/**`). `App.svelte` is the composition root and `main.ts` mounts it. Both are exercised by every E2E test, and `App.test.ts` still runs in Vitest for its own assertions. Counting them would mostly measure jsdom, which has no layout, no `matchMedia` and no CSP.
- **`frontend/vite-plugins/`, `frontend/tests/` and `frontend/public/theme-init.js`** are build-time or static-file code. `tests/preload-fonts.test.ts`, `tests/theme-init.test.ts` and `tests/nginx-template.test.ts` test them directly, and the E2E `theme` and `headers` specs check them in the browser.
- **`backend/tests/`, `backend/alembic/`** are excluded from `--cov=app`. The migration is exercised by `test_migrations.py` (one head, `upgrade head` on an empty DB, `alembic check` with no drift), not counted as app code.
- **The test-only router** (`routers/testing.py`, `services/testing_task_service.py`) _is_ counted, at 100%. It is only mounted when `APP_ENV=test`, and `test_testing_router.py` covers both the mounted behaviour and its absence under the default config.
- **Infrastructure** (compose profiles, the nginx re-resolve after a backend recreate, the dev profile) is not reachable from any suite. `scripts/check-infra.sh` checks it by hand (README › Infra smoke checks).
