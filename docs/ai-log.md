# AI Integration Log

This log records how AI agents were used to build the Todo app: which agents and prompts, which MCP servers, how tests were generated, where AI helped with debugging, and where human judgement was needed. There is one section per ticket. Sections are append-only: later tickets add new sections and never rewrite earlier ones.

## Ticket 1 — Walking skeleton

**Agents.** A Claude Code subagent (Claude Opus) implemented the ticket plan `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-walking-skeleton-through-every-layer-plan.md`, which came out of the BMad build workflow. It first loaded the architecture spine and EXPERIENCE.md, as the plan's `context:` list requires.

**Prompt that worked.** "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start. Report what you changed, how you verified it, and anything left incomplete or risky." The plan's "Never" list mattered as much as its task list: it kept the agent from building ahead into later tickets (schemas, the clock, the store, toasts).

**MCP servers.** None for this ticket. Verification used the shell: `docker compose`, `curl`, pytest, Vitest and Playwright.

**Test generation.** The AI wrote the backend tests from the plan's I/O matrix: empty list, one row, healthy, and DB down (a `Session` subclass whose `execute` raises). It wrote the frontend tests for `api.ts` and `App.svelte`, including a load-failure case with no empty state and a task text containing HTML, which must render as plain text. It also wrote the Playwright smoke test that fails on any `securitypolicyviolation`.

**Debugging with AI.**
- The first App tests leaked DOM between tests. The fix was Testing Library's `svelteTesting()` Vite plugin, which adds automatic cleanup and the browser resolve condition.
- svelte-check did not know the jest-dom matcher types until `@testing-library/jest-dom/vitest` was added to `tsconfig.app.json` `types`.
- Starlette deprecated `httpx` for its TestClient, so the dev dependency is `httpx2`.

**What AI missed or could not do.**
- The default host ports (`5433` for `db-test`, `8080` for the app) were already taken on the dev machine by a local Postgres and another server. The agent kept the committed defaults and verified through a throwaway compose override on other ports. A human should confirm the stack on the real ports.
- The Playwright browser download timed out in the agent's sandbox, so the smoke test was run against the system Google Chrome (`channel: 'chrome'`) through a temporary config. The committed config uses Playwright's bundled Chromium.
- ESLint's `svelte/require-each-key` forced a key on the task list. The spine says rows key by a client `key`, which does not exist yet. For tasks that come from a GET the key is the server `id`, so the list keys by `id` until the store arrives.

**Review.** Four independent reviewer subagents (blind, edge-case, verification-gap and intent-alignment lenses) read the diff. The main session checked each of their 22 findings against the code before acting on it.
- AI-written tests that passed for the wrong reason:
  - The DB-down test overrode `Session.execute`, which SQLModel's `exec` bypasses, so it passed on an unrelated `UnboundExecutionError`.
  - The load-failure App test asserted before the rejection was handled. A mutant that shows the empty state after a failed load still passed.
- Safety and verification gaps that were then fixed:
  - pytest would `drop_all` on any database named by `TEST_DATABASE_URL`; it now refuses unless the name ends in `_pytest`.
  - The nginx headers were checked only by a manual curl; `e2e/tests/headers.spec.ts` now checks them.
- About two thirds of the findings were rejected on evidence: they were false, deliberate spine decisions, or owned by later tickets. One unverified finding (nginx caching the backend IP) went to `deferred-work.md`.
- Follow-up: after the build, the user moved the host ports so the stack runs beside a local Postgres and llama-server: the app to `8081`, `db-test` to `5436`, and the planned test frontend to `8082`. The agent flagged that the architecture had already reserved 8081 for the test frontend, and the user chose how to split the ports.

## AD-21 — Backend settings through Pydantic Settings

**Agents.** The architect persona (bmad-architecture, update mode) added AD-21 after the user asked for Pydantic Settings. It put three choices to the user: a separate test settings class, whether to also read `backend/.env`, and a strict `APP_ENV`. Three reviewer subagents (rubric, currency, adversarial) then attacked the draft. All three found the same critical flaw: config read at import time can't be reached by `dependency_overrides`. That led to `create_app(settings)` with `uvicorn --factory`. The dev persona (bmad-build) then planned the refactor, and a subagent implemented it from the plan alone.

**Test generation and what AI missed.** The implementer wrote one test per matrix row. Four review lenses then showed that several of those tests could pass without proving anything:
- The import check passed on any machine that has a `backend/.env`.
- The any-working-directory test returned early.
- The `TEST_DATABASE_URL` override was never exercised.
- An empty `DATABASE_URL` passed validation.

All four were fixed. One gap was deferred to entry 1.2: the Alembic "caller-passed connection" path has no test yet.

**Human expertise.** The user overrode the recommended "env vars only" default and chose to also read `backend/.env`. The spine then bound that choice safely: env vars win, the path is anchored, and the file is ignored by git and Docker. The user also chose to stop committing `.env`, which made `cp .env.example .env` a required setup step.

**Debugging with AI.** Switching branches outside the session deleted the local `.env`: the branch's "stop tracking .env" commit removes the file on checkout. The agent noticed and restored it from `main`.

## Ticket 2 — Task model, ordering and the shared ordering fixtures

**Agents.** The dev persona (bmad-build) planned the ticket, and the user settled one scope question: `TaskCreate` waits for entry 1.3's validation. A subagent implemented the plan and checked its own tests with two deliberate breaks, which it then reverted. It flipped the id tie-break, and the tie cases failed. It added a model column with no migration, and the migration guard failed. Four review lenses read the diff, and the main session checked each finding against the code.

**Test generation.** The AI wrote `contracts/ordering-cases.json`, with inputs listed out of order so an unordered query can't pass by luck, plus a parametrized HTTP test, unit tests for the `.sssZ` serializer and the clock, and an AD-15 migration guard on a scratch `*_pytest` database. The guard also covers the Alembic passed-connection path that the AD-21 build had deferred.

**What AI missed.**
- The migration test loads `alembic.ini`, and Alembic's `fileConfig` then silently disabled the app's loggers for the rest of the pytest session. An edge-case reviewer caught it, and the main session reproduced it before fixing it.
- The fixtures lacked a case where an open task and a completed task share a timestamp. Without it, a merged sort key would pass every case, and that is the likely mistake when the frontend mirrors the order in entry 1.6.
- The implementer edited an existing `deferred-work.md` entry. That file is append-only, so the edit was reverted and a new entry appended instead.

## Ticket 3 — Mutation endpoints and the error contract

**Agents.** The dev persona (bmad-build) planned the ticket and raised two gaps in AD-5 and AD-11 as questions for the user: which codes framework 404 and 405 errors get, and what a malformed id returns. The user chose the new codes `not_found` and `method_not_allowed`, and chose `404 task_not_found` for a malformed id rather than FastAPI's default 422. The spine and the memlog were updated in the same change. A subagent implemented the plan, then four review lenses read the diff.

**Test generation.** The AI wrote one integration test per matrix row: add, the 2000- and 2001-character limits, invalid bodies, idempotent tick and untick, delete, and missing or malformed ids. It stamped times from a fixed clock injected through `dependency_overrides`, the first real use of the AD-7 clock. It also wrote error-contract tests: DB down gives 503 on every route, framework 404 and 405, an unhandled 500 with no traceback, and an OpenAPI check.

**What AI missed, and what review caught.**
- **NUL character.** Text containing NUL passed validation, then Postgres rejected it, and the API returned a 500. The main session reproduced it before routing it to a fix.
- **Tick racing a delete.** A tick committed after a concurrent delete raised `StaleDataError`, also a 500. The main session reproduced it with two sessions.
- **OpenAPI rewrite.** The rewrite silently dropped FastAPI's generator arguments.
- **Missing assertion.** Nothing asserted that tick, untick and delete advertise no 422.

**Human decisions.** The error-code vocabulary and the malformed-id behaviour were the user's calls. A narrower race window, a delete landing between commit and refresh, was accepted as a known low risk.

## Ticket 4 — Test and dev compose profiles with the gated testing router

**Agents.** The dev persona (bmad-build) planned the ticket and asked the user one question before starting: may the one-time `db-test` volume be recreated so the `todo_e2e` init script runs? The user said yes, limited to `todo_db-test-data`; `docker compose down -v` was forbidden because it could also delete the app's data. A subagent implemented the plan, then four review lenses read the diff.

**What was built.**
- The AD-14 testing router (seed, reset, clock offset), imported and mounted only in test mode.
- One shared `Clock` on `app.state` that holds the offset.
- The `dev` profile: `backend-dev` with `--reload` and read-only bind mounts, and `frontend-dev` on `node:24-alpine`, which runs `npm ci` inside the container so no glibc host binaries end up in musl.
- The `test` profile: `backend-test` on `todo_e2e`, and `frontend-test` on `:8082`.

**What AI missed, and what review caught.**
- The first `db-test` health check used `pg_isready -d todo_e2e`, which ignores whether the database exists. An old volume would have looked healthy while `backend-test` crash-looped. It now runs a real query.
- The seed and clock bodies silently ignored misspelled keys, and they accepted negative offsets that could stamp `completed_at` before `added_at`.
- The README didn't warn that `dev` and `app` share one database and both migrate it at startup.

**Verification.** None of the compose wiring is covered by automated tests (deferred to entry 1.5's E2E suite). The main session ran and recorded the stack checks itself, including a live reload triggered by touching a source file.

## Refactor — test-only use cases out of TaskService (PR #7)

**What a human caught.** Ticket 4 put `seed` and `remove_all` on the production `TaskService`, and `delete_all` on the `Task` model. The routes were gated, but the methods still shipped in every build. The four review lenses on ticket 4 did not flag it; the user spotted it while reading PR #5.

**Agents.** Claude Code in the main session, without a plan. It moved the methods into `TestingTaskService(TaskService)` in `services/testing_task_service.py`, which only `routers/testing.py` imports. The router builds the service with its own provider, so `deps.py` never imports test code. A follow-up bmad-build run updated AD-14, AD-20, the dependency note and the source tree in the spine, plus the README.

**Test generation.** The AI added a test that builds the default app in a fresh interpreter and asserts that neither test-only module is in `sys.modules`. It runs in a subprocess because the session's test-mode app has already imported both modules in-process. The AI checked that the test can fail by temporarily importing the testing service from `deps.py`, which made it fail.

**What the docs check found.** The spine said `routers/testing.py` reaches `db.py` through `deps.py`. `routers/health.py` has imported `get_session` from `app.db` directly since ticket 1, and the testing router now does too, so the rule was rewritten to match.
