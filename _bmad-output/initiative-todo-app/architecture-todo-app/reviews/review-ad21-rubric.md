# Review — AD-21 (backend configuration through Pydantic Settings)

- **Reviewed:** `architecture-todo-app.md` working-tree diff (AD-21, Config convention row, Stack row, backend dependency diagram, Structural Seed line)
- **Against:** `.memlog.md` (last 7 entries), `backend/app/{db,deps,main}.py`, `backend/alembic/env.py`, `backend/tests/conftest.py`, `backend/.dockerignore`, root `.gitignore`, `.env.example`, `.env`, `docker-compose.yml`
- **Date:** 2026-09-30

## Verdict

**Revise before stories consume it.** AD-21 faithfully records every memlog decision (only-reader `Settings`, `Literal["app","test"]` with default `"app"`, a separate test-only `BaseSettings`, `backend/.env` with env-over-file precedence, `.env.example` as the one list, frontend untouched). But its override mechanism does not reach the two places where config actually takes effect: the import-time engine in `db.py` and the factory-time AD-14 gate in `main.py`. Putting `get_settings()` in `deps.py` also creates an import cycle with `db.py`, and it disagrees with the diagram. Three secondary gaps (the `.env` path and extras, where defaults live, and the Alembic URL for the AD-15 migration test) leave room for units to diverge.

## Checklist

| Criterion | Result |
|---|---|
| Fixes the real divergence points one level down, misses none | Partial: misses the settings location/cycle, the `.env` path resolution, extra keys, where defaults live, and how the migration test passes a URL |
| Rule is enforceable and prevents its stated divergences | Partial: "tests swap it through `dependency_overrides`" cannot prevent env patching for the gate or the engine (F1) |
| Does not contradict other ADs / conventions | AD-14 gate test and AD-15 migration test are left without a legal mechanism (F1, F5). The diagram contradicts the Rule (F2). Config row "defaults inline in compose" clashes with a Settings default (F4) |
| Ratifies the existing code | Mostly. It replaces both `os.environ` reads (`db.py:13`, `conftest.py:15`). `.gitignore`/`.dockerignore` do not yet list `backend/.env`, but the Rule states that as fact (F6) |
| Nothing left open lets two units diverge | No (F3, F4, F5) |
| Diagram / Seed / Stack consistent with Rule | Stack OK (pydantic-settings 2.15 fits Pydantic 2.13 and Python 3.14). Diagram disagrees with the Rule on where `get_settings` lives (F2). Seed omits `backend/.env` and the test settings module (F7) |

## Findings

### F1 — `dependency_overrides` cannot swap settings for the engine or the AD-14 gate · **critical**

`app.dependency_overrides` only affects `Depends(...)` resolution inside requests. Settings are consumed at two points outside that:

- `db.py` builds `engine = make_engine(database_url())` at import time.
- `main.py` decides whether to mount `routers/testing.py` inside `create_app()`, and `app = create_app()` runs at import.

As a result:

- The AD-14 test ("`/api/test/*` returns 404 under the default config") and its positive counterpart (mounted when `app_env="test"`) cannot be written with the sanctioned mechanism. Authors will fall back to `monkeypatch.setenv("APP_ENV", …)` + `get_settings.cache_clear()`, or they will reload the module. The Rule lists "tests patching environment variables" as something it prevents, yet this pushes tests straight into it, and each story will pick a different workaround.
- "Construct `Settings(...)` directly" has nothing to plug into, because no function accepts one.
- Importing `app.main` under pytest runs `create_app()` with the developer's real env / `backend/.env`. If that file says `APP_ENV=test`, the session-scoped `application` fixture mounts the testing router, and the default-config 404 test becomes machine-dependent.
- "Invalid values fail at startup" is undefined when `get_settings()` is lazy and cached: it fails on first call, which may be the first request.

**Fix.** Make settings an explicit factory input:
- `create_app(settings: Settings | None = None)` uses `settings or get_settings()`, calls it eagerly (this is what "fails at startup" means), gates the testing router on `settings.app_env`, and builds the engine from `settings.database_url`.
- The engine is then no longer a module global. Either `create_app` stores it on `app.state` and `get_session` reads it from `request.app.state`, or `db.py` exposes a cached `get_engine()` keyed on the URL. The spine should pick one.
- Tests build the app with `create_app(Settings(_env_file=None, app_env=…, database_url=…))`. Reserve `dependency_overrides[get_settings]` for request-time consumers only, if any exist.
- State that `app = create_app()` at module level is the only uvicorn target, and that tests never import it. Today `conftest.py` imports `create_app`, which is fine, but `app.main` import still triggers the module-level app.

### F2 — `get_settings()` in `deps.py` creates an import cycle and contradicts the diagram · **high**

`deps.py` already imports `get_session` from `db.py`. The Rule says `db.py` takes its values from `deps.get_settings()`, which gives `db.py → deps.py → db.py`: a circular import at module load. It also means `alembic/env.py` would import `deps.py`, and through it `services/*` and FastAPI, just to read a URL. The diagram draws `DBM --> CF` (db.py → config.py), not db.py → deps.py, so the diagram and the Rule already disagree.

**Fix.** Define `get_settings()` (the `lru_cache`d accessor) in `app/config.py`, beside `Settings`. `db.py`, `main.py` and `alembic/env.py` import it from `config.py`. `deps.py` may re-export it if request-time injection is needed. Keep the diagram edges as drawn (`D --> CF`, `DBM --> CF`), and change the Rule's second bullet to "`config.py` exposes `get_settings()`…".

### F3 — The `backend/.env` source is under-specified: path resolution and extra keys · **high**

- **Path.** pydantic-settings resolves `env_file=".env"` relative to the **current working directory**. `uv run pytest` from `backend/`, `alembic` from `backend/`, the container at `/app`, and an IDE run from the repo root would each load a different file, or none. The repo root also has a committed `.env` (`COMPOSE_PROFILES=app`), which a root-CWD run would pick up instead.
- **Extras.** `BaseSettings` defaults to `extra="forbid"`, and unknown keys in a dotenv file raise `extra_forbidden`. Since `.env.example` is "the one list of every variable", the natural move is to copy it to `backend/.env`. That file contains `TEST_DATABASE_URL`, `APP_BIND`, `POSTGRES_*`, `API_UPSTREAM` and so on, so app `Settings` would refuse to start. The test-only `BaseSettings` has the mirror problem if it also reads the file.
- **Test settings source.** The Rule does not say whether the test-only `BaseSettings` reads `backend/.env`. One story will make it read the file and another will not, so `TEST_DATABASE_URL` in `backend/.env` works in one checkout and not the other.

**Fix.** Pin the `model_config` in the Rule: `env_file = Path(__file__).resolve().parents[1] / ".env"` (always `backend/.env`), `extra="ignore"`, no `env_prefix`, field names map case-insensitively to `DATABASE_URL`/`APP_ENV`. State that the test-only settings class uses the same `env_file` and `extra="ignore"`, and that it keeps the `_pytest` guard from the current `conftest.py`.

### F4 — Where defaults live is left open, and the Config row still says "inline in compose" · **medium**

The Rule's Prevents line includes "config defaults defined in two places", but it never says which place wins. Today the `DATABASE_URL` default exists in both `db.py` (`localhost:5432`) and `docker-compose.yml` (`db:5432`). `app_env="app"` is a code default, while the Config row says "defaults inline in compose". The Rule also does not say whether `database_url` is required (a missing value fails at startup) or has a code default (localhost). One unit will keep `DEFAULT_DATABASE_URL`, and another will make it required, so a local `uv run uvicorn` either connects to localhost or fails.

**Fix.** Pick one, for example: "`database_url` has no default (required) and a missing value fails at startup. `app_env` defaults to `"app"` in `Settings` only. Compose passes values through and never duplicates a code default. `.env.example` documents the local-dev value." Then reword the Config row to "defaults live in `Settings` (backend) or compose `${VAR:-…}` (compose-only vars), never both." Optionally type `database_url` so it must start with `postgresql+psycopg://` (AD-20).

### F5 — Alembic reads only `Settings`, so the AD-15 migration test has no sanctioned way to target its scratch DB · **medium**

AD-15's migration test "creates and drops its own scratch database" and runs `upgrade head` / `alembic check` against it. If `env.py` takes its URL only from `get_settings()`, the test must patch `DATABASE_URL` in the environment, which is exactly what AD-21 prevents. Two authors will resolve this differently (env patch, `cache_clear`, or `set_main_option`).

**Fix.** Add this to the Rule: "`alembic/env.py` uses `config.get_main_option('sqlalchemy.url')` (or `config.attributes['connection']`) when the caller sets it, and otherwise `get_settings().database_url`. The migration test passes its scratch URL through the Alembic `Config` object, never through the environment." `alembic.ini` must then not set `sqlalchemy.url`, which it does not today.

### F6 — The ignore and dockerignore entries are stated as fact but do not exist yet, and the dev bind-mount leaks the file · **low/medium**

Neither the root `.gitignore` nor `backend/.dockerignore` lists `backend/.env` / `.env` today, so the Rule's sentence "is gitignored and listed in `backend/.dockerignore`" is currently false. The Dockerfile only COPYs `app`, `alembic`, `alembic.ini` and `entrypoint.sh`, so the image is safe regardless. However, the AD-16 `dev` profile bind-mounts source into `backend-dev`, so `/app/.env` will be loaded there. Any key compose does not set (for example `APP_ENV=test` left in a developer's file) silently applies to `backend-dev` and mounts the testing router. That is one of the divergences AD-21 claims to prevent.

**Fix.** Phrase the ignore entries as obligations ("must be listed in…") and have the AD-21 story add them. In AD-16, require every backend service in compose to set `APP_ENV` explicitly (`app` for `backend`/`backend-dev`, `test` for `backend-test`), so real env always beats the file for the gate.

### F7 — Structural Seed and bindings nits · **low**

- The Seed tree omits `backend/.env` (uncommitted) and the test settings module. Name it, for example `backend/tests/settings.py`, so two test authors do not create it in different places.
- The `main.py` comment "mounts testing router only if APP_ENV=test" is fine, but after F1 it would read "if `settings.app_env == "test"`".
- AD-20's Rule lists what `deps.py` owns and what tests swap. After F2, add a one-line cross-reference ("settings: AD-21, via `config.py`") so AD-20 and AD-21 do not appear to compete over the same override mechanism.
- Stack: `pydantic-settings 2.15` is consistent with `Pydantic 2.13` (needs ≥2.7) and Python 3.14. `pyproject.toml` does not list it yet, which is expected, because the story adds it.

## What is sound

- It covers exactly the two direct env reads that exist (`db.py:13`, `conftest.py:15`), and the memlog confirms that nothing else reads the environment.
- `Literal["app","test"]` with a fail-closed default correctly hardens the AD-14 gate against typos.
- Separating `TEST_DATABASE_URL` from app `Settings` keeps the `_pytest` safety guard test-only and matches the user's choice.
- Env-over-file precedence matches pydantic-settings defaults and AD-16 (compose env wins).
- Scoping to backend only (the memlog constraint) keeps AD-2, AD-16 nginx `API_UPSTREAM` and frontend config untouched.
