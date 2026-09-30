# Review: AD-21 (Pydantic Settings) currency and reality check

- **Scope:** the uncommitted diff that adds AD-21, the Config convention row, the `pydantic-settings | 2.15` Stack row, `config.py` in the tree and the `CF` diagram nodes to `architecture-todo-app.md`.
- **Date:** 2026-09-30
- **Checked against:** PyPI JSON API (`pydantic-settings`, `pydantic`), pydantic-settings docs (pydantic.dev/docs/validation/latest/concepts/pydantic_settings/), FastAPI "Settings and Environment Variables" docs, `backend/pyproject.toml`, `backend/uv.lock`, current `backend/` code, and a scratch run of pydantic-settings 2.15.0 + pydantic 2.13.5 on CPython 3.14.3.

## Verdict

The versions and the named technology hold up: pydantic-settings 2.15 is current, supports Python 3.14, and resolves against the pinned lock without moving pydantic. Source precedence is stated correctly. Two library defaults the rule leaves unstated will break the design as written: `extra="forbid"` applies to dotenv files, and a relative `env_file` resolves against the current working directory and is skipped silently when missing. There is also a circular import in where `get_settings()` is placed. All of these can be fixed in a few lines of the rule.

## Confirmed facts

| Claim / dependency | Evidence | Status |
| --- | --- | --- |
| pydantic-settings 2.15 is current | PyPI: latest `2.15.0`, uploaded 2026-08-07. Earlier releases: 2.14.2 (2026-06-19), 2.14.1, 2.14.0 (2026-04-20) | Confirmed |
| Python 3.14 support | `requires_python >=3.10`, and the classifiers include `Python :: 3.14` | Confirmed |
| Pydantic requirement fits the Pydantic 2.13 pin | `requires_dist`: `pydantic>=2.7.0`, `python-dotenv>=0.21.0`, `typing-inspection>=0.4.0`. PyPI latest pydantic is `2.13.5`, which is what the lock has | Confirmed |
| Lock resolves | `uv add --no-sync "pydantic-settings~=2.15.0"` on a scratch copy of pyproject+lock: resolved 39 packages. pydantic stays `2.13.5`. It adds `pydantic-settings 2.15.0` and `python-dotenv 1.2.3` (`typing-inspection 0.4.4` is already there) | Confirmed |
| Precedence "real env vars, then `backend/.env`" | Scratch run: env var beats the dotenv value, the dotenv value beats the field default, and init kwargs beat both. This matches the documented order (init kwargs > env > dotenv > secrets dir > defaults) | Confirmed. `Settings(...)` in tests works as the rule says |
| `Literal["app","test"]` fails on bad values | `APP_ENV=Test` raises `literal_error`. Env *names* are case-insensitive by default (`case_sensitive=False`), but values are not | Confirmed. This does what the "mistyped APP_ENV" line in Prevents intends |
| `lru_cache`d `get_settings()` plus `dependency_overrides` | This is the pattern in FastAPI's own settings docs | Confirmed as idiomatic, with the placement caveat in F3 |
| Missing `env_file` | Scratch run: no file means no error and no warning, so defaults and env are used | Confirmed. The spine relies on this but does not say it (see F2) |
| Relative `env_file` path | Docs: "absolute or relative to the current working directory". Scratch run from a sub-directory: the `.env` one level up is ignored silently | Confirmed. The spine does not account for it (see F2) |

## Findings

### F1 — High: `extra="forbid"` (the default) applies to `backend/.env`, so the planned file contents make startup fail

The pydantic-settings docs say: "if you set the `extra=forbid` (*default*) … and your dotenv file contains an entry for a field that is not defined in settings model, it will raise `ValidationError`." In the scratch run, a `.env` holding `TEST_DATABASE_URL` and `POSTGRES_USER` failed with `extra_forbidden` for both. Extra keys in real environment variables are ignored. Only the dotenv source is strict.

AD-21 sets up exactly this collision:
- The app `Settings` and the test-only `BaseSettings` are both meant to hold values a developer keeps in `backend/.env`. If `TEST_DATABASE_URL` is in the file, the app `Settings` fails. If `DATABASE_URL` or `APP_ENV` is in the file and the test settings read it, the test settings fail.
- The rule points to root `.env.example` as "the one list of every variable". The obvious move is to copy it to `backend/.env`, and that file carries Compose-only keys (`COMPOSE_PROFILES`, `POSTGRES_*`, `API_UPSTREAM`, `E2E_BASE_URL`).

**Fix:** state in the rule that both settings classes use `SettingsConfigDict(env_file=…, extra="ignore")`. Say explicitly which file the test-only class reads: the same `backend/.env` with `extra="ignore"`, or none.

### F2 — Medium: a relative `env_file` resolves against the CWD and a missing one is skipped silently

`env_file=".env"` only finds `backend/.env` when the process runs from `backend/`. `uv run pytest` from `backend/` works. Any of the following silently drops the file and falls back to field defaults, with no error: `alembic -c backend/alembic.ini …` from the repo root, an IDE test runner rooted at the repo, or the AD-15 migration test calling Alembic from a different CWD. If `database_url` has a default, the process then connects to the wrong database without any warning. A default here is also a second copy of what compose already defines, which the rule's own Prevents line ("config defaults defined in two places") forbids.

**Fix:**
- Anchor the path: `env_file=Path(__file__).resolve().parent.parent / ".env"` (that is, `backend/.env`).
- Give `database_url` no default (a required field), so a missing source fails at startup. The current `DEFAULT_DATABASE_URL` in `app/db.py` then goes away.
- Keep `app_env`'s `"app"` default. That is the safe side for the AD-14 gate.

### F3 — Medium: `get_settings()` in `deps.py` creates an import cycle, and `dependency_overrides` cannot reach its import-time callers

- **Cycle:** `app/deps.py` already does `from app.db import get_session`. AD-21 has `db.py` take its URL from `deps.get_settings()`, so `db` imports `deps` and `deps` imports `db`. The diagram's `DBM --> CF` edge (db to config) is the direction that avoids the cycle, but the rule text puts `get_settings` in `deps.py`.
- **Override reach:** `app.dependency_overrides[get_settings]` only affects `Depends(...)` resolution inside requests. It has no effect on the three named consumers: `db.py` builds its engine at import time (`engine = make_engine(database_url())`), `create_app()` decides whether to mount the router before any request, and `alembic/env.py` is not a FastAPI request at all. The FastAPI docs example works only because its settings are read inside an endpoint.

**Fix:**
- Define `get_settings()` in `app/config.py` next to `Settings`. `deps.py` may re-export it for routers.
- Change the test sentence to: "Tests construct `Settings(...)` directly and pass it in (for example `create_app(settings)`), or call `get_settings.cache_clear()` after setting the environment. `dependency_overrides` applies only to request-time consumers."
- Better still, stop creating the engine at import time in `db.py` (build it lazily or in the app factory), so the settings choice is made when it is used.

### F4 — Low: Alembic `env.py` behind a cached `get_settings()` makes the AD-15 scratch-database test harder

The Consistency table says the migration test "creates and drops its own scratch database", so it must point Alembic at a URL that is neither `DATABASE_URL` nor, necessarily, `TEST_DATABASE_URL`. Suppose `env.py` reads only `get_settings().database_url`. Then the test has to change `DATABASE_URL` in `os.environ` and clear the cache, which is the "tests patching environment variables" pattern AD-21 says it prevents. And if pytest has already imported `app` with the cache filled, the change has no effect.

In the container, `backend/.env` is excluded by `.dockerignore`, so `env.py` gets `DATABASE_URL` from compose. That path is fine.

**Fix:** in `env.py`, take `config.attributes.get("database_url")` first (or `config.get_main_option("sqlalchemy.url")`), and fall back to `get_settings().database_url`. The migration test sets `cfg.attributes["database_url"] = scratch_url` on its `alembic.config.Config`. Add this to the AD-21 rule, since it lists `alembic/env.py` in Binds.

### F5 — Low: present-tense claims that are not yet true in the repo

- "`backend/.env` is gitignored": the root `.gitignore` has no `.env` pattern, and `git check-ignore backend/.env` matches nothing. Note that root `.env` is **committed on purpose** (AD-16, `COMPOSE_PROFILES=app`), so the fix must be the specific path `backend/.env`, not a bare `.env` pattern.
- "listed in `backend/.dockerignore`": it is not listed today.
- `pydantic-settings` is in the Stack table but not in `backend/pyproject.toml`.

**Fix:** either word these as requirements the first AD-21 story delivers, or make the changes now: add `backend/.env` to `.gitignore`, add `.env` to `backend/.dockerignore`, and add `"pydantic-settings~=2.15.0"` to `dependencies` (confirmed to resolve cleanly, see above). The `~=2.15.0` form matches how the other runtime deps are pinned.

## Not in scope / no issue found

- `BaseSettings` / `SettingsConfigDict` import from `pydantic_settings` is the current API. It has been split out of pydantic since v2, and nothing has been deprecated.
- The choice of pydantic-settings is consistent with FastAPI 0.142 docs. No competing FastAPI-native config mechanism has replaced it.
- No web confirmation was needed for Python 3.14, Pydantic 2.13 or FastAPI 0.142 themselves. They are already pinned and locked (`pydantic 2.13.5`, `fastapi 0.142.2`) and outside this update.
