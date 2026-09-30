---
title: 'Test and dev compose profiles with the gated testing router'
type: 'feature'
ticket: '4'
created: '2026-09-30'
status: 'built'
baseline_revision: '9cedf8d52dabbf5805b24dac765800773c7458a6'
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

**Problem:** The E2E suite (entry 1.5) needs a backend it can seed with aged tasks and move forward in time, isolated from real data. Development also needs hot reload. Only the `app` profile and `db-test` exist today.

**Approach:**
- Add `routers/testing.py` (seed with `*_ago_ms`, reset, clock offset), mounted only when `settings.app_env == "test"`. Back it with an offset on one shared app `Clock`.
- Complete the compose profiles:
  - `dev`: `backend-dev` with `--reload` and bind-mounted source, and `frontend-dev` running Vite on `:5173`, which proxies `/api`.
  - `test`: `backend-test` on the `todo_e2e` database of `db-test`, and `frontend-test` on `:8082`.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-7, AD-14, AD-16, AD-20 and AD-21. The testing router is imported and mounted inside `create_app` only when `settings.app_env == "test"`. Under the default config, every `/api/test/*` path is `404 not_found`.
- **Endpoints:**
  - `POST /api/test/clock {"offset_ms": int}` sets the offset; 0 clears it.
  - `POST /api/test/tasks {"text", "added_ago_ms", "completed_ago_ms" | null}` returns `201` with the Task. Its times are the current server clock (offset included) minus each `*_ago_ms`.
  - `POST /api/test/reset` deletes every task and sets the offset to 0.
  - Seeding goes through the model and service layer, with the normal `TaskCreate` text rules, and never through raw SQL. `*_ago_ms` is ≥ 0, and `completed_ago_ms` ≤ `added_ago_ms`; otherwise the response is `422 validation_error`.
- **One clock:** the app holds one `Clock` on `app.state`. `deps.get_clock` returns it, so the offset applies to every request. Only the testing router can change the offset.
- **Compose:**
  - `dev`: `db`, `backend-dev` and `frontend-dev`. `db` is shared with `app`. `backend-dev` bind-mounts only `backend/app` and `backend/alembic`. Ports `127.0.0.1:8000` and `127.0.0.1:5173`.
  - `test`: `db-test`, `backend-test` (`APP_ENV: test`, `DATABASE_URL` → `db-test/todo_e2e`) and `frontend-test` (`127.0.0.1:8082` → 8080).
  - Every backend service sets `DATABASE_URL` and `APP_ENV` explicitly. Every `depends_on` uses `service_healthy`. No compose service points at `todo_pytest`.
  - `db-test` creates `todo_e2e` through an init script. It keeps `todo_pytest` for pytest.
- **Docs:** the README gives the commands for each profile, and how to recreate an existing `db-test` volume once so the init script runs.

**Decisions (2026-09-30, user):** The full plan is approved despite its roughly 2,000 tokens. During verification the implementer may stop `db-test` and run `docker volume rm todo_db-test-data` (pytest scratch data only) so the `todo_e2e` init script runs. No other volume may be removed.

**Never:**
- Test endpoints or the offset reachable when `app_env == "app"`.
- A `beforeunload`, frontend, or E2E harness change (entry 1.5).
- Bind-mounting the whole `backend/` or the host `node_modules`.
- `docker compose down -v`, which could remove `db-data`.
- A clock offset or seeding in pytest's rollback DB that leaks between tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Gate closed | default app (`app_env="app"`), `POST /api/test/reset`, `/tasks`, `/clock` | `404 not_found` for each | — |
| Seed aged | test app, clock at T, `added_ago_ms=90_000_000`, no completion | `201`; `added_at` = T − 25 h; `GET /api/tasks` lists it | — |
| Seed completed | `added_ago_ms=7_200_000`, `completed_ago_ms=3_600_000` | `completed_at` = T − 1 h, `added_at` = T − 2 h | — |
| Seed invalid | negative `*_ago_ms`, or `completed_ago_ms` > `added_ago_ms`, or 2001-char text | `422` | `validation_error` / `text_too_long` |
| Offset | `POST /api/test/clock {"offset_ms": 3_600_000}`, then `POST /api/tasks` | the new task's `added_at` = wall + 1 h | — |
| Offset + seed | offset 1 h, seed `added_ago_ms=0` | `added_at` = wall + 1 h | — |
| Clear offset | `offset_ms: 0` | the clock is back to wall time | — |
| Reset | tasks exist, offset set | `204`; `GET /api/tasks` returns `[]`; offset is 0 | — |
| Test stack | `COMPOSE_PROFILES=test`, seed a 25 h task on `:8082` | `GET :8082/api/tasks` shows it; the app stack on `:8081` doesn't | — |
| Dev stack | `COMPOSE_PROFILES=dev` | `:5173` serves the Vite page; `:5173/api/health` returns 200 through the proxy | — |

</frozen-after-approval>

## Code Map

- `backend/app/clock.py` -- `Clock(wall=_wall)` returns the time truncated to ms. Add an `offset_ms` attribute (default 0), applied before truncation.
- `backend/app/deps.py` -- `get_clock()` returns a new `Clock()` per request. Change it to `request.app.state.clock`. `get_task_service(session, clock)`; `current_settings(request)`.
- `backend/app/main.py` -- `create_app(settings)` sets `app.state.settings` and `engine`, includes `tasks`/`health` under `/api`, and calls `install_error_handlers`. Add `app.state.clock` and the gated import-and-mount of `routers.testing`.
- `backend/app/services/task_service.py` -- `add(text)`, `tick`, `untick`, `remove`, `_save`. Seeding needs a model-layer insert with explicit times; add a service method and a `Task` classmethod for delete-all.
- `backend/app/schemas/task.py` -- `TaskCreate` (text rules), `TaskRead`. `backend/app/exceptions.py` -- `AppError` subclasses (use `ValidationFailed` for the ordering rule).
- `backend/tests/conftest.py` -- the session `application` (app_env `"app"`) and `client`. Add a test-mode app fixture (AD-21 allows one extra `app_env="test"` session app), sharing the rollback `session_factory`.
- `docker-compose.yml` -- the `app` services, and `db-test` (`todo_pytest`, `127.0.0.1:5436`, volume `db-test-data`). The backend image's ENTRYPOINT is `./entrypoint.sh`, which runs the migration and then `uvicorn --factory` without reload. `/app/.venv` lives in the image.
- `frontend/vite.config.ts` -- `server.host: true`, and proxies `/api` to `http://${API_UPSTREAM ?? 'localhost:8000'}`.
- `README.md`, `.env.example` -- profile docs and the variable list.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/clock.py`, `deps.py`, `main.py` -- `Clock.offset_ms`; one `app.state.clock`; `get_clock(request)` reads it; import and mount `routers.testing` only when `app_env == "test"` -- AD-14 gate and one clock
- [x] `backend/app/routers/testing.py`, schemas, service/model -- the three endpoints with the body rules above; seeding through the service and model -- AD-14 contract
- [x] `backend/tests/conftest.py`, `tests/test_testing_router.py` -- a test-mode app fixture whose client resets `app.state.clock.offset_ms` to 0 after each test (the app is session-scoped); one test per backend matrix row (gate closed through offset + seed and reset) -- proves the matrix
- [x] `db-test/init/01-create-e2e.sql` (or `.sh`), `docker-compose.yml` -- the `todo_e2e` init; `backend-test`, `frontend-test`, `backend-dev`, `frontend-dev`; `db` joins `dev` -- AD-16 profiles
- [x] `README.md`, `.env.example` -- how to run the dev and test profiles, the one-time `db-test` volume recreation (`docker compose --profile test rm -sf db-test && docker volume rm todo_db-test-data`), and which ports belong to which profile -- operability

**Acceptance Criteria:**
- Given `db-test` is up, when `uv run pytest` runs, then all tests pass with coverage ≥ 70%.
- Given `COMPOSE_PROFILES=test docker compose up -d --build --wait`, then `db-test`, `backend-test` and `frontend-test` are healthy, and the matrix's test-stack row holds.
- Given `COMPOSE_PROFILES=dev docker compose up -d --wait`, then the matrix's dev-stack row holds, and editing a file in `backend/app` restarts `backend-dev`.

## Implementation Notes

- `Clock(wall, offset_ms=0)`; `create_app` sets `app.state.clock = Clock()`; `get_clock(request)` returns it. The testing router is imported inside `create_app` under `if settings.app_env == "test"`.
- Seeding: `TaskSeed(TaskCreate)` (`schemas/testing.py`) adds `added_ago_ms` (required) and `completed_ago_ms` (optional, default null), both `StrictInt` in `[0, ~100 years]`; `offset_ms` is also in `[0, ~100 years]` (never negative, so a later tick can't precede `added_at`). Both bodies use `extra="forbid"`, so a misspelt key is `422 validation_error`. `TaskService.seed` raises `ValidationFailed` when `completed_ago_ms > added_ago_ms`, reads the clock once and saves through `_save`. Reset sets `clock.offset_ms = 0` first (so a failed delete can't leave the offset set), then calls `TaskService.remove_all` → `Task.delete_all` (a SQLAlchemy `delete(Task)`).
- Choices the plan left open: `POST /api/test/clock` and `/reset` return `204` with no body. `offset_ms` and `*_ago_ms` are bounded to about 100 years, so absurd values give `422 validation_error` rather than a datetime overflow `500`.
- Tests: `testing_application` (session, `app_env="test"`) and `testing_client` in `conftest.py`; the client restores the app's original `Clock` and sets its offset to 0 after each test. `test_testing_router.py` pins wall time by swapping `app.state.clock` for a `Clock(FixedWall)`, plus one test on the real wall clock.
- `entrypoint.sh` now passes `"$@"` to uvicorn, so `backend-dev` sets `command: ["--reload", "--reload-dir", "app"]` (uvicorn has no `[standard]` extra, so it uses StatReload polling, which works on bind mounts). The two bind mounts are read-only, and `PYTHONDONTWRITEBYTECODE=1` is set.
- Deviation from AD-16 ("compose defines only the db health check"): `frontend-dev` has no Dockerfile, so its `wget` health check lives in compose (`start_period: 180s`, since `npm ci` runs on start). Without it `--wait` returns before Vite is listening.
- `db-test` health check is now `psql -h 127.0.0.1 -U todo -d todo_e2e -c 'select 1'`. `pg_isready` ignores whether the `-d` database exists, so a real query is needed: it fails on an old volume without `todo_e2e`, and running over TCP means the socket-only server Postgres runs during init never counts as healthy.
- `frontend-dev`/`frontend-test` hard-code `API_UPSTREAM`, and `backend-test` hard-codes its `DATABASE_URL`, so the root `.env` (which sets `API_UPSTREAM=backend:8000`) can't point them at the app stack.

- **Review pass 1 patches (2026-09-30):**
  - The `db-test` health check is `psql -h 127.0.0.1 -d todo_e2e -c 'select 1'`.
  - `offset_ms` must be `ge=0`.
  - `extra="forbid"` is set on `TaskSeed` and `ClockOffset`.
  - `reset` clears the offset before deleting.
  - A test was renamed.
  - The README now covers the shared dev/app `db` and the single-worker E2E rule.
- **Verification (main session):**
  - ruff is clean; pytest passes 113/113 at 99%; `todo_db-data` is untouched.
  - Test profile: all three services are healthy.
    - On `:8082`: reset returns 204; a seeded task with `added_ago_ms=90000000` has `added_at` exactly 25 h before now, and `GET` lists it.
    - `:8081/api/tasks` stays `[]`, and `:8081/api/test/reset` returns 404 `not_found` (app image rebuilt on this code).
    - A negative offset returns 422, and an unknown seed key returns 422.
  - Dev profile: services are healthy on `127.0.0.1:8000` and `:5173`.
    - `:5173` serves the Vite page (`/@vite/client`, title "Todo"), and `:5173/api/health` returns 200 through the proxy.
    - `:8000/api/test/reset` returns 404.
    - Touching `backend/app/clock.py` logs "StatReload detected changes … Reloading".
  - Afterwards the dev and test app containers were removed; the app stack and `db-test` are still running, and no root-owned files are in the tree.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-30): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 1 · low 17 · false 2 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 6 patches and 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The `db-test` health check doesn't prove `todo_e2e` exists: `pg_isready` ignores `-d` (BH, ECH) | medium | patch | pg_isready only reports whether the server accepts connections, so on an old volume `db-test` shows healthy and `backend-test` crash-loops on alembic. Patch: `psql -h 127.0.0.1 -U todo -d todo_e2e -c 'select 1'`, and correct the comment and notes. |
| 2 | Negative `offset_ms` lets a later tick stamp `completed_at` before `added_at` (BH) | low | patch | E2E only advances (AD-14 `advance(ms)` adds). Direct fix: `offset_ms` `ge=0`, plus a test. |
| 3 | Misspelled seed keys are silently ignored, e.g. `completedAgoMs` (ECH) | low | patch | The task would be seeded open with a 201. `extra="forbid"` on `TaskSeed` and `ClockOffset` gives `422 validation_error`. |
| 4 | `reset` leaves the offset set if `remove_all` fails (ECH) | low | patch | Direct: clear the offset before deleting. |
| 5 | Test name `…does_not_import_or_document…` checks only the docs half (BH) | low | patch | Rename; the import half can't be tested in the same process as the test-mode app. |
| 6 | The README doesn't say that dev and app share `db` (migrations from `backend-dev` can break an older `backend` image; both migrate at start), that the E2E stack has one clock and one reset (one worker), or that `db` belongs to two profiles (BH, ECH) | low | patch | Doc fixes. |
| 7 | Nothing automated exercises the compose profiles, the entrypoint `"$@"`, reload or the `frontend-test` wiring (VG, IA, BH) | low | defer | Pre-verified by VG with the same disposition. Entry 1.5's E2E suite runs against the test stack end to end; the main session runs and records the stack checks for this change. |
| 8 | `E2E_BASE_URL` default still `:8081` (BH, ECH, IA) | low | reject | Moving E2E to the test stack is entry 1.5's scope (tickets 1 and 5); this plan's Never list excludes E2E harness changes. |
| 9 | `frontend-dev` health check can time out on a slow `npm ci` (ECH) | low | reject | `start_period` is 180 s; a cold network beyond that is rare, and the fix is only a tuning change. |
| 10 | `frontend-dev` runs as root on the `./frontend` bind mount (BH) | low | reject | `npm ci` writes only to the anonymous `node_modules` volume and Vite caches there too; the implementer found no root-owned files on the host. |
| 11 | `npm ci` on every `frontend-dev` start (BH) | low | reject | Deliberate: keeps the musl `node_modules` in sync with the lockfile. |
| 12 | `# type: ignore` on `session.exec(delete(...))` (BH) | low | reject | Works and is covered; SQLModel steers queries to `exec`. |
| 13 | No assertion that `reset` inside the rollback DB can't leak (BH) | low | reject | Every test runs inside the rolled-back outer transaction, so nothing can escape. |
| 14 | Body-less POSTs to `/clock` and `/tasks` are untested (BH) | low | reject | The shared request-validation handler maps them to `validation_error`, already pinned for `POST /api/tasks`. |
| 15 | Offset is absolute, not incremental (IA) | low | reject | AD-14 specifies set/clear; `advance(ms)` in entry 1.5 adds to it. |
| 16 | Router tests swap in a fixed clock (IA) | low | reject | `test_offset_on_the_real_clock_shifts_wall_time` covers the clock `create_app` built. |
| 17 | Dev shares `db-data` with app (IA) | low | reject | That's AD-16's `dev` row; the intent only asks for E2E isolation. |
| 18 | `.env.example`'s `E2E_BASE_URL` comment vs value (BH) | low | reject | Same as #8. |
| 19 | `reset` doesn't declare a 422 (BH) | false | reject | It takes no body, so it can't produce one. |
| 20 | Stack rows verified only by unrecorded curls (IA) | false | reject | The implementer ran them, and the main session re-runs and records them in Implementation Notes before commit. |


## Design Notes

- **Why an offset on one shared clock:** E2E moves time with `advance(ms)` on both sides (AD-8, AD-14). A per-request `Clock()` would lose the offset between requests. The single `app.state.clock` has one writer, the testing router, and exists only in test mode, so a real run can never shift time.
- **frontend-dev without a Dockerfile:** use `node:24-alpine` with `./frontend` mounted and an anonymous volume at `/app/node_modules`. Run `npm ci` on start, then `npm run dev -- --host 0.0.0.0`. This avoids glibc host binaries (rollup, esbuild) inside the musl container.
- **Init script on an existing volume:** Postgres runs `/docker-entrypoint-initdb.d` only on an empty data dir. On machines that already have `db-test-data`, it must be recreated once (it holds only pytest scratch data). `down -v` is forbidden because it could also remove `db-data`.

## Verification

**Commands:**
- `docker compose --profile test up -d --wait db-test && cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green, coverage ≥ 70
- `COMPOSE_PROFILES=test docker compose up -d --build --wait`, then `curl -s -XPOST -H 'content-type: application/json' -d '{"text":"old","added_ago_ms":90000000,"completed_ago_ms":null}' http://127.0.0.1:8082/api/test/tasks` and `curl -s http://127.0.0.1:8082/api/tasks` -- expected: the task, with `added_at` 25 h ago; `curl -s http://127.0.0.1:8081/api/test/reset -XPOST` gives `404 not_found`
- `COMPOSE_PROFILES=dev docker compose up -d --wait && curl -s http://127.0.0.1:5173/api/health` -- expected: `{"status":"ok"}`
