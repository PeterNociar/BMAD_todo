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
cp .env.example .env   # optional: the committed .env already sets COMPOSE_PROFILES=app
```

`.env.example` lists every variable with its default. The committed `.env` only sets `COMPOSE_PROFILES=app`, so a plain `docker compose up` starts the app.

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
- Stop: `docker compose down`. Data lives in the `db-data` volume; `docker compose down -v` deletes it.

## Backend tests and lint

The backend tests run against their own Postgres, `db-test`, in the `test` profile. It is published on `127.0.0.1:5436` and has its own volume, so tests never touch the app's data.

```sh
docker compose --profile test up -d --wait db-test
cd backend
uv sync
uv run pytest                    # coverage gate: 70%, branch coverage on
uv run ruff check . && uv run ruff format --check .
```

Set `TEST_DATABASE_URL` to point pytest at another database. The default is `postgresql+psycopg://todo:todo@127.0.0.1:5436/todo_pytest`.

To run the backend outside Docker against the app database, start `db` and set `DATABASE_URL`, then run `uv run alembic upgrade head` and `uv run uvicorn app.main:app --reload`.

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
```

## End-to-end tests

The Playwright suite runs against a running stack, with one worker.

```sh
docker compose up -d --wait
cd e2e
npm ci
npm run install:browsers    # first time only: downloads Chromium
npm test
```

`E2E_BASE_URL` sets the target (default `http://127.0.0.1:8081`).

## Phone access

The app has no login, so it only listens on `127.0.0.1` by default. There are two ways to reach it from a phone:

- **Tailscale Serve (recommended).** Run `tailscale serve --bg 8081` on the laptop, then open the `https://<machine>.<tailnet>.ts.net` URL on the phone. Only devices on your tailnet can reach it, and you get HTTPS.
- **`APP_BIND`.** Set `APP_BIND` in `.env` to an address of the laptop, such as its Tailscale IP, then run `docker compose up -d` again. Open `http://<that address>:8081` on the phone. Avoid `0.0.0.0` on untrusted networks, because anyone who can reach the laptop can then use the app.

## Repository layout

```text
backend/    FastAPI app (app/), Alembic migrations, pytest suite, Dockerfile
frontend/   Svelte 5 + Vite SPA, Vitest suite, nginx template, Dockerfile
e2e/        Playwright package
docs/       Exercise, original PRD, AI integration log
_bmad-output/  BMad planning artifacts and ticket plans
```
