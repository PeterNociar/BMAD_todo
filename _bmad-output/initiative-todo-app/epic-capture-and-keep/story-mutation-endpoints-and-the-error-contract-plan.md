---
title: 'Mutation endpoints and the error contract'
type: 'feature'
ticket: '3'
created: '2026-09-30'
status: 'built'
baseline_revision: '184324d759b16606494dccd6cfe66359922df884'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The API can only list tasks. There is no way to add, tick, untick or delete one. Errors also come back in FastAPI's default shapes, such as the 422 list, so the frontend (AD-5) has no machine `code` to branch on.

**Approach:**
- Add `POST /api/tasks`, `PUT /api/tasks/{id}/tick`, `PUT /api/tasks/{id}/untick` and `DELETE /api/tasks/{id}` per AD-3. Validate text in `TaskCreate` (AD-12), and stamp times only from the injected `Clock` (AD-7).
- Add exception handlers so that every non-2xx response the app produces is `{"detail": str, "code": str}`, and document that shape in OpenAPI at `/api/docs`.

## Boundaries & Constraints

**Always:**
- **Architecture:** AD-3, AD-5, AD-7, AD-11, AD-12, AD-13, AD-20 and AD-21.
- **Wiring:** routers stay skinny and receive `TaskService` only through `Depends(get_task_service)`. Queries are classmethods on `Task`, services commit, and every query is a SQLAlchemy expression (no string SQL).
- **Tick and untick** are idempotent. A repeated tick keeps the first `completed_at`, and a repeated untick stays `null`.
- **Text validation:** `TaskCreate.text` is trimmed and must be 1–2000 characters after trimming. More than 2000 gives `422 text_too_long`; empty after trimming, missing, or not a string gives `422 validation_error`. The DB column stays unlimited `TEXT`.
- **Error shape:** every app-produced non-2xx response is exactly `{detail, code}`. Codes are `text_too_long`, `validation_error`, `task_not_found`, `not_found`, `method_not_allowed`, `service_unavailable` and `internal_error`. There are no stack traces in responses, and unhandled errors are logged server-side.
- **Integration tests:** one per endpoint, with success and error cases, using a fixed `Clock` through `app.dependency_overrides[get_clock]`.

**Decisions (2026-09-30, user):**
- Framework errors get two new codes, noted in AD-5: an unknown route gives `404 not_found`, and a wrong method gives `405 method_not_allowed`.
- A malformed id in the path (not a UUID) gives `404 task_not_found`, the same as a missing id.

**Never:**
- The testing router or the clock offset (entry 1.4).
- Any frontend change (entries 1.6–1.9).
- Client-generated ids or client-sent timestamps.
- A length limit enforced in the DB or the frontend.
- CORS.
- Changing the `GET /api/tasks` order or its wire format.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add | `POST {"text": "  buy milk  "}` | `201` Task: `text` = `"buy milk"`, `added_at` = clock time, `completed_at` null, server UUID | — |
| Add at limit | text of exactly 2000 chars after trim | `201` | — |
| Too long | 2001 chars after trim | `422` | `{"detail": …, "code": "text_too_long"}` |
| Empty | `"   "`, `""`, missing `text`, `text: 5`, non-JSON body | `422` | `code: validation_error` |
| Tick | open task | `200`, `completed_at` = clock time | — |
| Tick twice | already ticked at T1, clock now T2 | `200`, `completed_at` still T1 | — |
| Untick | completed task | `200`, `completed_at` null | — |
| Untick twice | open task | `200`, unchanged | — |
| Delete | existing task | `204`, empty body; gone from `GET` | — |
| Missing id | tick, untick or delete with a valid unknown UUID | `404` | `code: task_not_found` |
| Malformed id | tick, untick or delete with `abc` as the id | `404` | `code: task_not_found` |
| Unknown route | `GET /api/nope` | `404` | `code: not_found` |
| Wrong method | `PATCH /api/tasks` | `405` | `code: method_not_allowed` |
| DB down | any mutation while the DB raises `OperationalError` | `503` | `code: service_unavailable` |
| Unhandled | a route raises an unexpected exception | `500`, no traceback in the body | `code: internal_error`, logged |
| OpenAPI | `GET /api/docs`, `/api/openapi.json` | 200; error responses reference the `{detail, code}` schema, not `HTTPValidationError` | — |

</frozen-after-approval>

## Code Map

- `backend/app/models/task.py` -- `Task` (UUID pk `default_factory=uuid4`, `text` TEXT, `timestamptz` columns without defaults) and `list_ordered(session)`. Add id lookup as a classmethod.
- `backend/app/services/task_service.py` -- `TaskService(session, clock)` stores `_clock`, which nothing uses yet, and has `list()`. Add `add`, `tick`, `untick`, `remove`. It raises a domain `TaskNotFound` for a missing id.
- `backend/app/schemas/task.py` -- `TaskRead` with the `.sssZ` serializer (`format_timestamp`). Add `TaskCreate` and an `ErrorResponse {detail, code}` model. `schemas/__init__.py` re-exports.
- `backend/app/routers/tasks.py` -- `GET ""` → `list[TaskRead]`. Add the four routes.
- `backend/app/routers/health.py` -- already returns its own `503 {detail, code: service_unavailable}`; keep that behaviour.
- `backend/app/main.py` -- `create_app(settings)` composition root; register the exception handlers here (for example from a new `app/errors.py`).
- `backend/app/deps.py` -- `get_clock()` returns `Clock()`; `get_task_service(session, clock)`.
- `backend/tests/conftest.py` -- the session `application`, `client` (overrides `get_session` with the rollback factory), and `db_session`. `tests/test_health.py` shows the `UnreachableSession` pattern for a DB-down session (override `exec`/`execute`).

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/schemas/task.py` -- `TaskCreate` with the AD-12 trim and length rules, so that >2000 is distinguishable as `text_too_long`; `ErrorResponse` -- request contract
- [x] `backend/app/models/task.py`, `services/task_service.py` -- id lookup; `add(text)`, `tick(id)`, `untick(id)`, `remove(id)` stamping only from `self._clock`; `TaskNotFound` -- domain behaviour
- [x] `backend/app/routers/tasks.py` -- `POST ""` 201, `PUT /{id}/tick`, `PUT /{id}/untick`, `DELETE /{id}` 204; declared error `responses` use `ErrorResponse` -- AD-3 surface
- [x] `backend/app/errors.py`, `main.py` -- handlers: request validation → 422 (`text_too_long` or `validation_error`), `TaskNotFound` → 404, DB `OperationalError` → 503, framework 404 → `not_found`, 405 → `method_not_allowed`, a malformed path id → 404 `task_not_found`, anything else → 500 `internal_error` (logged); OpenAPI 422 replaced by `ErrorResponse` -- AD-5
- [x] `_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md`, `.memlog.md` -- add `not_found` and `method_not_allowed` to AD-5's code list, and state in AD-11 that a malformed id is `404 task_not_found`; log the decision with `memlog.py append` -- the spine matches the code
- [x] `backend/tests/test_mutations.py` -- one test per matrix row for the four endpoints, with a fixed-clock override -- proves the matrix
- [x] `backend/tests/test_errors.py` -- DB-down 503 on a mutation, 500 `internal_error` from a throwaway `create_app` with a raising route (`TestClient(raise_server_exceptions=False)`), framework 404/405 shape, and the OpenAPI schema check -- error contract

**Acceptance Criteria:**
- Given `db-test` is up, when `uv run pytest` runs, then all tests pass with coverage ≥ 70%.
- Given the rebuilt stack, when a task is POSTed, ticked, unticked and deleted through nginx on `:8081`, then each call returns its AD-3 status and `GET /api/tasks` reflects it.

## Implementation Notes

- **Review pass 1 patches (2026-09-30):**
  - `TaskCreate` rejects NUL as `422 validation_error`.
  - `StaleDataError`/`ObjectDeletedError` map to `404 task_not_found`, with a forced-race test.
  - OpenAPI is post-processed from FastAPI's own generator and asserts no 422 on tick, untick and delete.
  - `ErrorResponse.code` is a `Literal` of the seven codes (an OpenAPI `enum`).
  - `health.py` uses `error_response`.
  - Tests cover the 401 and 502 fallbacks.
- **Verification (main session):** ruff clean; pytest 72/72 at 98%.
  - Through nginx on `:8081`: POST gives 201 with trimmed text and a `.sssZ` time; tick gives 200, and a second tick a second later keeps the same `completed_at`; untick gives 200 twice; delete gives 204, then 404 `task_not_found`.
  - Error paths: `abc/tick` gives 404 `task_not_found`, `/api/nope` 404 `not_found`, PATCH 405 `method_not_allowed`, 2001 characters 422 `text_too_long`, NUL 422 `validation_error`.
  - OpenAPI has no `HTTPValidationError`, and `/api/docs` returns 200.

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-09-30): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 17 · false 3 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 7 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | Text with a NUL character returns `500` (BH, ECH) | medium | patch | Reproduced: `POST {"text": "a\u0000b"}` gives `500 internal_error` (psycopg `DataError`). Patch: `TaskCreate` rejects NUL as `422 validation_error`, plus a matrix-style test. |
| 2 | OpenAPI never asserts that tick, untick and delete have no `422` (VG) | medium | patch | Pre-verified: a regression in `_only_path_id` would publish a 422 the app never returns. Patch: assert `"422"` is absent on those three operations. |
| 3 | A tick or untick racing a concurrent delete raises `StaleDataError`, so `500` (BH, ECH) | low | patch | Reproduced with two sessions: the commit raises `StaleDataError`. Rare (two devices within ms), but the fix is a mapping: `StaleDataError` and `ObjectDeletedError` give `404 task_not_found`. |
| 4 | The custom `openapi()` replaces FastAPI's generator, drops its arguments (servers, tags…), finds 422s by `str(response)` and iterates non-operation keys (BH, ECH) | low | patch | Direct correction: build from FastAPI's own `openapi()` output, then post-process only HTTP-method keys, matching the `HTTPValidationError` `$ref`. |
| 5 | `ErrorResponse.code` is a plain `str`, so OpenAPI doesn't list the codes (BH, IA) | low | patch | `Literal` of the seven AD-5 codes; entry 1.6's `lib/api.ts` gets a closed set. |
| 6 | `health.py` hand-builds its 503 body (BH) | low | patch | Direct correction: use `errors.error_response`. |
| 7 | The fallback branches for other HTTP statuses (other 4xx → `validation_error`, 5xx → `internal_error`) are untested (BH, VG, IA) | low | patch | Add a test raising `HTTPException(401)` and `(502)` on a throwaway app. |
| 8 | Two concurrent ticks can overwrite the first `completed_at` (BH, ECH) | low | reject | Needs two ticks on one task within the same ms from two devices; the per-task op queue (AD-9) serializes a single client. A conditional `UPDATE` is more than a direct fix. |
| 9 | Tick/untick race without a row lock (ECH) | low | reject | Same as #8. |
| 10 | Only `OperationalError` maps to 503; pool `TimeoutError`/`InterfaceError` give 500 (BH, ECH) | low | reject | Connection refused and dropped connections surface as `OperationalError` in psycopg 3; pool exhaustion is implausible for one user. The health route intentionally catches wider. |
| 11 | Code points vs UTF-16 in the 2000 limit (BH, IA) | low | reject | AD-12: the frontend never enforces the maximum, so only the server counts; nothing disagrees. |
| 12 | Zero-width-only text is accepted (ECH) | low | reject | Consistent with JS `trim()` on the client; a visibly blank but non-empty edge case with no reported need. |
| 13 | The path-`id` → 404 rule is not scoped to task routes (BH) | low | reject | Every `{id}` route is a task route, and no other resources are planned (spine scope). |
| 14 | Unhandled errors are logged twice (BH) | low | reject | Starlette's `ServerErrorMiddleware` re-raises by design; this is the documented behaviour. |
| 15 | `str(exc.detail)` would print a repr for dict details (BH) | low | reject | The app never raises `HTTPException` with a non-string detail. |
| 16 | OpenAPI test would crash on a `"default"`/`"4XX"` key (BH) | low | reject | The app emits neither. |
| 17 | The throwaway app's engine is never disposed in the 500 test (BH) | low | reject | Never connects; freed at process exit. |
| 18 | DB-down is simulated, not real (IA) | low | reject | The simulated `OperationalError` is the exact type psycopg raises; the health route's real-DB-stop check was run in 1.1. |
| 19 | The rendered `/api/docs` page is only checked by proxy (IA) | low | reject | The page is FastAPI's stock Swagger UI over the tested JSON; the verification run loads it through nginx. |
| 20 | Tests run in-process, not through nginx (IA) | false | reject | The plan's Verification runs the full curl sequence through `:8081`; the main session re-runs it after the patches. |
| 21 | A whitespace-padded string over 2000 that fits after trimming is untested (BH) | false | reject | `test_add_accepts_exactly_2000_characters_after_trim` pads a 2000-character string, which is exactly that case. |
| 22 | The plan's review bookkeeping is inconsistent (BH) | false | reject | The lenses were still running when it was read; this log is the triage. |
| 23 | (Raised by the implementer while patching #3.) A task deleted by another session between `commit()` and `refresh()` in `_save` still gives 500 (`InvalidRequestError`) | low | reject | Same two-device race as #3 but a narrower window, and the suggested fix (drop `refresh`) is untested. Revisit if it is seen in practice. |


## Design Notes

- **Telling `text_too_long` apart:** the 422 handler has to tell the length violation apart from every other validation error without parsing messages. One option is a custom error type raised from a `TaskCreate` validator (for example Pydantic's `PydanticCustomError("text_too_long", …)`), which the handler matches by `type`. Any other error in the request, or any other type, maps to `validation_error`.
- **Idempotent tick:** `tick` sets `completed_at` only when it is `null`, so a retried tick after a lost response keeps the original completion time and the client's order doesn't jump.
- **Malformed id:** either take the path id as `str` and parse it, raising `TaskNotFound` when it isn't a UUID, or keep the `UUID` path type and map a path-`id` validation error to 404 in the 422 handler. The second keeps `format: uuid` in OpenAPI. Other framework statuses aren't produced by this app; if one appears, 5xx maps to `internal_error` and 4xx to `validation_error`.
- **Delete returns `204` with no body.** A delete of a missing id is `404 task_not_found`; AD-11's "404 counts as success" is the client's rule (entry 1.8), not the server's.

## Verification

**Commands:**
- `docker compose --profile test up -d --wait db-test && cd backend && uv run ruff check . && uv run ruff format --check . && uv run pytest` -- expected: green, coverage ≥ 70
- `docker compose up -d --build --wait`, then `curl -s -XPOST -H 'content-type: application/json' -d '{"text":"x"}' http://127.0.0.1:8081/api/tasks` -- expected: `201` with a Task; then tick, untick and delete by its id return 200, 200, 204
- `curl -s http://127.0.0.1:8081/api/openapi.json | grep -c HTTPValidationError` -- expected: `0`
