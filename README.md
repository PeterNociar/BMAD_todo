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
- Only in this mode does the backend mount the test-only router (AD-14). Under `APP_ENV=app` every `/api/test/*` path is `404 not_found`, and the test-only code (`routers/testing.py`, `services/testing_task_service.py`) is never imported.
  - `POST /api/test/tasks {"text", "added_ago_ms", "completed_ago_ms" | null}` → `201` Task, with times relative to the server clock.
  - `POST /api/test/clock {"offset_ms": int}` → `204`; shifts the server clock (0 clears it).
  - `POST /api/test/reset` → `204`; deletes every task and clears the offset.
- The test stack has one server clock and one reset shared by every request, so E2E runs with one worker, and only one user (or suite) should drive a test stack at a time.

```sh
curl -s -XPOST -H 'content-type: application/json' -d '{"text":"old","added_ago_ms":90000000,"completed_ago_ms":null}' http://127.0.0.1:8082/api/test/tasks
```

### Infra smoke checks

`scripts/check-infra.sh` checks what no test suite reaches: the compose profiles themselves, and that nginx follows a recreated backend. Run it from the repo root with the test profile up (and the app profile too, if you want its probe), and with host ports `8000` and `5173` free:

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
scripts/check-infra.sh
```

It prints one `PASS`, `FAIL` or `SKIP` line per check and exits 1 if any check fails.

- **Test profile:** `POST :8082/api/test/reset` is `204`. If the app profile is running, `POST :8081/api/test/reset` is `404`. That probe is the only HTTP request it sends to the app stack (the dev check below does migrate the app's `db`).
- **Stale IP:** it briefly stops `backend-test`, starts `busybox` containers on the compose network (up to 8; Docker hands out the lowest free address, so the first ones fill any lower gaps) until one takes its IP, then starts `backend-test` again on a new IP. `GET :8082/api/health` must answer `200` within 15 s. If no squatter gets the old IP, the check reports `SKIP`.
- **Dev profile:** it starts `backend-dev` and `frontend-dev` (`--build`; the first `npm ci` takes a minute), checks that uvicorn runs with `--reload` and that `GET :5173/api/health` is `200` through Vite. `backend-dev` uses the app's `db`, so its start runs `alembic upgrade head` there, a no-op when `app` runs the same code. It then stops whichever of `db`, `backend-dev` and `frontend-dev` it started; any that were already running stay up.

On exit, even after a failure, it removes the squatters, makes sure `backend-test` is running and stops the dev-profile services it started (and only those). It resets the test stack's data, so don't run it during an E2E run.

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
npm run docs:format:check  # Prettier over ../docs with this config (docs:format to fix; format:check runs it too)
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

## QA reports

The hand-in QA reports live in `docs/`. Each one starts with its date, the commit it measured and the commands that produced it:

- [Coverage](docs/qa-coverage.md): backend, frontend and E2E coverage, and how each NFR-7 behaviour is tested.
- [Accessibility](docs/qa-accessibility.md): an axe sweep of every UI state, in light and dark, at 320 and 1280 px.
- [Security](docs/qa-security.md): findings with evidence, the fixes, probes and dependency audits.
- [Performance](docs/qa-performance.md): NFR-2 with 500 tasks, measured through the Chrome DevTools Protocol.

The accessibility sweep and the performance check are Playwright specs in `e2e/qa/`, with their own config (`e2e/playwright.qa.config.ts`), so `npm test` doesn't run them. Run them against the test profile:

```sh
COMPOSE_PROFILES=test docker compose up -d --build --wait
cd e2e
E2E_BROWSER_CHANNEL=chrome npm run qa    # about 5 minutes
```

They write their output to `docs/qa-artifacts/`. The summary JSONs the reports quote (`a11y-summary.json`, `perf-results*.json`) are committed. The bulky DevTools traces and the per-cell accessibility files are gitignored. `npm run qa` fails if any NFR-2 target regresses, including feedback with 500 rows under both motion settings.

## Phone access

The app has no login, so by default it listens only on `127.0.0.1`. To use it from your phone, put the laptop and the phone on the same [Tailscale](https://tailscale.com) tailnet. Then use one of the two options below.

Before either option, make sure the app profile is running the current code: `docker compose up -d --build`.

### Tailscale Serve (recommended)

Tailscale Serve gives you HTTPS, and only devices on your tailnet can reach the app. Keep `APP_BIND` at its default: Serve forwards to `127.0.0.1:8081` on the laptop.

1. In the Tailscale admin console, under **DNS**, turn on **MagicDNS** and **HTTPS Certificates**. You only need to do this once per tailnet. If you skip it, `tailscale serve` prints a link to enable them.
2. On the laptop, run `tailscale serve --bg 8081`. If it refuses with "Access denied", either run it with `sudo`, or once run `sudo tailscale set --operator=$USER`.
3. Run `tailscale serve status` to see the URL, `https://<machine>.<tailnet>.ts.net`, and open it on the phone. The first load can take a few seconds while the certificate is issued.
4. To stop, run `tailscale serve --https=443 off` (or `tailscale serve reset` to clear every Serve setting). Serve settings survive a reboot until you remove them.

### `APP_BIND`

1. In `.env`, set `APP_BIND` to the laptop's Tailscale IP, which `tailscale ip -4` shows.
2. Run `docker compose up -d`.
3. On the phone, open `http://<that IP>:8081`.

Be aware of three side effects:
- The port then listens only on that IP, so <http://127.0.0.1:8081> stops working on the laptop too. Use `http://<that IP>:8081` there as well. Tailscale Serve also stops working, because it forwards to `127.0.0.1:8081`.
- After a reboot, if Docker starts the containers before Tailscale has its IP, the frontend fails to bind and the app is down. Run `docker compose up -d` again once Tailscale is up.
- The connection is plain HTTP. The tailnet encrypts the traffic, but the browser doesn't treat the page as a secure context.
- Avoid `0.0.0.0` on untrusted networks: anyone who can reach the laptop could then use the app.

### Sync between devices

Each open tab re-reads the list every 30 s while it is visible, and straight away when you switch back to it. So a task added on the phone usually shows up in an idle laptop tab within 30 s, without a reload. A poll is skipped while that tab is saving a task of its own, so it can take up to a minute.

## Repository layout

```text
backend/    FastAPI app (app/), Alembic migrations, pytest suite, Dockerfile
frontend/   Svelte 5 + Vite SPA, Vitest suite, nginx template, Dockerfile
db-test/    init script that creates the todo_e2e database
e2e/        Playwright package
docs/       Exercise, original PRD, AI integration log, QA reports
_bmad-output/  BMad planning artifacts and ticket plans
```
