---
title: 'Refactor sweep'
type: 'refactor'
ticket: '11'
created: '2026-10-01'
status: 'built'
baseline_revision: 'c102aa383cfcef745072bb493ee1743718e6a45a'
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

**Problem:** The epic's builds left a few deferred findings (deferred-work.md) that the user chose for this sweep:
- an unverified nginx stale-IP risk;
- the `%` caveat in the Alembic URL;
- the AD-8/AD-18 lint bans, which no test pins;
- no pass-through test for `failApi`;
- a missing arrow in the spine diagram.

**Approach:**
- Settle the nginx risk by experiment, and fix it if it is real.
- Pin the Alembic `%` contract, the lint bans and `failApi` pass-through with tests.
- Correct the spine diagram.
- Confirm the epic's Done-when checks still pass.

## Boundaries & Constraints

**Always:**
- **nginx:**
  - **Reproduce on the test stack:** keep `frontend-test` running, and stop `backend-test`. Start a throwaway container on `todo_default` so it takes the old IP, then `docker compose up -d --no-deps backend-test`. Curl `:8082/api/health`.
  - **If it returns 502:** add `resolver 127.0.0.11 valid=10s ipv6=off;` and proxy through a variable (`set $api http://${API_UPSTREAM}; proxy_pass $api;`). The variable has no URI part, so the request path passes through unchanged. Re-run the repro, which must then return 200, and remove the throwaway container.
  - **If it doesn't return 502:** record the evidence and change nothing.
  - Either way, the headers spec and the CSP checks still pass.
- **Alembic:**
  - A test proves that a caller-set `sqlalchemy.url` whose password contains `%` reaches the engine correctly when the caller escapes it as `%%` (configparser's contract).
  - `env.py`'s docstring states that contract.
  - The settings path, which never goes through configparser, is tested with a raw `%`.
- **Lint test:** `frontend/tests/lint-rules.test.ts` (node environment) runs ESLint's Node API (`lintText` with a `filePath`). It shows:
  - `Date.now()`, `new Date()` and `Date()` are errors in `src/x.ts` and in `src/X.svelte`, and allowed in `src/lib/clock.svelte.ts`;
  - `.focus()` is an error in `src/x.ts` and allowed in `src/lib/focus.ts`;
  - all of these are allowed in a `*.test.ts` file.

  Add the file to the Vitest `include` and to the tsconfig that covers it, so `npm run check` stays clean.
- **`failApi` pass-through:** a harness test fails `POST /api/tasks` while a seeded list loads through `GET`. The list renders, so the non-matching request passed through.
- **Spine:** the backend diagram gains `R --> SV` and `R --> M`, labelled as type-only, matching `routers/tasks.py`'s imports.
- **deferred-work.md:** for each item this sweep resolves, append a short "resolved by entry 11" entry naming it. Never edit existing entries.
- **Coverage:** all suites stay at or above 70% coverage.

**Decisions (2026-10-01, user):**
- Sweep scope: the nginx stale IP, the small test and code gaps, and the spine doc fix. Tooling hygiene stays deferred.
- The plan is approved at about 1,750 tokens.

**Never:**
- Font preload, toast offset, the e2e Prettier config or the `.vitest` ignore. These stay deferred, by the user's choice.
- Behaviour changes in the app, the store or the UI.
- `docker compose down -v`, or touching `db-data`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Stale IP | backend-test recreated with a new IP, frontend-test kept | before the fix: the observed result is recorded; after any fix: `/api/health` 200 | — |
| Alembic `%%` | `set_main_option('sqlalchemy.url', '…p%%w…')` | the engine URL password is `p%w` | — |
| Settings `%` | `database_url` with a raw `%` | used as is | — |
| Lint bans | snippets in the listed paths | errors and passes exactly as listed | — |
| failApi pass-through | POST failed; seeded GET | the list renders the seeded row | — |

</frozen-after-approval>

## Code Map

- `frontend/nginx/default.conf.template` -- `location /api/ { proxy_pass http://${API_UPSTREAM}; … }`, rendered by `envsubst` in the nginx image (only `${…}` with a defined env var is substituted). nginx's `$api` must not clash with envsubst; nginx-unprivileged's template step substitutes only defined env vars, so `$api` survives.
- `docker-compose.yml` -- `frontend-test` sets `API_UPSTREAM: backend-test:8000`; the network is `todo_default`.
- `backend/alembic/env.py:19-20` -- `config.get_main_option("sqlalchemy.url") or get_settings().database_url`. `backend/tests/test_migrations.py` already drives Alembic with a `Config` and a passed connection. Reuse its fixtures.
- `frontend/eslint.config.js` -- the AD-8 `no-restricted-properties` / `no-restricted-syntax` rules plus the AD-18 `.focus()` selector, with overrides for `src/lib/clock.svelte.ts`, `src/lib/focus.ts` and `**/*.test.ts`. `vite.config.ts` uses `test.include: ['src/**/*.test.ts']`. `tsconfig.node.json` covers the root configs.
- `e2e/fixtures.ts` -- `failApi(page, {method, path})`, `seed`. `e2e/tests/harness.spec.ts` has the `failApi` test.
- `_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md` -- the mermaid `BE` subgraph, around line 44.
- `docs/ai-log.md` -- append `## Ticket 11`.

## Tasks & Acceptance

**Execution:**
- [x] nginx repro, then the fix and re-run if needed -- `frontend/nginx/default.conf.template`; record the commands and results in Implementation Notes
- [x] `backend/tests/test_migrations.py` (or a new test file), `backend/alembic/env.py` docstring -- the `%` contract
- [x] `frontend/tests/lint-rules.test.ts`, `vite.config.ts`, the matching tsconfig -- pins the lint bans
- [x] `e2e/tests/harness.spec.ts` -- `failApi` pass-through
- [x] the architecture spine diagram -- the arrows
- [x] `_bmad-output/initiative-todo-app/deferred-work.md` (append only), `docs/ai-log.md` -- records

**Acceptance Criteria:**
- Given `db-test` is up, when `uv run ruff check . && uv run ruff format --check . && uv run pytest` runs, then it is green with coverage ≥ 70%.
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then all pass.
- Given the app profile is rebuilt with `docker compose up -d --build --wait`, then all three services are healthy and `:8081` serves the app (the epic's Done-when check 1).

## Implementation Notes

**nginx repro (2026-10-01), before the fix:**
- `backend-test` was at 172.27.0.6. `COMPOSE_PROFILES=test docker compose stop backend-test`, then `docker run -d --rm --name stale-ip-squatter --network todo_default alpine:3 sleep 600` took 172.27.0.6, then `COMPOSE_PROFILES=test docker compose up -d --no-deps --wait backend-test` came up at 172.27.0.8.
- `curl :8082/api/health` three times: `502 Bad Gateway` each time. The `frontend-test` log: `connect() failed (111: Connection refused) while connecting to upstream ... upstream: "http://172.27.0.6:8000/api/health"`. The risk is real.

**Fix and re-run:** `resolver 127.0.0.11 valid=10s ipv6=off;` plus `set $api http://${API_UPSTREAM}; proxy_pass $api;`. The rendered config in the container reads `set $api http://backend-test:8000;`, so envsubst left `$api` alone. Rebuilt only `frontend-test` (`up -d --build --no-deps --wait`). Repeated the repro: `backend-test` at 172.27.0.8, stopped, `stale-ip-squatter-2` took 172.27.0.8, `backend-test` came back at 172.27.0.9. `/api/health` gave 200 three times, `/api/tasks` 200, `/api/docs` 200, `PUT /api/tasks/not-a-uuid/tick?x=1%202` 404 `task_not_found`, `/api/nope` 404 `not_found`. `/api/health` keeps `X-Content-Type-Options` and `Referrer-Policy`, and `/` keeps the CSP too. Both squatters removed.

**Alembic:** `percent_password_url` (conftest) creates a scratch role with password `p%w` and a `*_pytest` database it owns, and drops both afterwards. `db-test` enforces scram on the forwarded port (a wrong password is refused), so a successful migration proves the password reached the engine intact. The settings-path test lives in `test_config.py`, the one module that patches the environment.

**Lint test:** `src/X.svelte` and `src/lib/store.svelte.ts` are not on disk, so the test's ESLint instance sets `projectService: false` for those paths only. Only ban-rule errors count, and a parse error or a "File ignored" warning fails the test. Setting the `Date.now` rule to `warn` failed two tests, as it should.

**Spine:** also updated AD-16's `proxy_pass` sentence to describe the resolver, and `updated:` to 2026-10-01.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 14 · false 1 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 9 patches and 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The `env.py` docstring says a raw `%` is used as given, but `make_url` percent-decodes `%XX` (`p%41w` → `pAw`) (BH, ECH ×2) | medium | patch | It now says passwords are URL-encoded (`%25`) on both paths, plus `%%` for `set_main_option`; the `%25` case is tested. |
| 2 | The lint test misses cross-bans (Date in `focus.ts`, `.focus()` in `clock.svelte.ts`), `.svelte` `.focus()`, other `.svelte.ts` files and rule ids, and an ignored file passes vacuously (BH, VG, ECH ×3) | medium | patch | 23 cases with rule ids; "File ignored" and fatal messages fail the test. |
| 3 | The spine's "type-only" arrows mislabel runtime imports (BH) | low | patch | Reworded "annotation-only", with the runtime-import note. |
| 4 | The nginx side effects are undocumented: Docker DNS only, and it starts healthy with an unresolvable backend (BH, ECH ×2) | low | patch | Template comment and AD-16 updated; backend-down behaviour checked by the main session (page 200, `/api` 502, then 200 after recovery with no nginx restart). |
| 5 | No regression guard for the nginx fix (BH, VG) | low | patch + defer | A static template test asserts the resolver and a variable `proxy_pass`; the full recreate repro is deferred (needs orchestration). |
| 6 | The scratch role leaks if `CREATE DATABASE` fails; the password is in an SQL literal (ECH, BH) | low | patch | Everything is dropped in `finally`; a no-quote assert on the constant. |
| 7 | Helpers are imported from `tests.conftest` (BH) | low | patch | Moved to `tests/helpers.py`. |
| 8 | The settings-path test doesn't prove the settings path ran (BH) | low | patch | Asserts an empty main option and `cache_info().misses == 1`. |
| 9 | The `failApi` test has no method filter in its predicate, and the path half of the guard is unexercised (BH, IA) | low | patch | `tasksGet` filters on GET; a same-method, other-path case was added. |
| 10 | The fixture URL breaks with no port or a socket host (ECH) | low | reject | `TEST_DATABASE_URL` is fixed with host and port in `.env.example`. |
| 11 | `frontend/tests/` vs co-located tests is undocumented (BH) | low | reject | The new tests target config files, not source; the Vitest include names both locations. |
| 12 | Done-when checks 2–5 not re-run (IA) | low | reject | Covered: E2E (checks 2 and 6), the 1.10 down/up check (3), the main-session backend-down check here (4), and the test profile running every E2E plus the dev profile from 1.4 (5). |
| 13 | The `%` contract is tested through made-up callers (IA) | low | reject | No real caller exists; the tests pin `env.py` end to end. |
| 14 | The lint pin runs only with `npm test`, with no CI (IA) | low | reject | Pre-existing; no CI is in scope. |
| 15 | The spine gained a second arrow and an AD-16 edit beyond the request (IA) | low | reject | Needed so the spine matches the code and the new nginx config. |
| 16 | The review diff omits deferred-work.md (BH) | false | reject | Excluded by design; it is committed with this change. |
| 17 | Ticket 11 ai-log review | low | patch | Added. |

## Verification

**Commands:**
- `docker compose --profile test up -d --wait db-test && cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: green
