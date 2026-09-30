---
title: 'Backend settings through Pydantic Settings (AD-21)'
type: 'refactor'
ticket: ''
created: '2026-09-30'
status: 'built'
baseline_revision: '529c886280ab81923a0c6d7194aef26d8b5d050c'
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

**Problem:** The backend reads the environment ad hoc: `app/db.py` calls `os.environ` and builds its engine at import, `app/main.py` builds a module-level `app`, and `tests/conftest.py` calls `os.environ`. That breaks the new AD-21, and entry 1.4's `APP_ENV` gate would inherit the same untestable shape.

**Approach:** Make the backend follow AD-21 as written. Pydantic Settings becomes the only reader of the environment. The app is built by `create_app(settings)` and started with `uvicorn --factory`, with the settings and engine on `app.state`. Alembic resolves its URL by the AD-21 precedence, and a test-only settings class owns `TEST_DATABASE_URL`. Behaviour of the running app is unchanged.

## Boundaries & Constraints

**Always:** AD-21 exactly, and AD-20 as amended. `pydantic-settings~=2.15.0`. `database_url` is required with no default, and `app_env: Literal["app", "test"] = "app"`. `env_file` is the absolute path of `backend/.env`, resolved from `config.py`, with `extra="ignore"` and no `env_prefix`. The test settings class uses the same file and `extra="ignore"`. Tests never patch the environment: they pass `Settings(_env_file=None, …)`. Importing any `app.*` module reads no config. Keep the existing tests' behaviour, the `_pytest` guard and the rollback-per-test fixture.

**Never:** The testing router, mounting anything on `app_env`, the clock (entries 1.2 and 1.4). The `dev`/`test` backend services and `todo_e2e` (entry 1.4). The AD-15 migration test (entry 1.2). Frontend or nginx changes. A module-level `app` or engine. Any `os.environ`/`os.getenv` in `backend/app`, `backend/alembic` or `backend/tests`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Import without config | no `DATABASE_URL`, no `backend/.env`; `import app.main` | import succeeds | — |
| Missing URL at startup | no `DATABASE_URL` anywhere; `create_app()` | raises `ValidationError` | fails fast, nothing served |
| Bad `APP_ENV` | `APP_ENV=prod` | `Settings` raises `ValidationError` | fails fast |
| Env beats file | `backend/.env` has `DATABASE_URL=A`, env has `B` | `database_url == B` | — |
| Unknown keys in file | `backend/.env` holds `TEST_DATABASE_URL`, `POSTGRES_USER` | app `Settings` loads; keys ignored | — |
| Any working directory | cwd is the repo root or `/tmp` | `backend/.env` is still the file read | — |
| Explicit settings | `create_app(Settings(_env_file=None, database_url=U))` | `app.state.settings` is that object; `app.state.engine.url` is `U` | — |
| Test settings | `TEST_DATABASE_URL` unset | default `…@127.0.0.1:5436/todo_pytest`; `DATABASE_URL` in the file is ignored | — |
| Alembic URL | `sqlalchemy.url` set on the Alembic `Config` | offline `upgrade --sql` uses it, not `Settings` | — |

</frozen-after-approval>

## Code Map

- `backend/app/db.py` -- today holds `database_url()` (the only `os.environ` read in `app/`), `DEFAULT_DATABASE_URL`, `make_engine(url)` (keep as is: `pool_pre_ping`, `TimeZone=UTC`) and a module-level `engine`. `get_session()` has no parameters.
- `backend/app/main.py` -- `create_app()` has no parameters; module-level `app = create_app()`.
- `backend/app/deps.py` -- `get_task_service(session=Depends(get_session))`; imports `app.db`, so config must not live here (import cycle).
- `backend/alembic/env.py` -- imports `database_url`, `make_engine` from `app.db`, and has an offline and an online path. `alembic.ini` sets no `sqlalchemy.url`.
- `backend/tests/conftest.py` -- `TEST_DATABASE_URL` from `os.environ` with the 5436 default; `_pytest` guard in `database_engine`; `application` fixture calls `create_app()`; `client` overrides `get_session`. `tests/test_health.py` overrides `get_session` with `UnreachableSession` (keep it).
- `backend/entrypoint.sh` -- `exec uvicorn app.main:app …`. `backend/.dockerignore` has no `.env`. `backend/pyproject.toml` has no `pydantic-settings`.
- `docker-compose.yml` -- the `backend` service sets only `DATABASE_URL`. `.gitignore` already ignores `.env` at any depth (covers `backend/.env`).

## Tasks & Acceptance

**Execution:**
- [x] `backend/pyproject.toml`, `uv.lock` -- add `pydantic-settings~=2.15.0` and re-lock -- AD-21 dependency
- [x] `backend/app/config.py` -- `Settings(BaseSettings)` with the fields and `model_config` from Boundaries, plus `get_settings()` with `lru_cache` -- the one env reader
- [x] `backend/app/db.py` -- drop `database_url()`, `DEFAULT_DATABASE_URL` and the module engine; `get_session(request: Request)` yields a `Session` on `request.app.state.engine` -- nothing at import
- [x] `backend/app/main.py` -- `create_app(settings: Settings | None = None)`: use `settings or get_settings()`, store it and `make_engine(settings.database_url)` on `app.state`, no module-level `app` -- composition root
- [x] `backend/app/deps.py` -- add `current_settings(request)` returning `request.app.state.settings`, for later request-time consumers -- the AD-21 dependency
- [x] `backend/alembic/env.py` -- resolve the connection or URL in AD-21 order: `config.attributes["connection"]`, then `config.get_main_option("sqlalchemy.url")`, then `get_settings().database_url`; online mode reuses a passed connection without disposing it -- AD-21 Alembic rule
- [x] `backend/tests/settings.py`, `tests/conftest.py` -- `TestSettings(BaseSettings)` with `test_database_url` defaulting to the 5436 URL, same `env_file`, `extra="ignore"`; conftest uses it and builds `application` with `create_app(Settings(_env_file=None, database_url=<test url>))` -- no env patching
- [x] `backend/tests/test_config.py` -- one test per matrix row; build `Settings`/`TestSettings` with explicit `_env_file` paths under `tmp_path` and pytest's `monkeypatch.setenv`/`delenv` only to set up the process environment under test -- proves the matrix
- [x] `backend/entrypoint.sh` -- `exec uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000` -- no module-level app
- [x] `backend/.dockerignore`, `docker-compose.yml` -- add `.env` to the dockerignore; the `backend` service sets `APP_ENV: app` next to `DATABASE_URL` -- AD-21 compose and image rules
- [x] `README.md`, `.env.example` -- document `backend/.env` for local backend runs (uncommitted, env vars win, which keys it may hold); mark `APP_ENV` in `.env.example` with default `app` -- docs match AD-21

**Acceptance Criteria:**
- Given the change, when `grep -rn "os.environ\|os.getenv" backend/app backend/alembic backend/tests` runs, then it finds nothing.
- Given `db-test` is up, when `uv run pytest` runs in `backend/`, then all tests pass with coverage ≥ 70%.
- Given `docker compose up -d --build --wait`, then all three services are healthy, the backend logs show `alembic upgrade head` then uvicorn started through `--factory`, and `/api/health` returns 200 through nginx on :8081.

## Implementation Notes

- **Review pass 1 patches (2026-09-30):** the import test now blocks `BaseSettings.__init__` and checks there is no module-level `engine` or `app`. The any-cwd test uses a decoy plus a known file and has no early return. New tests cover the `TEST_DATABASE_URL` override and an empty URL. `database_url` is `Field(min_length=1)`, the conftest app passes `app_env="app"`, `**/.env` goes in the dockerignore, the `.env.example` comment is corrected, and `is not None` replaces the truthiness check.
- **Verification (main session):** no env reads outside `config.py`; ruff clean; pytest 16/16 at 100%; offline `alembic upgrade head --sql` emits both tables with `DATABASE_URL` set and fails with `database_url Field required` without it; stack healthy; backend PID 1 is `uvicorn --factory app.main:create_app` with `APP_ENV=app` and no `.env` in `/app`; `/api/health` is ok on :8081; e2e 3/3 (system Chrome).

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-30): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 5 · low 14 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 10 patches, 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `test_import_reads_no_config` passes when a `backend/.env` holds `DATABASE_URL`; a direct `Settings()` at import is not caught (BH, IA, VG) | medium | patch | Pre-verified by VG: the subprocess inherits the absolute `ENV_FILE`. Patch: make `BaseSettings.__init__` raise inside the subprocess before the imports, and assert that `app.db` has no `engine` and `app.main` has no `app`. |
| 2 | Any-cwd test is vacuous: `repo_root` plants no decoy, and the `except ValidationError: return` passes silently (BH, ECH×2, IA) | medium | patch | Confirmed at `test_config.py:525-545`. Patch: plant a decoy `.env` in a tmp cwd, point `env_file` at an absolute tmp file with a known URL, and assert the known URL wins. Keep the `ENV_FILE` constant asserts and drop the early return. |
| 3 | `TEST_DATABASE_URL` override (env and file) never shown to work (VG) | medium | patch | Pre-verified: only the default is tested. Patch: test both override sources. |
| 4 | An empty `DATABASE_URL=` passes validation (BH, ECH) | medium | patch | `database_url: str` accepts `""`, and startup then fails later inside SQLAlchemy, whereas AD-21 says invalid values fail at startup. Patch: `Field(min_length=1)`, plus a test. |
| 5 | `Settings(_env_file=None, …)` still takes `APP_ENV` from the process env, so the test app isn't deterministic (IA) | medium | patch | Confirmed by `test_bad_app_env_fails` itself. Init kwargs beat env, so the conftest `application` passes `app_env="app"` explicitly. |
| 6 | `.env.example` `APP_ENV` comment is wrong: nothing reads that line, and no service sets `test` yet (BH, ECH×2, VG) | low | patch | The root `.env` only feeds compose interpolation, compose hardcodes `APP_ENV: app`, and `Settings` reads `backend/.env`. Patch: reword the comment. |
| 7 | `sessions.close()` is not in `finally` (BH, ECH) | low | patch | Direct correction. |
| 8 | `test_env_beats_file` doesn't clear `APP_ENV` (ECH) | low | patch | A stray exported `APP_ENV` fails it for an unrelated reason. One-line fix. |
| 9 | `backend/.dockerignore` `.env` matches the root only (BH) | low | patch | Use `**/.env`, matching `.gitignore`'s any-depth rule. |
| 10 | `settings or get_settings()` relies on truthiness (BH) | low | patch | Direct correction to `is not None`. |
| 11 | Alembic `config.attributes["connection"]` branch untested (BH, IA, VG) | low | defer | No caller yet; entry 1.2's AD-15 migration test is its first consumer and should pin it. |
| 12 | Engine never disposed on shutdown or in the session fixture (BH, ECH×2) | low | reject | Same as before the change; the engine only lives for the process, and the test engine never connects because `get_session` is overridden. A lifespan adds surface for negligible harm. |
| 13 | `test_config.py` patches the environment against "Tests never patch the environment" (BH, IA) | low | reject | The approved plan's Design Notes carve out this exception: these tests are about env reading. The fix would edit the plan; a spine clarification is offered to the user instead. |
| 14 | `current_settings` named differently from AD-21's "`get_settings` dependency" (BH, IA) | low | reject | Recorded in the approved Design Notes; the behaviour matches. Offered as a spine wording update. |
| 15 | `%` in a caller-set `sqlalchemy.url` breaks configparser interpolation (ECH) | low | reject | No caller exists; belongs with #11 in entry 1.2. |
| 16 | README gives no concrete DB for local runs (BH) | low | reject | Accurate as written (`db` publishes no port); a worked local-DB recipe is more than a direct fix. |
| 17 | Move the `_pytest` guard into a `TestSettings` validator (BH) | low | reject | The guard works at its only consumer; restructuring adds complexity. |
| 18 | No `Annotated` alias for `current_settings` (BH) | low | reject | No consumer yet; entry 1.4 adds one. |
| 19 | `conftest.py` reads `TestSettings` at import (IA) | low | reject | Test code, outside the "no config at import for `app.*`" rule. |
| 20 | Real-request `get_session` → `app.state.engine` and `--factory` boot not covered by pytest (IA) | low | reject | The e2e `/api/health` spec and the compose check exercise both; #1 now asserts there is no module-level `app`. |
| 21 | An Engine placed in `config.attributes["connection"]` breaks migrations (ECH) | false | reject | No such caller exists; the contract says "connection". |
| 22 | Plan bookkeeping stale (BH) | false | reject | The status is `in-review` and is managed by the workflow; the fix edits the plan. |
| 23 | Docs describe compose services that don't exist yet (IA) | false | reject | The README's claim holds for the one backend service today; the `.env.example` part is covered by #6. |

## Design Notes

Why `monkeypatch` is allowed in `test_config.py` only: those tests prove what `Settings` reads from the real process environment, so setting that environment is the input under test. Every other test passes `Settings(_env_file=None, …)`, as AD-21 requires.

The request-time dependency is named `current_settings`, not `get_settings`, so it can't be confused with the cached env loader `config.get_settings()`. AD-21 describes it as "a `get_settings` dependency"; the behaviour matches.

`get_session` moves to `request.app.state.engine`, but tests keep overriding `get_session` itself, so the rollback fixture is unchanged. The `application` fixture still needs a real `Settings`, because `create_app` builds an engine; engine creation doesn't connect.

## Verification

**Commands:**
- `cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green, coverage ≥ 70
- `cd backend && uv run alembic upgrade head --sql` -- expected: SQL emitted with `DATABASE_URL` set and no DB running (offline path)
- `docker compose up -d --build --wait && curl -s http://127.0.0.1:8081/api/health` -- expected: 3 services healthy, `{"status":"ok"}`
