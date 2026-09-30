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
