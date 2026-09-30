# Reconcile: docs/bmad_exercise.md vs architecture spine

Date: 2026-09-30
Inputs: `../architecture-todo-app.md`, `../.memlog.md`, `docs/bmad_exercise.md`, `../../brief-todo-app/addendum.md` (plus PRD NFR-1/2/4/7/8 and PRD addendum for cross-checks).

Scope: exercise deliverables and targets with architectural consequences. A gap is flagged only if two independent builders could reasonably diverge, or if a deliverable becomes hard to produce. Style and wording are out of scope. The spine is not edited here.

## Coverage table

| # | Exercise item | Spine status | Where |
|---|---|---|---|
| 1 | Structure for frontend, backend, tests | enabled | Structural Seed |
| 2 | Vitest unit tests + Playwright E2E | enabled | Conventions, Stack |
| 3 | Test commands configured in package.json | **missing** | G5 |
| 4 | Integration test per API endpoint | enabled, with gaps in DB sourcing | Conventions; G2 |
| 5 | API contract validation (Postman MCP or similar) | **ambiguous** | G9 |
| 6 | Component tests | enabled | Conventions (Vitest + Testing Library) |
| 7 | E2E: create, complete, delete, empty state, error handling; >=5 tests | mostly enabled (seeding AD-14, clock AD-8) | G6 (error injection, isolation) |
| 8 | Dockerfiles: multi-stage, non-root, health checks | partly enabled | AD-16; G3, G4 |
| 9 | Compose: networking, volumes, env config | partly enabled | AD-16; G1, G7 |
| 10 | Health endpoints; logs via `docker-compose logs` | enabled | AD-3 `/api/health`, AD-16 |
| 11 | Dev/test through env vars + compose profiles | **contradicts Compose semantics** | G1 |
| 12 | Coverage >= 70% meaningful | **missing** | G8 |
| 13 | Performance check (Chrome DevTools) | ambiguous | G11 |
| 14 | Accessibility audit, zero critical WCAG | enabled (axe in Playwright) | G10 (minor) |
| 15 | Security review (XSS, injection) | enabled (AD-13, AD-14, AD-16) | G12 (minor) |
| 16 | README with setup instructions | referenced (AD-16, Deferred CI) but not placed | G13 |
| 17 | AI integration log, QA reports, BMAD docs | **not placed** | G13 |
| 18 | Brief addendum stack (FastAPI, SQLModel, Alembic, Postgres) | enabled | Stack, AD-7, AD-15 |
| 19 | Brief addendum ordering (three tiers) | intentionally superseded by PRD FR-6 | AD-6. No action |

Count: 13 gaps (3 high, 6 medium, 4 low).

## Gaps

### G1 — HIGH — Compose profiles cannot "swap" services or "set" env as AD-16 describes

AD-16 says the `dev` profile *swaps* nginx for Vite and the `test` profile *sets* `APP_ENV=test` with its own DB volume. Compose profiles work differently: they only enable extra services. Services with no `profiles:` key always start. So `docker compose --profile dev up` runs nginx **and** Vite. `--profile test` starts the default `db`/`backend` (real volume, `APP_ENV` unset) next to whatever test services exist. A profile cannot change the env of an existing service. The nginx upstream name `backend` would then point at the wrong backend unless aliases are used.

Builders will diverge on several points: duplicate services (`backend-test`, `db-test`, `frontend-test`), override files (`-f docker-compose.test.yml`), a separate project name (`-p todo-test`, which namespaces volumes on its own), or giving every default service a profile (which breaks plain `docker-compose up`). The exercise wants "compose profiles" literally, and `docker-compose up` must still start the default app.

**Fix:** pick one mechanism and write it into AD-16. For example: default services have no profile. The `dev` and `test` profiles add separately named services (`frontend-dev`, `backend-dev`; `db-test`, `backend-test`, `frontend-test`) on their own network, or use a network alias `backend` so `nginx.conf` stays the same. Test services use volume `db_test_data`. State the published host port for each profile (e.g. default 8080, dev 5173 + 8000, test 8081) so the stacks can run side by side.

### G2 — HIGH — Where backend integration tests get their Postgres is undefined

The conventions say "Real Postgres, one rolled-back transaction per test". They don't say where that Postgres comes from: the compose `test` profile DB, a dedicated `db` for pytest, testcontainers, or a host Postgres. There is also no variable for it: `Config` lists only `DATABASE_URL`, `APP_ENV`, `APP_BIND`, while the user's pattern uses `TEST_DATABASE_URL`. There are two collisions:
- The AD-15 migration test needs an **empty** database for `upgrade head`. The fixture schema built with `metadata.create_all` must not live in that same database.
- If pytest shares the E2E test DB, `POST /api/test/reset` and the rollback fixtures step on each other.

**Fix:** add `TEST_DATABASE_URL` to Config. State that pytest runs against a dedicated database (e.g. `todo_pytest` on the test-profile Postgres, or a `docker compose run backend-test pytest`). State that the migration test creates and drops its own scratch database.

### G3 — HIGH — Container ports and non-root nginx are unspecified

The spine publishes host `:8080` but never gives the container ports: uvicorn's port (which the `nginx.conf` `proxy_pass` and the Vite proxy target depend on) and nginx's listen port. A non-root nginx cannot bind port 80. It needs an unprivileged port plus writable pid and temp paths, or the `nginxinc/nginx-unprivileged` image. One builder will run stock `nginx:1.30` as root on port 80 and fail the "non-root" deliverable. Another will switch images and ports.

**Fix:** state the internal ports (backend `8000`, nginx `8080`) and the runtime user or base image for each Dockerfile (e.g. `nginxinc/nginx-unprivileged:1.30`, python slim with a created `app` user). The spine already pins version 1.30.

### G4 — MEDIUM — Health checks are placed in compose, but the exercise wants them in the Dockerfiles, and the probe tooling is unspecified

The exercise says "Dockerfiles … with … health checks". AD-16 lists health checks only as compose `healthcheck`s. Python slim images have no `curl`/`wget`, so `/api/health` needs a probe (`python -c urllib…`, or installing curl, which grows the image). The `frontend fetches /` probe doesn't exercise the `/api` proxy. The dev-profile Vite service also needs a health check, because every `depends_on` uses `service_healthy`.

**Fix:** put `HEALTHCHECK` in both Dockerfiles (compose inherits it), name the probe command (python urllib for the backend, busybox `wget` for nginx), and require a health check on every service in every profile.

### G5 — MEDIUM — No test command contract ("configure test commands in package.json")

The spine defers commands to the README and names no scripts. The Python package tooling (pip + requirements vs uv/poetry with `pyproject.toml`) is also unset, and that choice shapes the multi-stage backend Dockerfile and how `pytest` is invoked. Builders will produce different script names, and some will add a root `package.json` or Makefile while others won't.

**Fix:** add a Conventions row with the command names:
- `frontend/`: `npm test`, `npm run test:coverage`, `npm run check`
- `e2e/`: `npm test` (brings up the test stack or expects it running; say which)
- `backend/`: `pytest` (with `--cov`)

Optionally add a root `package.json` whose `test` script runs all three. Name the Python dependency manifest and lock tool.

### G6 — MEDIUM — E2E error-handling and isolation strategy are open

The exercise requires an E2E test for error handling, and NFR-7 lists it too. The spine gives no way to make the backend fail. One builder will use Playwright `page.route` to fake 5xx/timeouts, and another will add fault-injection endpoints to `routers/testing.py`, which widens AD-14. `POST /api/test/reset` against one shared DB also makes parallel Playwright workers flaky.

**Fix:** state that failures are injected client-side with `page.route` (no backend fault injection), and that the E2E suite runs `workers: 1` (or `fullyParallel: false`) with a reset in `beforeEach`.

### G7 — MEDIUM — Env configuration defaults for a zero-setup `docker-compose up`

The success criterion is that `docker-compose up` works. Postgres needs `POSTGRES_USER/PASSWORD/DB`, and `DATABASE_URL` must be built from them. None of these are listed. If one builder requires a `.env`, a fresh clone fails. The dev-profile Vite proxy target also differs by context (`http://backend:8000` in a container, `http://localhost:8000` on the host). That means some config the spine's "frontend has no runtime config" rule doesn't cover, and builders will hard-code different targets.

**Fix:** require inline compose defaults (`${POSTGRES_PASSWORD:-todo}`) and a committed `.env.example`. Add a dev-only `VITE_API_PROXY` (or similar) env var used by `vite.config.ts` only, which doesn't break AD-2.

### G8 — MEDIUM — Coverage target has no tooling, threshold location or scope

The spine names no coverage tools (`pytest-cov`, `@vitest/coverage-v8`) and says nothing about whether 70% applies per package or combined, to lines or branches, or what is excluded (the Alembic `versions/`, `main.py` wiring, `routers/testing.py`). A builder who counts E2E would need instrumented builds. Without an enforced threshold the ">=70% meaningful" deliverable can't be checked.

**Fix:** add a Conventions row: backend `pytest-cov` with `--cov=app --cov-branch --cov-fail-under=70`; frontend Vitest `coverage.provider: 'v8'` with `thresholds` of 70 for lines and branches over `src/lib` + `src/components`; E2E excluded from the numbers. Reports go to a fixed path (see G13). Add both coverage tools to Stack.

### G9 — MEDIUM — API contract artefact for "Postman MCP or similar" validation

AD-3 is a prose table. FastAPI serves `/docs` and `/openapi.json` at root, so they are not reachable through nginx's `/api/*` proxy. The AD-5 error shape and codes won't appear in OpenAPI unless `responses=` are declared. Builders will differ on whether the schema is reachable and whether it matches AD-5, and the contract-validation step then has nothing reliable to import.

**Fix:** mount `openapi_url="/api/openapi.json"` and `docs_url="/api/docs"`. Declare an `ErrorResponse` schema (`detail`, `code`) on the 404/422/500 responses. Treat the OpenAPI document as the machine-readable contract that validation runs against.

### G10 — LOW — Accessibility audit scope is not pinned

Axe runs inside Playwright. The spine doesn't say which tags (`wcag2a`, `wcag2aa`, `wcag21aa`), which UI states get scanned (empty, populated with overdue items, toast visible, dark scheme, 360 px viewport), or whether the gate fails on critical only or on critical plus serious. The exercise wants a QA report as well as a test.

**Fix:** state the tags, the scanned states, and the gate (fail on `critical` and `serious`, report the rest). Write the axe JSON/summary to the reports folder.

### G11 — LOW — Performance check setup (NFR-2, 500 tasks) is unspecified

A DevTools check must run against the production build, which is nginx and not Vite dev. 500 tasks with varied ages can only be seeded through `/api/test/tasks`, which exists only in the test profile. That suggests the test stack, but the spine doesn't say so.

**Fix:** state that perf checks run against the test stack using a seed script (`e2e/scripts/seed-500.ts` or similar), and optionally add a Playwright perf smoke test that asserts render time under 200 ms.

### G12 — LOW — Security review surface beyond AD-13

XSS and SQL injection are covered. The spine doesn't mention nginx hardening (CSP / `X-Content-Type-Options` headers, `server_tokens off`, `client_max_body_size`), dependency audits (`npm audit`, `pip-audit`), or confirming FastAPI docs exposure (see G9). These are the usual findings in a review report, and builders will either skip them or add them ad hoc.

**Fix:** add a single line to AD-13/AD-16 listing the baseline nginx headers and the audit commands the security report runs.

### G13 — LOW — Deliverable documents have no home in the repo layout

The Structural Seed omits `README.md`, the AI integration log, the QA reports (coverage, accessibility, security, performance) and the BMAD process notes, even though AD-16 and Deferred both refer to the README.

**Fix:** add them to the seed. For example: `README.md`, `docs/ai-integration-log.md`, `docs/qa/{coverage,accessibility,security,performance}.md`, and a git-ignored `reports/` for generated output.

## Not flagged (checked, OK)

- Component tests: Vitest + `@testing-library/svelte`, with the clock faked through `lib/clock.svelte.ts`.
- Time control for age-dependent E2E: AD-8 `page.clock` + AD-14 seeding with `added_at`.
- Health endpoint semantics (200/503 via a DB ping) and logs through stdout.
- Test-router gating and its 404 guard test (AD-14). One caveat: "one app per session" means the gating test must build a second app through the factory with default settings. The spine already names `main.py` an app factory.
- Brief addendum stack constraints. The three-tier ordering was deliberately replaced by PRD FR-6.
