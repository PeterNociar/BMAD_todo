---
title: 'Task model, ordering and the shared ordering fixtures'
type: 'feature'
ticket: '2'
created: '2026-09-30'
status: 'built'
baseline_revision: '518dd2f83422701d443ae0cae52df450e127287f'
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

**Problem:** `GET /api/tasks` returns rows in no defined order, with whatever timestamp format Pydantic picks, and nothing guards the Alembic migrations. Every later story relies on the FR-6 order (AD-6), the fixed-width `.sssZ` timestamps and one server clock (AD-7), and migrations that can't drift (AD-15).

**Approach:** Add the injectable ms-truncated `Clock` and a `TaskRead` schema that always serializes `YYYY-MM-DDTHH:MM:SS.sssZ`. Make `Task.list_ordered()` the one canonical FR-6 query behind `GET /api/tasks`. Pin it with shared `contracts/ordering-cases.json` fixtures, which the frontend will reuse in entry 1.6. Add the AD-15 migration guard test on a scratch database.

## Boundaries & Constraints

**Always:**
- AD-6, AD-7, AD-15, AD-20 and AD-21.
- **Order:** open tasks by `added_at` ascending, then completed tasks by `completed_at` descending, ties by `id` ascending. It is done in SQL by `Task.list_ordered()`, and nothing else sorts.
- **Clock:** `clock.py` returns `datetime.now(UTC)` truncated to milliseconds. It is injected through `deps.get_clock()` into `TaskService(session, clock)`, and it is the only producer of stored times.
- **Wire format:** every timestamp on the wire is exactly `YYYY-MM-DDTHH:MM:SS.sssZ` in UTC. `null` stays `null`.
- **Fixtures:** `contracts/ordering-cases.json` sits at the repo root and holds input tasks plus the expected id order. It includes a same-millisecond tie and uses lowercase canonical UUIDs, so string order equals UUID order.
- **Migration guard test** checks three things on a scratch database whose name ends in `_pytest`: there is exactly one head, `upgrade head` succeeds on the empty DB, and `alembic check` reports no drift. It reaches Alembic through `config.attributes["connection"]`, and it drops the scratch DB afterwards.
- Existing tests, the `_pytest` guard and the rollback fixture keep working.

**Decisions (2026-09-30):** Only `TaskRead` is added here; `TaskCreate` lands in entry 1.3 with its AD-12 validation (user). The full plan is kept despite about 1,850 tokens, because it is one ticket and one goal (user).

**Never:**
- POST, PUT or DELETE, `TaskCreate`, or AD-12 validation (entry 1.3).
- The clock offset or the testing router (entry 1.4).
- A frontend `sort.ts` (entry 1.6).
- Sorting in Python.
- DB defaults or `now()` for timestamps.
- Environment reads outside `app/config.py` and `tests/settings.py`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Canonical order | each case in `ordering-cases.json`, seeded | `GET /api/tasks` ids equal the case's expected order | — |
| Same-ms tie | two open tasks with the same `added_at` | the lower `id` comes first | — |
| Completed tie | two completed tasks with the same `completed_at` | the lower `id` comes first | — |
| Timestamp shape | any returned task | `added_at`, and `completed_at` when set, match `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` | — |
| Whole second | stored `…:05.000+00` | serialized `…:05.000Z` (never `…:05Z`) | — |
| Non-UTC input | aware datetime in `+02:00` | serialized as the same instant in `Z` | — |
| Clock truncation | fixed wall time `…12.345678` | `Clock()` returns `…12.345000`, tz UTC | — |
| Migrations | fresh scratch `*_pytest` DB | one head; upgrade succeeds; `alembic check` clean; passed connection still usable | test fails with the Alembic error |

</frozen-after-approval>

## Code Map

- `backend/app/models/task.py` -- `Task` table model (UUID pk, `text` TEXT, `added_at`/`completed_at` `timestamptz`, no defaults) and `list_all(session)` (unordered). Replace `list_all` with `list_ordered`.
- `backend/app/services/task_service.py` -- `TaskService(session)` with `list()` → `Task.list_all`. Gains `clock` in its constructor.
- `backend/app/routers/tasks.py` -- `GET ""` with `response_model=list[Task]`. It becomes `list[TaskRead]`.
- `backend/app/deps.py` -- `current_settings`, `get_task_service(session)`. Add `get_clock()`, and pass the clock into `TaskService`.
- `backend/app/db.py` -- `make_engine` already sets `TimeZone=UTC` (AD-7 session rule, keep).
- `backend/alembic/env.py` -- AD-21 order: `config.attributes["connection"]` is used as is and never closed; online mode otherwise builds its own engine. The one migration is `alembic/versions/2026_09_30_1200-3f1c2a9b7d10_create_tasks_table.py`.
- `backend/tests/conftest.py` -- `TEST_DATABASE_URL` from `TestSettings`, `database_engine` (`_pytest` guard, `create_all`), `session_factory` (rollback), `db_session`, `application` (explicit `Settings`), `client` (overrides `get_session`). `tests/test_tasks.py` seeds with `db_session.add` + `commit` and compares `datetime.fromisoformat` (update it to the `.sssZ` form).
- `_bmad-output/initiative-todo-app/deferred-work.md` -- two entries from the AD-21 plan are due here: test the passed-connection path, and escape `%` when setting `sqlalchemy.url`.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/clock.py` -- `Clock` callable returning ms-truncated `datetime.now(UTC)`; `deps.get_clock()` provides it -- AD-7 single time source
- [x] `backend/app/schemas/__init__.py`, `schemas/task.py` -- `TaskRead` (`id`, `text`, `added_at`, `completed_at`), whose serializer emits the fixed-width `.sssZ` UTC form -- AD-7 wire format
- [x] `backend/app/models/task.py` -- replace `list_all` with `list_ordered(session)`, the AD-6 order as one SQL query -- canonical order
- [x] `backend/app/services/task_service.py`, `deps.py`, `routers/tasks.py` -- `TaskService(session, clock)`; `list()` uses `list_ordered`; the router returns `list[TaskRead]` -- wiring
- [x] `contracts/ordering-cases.json` -- named cases: mixed open and completed, the same-ms open tie, the completed tie, all open, all completed, and empty -- the shared AD-6 contract
- [x] `backend/tests/test_ordering.py` -- one test per fixture case (parametrized from the JSON): seed through `db_session`, then `GET /api/tasks`, then assert the id order and the timestamp regex -- matrix rows 1–4
- [x] `backend/tests/test_serialization.py`, `tests/test_clock.py` -- the whole-second, non-UTC and truncation rows, as unit tests without a DB -- matrix rows 5–7
- [x] `backend/tests/test_migrations.py` -- create the scratch `*_pytest` DB from an AUTOCOMMIT admin connection on the `TEST_DATABASE_URL` server. Pass a connection to it via `Config.attributes["connection"]`. Assert one head, run `upgrade head` and `check`, then assert the connection still executes `SELECT 1`. Drop the DB in a finally -- AD-15 plus the deferred connection-path test
- [x] `backend/tests/test_tasks.py` -- update its timestamp assertion to the `.sssZ` string -- keeps it truthful

**Acceptance Criteria:**
- Given `db-test` is up, when `uv run pytest` runs in `backend/`, then all tests pass with coverage ≥ 70%, and no scratch database is left behind (`\l` shows only `todo_pytest`).
- Given the stack is rebuilt, when `GET /api/tasks` runs through nginx on `:8081`, then it returns `200 []` on an empty DB.

## Implementation Notes

- `Clock(wall=...)` takes an optional wall-time callable so the truncation row is testable without patching; `get_clock()` returns `Clock()`.
- `TaskRead` uses `AwareDatetime`, so a naive datetime fails validation instead of being serialized as if it were UTC.
- `list_ordered` sorts on `completed_at IS NOT NULL`, `CASE WHEN completed_at IS NULL THEN added_at END`, `completed_at DESC NULLS LAST`, `id`.
- The migration test names its scratch DB `todo_migrations_<hex>_pytest`, drops it `WITH (FORCE)` in a finally, and commits the passed connection after `upgrade` before `check`.
- Mutation checks: flipping the `id` tie-break fails the two tie cases; adding an unmigrated model column fails the migration test.
- Deferred item from the AD-21 plan (passed-connection path): now covered by `test_migrations.py`, which checks that the tables exist on the passed connection and that it still answers `SELECT 1`. The `%` escaping is avoided rather than fixed: no URL is set, and `env.py` still does not escape a caller-set `sqlalchemy.url`. The `deferred-work.md` entry is left unchanged, since that file is append-only.

- **Review pass 1 patches (2026-09-30):** `env.py` calls `fileConfig(..., disable_existing_loggers=False)`; `contracts/ordering-cases.json` gains `cross_group_tie`; `format_timestamp` pads the year to 4 digits; `test_migrations.py` takes its URL from `TestSettings`; the router imports `TaskRead` from `app.schemas`.
- **Verification (main session):** ruff clean; pytest 32/32 at 100%; app loggers stay enabled after the Alembic config; the only `_pytest` database left is `todo_pytest`; stack healthy; `GET /api/tasks` returns `[]` through nginx on :8081; e2e 3/3 (system Chrome).

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-30): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 15 · false 5 · maybe-false 0. Verification-gap found no gaps. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches plus 1 log append, and no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The migration test's `Config(alembic.ini)` makes `env.py` call `fileConfig`, which disables the already-created app loggers for the rest of the session (ECH) | medium | patch | Reproduced: `app.routers.health` logger `.disabled` is `True` after `fileConfig('alembic.ini')`. Later `caplog` tests (entry 1.3) would be order-dependent. Patch: `fileConfig(..., disable_existing_loggers=False)` in `env.py`. |
| 2 | Fixture lacks a cross-group tie: an open `added_at` equal to a completed `completed_at`, where the completed task has the lower id (BH) | medium | patch | A merged `COALESCE`-style key would pass all 6 cases. Entry 1.6's `sort.ts` is the likely place to make that mistake. Patch: add the case. |
| 3 | `format_timestamp` relies on `%Y`, which glibc doesn't zero-pad below year 1000 (BH, ECH) | low | patch | Unreachable from the clock today, but the fix is a direct correction: format the year as `{utc.year:04d}`. |
| 4 | `test_migrations.py` imports `TEST_DATABASE_URL` from `tests.conftest` (BH) | low | patch | It works with `tests/__init__.py`, but `TestSettings` owns the value (AD-21); import it from `tests.settings`. Direct correction. |
| 5 | `app/schemas/__init__.py` re-exports `TaskRead` but nothing uses it (BH) | low | patch | Router imports `from app.schemas import TaskRead`. Direct correction. |
| 6 | `deferred-work.md` still reads as if both AD-21 items are open (BH) | low | patch | Append-only: add a new entry saying the passed-connection path is covered here and `%` escaping stays open. Main session. |
| 7 | `get_clock` wiring untested; the Clock is injected but never used (BH, IA) | low | reject | There is no write path in this story, so there is nothing observable to wire. Entry 1.3's POST tests with a fixed-clock override prove it. |
| 8 | Service types the clock as the concrete `Clock` (BH) | low | reject | `dependency_overrides` accepts any callable; no caller is affected. |
| 9 | `Clock` accepts a naive wall time (BH, ECH) | low | reject | The default wall is aware; only tests inject one. A guard adds a branch for an unreachable input. |
| 10 | The route's return annotation `list[Task]` vs `response_model=list[TaskRead]` (BH) | low | reject | The standard FastAPI pattern; `response_model` governs the wire, and the tests pin it. |
| 11 | Scratch DB leaks if pytest is killed; no sweep (BH, ECH) | low | reject | Needs a kill mid-test; a sweep adds complexity. The manual check found none left. |
| 12 | No test asserts the scratch DB was dropped (BH) | low | reject | `DROP … WITH (FORCE)` in a `finally`; verified manually. |
| 13 | The `_pytest` guard doesn't run when the migration test runs alone (ECH) | low | reject | The test only creates and drops its own random `todo_migrations_<hex>_pytest` DB; it never touches the named database. |
| 14 | The migration guard never runs `downgrade` (BH) | low | reject | AD-15 requires one head, upgrade and check; downgrade is not in the contract. |
| 15 | Mutation-check claim unbacked (BH) | low | reject | A note, not a defect; the two regressions it names are exactly what the ordering and migration tests assert. |
| 16 | Sub-ms / non-UTC rows tested on the schema, not over HTTP (IA) | low | reject | The DB session is pinned to UTC and the clock truncates, so neither value can reach the wire from storage; the schema is the surface where they can occur. |
| 17 | The Alembic own-engine branch is exercised only by the entrypoint (IA) | low | reject | It runs on every container start; the stack check covers it. |
| 18 | The Verification query's `LIKE '%_pytest'` treats `_` as a wildcard (BH) | false | reject | The fix edits this plan; the query still lists every scratch DB, just more loosely. |
| 19 | The fixture has no schema or invariant checks for the frontend (BH) | false | reject | The backend test asserts exact id order and exact timestamp strings against Postgres, which enforces unique ids, a permutation and the `.sssZ` form. |
| 20 | The fixture's second consumer (TypeScript) is not exercised (IA) | false | reject | That's entry 1.6 by design; the intent names the reuse, not a TS test here. |
| 21 | The plan's review bookkeeping contradicts itself (BH) | false | reject | The lenses were still running when it was read; this log is the triage. |
| 22 | Double import of `tests.conftest` (BH) | false | reject | With `tests/__init__.py`, pytest registers conftest as `tests.conftest`, the same module; #4 still moves the import for ownership. |


## Design Notes

- **Ordering in SQL, not Python:** AD-6 says the backend owns the order and "nothing else sorts". A single `ORDER BY` also keeps the order stable for later pagination. One shape that works is to sort on `completed_at IS NOT NULL` first, then `added_at` for open rows, then `completed_at DESC` for completed rows, then `id`. The fixture is the judge, not this sketch.
- **`id` tie-break across languages:** Postgres orders `uuid` bytewise, which matches lexicographic order of lowercase canonical hex strings. That is why the fixture uses lowercase ids: entry 1.6's `sort.ts` compares strings and must agree.
- **Why the migration test passes a connection:** it pins AD-21's step 1, which was deferred from the AD-21 plan. It also avoids the configparser `%` problem, because no URL is ever set.
- **Scope of the schemas:** only `TaskRead` is added. `TaskCreate` exists to carry AD-12 validation, which is entry 1.3's scope.

## Verification

**Commands:**
- `docker compose --profile test up -d --wait db-test && cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green, coverage ≥ 70
- `docker compose exec -T db-test psql -U todo -d todo_pytest -Atc "select datname from pg_database where datname like '%_pytest'"` -- expected: only `todo_pytest`
- `docker compose up -d --build --wait && curl -s http://127.0.0.1:8081/api/tasks` -- expected: `[]`
