---
title: 'Walking skeleton through every layer'
type: 'feature'
ticket: '1'
created: '2026-09-30'
status: done
baseline_revision: 'ef37c720358be45dddb47564b717f2964f150371'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repo has only planning docs. No layer exists yet, so later stories have nothing to build on and nothing proves nginx → FastAPI → Postgres works end to end.

**Approach:** Scaffold `backend/`, `frontend/` and `e2e/` with their test and lint tooling, plus both Dockerfiles, the nginx template and the compose `app` profile with `db-test`. Stop at the thinnest real slice: GET `/api/tasks` + `/api/health` on a migrated DB, and a Svelte page showing the input and the empty state.

## Boundaries & Constraints

**Always:** The spine ADs, especially AD-1, AD-2, AD-15, AD-16 and AD-20, and the Stack versions. If a pinned version can't be resolved, use the nearest release and record it in Implementation Notes. Sync `def` endpoints with no CORS. Every backend route goes under `/api`. The frontend uses only relative `/api` URLs. The entrypoint runs `alembic upgrade head` and app code never calls `create_all()`. Health checks live in the Dockerfiles only, with `depends_on: service_healthy`. Both images run as non-root. UX copy is verbatim: placeholder "What needs doing?", visually hidden label "New task", empty state "Nothing waiting. Type a task above and press Enter.", wordmark "Todo" as an `h1`, `lang="en"`, title "Todo".

**Decisions (2026-09-30):** Docs and commands use `docker compose` (the Compose v2 plugin), and the README notes that it is the v2 form of `docker-compose up`. The user upgrades local uv with `uv self update` before `uv.lock` is created. The full plan is kept despite its roughly 1,900 tokens, because it is one tracer goal.

**Never:** POST/PUT/DELETE, `schemas/`, `clock.py`, `list_ordered`, the `.sssZ` serializer or the AD-5 exception handlers (entries 2–3). The testing router and the `dev` profile, or `backend-test` and `frontend-test` (entry 4). Store, toasts, focus, fonts or theme (later entries). `{@html}`. Epic or story refs in code comments.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Empty list | `GET /api/tasks`, no rows | `200 []` | — |
| One row | one Task in DB | `200 [{id, text, added_at, completed_at}]` | — |
| Healthy | DB reachable | `GET /api/health` → `200` | — |
| DB down | session `SELECT 1` raises | `503 {"detail", "code": "service_unavailable"}` | caught in the health router |
| UI empty | GET returns `[]` | input + empty-state text rendered | — |
| UI load fails | GET rejects | no empty state shown (the load-failure UI comes in a later entry) | swallowed, no crash |

</frozen-after-approval>

## Code Map

Greenfield: only `.gitignore` (already ignores `.idea/`, `_bmad/render/`) and `docs/` exist. Layout follows the spine's Structural Seed.

- `backend/app/{main,db,deps}.py`, `models/task.py`, `services/task_service.py`, `routers/{tasks,health}.py` -- factory `create_app()`; `get_session()` yields a sync SQLModel `Session` on `DATABASE_URL` (`postgresql+psycopg://`) with `TimeZone=UTC`; `get_task_service()`; `TaskService.list()` → `Task.list_all()` (a plain select, which entry 2 replaces)
- `backend/alembic/` -- baseline migration for `tasks` (`id uuid pk`, `text TEXT NOT NULL`, `added_at timestamptz NOT NULL`, `completed_at timestamptz NULL`, no DB defaults); file template `YYYY_MM_DD_HHMM-rev_slug`
- `backend/tests/conftest.py` -- `TEST_DATABASE_URL` (default `…@127.0.0.1:5436/todo_pytest`), `create_all` once per session, one rolled-back outer transaction per test (`join_transaction_mode="create_savepoint"`), one app per session, `app.dependency_overrides[get_session]`
- `frontend/` -- Vite `svelte-ts`; `src/lib/api.ts` (`Task` type, `listTasks()`); `src/App.svelte`; `nginx/default.conf.template`; `vite.config.ts`
- `e2e/` -- Playwright package, `baseURL` from `E2E_BASE_URL`, default `http://127.0.0.1:8081`

## Tasks & Acceptance

**Execution:**
- [x] `backend/pyproject.toml`, `uv.lock`, `app/**`, `alembic.ini`, `alembic/**`, `entrypoint.sh` -- the uv project with runtime and dev deps, ruff config, pytest config `--cov=app --cov-branch --cov-fail-under=70`, and the modules in the Code Map -- the backend spine
- [x] `backend/tests/{conftest,test_health,test_tasks}.py` -- cover the I/O matrix backend rows; the DB-down case overrides `get_session` with a session whose execute raises -- proves the contract
- [x] `backend/Dockerfile`, `.dockerignore` -- uv builder stage → `python:3.14-slim` runtime, non-root `app` user, AD-16 health check with `start_period` ≥ 30 s, entrypoint runs the migration then `uvicorn app.main:app --host 0.0.0.0 --port 8000` -- AD-15/16
- [x] `frontend/**` scaffold -- `package.json` scripts `dev`, `build`, `test`, `test:coverage`, `check` (svelte-check), `lint` (ESLint flat config with `svelte/no-at-html-tags` as an error), `format`; Vitest jsdom with `coverage-v8` thresholds of 70 over `src/lib` and `src/components`; `vite.config.ts` proxies `/api` to `http://${API_UPSTREAM ?? 'localhost:8000'}` with `server.host: true` -- AD-1/2
- [x] Spike -- install Vitest 5 + `@testing-library/svelte` 5.4 and render `App.svelte` in a test; if it fails, pin Vitest and coverage-v8 to 4.1, update the spine's Stack row and note it -- resolves the ticket's unknown
- [x] `frontend/src/lib/api.ts`, `src/App.svelte`, tests -- `listTasks()` GETs `/api/tasks`; App renders the header, input and list/empty state per the matrix; tests for api.ts and App -- the UI slice
- [x] `frontend/nginx/default.conf.template`, `Dockerfile` -- node:24 build → `nginxinc/nginx-unprivileged:1.30-alpine`; `listen 8080`; `client_max_body_size 64k`; `location /api/ { proxy_pass http://${API_UPSTREAM}; }`; SPA `try_files`; `X-Content-Type-Options nosniff` + `Referrer-Policy` on every response (`always`); CSP `default-src 'self'` on `location /` only; busybox `wget` health check -- AD-16
- [x] `docker-compose.yml`, `.env`, `.env.example` -- `db` (postgres:18, volume at `/var/lib/postgresql`, `pg_isready`), `backend`, `frontend` in profile `app` with `restart: unless-stopped` and `${APP_BIND:-127.0.0.1}:8081`; `db-test` in profile `test` with its own volume on `127.0.0.1:5436` and the `todo_pytest` DB; `.env` = `COMPOSE_PROFILES=app`; `.env.example` lists every variable with its default -- AD-16
- [x] `e2e/package.json`, `playwright.config.ts`, `tests/smoke.spec.ts` -- `npm test` runs one worker; the smoke test loads `/`, sees the input by its label and the empty-state text, and records no `securitypolicyviolation`
- [x] `README.md`, `docs/ai-log.md` -- README: prerequisites, setup, `docker compose up`, starting `db-test` + `uv run pytest`, frontend and e2e test and lint commands, phone access via `tailscale serve`/`APP_BIND`. ai-log: header plus an append-only `## Ticket 1 — Walking skeleton` section (agents, prompts, what AI missed)

**Acceptance Criteria:**
- Given a clean checkout with `.env`, when `docker compose up -d` runs, then `db`, `backend` and `frontend` all reach `healthy` and `http://127.0.0.1:8081` shows the input and the empty-state text.
- Given the stack is up, when `curl -I http://127.0.0.1:8081/` runs, then the CSP, `X-Content-Type-Options` and `Referrer-Policy` headers are present, and `/api/health` has no CSP.
- Given `db-test` is running, when `uv run pytest` runs in `backend/`, then all tests pass with coverage ≥ 70%.
- Given `frontend/`, when `npm test`, `npm run test:coverage`, `npm run check` and `npm run lint` run, then all pass; a `{@html}` added to a component fails lint.
- Given the app stack is up, when `npm test` runs in `e2e/`, then the smoke test passes.

## Implementation Notes

- **Resolved versions (2026-09-30):** Python 3.14.3, FastAPI 0.142.x, SQLModel 0.0.47, SQLAlchemy 2.0.54, Alembic 1.20.x, psycopg 3.3.6 (`[binary]`), uvicorn 0.54.0, Pydantic 2.13.5, pytest 9.1.1, pytest-cov 7.1.0, ruff 0.16.9, uv 0.12.21. Svelte 5.57.1, Vite 8.3.1, vite-plugin-svelte 7.3.1, TypeScript 6.0.3, svelte-check 4.7.6, Vitest 5.0.3, @vitest/coverage-v8 5.0.3, @testing-library/svelte 5.4.2, jsdom 30.1.1, @playwright/test 1.63.0. Every pinned version resolved, so the spine's Stack table is unchanged.
- **Spike result:** Vitest 5 + @testing-library/svelte 5.4 render `App.svelte` fine through the library's `svelteTesting()` Vite plugin, so the 4.1 fallback is not needed.
- **Test client:** the dev dependency is `httpx2`, not `httpx`, because Starlette 1.7 deprecates `httpx` for `TestClient`.
- **Row key:** `svelte/require-each-key` (ESLint recommended) forces a key. The list keys by `task.id`, which equals the AD-4 client `key` for tasks that come from a GET. The store entry must switch it to `key`.
- **Backend image:** the builder stage is `ghcr.io/astral-sh/uv:0.12-python3.14-trixie-slim`, which uses the same interpreter path as `python:3.14-slim`, so the copied `.venv` runs unchanged. The container runs as `app` (uid 999). The frontend runs as `nginx` (uid 101).
- **nginx headers:** a location with its own `add_header` does not inherit the server-level ones, so `location /` repeats `X-Content-Type-Options` and `Referrer-Policy` next to the CSP. `Referrer-Policy` is `no-referrer`.
- **Health response:** `GET /api/health` returns `200 {"status": "ok"}`, or `503 {"detail": "Database unavailable", "code": "service_unavailable"}`.
- **Verification environment:** host ports 5433 and 8080 were already in use on the dev machine (a local Postgres and llama-server). Verification ran through a throwaway compose override, not committed, that maps `db-test` to 55433 and `frontend` to 18080. The committed defaults are unchanged. Playwright's Chromium download timed out in the sandbox, so the smoke test ran against the system Chrome (`channel: 'chrome'`) through a temporary config, which was then deleted.
- **Also verified:** `alembic check` inside the backend container reports no drift. With `db` stopped, `/api/health` through nginx returns 503 `service_unavailable`, and it recovers once `db` is back. A `{@html}` added to `App.svelte` fails `npm run lint`. The root `.gitignore` gained Python and Node build and cache entries.

- **Review pass 1 patches (2026-09-30):** `test_health.py` overrides `exec`; `App.test.ts` waits a macrotask before its absence check, and the `tasks = []` mutant now fails; `e2e/tests/headers.spec.ts` checks the headers on `/` and `/api/health` through nginx; `conftest.py` exits unless the test DB name ends in `_pytest`; the README mentions `--build`; `.env.example` gains `E2E_BASE_URL`. The main session re-ran the checks on alternate ports (frontend 18080, pytest DB 55439): ruff, pytest 4/4 at 97%, svelte-check, ESLint, Prettier, Vitest coverage, build, 3 services healthy, e2e 3/3 on system Chrome. The bundled Chromium download still fails on this machine.

- **Host ports changed after build (2026-09-30, user request):** the app is now published on `127.0.0.1:8081` (was 8080) and `db-test` on `127.0.0.1:5436` (was 5433), so the stack runs beside the user's local Postgres (5432–5435) and llama-server (8080). The planned test-profile frontend moves from 8081 to 8082 (AD-16, entries 4 and 5). Ports inside the containers are unchanged.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-30): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 4 · low 9 · false 7 · maybe-false 1. There are no intent_gap or bad_plan entries, so there is no loopback: 6 patches, 1 deferral.

| # | Finding | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `test_health.py`: the `UnreachableSession.execute` override is never reached, because `Session.exec` calls `super().execute` | medium | patch | Reproduced: it raises `UnboundExecutionError`, not `OperationalError`, and passes only because both are `SQLAlchemyError`. Patch: override `exec` so the connection-failure path is tested. |
| 2 | `App.test.ts` load-failure test runs its assertion before the `.catch` and the DOM flush | medium | patch | Verification-gap showed a mutant (`tasks = []` in catch) that still passes. Patch: wait a macrotask before the absence assertion. |
| 3 | Nothing automated checks the nginx headers, the CSP scope, or `/api/health` through nginx | medium | patch | Pre-verified gap, plus intent-alignment's chain divergence. Patch: an e2e `request` spec for the headers on `/` and `/api/health`, including 200 through the proxy. |
| 4 | `conftest.py` runs `drop_all` against whatever `TEST_DATABASE_URL` names, and the README invites overriding it | medium | patch | Pointing it at the app DB wipes `tasks`. Patch: refuse unless the database name ends in `_pytest`. |
| 5 | The README "Run the app" section never says to rebuild after code changes | low | patch | The plan's own verification uses `--build`; a stale image is easy to hit. One-line doc fix. |
| 6 | `.env.example` lacks `E2E_BASE_URL` | low | patch | The claim "lists every variable" is otherwise false. One-line fix. |
| 7 | nginx resolves `backend` once at startup, so a recreated backend could 502 | maybe-false | defer | Unverified medium. It would be settled by recreating `backend` with a changed IP while `frontend` keeps running, then curling `/api/health`. Deferred. |
| 8 | Backend tests use `create_all`, not Alembic | low | reject | Real, but entry 2 adds the AD-15 migration guard test; `alembic check` in the container found no drift. The fix is more than a direct correction. |
| 9 | Frontend coverage gate only measures `api.ts` | low | reject | The scope `src/lib`/`src/components` is fixed by the spine's frontend-test convention, and `App.svelte` is the composition root. |
| 10 | `Task.list_all` has no ORDER BY | low | reject | Not reachable yet (no POST), and entry 2 replaces it with `list_ordered`. |
| 11 | `/api` without a trailing slash falls through to the SPA | low | reject | Only reached by typing it by hand; the client always calls `/api/...`. |
| 12 | `APP_BIND` set to a Tailscale IP may fail to bind at boot | low | reject | The README already recommends `tailscale serve` first; this is rare. |
| 13 | Health 503 missing from OpenAPI, OK body untested, traceback logged on each failed check | low | reject | The OpenAPI error shapes are entry 3's (AD-3/AD-5); the traceback is deliberate diagnostics; not a defect. |
| 14 | "`restart: unless-stopped` doesn't restart unhealthy containers" belongs in the README | low | reject | Not a defect of this change; Docker's behaviour is documented upstream. |
| 15 | Committed `.env` is a secret-leak trap | false | reject | AD-16 requires a committed `.env` with `COMPOSE_PROFILES=app`; credentials are local dev defaults. |
| 16 | `DATABASE_URL` duplicates the credentials | false | reject | Compose falls back to the defaults. The duplication is only in `.env.example` documentation; no caller diverges today. |
| 17 | Lockfiles missing from the diff | false | reject | They exist on disk and are not ignored; the review diff excluded them on purpose, and they are committed with the change. |
| 18 | ESLint allows Node globals in browser code | false | reject | `tsconfig.app.json` `types` has no `node`, so `npm run check` fails on `process` in `src/`. |
| 19 | `api.ts` does not guard against a non-array 200 body | false | reject | No reachable producer: the backend returns `list[Task]` via `response_model`. |
| 20 | `db.py` breaks on a non-Postgres URL | false | reject | AD-20 fixes the driver to `postgresql+psycopg`; nothing configures another one. |
| 21 | Plan Code Map is inaccurate / the status is stale | false | reject | The fix edits this build's plan; the status is managed by the workflow. |
| 22 | The smoke test proves only the empty-list path; no row crosses the whole chain | low | reject | Seeding a row end to end needs the AD-14 testing router (entry 4) and harness (entry 5). The `/api/health` proxy proof is added under #3. |

## Design Notes

The health router is the one route that reaches `db.py` directly (spine's allowed exception). It runs `session.exec(text("SELECT 1"))` and returns its own AD-5-shaped 503, because the global handlers come in entry 3. `GET /api/tasks` returns `list[Task]` straight from the table model for now; entry 2 adds `TaskRead` and the serializer.

## Verification

**Commands:**
- `cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green, coverage ≥ 70
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `docker compose up -d --build && docker compose ps` -- expected: 3 services healthy
- `cd e2e && npm test` -- expected: 1 passed

**Manual checks:**
- The user opens `http://127.0.0.1:8081` on a clean checkout (HITL ticket).
