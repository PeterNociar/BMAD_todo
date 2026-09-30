---
title: Rubric review — Architecture Spine, Todo App
reviewed: architecture-todo-app.md (status draft, updated 2026-09-30), .memlog.md
sources checked: prd-todo-app.md, prd addendum, DESIGN.md, EXPERIENCE.md, brief addendum, docs/bmad_exercise.md
date: 2026-09-30
---

# Rubric review — Architecture Spine, Todo App

## Verdict

Strong, unusually tight spine. The hard divergence points are pinned with enforceable rules: the HTTP contract, error codes, ordering authority plus a shared fixture, the optimistic store, sync merge, clocks, test gating, migrations and the compose envelope. The mermaid diagrams are valid. It is **not yet ready to hand to builders**. There is one cross-AD contradiction: the CSP in AD-16 breaks three things other docs require. Two backend and operations dimensions are left undecided, and builders will diverge on them: sync vs async DB access, and where backend tests find Postgres. One clock-rule gap will break FR-11 and FR-4 ordering. All four fixes are small.

Severity scale: **High** = two units will diverge, or a stated requirement breaks as written. **Medium** = likely divergence or rework. **Low** = polish or a latent gap.

## Checklist results

| Criterion | Result | Notes |
|---|---|---|
| Fixes the real divergence points, misses none | Partial | Misses sync/async DB access and session wiring (F2), where the TS `Task` type lives (F9) and lint/format tooling (F12) |
| Every AD Rule is enforceable and prevents its divergence | Mostly | AD-8's rule causes the ordering bug in F3. AD-16's CSP contradicts AD-3 and the UX (F1). AD-5's closed code list is incomplete (F7) |
| Nothing under Deferred lets units diverge | Pass | All eight deferred items are either safe or owned by UX. The component tree is deferred to UX and the stories, which is acceptable |
| Covers FR-1..18, NFR-1..8 | Pass with gaps | Every FR is mapped. The map has no rows for NFR-1, NFR-2, NFR-3, NFR-6 or NFR-8, although they are in `binds` (F11). The UX wake-from-sleep trigger is dropped (F10) |
| Every dimension decided, deferred or open, incl. the operational envelope | Partial | Where backend tests run (F4), restart policy, backup and down-migration (F8) are undecided. The spine has no Open Questions section, although the memlog holds two pending confirmations (F6) |
| Mermaid diagrams valid | Pass | All three were inspected by hand: two flowcharts and one erDiagram. The syntax is valid (quoted edge labels, `[( )]` cylinders, `<br/>`, erDiagram attribute comment). The dependency diagram is incomplete against its own "only these arrows" rule (F5) |
| No internal contradictions | Fail (1 High, 2 Low) | CSP vs Swagger UI, theme no-flash and webfonts (F1). "One app per session" vs the AD-14 gating test (F7). Unknown-route 404 body vs the closed code list (F7) |

## Findings

### F1 — High — The AD-16 CSP `default-src 'self'` contradicts AD-3 and the UX spec

nginx sends `Content-Security-Policy: default-src 'self'`. If `add_header` is set at server level, it also applies to proxied `/api/*` responses. That breaks three committed things:

1. **`/api/docs` (AD-3).** FastAPI's Swagger UI page loads its JS and CSS from `cdn.jsdelivr.net` and bootstraps with an inline `<script>`. Both are blocked, so the page renders blank.
2. **Theme "applied before first paint, with no flash" (EXPERIENCE › Theme toggle).** The standard way to do this is a tiny inline script in `index.html` that reads `localStorage`. `script-src` falls back to `default-src 'self'`, so the inline script is blocked. One builder writes it inline and it silently fails. Another moves it to an external file and gets render-blocking behaviour. A third drops it.
3. **Webfonts (DESIGN › Typography: Inter + JetBrains Mono, preloaded, metric-matched fallbacks).** If they come from Google Fonts or any CDN, they are blocked. Nothing says they must be self-hosted.

**Fix:** Add to AD-16:
- The CSP applies only to the static `location /`, not to `/api/`. Alternatively, keep it global and serve Swagger UI assets from self-hosted paths.
- Fonts are self-hosted: bundled via `@fontsource/*` or files in `public/fonts`, with `font-src 'self'`.
- The pre-paint theme script is an external `/theme-init.js` loaded synchronously in `<head>`. The other option is a CSP hash for that one inline script; pick one.
- An E2E check asserts zero CSP violations on page load.

### F2 — High — Sync vs async DB access and session wiring are undecided

The spine fixes the layered shape (router → service → model) and names psycopg 3.3. It does not say whether routes and services are `def` with a sync `Session` or `async def` with `AsyncSession`. It also does not say where the engine and session dependency live, or how `TaskService(session, clock)` is built per request. psycopg 3 supports both modes. Two backend stories can pick differently. The test fixture from pytest-db-isolation (sync `sessionmaker` and connection-level rollback) only works with sync. The user's global memory defaults to sync (`get_db` yielding `Session`), but a builder without that memory will not know.

**Fix:** Add a short AD or convention row:
- Backend is sync: `def` endpoints, `sqlmodel.Session`.
- `app/db.py` owns the `engine` and `get_session()`.
- `app/deps.py` owns `get_clock()` and `get_task_service()`.
- Tests override `get_session` and `get_clock` via `app.dependency_overrides`.
- Add both files to the Structural Seed.

### F3 — High — Provisional timestamps from a 30 s-stale `now` mis-order optimistic tick and add (FR-11, FR-6)

AD-8 makes `clock.svelte.ts` the only `Date.now()` call site and says `now` updates every 30 s. AD-6 says pending tasks sort on "provisional timestamps taken from the frontend clock". Read literally, the store stamps a tick with `now`, which can be up to 30 s old.

Example: task A is ticked and confirmed at server time t+5 s. Task B is ticked at t+20 s and gets provisional `completed_at = t+0`. B sorts *below* A, which breaks FR-11 ("moves to the top of the completed tasks"). B then jumps when its tick is confirmed. Optimistic adds hit the same problem: a new task can sort above an open task added a few seconds earlier.

Builders will split. Some read `now` as the rule says. Others call `Date.now()` and break the single-call-site rule.

**Fix:** In AD-8, `clock.svelte.ts` also exports `read(): number`, a fresh reading from the same single call site, so it can still be faked. AD-6/AD-9 then say that provisional timestamps use `clock.read()`, never the reactive `now`. Add an ordering-fixture case: an optimistic tick after a confirmed one lands above it.

### F4 — Medium — Nothing defines where backend tests (and the migration test) reach Postgres

The convention says to run `uv run pytest` against `TEST_DATABASE_URL`, with the migration test on "a scratch database". AD-16 publishes no Postgres port in any profile:
- `dev` publishes 8000 and 5173.
- `test` publishes only 8081.
- `db` and `db-test` are internal.

So a host-side `uv run pytest` has no database to reach. It is also undefined whether the pytest DB is `db-test`, which E2E `reset` wipes, or a separate database. It is also undefined who creates and drops the scratch DB, and with what URL. The README story and each backend story will each invent an answer.

**Fix:** In AD-16, the `test` profile publishes `db-test` on `127.0.0.1:5433`. `TEST_DATABASE_URL` defaults to a dedicated `todo_pytest` database on it, created by an init script. The migration test creates and drops `todo_migration_check` through an admin URL. List the default in `.env.example`, and give the full sequence in the README: bring up the test profile, then run pytest and the E2E suite.

### F5 — Medium — The dependency diagram forbids dependencies the design needs

"Arrows are the only dependencies allowed", but the diagram has no arrows for these:
- routers → `clock.py`/deps (DI wiring for `TaskService`, and `POST /api/test/clock` sets the offset).
- `routers/health.py` → DB. Does health go through a service?
- `routers/testing.py` → models ("seeding goes through the model layer": direct, or via a service?).
- services → schemas (does `TaskService.add` take a `TaskCreate` or a `str`?).
- `main.py`, and the theme code (`localStorage`) on the frontend.

Builders must either break the rule or invent a route around it, and they will do that differently.

**Fix:** Add a `deps` node and the missing edges. Alternatively, state that `main.py` and `deps.py` are composition roots exempt from the rule. Also state:
- Services take primitives and return models. Routers map them to `TaskRead`.
- `TestingService` does the seeding and resets the clock offset.
- The health check calls `Task.ping(session)` or `db.ping()`.

### F6 — Medium — Pending confirmations are not surfaced; the spine has no Open Questions section

The memlog records two items that were never closed:
- `(assumption)` "'Yes' taken as keeping the beforeunload warning; confirm in review".
- `(decision)` loadState lifecycle: "New behaviour, UX to confirm".

The spine presents both as `[ADOPTED]` fact (AD-9, AD-10) and has no Open Questions section. That hides them from story slicing.

**Fix:** Add `## Open Questions` listing both, each with an owner and a default if unanswered. Alternatively, confirm them and log the confirmation.

### F7 — Low — AD-5's closed code list is incomplete, and one convention clashes with AD-14's test

- `GET /api/health` → `503` needs a `code`, and none is listed. Suggest `unavailable`, reusing the client-side code.
- Unknown routes and 405s from Starlette also need a code. This includes the `/api/test/*` → 404 that AD-14 asserts. Suggest `not_found` and `method_not_allowed`, or a catch-all `http_error`.
- "One app per session" (Backend tests) cannot cover AD-14's check: the testing router must be mounted in one test app and absent in another.

**Fix:** Complete the list and say it is exhaustive. Allow a second app built by the factory with `APP_ENV` unset, for the gating test only.

### F8 — Low — Operational envelope gaps

The following are not decided and not deferred:
- **`restart:` policy.** The phone-over-Tailscale use case needs the stack back after a laptop reboot.
- **Backup of the named volume.** SM-4 promises "nothing lost", and one `docker-compose down -v` loses everything.
- **Alembic downgrade policy.**
- **Base image tags.** Only "Python slim" is named. The Postgres image and Node build image are named only by version.
- **`POSTGRES_USER`/`POSTGRES_PASSWORD` and the volume name.** These are missing from the Config variable list, which claims to be complete ("Environment variables only (…)").

**Fix:**
- Set `restart: unless-stopped` for `app`.
- Defer backups with one line, plus a README warning about `-v`.
- Migrations are forward-only.
- Pin `python:3.14-slim`, `postgres:18-alpine` and `node:24-alpine`.
- Add the DB credential variables to the Config row and `.env.example`.

### F9 — Low — Where the frontend `Task` type lives is unspecified

Components need the `Task` shape and the `key`/pending fields, but the diagram does not allow C → `api.ts`.

**Fix:** Add `lib/types.ts` (wire `Task`, `ViewTask`, `ErrorCode`), importable by every module, and show it in the seed.

### F10 — Low — AD-8 drops the UX wake-from-sleep trigger

EXPERIENCE (Age Nudge; the UJ-3 failure path) also recomputes when "the timer sees a wall-clock gap much longer than its interval", and says labels update "at once" on wake. AD-8 lists only the interval, `visibilitychange`, `focus` and `pageshow`.

**Fix:** Add "or when a tick observes a gap > 2× interval" to AD-8. The same trigger should also start an immediate AD-10 poll.

### F11 — Low — The capability map is missing NFR rows

NFR-1, NFR-2, NFR-3, NFR-6 and NFR-8 are in `binds` but have no row. Where they live is implicit:
- NFR-1: axe in E2E, plus the UX floor.
- NFR-2: the 500-row budget and the Deferred note.
- NFR-3: UX.
- NFR-6: the Deferred note.
- NFR-8: README and docs.

**Fix:** Add one row per NFR.

### F12 — Low — Lint/format tooling and the component-test DOM environment are undecided

Parallel story agents will each pick their own lint/format and type-check tools, or none:
- Python: ruff or black.
- Frontend: ESLint, Prettier, `svelte-check`.
- The Vitest DOM environment: jsdom or happy-dom.

The result is style churn across units, which works against NFR-8.

**Fix:** Add a convention row: ruff (lint and format), `svelte-check`, Prettier with `prettier-plugin-svelte`, and Vitest `environment: 'jsdom'`. Commands go in the README.

### F13 — Low — Timestamp precision differs between the two ordering implementations

The server stores microseconds. `Date.parse` keeps milliseconds. Two timestamps that differ by less than 1 ms order by time on the backend but tie (and fall to `id`) on the frontend, so the shared `ordering-cases.json` can make the two suites disagree. The tie is rare in practice, but the fixture can trigger it.

**Fix:** In AD-7, the `Clock` truncates to milliseconds, and the serializer emits exactly 3 fractional digits. That also avoids parser differences with more than 3 digits in mobile browsers.

### Minor notes (no action required)

- AD-12 and AD-13 lack the `[ADOPTED]`/status tag that the other ADs carry.
- The AD-6 tie-break between a pending task (key) and a confirmed task (id) at equal timestamps is undefined. Suggest "confirmed before pending".
- AD-14: `POST /api/test/reset` should also clear the clock offset. Otherwise E2E tests leak server time into each other.
- AD-2: the Vite `server.proxy` target differs between host (`localhost:8000`) and container (`backend-dev:8000`). Reuse `API_UPSTREAM` with that default.
- The backend accepts `\n` in text sent directly to the API. The UX turns pasted line breaks into spaces on the client only. Consider normalising in `TaskCreate`.

## What is solid

- AD-3/AD-5/AD-11 together give a complete, branchable client contract, including failures that never reach FastAPI (413, 502–504, timeout).
- AD-6's single backend authority with a fixture-locked mirror is the right answer to the optimistic-ordering problem.
- AD-9/AD-10 hold up to adversarial walk-throughs of the confirmed-plus-queue model with sequence-stamped GET merge and tombstones: a GET racing a tick, an add confirmed during the initial load, and a delete racing a poll.
- AD-14's structural gating (import-time mount plus a 404 assertion) and AD-15's three-part migration guard are enforceable in CI.
- AD-16's profile table makes the "plain `docker-compose up` = app" behaviour explicit and keeps test data separate from real data.
