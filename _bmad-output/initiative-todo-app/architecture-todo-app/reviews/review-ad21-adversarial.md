---
review: adversarial (unit-pair divergence), scoped to AD-21
target: ../architecture-todo-app.md (status: final, updated 2026-09-30, uncommitted AD-21 edit)
focus: AD-21 x AD-14, AD-15, AD-16, AD-20, Config and Backend-tests conventions
grounding: backend/app/db.py, backend/app/deps.py, backend/app/main.py, backend/tests/conftest.py, backend/alembic/env.py, docker-compose.yml, .env, .env.example, backend/.dockerignore, epic-capture-and-keep/tickets.toml entry 4 ("1.4")
date: 2026-09-30
spine_edited: no
---

# Adversarial Review — AD-21 (backend configuration through Pydantic Settings)

## Verdict

AD-21 gets the intent right: one reader of the environment, a strict `APP_ENV`, and a separate test settings class. The rule breaks down at the **time** config is read. Nothing reads it inside a request. The engine is built when `db.py` is imported, the AD-14 gate runs when `create_app()` runs, and `alembic/env.py` runs from the CLI. `app.dependency_overrides` reaches none of these, so the test seam AD-21 promises does not exist for any real consumer. The spine also says `get_settings()` lives in `deps.py`, but `deps.py` already imports `db.py`, so following it to the letter creates an import cycle. Add the `.env` handling, where pydantic-settings resolves the path from the current directory and rejects extra keys by default, and stories 1.4 and the AD-21 refactor can each follow every AD and still ship a crashing or mis-gated backend. Close holes 1–4 before entry 4 starts. Hole 5 can go into entry 4's plan.

## Method

Same method as `review-adversarial.md`. I paired two units that separate stories or agents would build. I gave each one the most natural implementation that still follows every AD to the letter. Then I checked whether the two fit together, using the real code on `story-1-1-walking-skeleton` wherever it already chose a path. Severity: **High** = a story fails to integrate, or tests or the gate behave wrongly; **Medium** = works in one environment only, or fails in a confusing way; **Low** = unlikely or cosmetic.

---

## 1. High — `dependency_overrides` cannot reach any consumer of Settings; the AD-14 gate test has no compliant form

**Units:** `app/main.py` with the AD-14 gate (entry 4) ↔ `tests/conftest.py` plus the "404 under default config" test (entry 4) ↔ the "one app per session" Backend-tests convention.

**What the ADs say:** AD-21 says `main.py` (the AD-14 gate) takes `app_env` from `get_settings()`, and "tests swap it through `app.dependency_overrides` or construct `Settings(...)` directly". AD-14 says a backend test asserts `/api/test/*` returns 404 "under the default config". The Backend-tests convention says one app per session.

**How two compliant builds diverge:**

- The entry-4 agent writes `create_app()` as `if get_settings().app_env == "test": api.include_router(testing.router)`. This follows AD-21 to the letter. Overrides are set on the app *after* `create_app()` returns, and they apply only while a `Depends()` is resolved during a request. They can never change which routers get mounted. The only other option AD-21 allows, "construct `Settings(...)` directly", has nowhere to go, because `create_app()` takes no argument.
- The same agent also needs a positive test showing that the router is mounted under `APP_ENV=test`, so that seeding and reset can be tested at all. The remaining levers are `monkeypatch.setenv("APP_ENV", "test")` plus `get_settings.cache_clear()`. That is exactly what AD-21's "Prevents: tests patching environment variables" forbids. The agent either breaks AD-21 or leaves `testing.py` untested, and it has to build a second app, which bends "one app per session".
- `Settings()` with no arguments still reads the real environment and `backend/.env`. A developer who put `APP_ENV=test` in `backend/.env` to run E2E against a local uvicorn gets a session app **with** the testing router mounted. The "404 under default config" test then fails on that machine only. A "default config" test that builds `Settings()` inherits the same leak.

**Tightened rule (AD-21, replaces the second bullet):**

> - `create_app(settings: Settings | None = None)`. When no settings are passed, it calls `get_settings()`. `create_app` is the only place that reads `app_env`, and it mounts the AD-14 router from that value. It stores `settings` on `app.state.settings`.
> - `get_settings()` (in `app/config.py`, `lru_cache`d) is called only by composition roots: `app/main.py`'s module-level `app = create_app()`, `alembic/env.py` and the `db.py` engine factory (hole 2). No router, service or request-time dependency calls it.
> - Tests never override `get_settings` and never touch `os.environ`. They build `Settings(_env_file=None, database_url=..., app_env=...)` and pass it to `create_app(settings)`. The session fixture builds the default-config app. Testing-router tests use a second, session-scoped `test_mode_application` fixture. That is the one allowed exception to "one app per session".

---

## 2. High — Import-time engine plus `get_settings()` in `deps.py` gives an import cycle, and pytest crashes at collection when `database_url` is required

**Units:** `app/config.py` + `app/db.py` (the AD-21 refactor story) ↔ `tests/conftest.py` (already written) ↔ `alembic/env.py`.

**What the ADs say:** AD-21 puts `get_settings()` in `deps.py`, and says `db.py` "takes its values from it". AD-20 says `deps.py` owns the providers and imports `get_session` from `db.py`, as the code already does. AD-21 "Prevents: config defaults defined in two places", while the Config convention says defaults live "inline in compose". The spine never says whether `database_url` has a default.

**How two compliant builds diverge:**

- **Import cycle.** Taken literally: `deps.py` defines `get_settings()` and imports `db.get_session`, while `db.py` does `from app.deps import get_settings; engine = make_engine(get_settings().database_url)` at import. That is `deps → db → deps`, an `ImportError` on a partly initialised module. The spine's own diagram draws `db.py → config.py`, not `db.py → deps.py`, so the text and the diagram disagree. One agent moves `get_settings` into `config.py`. Another keeps a wrapper in `deps.py`. `dependency_overrides` matches on function identity, so an override of `deps.get_settings` silently misses the `config.get_settings` that the code actually calls.
- **Required vs defaulted `database_url`.** The config agent reads "no defaults in two places" plus "compose owns defaults" and makes `database_url: PostgresDsn` required. That follows the letter. `conftest.py` does `from app.db import get_session, make_engine`. With an import-time engine, collection now builds `Settings()`. `uv run pytest` on a machine with only `TEST_DATABASE_URL` set, which is the README setup, fails at collection with `database_url: Field required` before any fixture runs. A second agent keeps the walking skeleton's `localhost:5432` default in `Settings`. That puts the default in two places and points at a port that `dev-machine-gotchas.md` says is taken.
- **Unused engine against a real DB.** Even when the import succeeds, pytest builds a pooled engine against whatever `DATABASE_URL` or `backend/.env` names. `pool_pre_ping` connects lazily, so nothing fails, but any code path that bypasses the `get_session` override (a new router that imports `engine`, or a lifespan hook) writes to the developer's app database.

**Tightened rule (AD-20 + AD-21):**

> - `get_settings()` lives in `app/config.py`. `deps.py` does not re-export or wrap it.
> - `db.py` builds no engine at import. It exposes `make_engine(url)` and `get_engine()` (`lru_cache`d, built from `get_settings().database_url` on first call), and `get_session()` uses `get_engine()`. Importing any `app.*` module never constructs `Settings` and never opens a pool.
> - `database_url` is **required** in `Settings`, with no default in Python. Its defaults live in compose, one per service, and in `.env.example`. `app_env` defaults to `"app"`, and that default lives only in `Settings`, because compose does not set it outside the `test` profile.

---

## 3. High — `alembic/env.py` reads only `get_settings()`, so the AD-15 migration test cannot redirect it without breaking AD-21

**Units:** `alembic/env.py` (AD-21 refactor) ↔ the AD-15 migration test ("creates and drops its own scratch database", "`upgrade head` on an empty DB", "`alembic check`").

**What the ADs say:** AD-21 says `alembic/env.py` takes its URL from `get_settings()`. AD-15 says the migration test runs `upgrade head` and `alembic check` against a scratch database it creates. AD-21 forbids tests patching environment variables. `dependency_overrides` does not apply to Alembic, because there is no FastAPI request.

**How two compliant builds diverge:** the env.py agent writes `url = get_settings().database_url`, as the code does today with `database_url()`. The migration-test agent creates `todo_migrations_pytest` and calls `command.upgrade(cfg, "head")`. env.py ignores `cfg`, so the only ways to redirect it are `setenv("DATABASE_URL")` + `cache_clear()` (forbidden) or overriding `get_settings` (impossible). The easy fallback is to run the test against whatever `get_settings()` resolves. In pytest that is `backend/.env`'s `DATABASE_URL`, meaning the developer's app DB, or, if hole 2 made it required, nothing at all. `alembic check` then runs against real data, and an `upgrade`/`downgrade` round-trip test drops real tables. The `_pytest` name guard in `conftest.py` protects only `TEST_DATABASE_URL`, not this path.

**Tightened rule (AD-15 + AD-21):**

> `alembic/env.py` resolves the connection in this order: `config.attributes["connection"]` if the caller passed one, then `config.get_main_option("sqlalchemy.url")` if it is set, then `get_settings().database_url`. `alembic.ini` sets no `sqlalchemy.url`. The migration test builds an `alembic.config.Config`, sets `sqlalchemy.url` to its scratch database (derived from the test settings' `TEST_DATABASE_URL` with the database name swapped, and still ending in `_pytest`), and never touches the environment or the app `Settings`. The CLI and entrypoint path (`alembic upgrade head` in the container) always falls through to `get_settings()`.

---

## 4. High — `backend/.env` handling: a cwd-relative path, `extra="forbid"` by default, and "copy `.env.example`" make startup and test settings fail, or read the wrong file

**Units:** `app/config.py` `Settings` ↔ the test-only `BaseSettings` in `backend/tests/` ↔ the root `.env` / `.env.example` (AD-16) ↔ the dev profile's `backend-dev` bind mount (entry 4).

**What the ADs say:** Sources are real environment variables, then `backend/.env`. The root `.env.example` "stays the one list of every variable". `.env.example` lists `COMPOSE_PROFILES`, `APP_BIND`, `POSTGRES_*`, `DATABASE_URL` (host `db`), `API_UPSTREAM`, `TEST_DATABASE_URL`, `E2E_BASE_URL`. The committed root `.env` holds `COMPOSE_PROFILES=app`. AD-16 dev profile: `backend-dev` with its source bind-mounted.

**How compliant builds diverge (four ways):**

- **Extra keys.** pydantic-settings' default is `extra="forbid"`, and dotenv keys that are not fields count as extra. A developer does the obvious `cp .env.example backend/.env`, since it is "the one list". The app `Settings` then refuses to start (`COMPOSE_PROFILES`, `APP_BIND`, `POSTGRES_USER`, … extra inputs not permitted). The test settings class, if it also reads `backend/.env`, which is the natural symmetric choice, fails on `DATABASE_URL` and `APP_ENV`. AD-21 does say "invalid or unknown values fail at startup", but it never says that "unknown" covers keys, not just values.
- **Relative path.** The obvious `env_file=".env"` resolves from the **current working directory**. When `uv run --project backend pytest` or an IDE runner starts from the repo root, pydantic-settings reads the committed **root** `.env` (`COMPOSE_PROFILES=app`), which crashes under `forbid`. Under `ignore`, it silently skips `backend/.env`.
- **Wrong host in the copied file.** `.env.example`'s `DATABASE_URL` names `db:5432`, a compose network name, so a host-side uvicorn copied from it cannot resolve the host. The README's "run outside Docker" section says only "set `DATABASE_URL`".
- **Bind mount carries the file in.** `.dockerignore` keeps `backend/.env` out of the image, but it does nothing for a bind mount. The natural `backend-dev` mounts `./backend:/app`, so the container reads the developer's host `backend/.env`. If that file has `APP_ENV=test` (see hole 1), the dev stack mounts `/api/test/*`. That breaks AD-14's intent ("only the compose `test` profile sets that") while following its letter, because compose did not set it. If compose does not pass `DATABASE_URL` to `backend-dev`, the file's `localhost` URL is used inside the container and fails.

Grounding: `backend/.env` is not currently ignored (`git check-ignore backend/.env` returns nothing, and the root `.gitignore` has no `.env` entry because the root `.env` is committed), and `backend/.dockerignore` does not list it. AD-21 states both as facts, so the story implementing AD-21 has to add them.

**Tightened rule (AD-21, third and fourth bullets):**

> - `Settings.model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")`, where `BACKEND_DIR = Path(__file__).resolve().parents[1]`, so the path never depends on the working directory. "Invalid" means a bad **value** for a declared field (for example `APP_ENV=dev`), and it fails at startup. Unrelated keys are ignored, so one file can serve both classes.
> - The test settings class (`tests/settings.py`, `TestSettings` with `test_database_url` and a `_pytest` validator that replaces the ad-hoc `pytest.exit` guard) reads the same absolute `backend/.env`, also with `extra="ignore"`.
> - `backend/.env.example` is **not** added. The root `.env.example` gains a comment block listing which keys may go into `backend/.env` (`DATABASE_URL`, `TEST_DATABASE_URL`, `APP_ENV`) with host-side values (`127.0.0.1`, not `db`).
> - Every compose backend service (`backend`, `backend-dev`, `backend-test`) sets **both** `DATABASE_URL` and `APP_ENV` explicitly (`app`, `app`, `test`), so a file can never decide either one inside a container. `backend-dev` bind-mounts `./backend/app` and `./backend/alembic` only, never the whole `backend/`, so neither `backend/.env` nor the host `.venv` enters the container.

---

## 5. Medium — pytest and `backend-test` share `db-test` and database `todo_pytest`

**Units:** `tests/conftest.py` `database_engine` (drop_all → create_all → drop_all) ↔ `backend-test` (entry 4, entrypoint `alembic upgrade head`, AD-15) ↔ the E2E suite (entry 5).

**What the ADs say:** AD-16 puts only `db-test` in the `test` profile, and entry 4 says `backend-test` uses "entry 1's db-test". The Backend-tests convention points pytest at `db-test` / `todo_pytest`. AD-15 says the entrypoint runs `alembic upgrade head`.

**How it diverges:** the entry-4 agent gives `backend-test` the obvious `DATABASE_URL=...@db-test:5432/todo_pytest`, the only database on that server. Its entrypoint creates `tasks` and `alembic_version`. A later `uv run pytest` calls `SQLModel.metadata.drop_all`, which drops `tasks` but leaves `alembic_version` at head. On its next start, `backend-test` finds nothing to upgrade, and every `/api/tasks` call returns `500` until someone wipes the volume. When both run together, pytest's `create_all` and `drop_all` race the running E2E suite. The `_pytest` name guard even blesses this sharing, because the name matches.

**Tightened rule (AD-16, test profile row + Backend-tests convention):**

> `db-test` hosts two databases: `todo_pytest` (pytest only; fixtures may drop and create it) and `todo_e2e` (`backend-test` only; schema only through Alembic). The second is created by a `docker-entrypoint-initdb.d` script mounted into `db-test`. `backend-test`'s `DATABASE_URL` names `todo_e2e`. The `_pytest` suffix guard stays, and no compose service may point at a `*_pytest` database.

---

## 6. Medium — "Test mode" has two readers at two times (factory vs request)

**Units:** `routers/testing.py` + `create_app` gate ↔ `clock.py` / `deps.get_clock()` offset hook (AD-7 "in test mode only, the clock accepts an offset", entry 4).

**How it diverges:** agent A gates only the router (factory time), so the `Clock` always carries an offset field that nothing can set outside test mode. Agent B makes `get_clock(settings = Depends(get_settings))` return an offset-capable clock only when `app_env == "test"`. That is the one request-time consumer of `get_settings`, and it is the only one where AD-21's `dependency_overrides` sentence actually works. A pytest suite that overrides `get_settings` to test mode then gets an offset clock but no router (hole 1), and a suite that uses a test-mode app without the override gets the router but a plain clock, so `POST /api/test/clock` returns 200 and changes nothing. The offset also needs a single home. A module-level singleton in `clock.py` leaks between tests under "one app per session". An instance on `app.state` does not.

**Tightened rule (AD-7 + AD-14):**

> `create_app(settings)` builds the one `Clock` instance and stores it on `app.state.clock`. The instance supports an offset in every mode. `get_clock(request)` returns `request.app.state.clock`. Only `routers/testing.py` mutates the offset, so the router gate is the single test-mode switch. Tests replace the clock through `dependency_overrides[get_clock]` (AD-20), and a fixture resets `app.state.clock` offset to 0 after each test.

---

## 7. Low — env-var naming is implied, not pinned

An agent adding the common hygiene `env_prefix="TODO_"` still follows AD-21. Compose's `DATABASE_URL` and `APP_ENV` then go unread, `app_env` quietly falls back to `"app"`, and `database_url` fails as missing (or, before hole 2 is fixed, uses a default). **Tighten:** `Settings` has no `env_prefix`, and each field name is the lower-cased environment variable name listed in the Config convention.

## Side finding (outside AD-21, found while grounding)

`tickets.toml` entry 4 says `frontend-test` is on **8081**, but AD-16 and entry 5 say `127.0.0.1:8082`, and 8081 is the `app` profile's port. If both stacks run at once, one fails to bind. Fix the ticket text.

## Seams tried and found closed

- **`APP_ENV` typo mounting the router.** `Literal["app", "test"]` plus startup validation closes this, provided hole 4's compose rule makes `backend-dev` set `app` explicitly. A value of `dev` fails fast, which is correct.
- **Two owners of `TEST_DATABASE_URL`.** The separate test settings class keeps it out of app `Settings`. Hole 4 only adds how that class finds its file.
- **Image baking secrets.** `.dockerignore` (once it lists `.env`) plus environment variables winning over the file hold for the `app` and `test` images. The bind-mount case is hole 4.
- **Frontend and nginx config.** Untouched by AD-21 (memlog constraint). `API_UPSTREAM` handling in AD-16 is consistent.
- **Session driver.** `database_url` is only ever used with `make_engine` (psycopg sync, `TimeZone=UTC`). Once hole 2 routes everything through `get_engine()`, there is no second engine construction path.
