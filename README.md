# Todo

A single-user todo app whose tasks change colour as they age. It has a Svelte 5 single-page app served by nginx, a FastAPI backend and PostgreSQL, all run locally with Docker Compose. The planning artifacts (brief, PRD, UX, architecture, spec and tickets) live in `_bmad-output/initiative-todo-app/`.

```text
browser ──> frontend (nginx, host :8081, static SPA + /api proxy) ──> backend (FastAPI :8000) ──> db (PostgreSQL 18)
```

## Prerequisites

- Docker Engine with the Compose v2 plugin (`docker compose`)
- [uv](https://docs.astral.sh/uv/) 0.12 or newer, for backend development (`uv self update` upgrades it). uv installs Python 3.14 itself.
- Node.js 24 LTS and npm, for frontend and E2E development

## Setup

```sh
git clone <this repo> && cd BMAD_todo
cp .env.example .env   # required: .env is not committed
```

`.env.example` lists every variable with its default. Copying it to `.env` is required: `.env` sets `COMPOSE_PROFILES=app`, and every compose service belongs to a profile, so without it `docker compose up` starts nothing. `.env` is gitignored, so keep local values such as `APP_BIND` there.

## Run the app

```sh
docker compose up -d
docker compose ps        # db, backend and frontend should all be "healthy"
```

Open <http://127.0.0.1:8081>. `docker compose up` is the Compose v2 form of `docker-compose up`, and either works if you have both installed.

- After code changes or a `git pull`, rebuild the images with `docker compose up -d --build`.
- The backend runs `alembic upgrade head` on every start, then starts uvicorn.
- API docs are at <http://127.0.0.1:8081/api/docs>.
- Logs: `docker compose logs -f backend` (or `frontend`, `db`).
- Stop: `docker compose down`. Data lives in the `db-data` volume; `docker compose down -v` deletes it (and `db-test-data`), so don't use `-v` unless you mean it.

## Compose profiles

Every service belongs to at least one profile (`db` is in both `app` and `dev`). `.env` picks the default (`COMPOSE_PROFILES=app`); a `COMPOSE_PROFILES` in the shell overrides it for one command.

| Profile | Services | Host ports (all on `127.0.0.1` unless `APP_BIND` says otherwise) |
|---|---|---|
| `app` | `db`, `backend`, `frontend` | `8081` → nginx (bound to `APP_BIND`) |
| `dev` | `db` (shared with `app`), `backend-dev`, `frontend-dev` | `8000` → uvicorn with `--reload`, `5173` → Vite |
| `test` | `db-test`, `backend-test`, `frontend-test` | `5436` → `db-test` (pytest), `8082` → nginx for E2E |

### Dev (hot reload)

```sh
COMPOSE_PROFILES=dev docker compose up -d --build --wait
```

- Open <http://127.0.0.1:5173>. Vite proxies `/api` to `backend-dev`, so <http://127.0.0.1:5173/api/health> answers through the proxy.
- `backend-dev` bind-mounts only `backend/app` and `backend/alembic`, read-only. uvicorn restarts when a file in `backend/app` changes. A new migration needs `docker compose restart backend-dev`, because migrations run at container start. A dependency change needs `--build`.
- `frontend-dev` is `node:24-alpine` with `./frontend` mounted. It runs `npm ci` into its own `node_modules` volume on every start (the host `node_modules` is never used), so the first start takes a minute.
- `dev` uses the same `db` and `db-data` volume as `app`, so both show the same tasks. `backend` and `backend-dev` both run `alembic upgrade head` at start, so run one of the two profiles at a time, and after adding a migration in dev, rebuild the `app` images (`docker compose up -d --build`) before going back to `app`.
- Stop: `COMPOSE_PROFILES=dev docker compose stop backend-dev frontend-dev`.

### Test (E2E stack)

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
```

- `backend-test` runs with `APP_ENV=test` on the `todo_e2e` database of `db-test`, and `frontend-test` serves it on <http://127.0.0.1:8082>. Its data never mixes with the app's.
- Only in this mode does the backend mount the test-only router (AD-14). Under `APP_ENV=app` every `/api/test/*` path is `404 not_found`.
  - `POST /api/test/tasks {"text", "added_ago_ms", "completed_ago_ms" | null}` → `201` Task, with times relative to the server clock.
  - `POST /api/test/clock {"offset_ms": int}` → `204`; shifts the server clock (0 clears it).
  - `POST /api/test/reset` → `204`; deletes every task and clears the offset.
- The test stack has one server clock and one reset shared by every request, so E2E runs with one worker, and only one user (or suite) should drive a test stack at a time.

```sh
curl -s -XPOST -H 'content-type: application/json' -d '{"text":"old","added_ago_ms":90000000,"completed_ago_ms":null}' http://127.0.0.1:8082/api/test/tasks
```

### Existing `db-test` volume: recreate it once

`db-test` creates `todo_e2e` from `db-test/init/01-create-e2e.sql`. Postgres runs init scripts only on an empty data directory, so a `db-test-data` volume created before this script existed has no `todo_e2e`, and `backend-test` fails to start. The volume holds only pytest scratch data, so recreate it once:

```sh
docker compose --profile test rm -sf db-test && docker volume rm todo_db-test-data
docker compose --profile test up -d --wait db-test
```

Remove only that volume. Never use `docker compose down -v`: it also deletes `db-data`, the app's tasks.

## Backend tests and lint

The backend tests run against their own Postgres, `db-test`, in the `test` profile. It is published on `127.0.0.1:5436` and has its own volume, so tests never touch the app's data. pytest uses the `todo_pytest` database; no compose service points at it.

```sh
docker compose --profile test up -d --wait db-test
cd backend
uv sync
uv run pytest                    # coverage gate: 70%, branch coverage on
uv run ruff check . && uv run ruff format --check .
```

Set `TEST_DATABASE_URL` (in the environment or in `backend/.env`) to point pytest at another database. The default is `postgresql+psycopg://todo:todo@127.0.0.1:5436/todo_pytest`.

### Running the backend outside Docker

The backend reads its configuration only through Pydantic Settings (`backend/app/config.py`). For local runs you can put the values in `backend/.env` instead of exporting them. That file is not committed (`.gitignore` covers it) and is never copied into the image (`backend/.dockerignore`).

- Keys it may hold: `DATABASE_URL` (required, no default), `APP_ENV` (`app` or `test`, default `app`) and `TEST_DATABASE_URL` (read only by the pytest settings). Other keys are ignored.
- Real environment variables always win over `backend/.env`.
- The file is found from the code, not the working directory, so it applies wherever you start the command.
- Compose sets `DATABASE_URL` and `APP_ENV` on every backend service, so `backend/.env` never decides them in a container.

The `db` service does not publish a port, so point `DATABASE_URL` at a Postgres you can reach from the host, then run:

```sh
cd backend
uv run alembic upgrade head
uv run uvicorn --factory app.main:create_app --reload
```

There is no module-level `app`: uvicorn builds it by calling `create_app()` (`--factory`).

## Frontend tests and lint

```sh
cd frontend
npm ci
npm test                 # Vitest + Testing Library (jsdom)
npm run test:coverage    # coverage-v8, thresholds 70% over src/lib and src/components
npm run check            # svelte-check + tsc
npm run lint             # ESLint; {@html} is an error
npm run format           # Prettier (format:check to verify only)
npm run dev              # Vite dev server on :5173, proxies /api to $API_UPSTREAM or localhost:8000
                         # (or run it in Docker: the dev profile above)
```

## End-to-end tests

The Playwright suite runs against the compose `test` profile (`frontend-test` on `:8082`), with one worker, because every test shares that stack's database and server clock. It never touches the app stack on `:8081`: each test starts with `POST /api/test/reset`, which only exists in the test profile, so pointing the suite at `:8081` fails with a `404` before any data is changed.

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
cd e2e
npm ci
npm run install:browsers    # first time only: downloads Chromium
npm run typecheck           # type-check the specs and the harness
npm test
```

Playwright doesn't read `.env`, so set these two variables in the shell:

- `E2E_BASE_URL` sets the target (default `http://127.0.0.1:8082`), for example `E2E_BASE_URL=http://127.0.0.1:8082 npm test`.
- `E2E_BROWSER_CHANNEL` runs an installed browser instead of the bundled Chromium, for example `E2E_BROWSER_CHANNEL=chrome npm test` when `install:browsers` can't download.

Every spec imports `test` and `expect` from `e2e/fixtures.ts`, not from `@playwright/test`. The harness resets the test data before each test, installs `page.clock` before the first navigation, and fails a test on any CSP violation. It also provides `seed()`, `advance(ms)` (moves the browser and server clocks together), `failApi()` and `expectNoA11yViolations()`. `tests/harness.spec.ts` shows each one in use; its CSP test is an expected failure.

## Phone access

The app has no login, so it only listens on `127.0.0.1` by default. There are two ways to reach it from a phone:

- **Tailscale Serve (recommended).** Run `tailscale serve --bg 8081` on the laptop, then open the `https://<machine>.<tailnet>.ts.net` URL on the phone. Only devices on your tailnet can reach it, and you get HTTPS.
- **`APP_BIND`.** Set `APP_BIND` in `.env` to an address of the laptop, such as its Tailscale IP, then run `docker compose up -d` again. Open `http://<that address>:8081` on the phone. Avoid `0.0.0.0` on untrusted networks, because anyone who can reach the laptop can then use the app.

## Repository layout

```text
backend/    FastAPI app (app/), Alembic migrations, pytest suite, Dockerfile
frontend/   Svelte 5 + Vite SPA, Vitest suite, nginx template, Dockerfile
db-test/    init script that creates the todo_e2e database
e2e/        Playwright package
docs/       Exercise, original PRD, AI integration log
_bmad-output/  BMad planning artifacts and ticket plans
```
