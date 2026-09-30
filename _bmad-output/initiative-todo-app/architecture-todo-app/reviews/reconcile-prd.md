---
title: 'Reconcile: architecture spine vs PRD'
spine: ../architecture-todo-app.md
sources: [../../prd-todo-app/prd-todo-app.md, ../../prd-todo-app/addendum.md, ../.memlog.md]
date: 2026-09-30
findings: 16
---

# Reconcile: Architecture Spine vs PRD

Scope: PRD requirements, testable consequences, NFRs and addendum notes that have an architectural implication but are missing from the spine, only partly covered, or contradicted by it. Pure UX and visual items (FR-4 mechanics, colours, focus styling, copy) are left out on purpose.

Severity: **high** means an agent building from the spine will likely produce behaviour that fails a PRD consequence or an E2E gate. **medium** means a missing decision that two stories could settle differently. **low** means a traceability gap, an edge case or an unrecorded deviation.

## Summary

| # | Sev | Area | PRD anchor | Gap |
|---|---|---|---|---|
| 1 | high | Error handling | FR-16, FR-17, FR-18, AD-5 | Non-app failures (network, nginx 502/504/413) have no `{detail, code}` body and there is no fallback |
| 2 | high | Load / poll state | FR-5, FR-8, FR-17 | No load-status state machine; poll failures, Retry and toast auto-close are undefined |
| 3 | medium | Store ↔ input/toast contract | FR-1, FR-16, FR-18 | No defined way for a failed add's text to return to the input; toast state has no module |
| 4 | medium | Optimistic placement | FR-1, FR-6, FR-11, AD-6 | Provisional timestamps and tie-breaks for tasks that have no server `id` are unspecified |
| 5 | medium | E2E time | NFR-7, UJ-2, UJ-3, AD-7, AD-8 | Browser time is faked but server time is real, so a mutation made after advancing the clock gets inconsistent ages |
| 6 | medium | UTC serialisation | FR-15, addendum Timestamps | `timestamptz` comes back in the session time zone; nothing forces the output to `Z`; seed endpoint may accept naive datetimes |
| 7 | medium | Compose profiles | NFR-4, AD-16 | Profiles cannot "swap" services; the mechanism for a single `up` plus separate dev/test stacks is missing |
| 8 | medium | Quality gates | NFR-7, NFR-2, addendum QA reports | No coverage tooling or 70% threshold enforcement; no NFR-2 verification approach |
| 9 | medium | Exposure | NFR-5, §7 Non-Goals, AD-16 | `APP_BIND=0.0.0.0` undermines the "runs locally only" premise that justifies no auth |
| 10 | medium | E2E failure injection | NFR-7, FR-16, FR-17 | How E2E makes "the API unavailable" is not decided; shared DB + reset implies serial workers |
| 11 | low | Request timeout | FR-16, NFR-2 | No client fetch timeout; a hung backend keeps an op pending for about 60 s (nginx default) |
| 12 | low | Duplicate adds | FR-16, SM-4, AD-9, AD-10 | A POST that commits but reports failure gets re-added by the user, and the next poll then shows both |
| 13 | low | Trim semantics | FR-3 | JS `trim()` and Python `strip()` differ, so input the client sees as non-empty can come back as a `422` toast |
| 14 | low | Deviation record | addendum Live ages, FR-16 | Polling (AD-10) and the queued-add text rule (AD-9) depart from the PRD/addendum without saying so in the spine |
| 15 | low | Containers | NFR-4, addendum Dockerfiles | Non-root nginx needs a specific base image; the dev-profile Vite service also needs a health check |
| 16 | low | Open assumption | §6 Tone, FR-2 | `beforeunload` warning is an unconfirmed assumption (memlog) |

## Findings

### 1. high: non-app error responses break the "branch on `code` only" rule

- **PRD:** FR-16 ("With the API unavailable…"), FR-17 (load failure with the API unavailable), FR-18 (no raw error codes). Addendum Length safeguard ("reject … with a 4xx").
- **Spine:** AD-5 says every non-2xx *the app produces* is `{detail, code}` and that "the frontend branches on `code` only". In practice, "API unavailable" never reaches FastAPI. It shows up as a `fetch` rejection (network), nginx `502`/`504` with an HTML body, or nginx `413` when the body exceeds `client_max_body_size` (default 1 MB, so very large text is rejected by nginx before AD-12 runs). None of these carry `code`.
- **Risk:** the E2E error-handling paths hit exactly the case the spine leaves undefined. Agents will either crash on JSON parse or show inconsistent toasts.
- **Fix:** extend AD-5. `lib/api.ts` maps network errors, non-JSON bodies and missing `code` to client-side codes (e.g. `network_error`, `unavailable`). Optionally, nginx returns JSON for 502/504/413 (`proxy_intercept_errors` + `error_page`). Set `client_max_body_size` explicitly and add `unavailable`/`network_error` to the code list.

### 2. high: load / poll status state machine is missing

- **PRD:** FR-5 (loading state in place of the list, input usable), FR-8 (empty state only with zero tasks), FR-17 (persistent toast with Retry; no misleading empty state; closes itself when a retry succeeds; a failed retry keeps it).
- **Spine:** AD-10 defines merging but no store status. It says nothing on (a) how the store tells "loading", "loaded and empty" and "load failed" apart, (b) what a *poll* failure does after a successful load (toast every 30 s? silent?), (c) whether the 30 s poll keeps running while the load-failure toast is up, and whether a successful poll closes it, (d) which store action Retry calls.
- **Fix:** add a rule to AD-10 (or a new AD) with `status: 'loading' | 'ready' | 'load_failed'` exposed by `tasks.svelte.ts`. Only the initial load (and Retry) sets `load_failed`. Poll failures after `ready` stay silent. Any successful GET moves to `ready` and closes the load-failure toast. Retry = immediate GET, still one in flight.

### 3. medium: store ↔ input / toast contract for failed adds

- **PRD:** FR-1/FR-16/UJ-1 (failed add: text back in the input), FR-16 (if the user already typed new text, keep it; the toast shows the failed task's text), FR-18 (toasts non-blocking, live region).
- **Spine:** AD-9 makes the store the only mutator of task state and says "a toast is shown", but input text is component state and there is no toast module in `lib/` (Structural Seed lists only `api`, `tasks`, `sort`, `clock`, `age`). Nothing says who owns the toast queue, how the store tells the input "restore this text unless it is non-empty", or where the failed text comes from.
- **Fix:** add a `lib/toasts.svelte.ts` (one queue, with `persistent` for FR-17) to the seed and the dependency diagram. Define the add-failure signal: e.g. `add()` returns a promise that rejects with `{text}`, or the store exposes a `restoreInput` event. State the rule "restore into the input only if it is empty, otherwise put the text in the toast" in one place.

### 4. medium: provisional timestamps and tie-breaks for optimistic tasks

- **PRD:** FR-1 (new task appears immediately, "now"), FR-6 (exact order), FR-11 (ticked task goes to the top of completed), addendum Optimistic updates (exact position on rollback).
- **Spine:** AD-6 sorts by timestamps with a tie-break on `id`, and AD-3 says the client never sends timestamps. It does not say what `added_at` an optimistic add has before the POST returns (it has no `id` either), or what `completed_at` an optimistic tick gets. Without that, `sort.ts` cannot place pending tasks, and the ordering fixtures cannot cover them.
- **Fix:** state in AD-6/AD-9 that pending ops use `clock.now` for provisional timestamps (display only, never sent), that tasks without an `id` sort after equal-timestamp tasks with one (or tie-break on `key`), and that the confirmed server fields (timestamps *and* `text`) replace the provisional ones on confirmation. Add at least one pending-task case to `contracts/ordering-cases.json`, or say it is FE-only.

### 5. medium: E2E time is split between a fake browser clock and a real server clock

- **PRD:** NFR-7 ("Tests can control the current time"), UJ-2 (tick an overdue task → "done now"; untick → still red), UJ-3 (task crosses 24 h while open).
- **Spine:** AD-8 fakes browser `now` via `page.clock` (moving forward only). AD-7 injects a fixed clock only in backend unit tests; the E2E backend uses real time. If a test advances `page.clock` (e.g. UJ-3) and then ticks or adds, the server stamps real time. The optimistic "done now" then turns into "done 1d" on confirmation, or a new task shows a future timestamp clamped to "now".
- **Fix:** pick one. (a) Rule: E2E sets age through AD-14 seeding only and advances `page.clock` only after the last mutation in a test. (b) Add `POST /api/test/clock` to the AD-14 router so the test-profile `Clock` can be set to match the browser. Write whichever is chosen into AD-8/AD-14.

### 6. medium: UTC `Z` output is not guaranteed by the storage choice alone

- **PRD:** FR-15 (every timestamp ISO 8601 with `Z`, never bare local). Addendum: "Make sure FastAPI/Pydantic does not emit naive datetimes."
- **Spine:** AD-7 says columns are `timestamptz` and responses serialise with `Z`, but gives no mechanism. psycopg returns `timestamptz` in the connection's session `TimeZone`. If the DB or container isn't UTC, values come back as `+02:00`, and Pydantic emits `+02:00`, not `Z`. The AD-14 seed endpoint accepts `added_at` from tests and could store naive values as local time.
- **Fix:** add to AD-7: force the session time zone to UTC (connection option `timezone=UTC` or `PGTZ`), and/or have a `TaskRead` serializer convert to UTC and emit `Z`. Seed/request schemas reject naive datetimes (`AwareDatetime`). Add an integration test asserting the `Z` suffix.

### 7. medium: compose profile mechanics are not buildable as written

- **PRD:** NFR-4 (single `docker-compose up`; dev/test via env vars and compose profiles), FR-14 (data survives down/up), addendum compose deliverable.
- **Spine:** AD-16 says the dev profile "swaps nginx for the Vite dev server" and the test profile "sets `APP_ENV=test` and uses its own DB volume". Compose profiles only *add* services: a service with no profile always starts, so `--profile dev` would run nginx *and* Vite, and the test profile cannot change the env or volume of the default `backend`/`db`. The E2E target URL/port is also unspecified.
- **Fix:** name the mechanism. For example: default services carry profile `app` with `COMPOSE_PROFILES=app` in `.env`, so a bare `up` still works; `dev`/`test` use separate services (`backend-test`, `db-test` with a `pgdata-test` volume, `frontend-dev`) or override files. Also fix the published port for the test stack that Playwright's `baseURL` uses.

### 8. medium: coverage gate and performance verification are unplanned

- **PRD:** NFR-7 (≥70% meaningful coverage), NFR-2 (100 ms feedback, <300 ms API, 500 tasks render <200 ms), addendum QA reports (coverage, accessibility, security, Chrome DevTools performance).
- **Spine:** conventions list the test runners but not coverage tooling (`pytest-cov`, `@vitest/coverage-v8`), whether 70% applies per package or combined, or where the threshold fails the build. Nothing covers how NFR-2 is checked. The Deferred note "500 rows is well within budget" is an assertion with no check.
- **Fix:** add a Consistency Conventions row: coverage per package (backend, frontend) with the threshold in `pyproject.toml`/`vitest.config.ts`. Add one Playwright perf check seeding 500 tasks through AD-14, measuring render time and action feedback. Name the output locations for the QA reports.

### 9. medium: `APP_BIND=0.0.0.0` conflicts with the premise behind "no auth"

- **PRD:** NFR-5 ("No authentication, which is acceptable because the app runs locally only and is not exposed publicly"), §7 ("Not hosted publicly").
- **Spine:** AD-16 allows phone access via `tailscale serve` *or* `APP_BIND=<tailscale ip|0.0.0.0>`. `0.0.0.0` exposes an unauthenticated, writeable API (including delete) to every network the laptop joins (café Wi-Fi, etc.).
- **Fix:** drop `0.0.0.0` from the documented options (allow `127.0.0.1` or the Tailscale IP only, with `tailscale serve` preferred), or add a README warning and record the deviation from the NFR-5 premise in the spine.

### 10. medium: E2E failure injection and isolation are undecided

- **PRD:** NFR-7 (E2E covers error handling), FR-16/FR-17 consequences ("With the API unavailable…", "retrying after the API recovers").
- **Spine:** says nothing on how E2E makes the API unavailable and then recovers it. Stopping the backend container breaks the stack for later tests. Playwright `page.route` on `/api/*` works cleanly because of the single origin (AD-2). Also, one shared test DB with `POST /api/test/reset` means Playwright must run with `workers: 1` (or per-worker data isolation).
- **Fix:** add to the E2E convention: failure via `page.route` abort/fulfil (5xx and network error); reset per test; serial workers.

### 11. low: no client request timeout

- **PRD:** FR-16 (reverts on failure), NFR-2.
- **Spine:** does not set a fetch timeout. If the backend hangs, nginx's default `proxy_read_timeout` (60 s) decides when rollback happens, and per-task queues (AD-9) stay blocked for that time.
- **Fix:** `lib/api.ts` uses `AbortSignal.timeout(n)` (e.g. 10 s) and maps it to the same client code as finding 1. Align the nginx proxy timeouts.

### 12. low: a failed-but-committed add creates a duplicate after the next poll

- **PRD:** FR-16 (text back in the input; user presses Enter again), SM-4 (nothing lost).
- **Spine:** AD-9 (no auto-retry; POST not idempotent) plus AD-10 (30 s poll). If a POST commits but the response is lost (timeout/504), the UI rolls back and the user re-adds. The next poll then brings back the original, so there are two copies. Nothing is lost, but the UI contradicts itself.
- **Fix:** either accept it and record it in Deferred, or send the client `key` as an `Idempotency-Key` / `client_key` unique column so a repeated POST returns the existing task. The second option also helps NFR-6-era multi-device use.

### 13. low: trimming semantics differ between client and server

- **PRD:** FR-3 ("Empty or whitespace-only input … does nothing: no task, no error message"; "2,000 characters or fewer is always accepted").
- **Spine:** AD-12 has the frontend trim and the backend trim. JS `String.prototype.trim` and Python `str.strip` use different whitespace sets (e.g. `\x1c`–`\x1f` are stripped by Python and not JS; `﻿` the reverse). Input the client sees as non-empty can therefore come back as `422 validation_error`, which shows a toast, against FR-3. Nor does the spine say "character" means code points (Python `len`) or UTF-16 units.
- **Fix:** define one whitespace set in AD-12 (e.g. the backend strips with the same set as JS `trim`) and say the 2,000 limit counts Unicode code points. Optionally, treat `validation_error` on add like an empty add (silent).

### 14. low: unrecorded deviations from PRD and addendum

- **Polling:** the addendum says "With a single user and a single tab, server polling is not needed". AD-10 adds 30 s polling because of the phone-plus-laptop constraint (memlog line 30), which is not in the PRD. The spine should state this as a deliberate deviation and its source, so the PRD owner can fold multi-device use into PRD §2.
- **Queued-add text rule:** AD-9 says a failed add with queued ops returns no text to the input ("UX rule"). This departs from the literal FR-16/UJ-1 "text is back in the input". Cite the EXPERIENCE.md section it comes from.
- **Tick/untick 404:** AD-11 removes the task with no rollback toast, a refinement of FR-16 ("reverts … and shows a toast"). This is fine, but mark it as a refinement.
- **Fix:** add a short "Deviations from sources" note or inline source refs in AD-9/AD-10/AD-11.

### 15. low: non-root nginx and complete health checks

- **PRD:** NFR-4 (container health checks for *all* services), addendum (multi-stage, non-root users, health checks).
- **Spine:** AD-16 requires non-root images, but the official `nginx` image runs its master as root, and a non-root nginx can't bind port 80. The spine's 8080 fits, but the base image and listen port aren't named. The `dev`-profile Vite service has no health check listed. The frontend health check (`fetch /`) needs a tool that exists in the image (`wget` in alpine).
- **Fix:** name `nginxinc/nginx-unprivileged` (listen 8080) in AD-16 and add health checks for the dev services.

### 16. low: `beforeunload` warning is still an unconfirmed assumption

- **PRD:** §6 (calm, nothing competing for attention), FR-2 (no interruptions); nothing in the PRD asks for a warning.
- **Spine:** AD-9 adopts the `beforeunload` warning while ops are pending, but memlog line 34 records it as an assumption ("confirm in review").
- **Fix:** confirm with the user, then drop the assumption marker, or remove the rule.

## Checked and covered (no finding)

FR-2 focus never moved by sync (AD-10); FR-3 server-side limit and 4xx (AD-12, AD-5); FR-6 canonical order and fixture lock (AD-6); FR-7 30 s + `visibilitychange` (AD-8); FR-10 spoken age (AD-8); FR-12 original `added_at` kept (AD-3/AD-7); FR-13 permanent delete (AD-3, AD-11); FR-14 named volume and Alembic (AD-15, AD-16); FR-15 negative-age clamp (AD-8); addendum temp client ID (AD-4); addendum test-only seeding (AD-14); NFR-1 axe in E2E (conventions); NFR-5 XSS and parameterised queries (AD-13); NFR-6 accounts deferred cleanly; NFR-8 README (Deferred / AD-16).
