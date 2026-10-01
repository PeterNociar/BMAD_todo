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

## Ticket 5 — E2E harness against the test profile

**Agents.** The dev persona (bmad-build) planned the ticket. A subagent implemented the plan, then four review lenses (blind, edge-case, verification-gap, intent-alignment) read the diff. The main session checked each finding against the code before acting on it.

**What was built.** One `e2e/fixtures.ts` that every spec imports. It resets the test data before each test, installs `page.clock` before the first `goto`, fails a test at teardown on any CSP violation, and provides `seed()`, `advance(ms)` (browser and server clocks together), `failApi()` and an axe helper. The suite now targets the test profile on `:8082` with one worker, and `E2E_BROWSER_CHANNEL=chrome` works around the Playwright Chromium download that times out on this machine.

**Debugging with AI.**
- Under `module: nodenext`, relative ESM imports need an extension, so specs import `'../fixtures.ts'` and `tsconfig.json` sets `allowImportingTsExtensions`.
- `AxeBuilder` has to be a named import: the default import resolves to the CJS module object, and TypeScript rejects `new` on it.
- The reset asserts `204`. Against the app stack on `:8081` it gets a `404`, so the suite fails before it touches real data (checked by hand).

**What AI missed, and what review caught.** Review found 28 items (3 medium, 25 low or false): 11 were patched, 1 deferred, 16 rejected on evidence.
- **A test that passed for the wrong reason.** The CSP row ran under `test.fail()`, which also accepts a failure in the test body. With the listener removed, the poll timed out and the row still reported green. A normal test now asserts that the listener recorded the violation.
- **Lost violations.** Violations from an earlier document were lost after a `goto` or `reload`, because the init script replaced the page's array. They are now collected Node-side through `exposeBinding`, with a reload test.
- **Unpinned failure path.** The axe failure path was proved only by a throwaway spec. It is now pinned by a test that injects an `<img>` with no alt.
- Smaller fixes: `advance` posts the server offset before it moves the browser clock, the isolation pair runs serially, and the `.env.example` docs no longer imply that `.env` feeds Playwright.
- Deferred: nothing checks that `failApi` passes non-matching requests through. The first mutation-failure story will assert it.

## Ticket 6 — Frontend pure core

**Agents.** The dev persona (bmad-build) planned the ticket. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine as the plan's `context:` requires. Four review lenses then read the diff, and the same subagent applied the patches.

**Prompt that worked.** The same one as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The plan's Design Notes gave the pending-tie rule and the clock-test recipe (fake timers plus a fresh import), so the agent had nothing to invent there.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Vitest with coverage, and `vite build`.

**What was built.**
- `lib/api.ts`: the five AD-3 calls. Every rejection is an `ApiError` with a client `code`, mapped status-first (AD-5) under a 10 s `AbortController` timeout that covers the body read as well as the fetch.
- `lib/sort.ts`: the AD-6 mirror. Id-less (pending) tasks sort after confirmed ones on a tie and break ties by `key`, so the comparator stays a total order.
- `lib/clock.svelte.ts`: `clock.now` and `clock.sample()`, refreshed every 30 s and on `visibilitychange`, `focus` and `pageshow`.
- ESLint rules (`no-restricted-properties` for `Date.now`, `no-restricted-syntax` for `new Date()` and `Date()`) that make the clock the only wall-clock read in `src/`.

**Test generation.** The AI wrote one test per matrix row. The sort tests import `contracts/ordering-cases.json` directly (through `resolveJsonModule`), so there is no copy of the fixtures in `frontend/`. The clock tests use `vi.useFakeTimers()`, `vi.setSystemTime()` and a fresh module import per test, so the clock needs no test hook. The AI checked that the tests can fail with deliberate breaks, which it then reverted:
- Flipping the id tie-break failed the fixture tie cases.
- Dropping 503 from the status list, or the 413 rule, failed those rows.
- Not clearing the timeout failed the timer-count test.
- A `Date.now()` added to `sort.ts`, or to a `.svelte` component, failed `npm run lint`.

**Debugging with AI.** A stalled response body never settles on its own, because the fetch signal does not reach a hand-built `Response`. So `api.ts` races both the fetch and the body read against the abort, rather than relying on `fetch` to honour the signal.

**What AI missed or could not do.**
- The lint rule banned only the literal `Date.now`. A `new Date()` with no arguments, or a bare `Date()`, also reads the wall clock and passed lint. `no-restricted-syntax` now bans both, and `new Date(ms)` stays allowed.
- No test showed that `clock.now` is reactive: swapping `$state` for a plain `let` passed every test. A test in `clock.svelte.test.ts` now runs an `$effect` on `clock.now` and asserts that it re-runs after the 30 s tick.
- The first attempt at that test failed even with `$state`. `vi.resetModules()` gave the clock a fresh copy of the Svelte runtime, so the test file's effect could not track it. The reactivity test now lives in its own file, which installs fake time in `vi.hoisted` and imports the clock statically.

**Review.** Four lenses (blind, edge-case, verification-gap and intent-alignment) produced about 30 findings, each checked against the code.
- **Patched (5):**
  - the `new Date()` lint gap;
  - the clock reactivity test;
  - gaps in the api tests: the stalled body still pending at 9,999 ms with the signal aborted at 10 s, no `content-type` or body on GET/PUT/DELETE, and a 500 with an empty body;
  - a fixture check that asserts `same_ms_open_tie` and `cross_group_tie` by name, not just a case count;
  - this log section.
- **Deferred (1):** no automated test pins the lint rule, and no CI runs lint.
- **Rejected:** the rest, for example validating the shape of 2xx bodies, tearing down listeners on HMR, and NaN timestamps (the server always sends `.sssZ`).

## Ticket 7 — Toasts, live regions and focus modules

**Agents.** The dev persona (bmad-build) planned the ticket. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The plan's Design Notes settled the two subtle mechanisms ahead of time: the hold timer reads time only through `clock.sample()`, and a live region is cleared before each message so that a repeated message is read again.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, and the plan's grep for `aria-live`, `role`, and `.focus(`.

**What was built.**
- `lib/toasts.svelte.ts`: the AD-17 API and the verbatim copy as `COPY`. It shows at most two toasts, newest first. The load-failure toast is pinned, and a third toast drops the oldest transient one. Toasts dismiss after 5 s, and `hold`/`release` pause and resume from the time that remained. It also holds `politeText` and `alertText`.
- `components/LiveRegions.svelte`, which owns the only `role="status"` (polite) region and the only `role="alert"` region. `components/ToastLayer.svelte` renders the toasts: a decorative icon, the message, and either Dismiss or Retry (`onretry`). Hover or focus inside a toast pauses it.
- Light toast tokens as `--color-*` custom properties on `:root` in `app.css`.
- `lib/focus.ts`: `registerInput`, `returnToInput` (gated on `(hover: hover)`), `installSafetyNet`, `installTypeToFocus`, `onInputKeydown` and `onRowKeydown`, following the row contract `data-task-row` / `data-row-control`.

**Test generation.** The AI wrote one test per matrix row, plus edge cases: nested holds, a dropped toast's timer, a delegated row listener, and DOM order changed at keypress. The AI checked that the tests can fail with deliberate breaks, which it then reverted:
- Not clearing the polite region failed the repeat-announce test.
- Removing the hover gate from `returnToInput` failed the phone tests.
- Removing either path of the safety net (the MutationObserver, or the `focusout` listener) failed its own test.

**Debugging with AI.**
- The module is a singleton, so a test that rendered `LiveRegions` after an earlier test had announced something found the region already filled. The first-paint test moved to its own file, which gets a fresh module.
- Svelte leaves an empty text node in each region, so `toBeEmptyDOMElement()` fails on a region that is in fact empty. The test asserts `textContent === ''` instead.

**What AI decided beyond the plan.**
- Holds nest: hover and focus each hold the toast, and the timer resumes only after both are released. Without this, a pointer leaving a toast whose Dismiss button still has focus would restart the timer.
- The safety net also uses a MutationObserver, because not every engine fires `focusout` when the focused element is removed (jsdom does not).
- Type-to-focus ignores Space, so Space still scrolls the page.
- Row navigation (Up from the first row, Esc) focuses the input even on phone, because it is an explicit keyboard request. Only `returnToInput`, the safety net and type-to-focus are gated on hover.
- Each toast element needed a `svelte-ignore a11y_no_static_element_interactions`: its hover handlers only pause the timer, and adding a role would change the semantics.

**What AI missed.**
- **Same-tick announcements.** Two announcements in one tick (for example an action-error toast and a success message) each set the region on their own timeout, so the first was overwritten before a screen reader read it.
- **Touch-synthesised hover.** On touch, a tap fires a synthetic `mouseenter` and no `mouseleave` until the next tap elsewhere, so a tapped toast never dismissed itself.

**Review.** Four lenses read the diff, and each of about 40 findings was checked against the code.
- **Patched:**
  - Same-tick announcements are merged into one message: a call made while a region has a pending text joins its text to it.
  - On recovery, `hideLoadFailure` clears the stale alert text and cancels any pending alert.
  - The safety net forgets an element that focus left by a blank-space click, so removing that element later no longer pulls focus to the input.
  - Type-to-focus accepts AltGr characters, which arrive as Ctrl+Alt.
  - Touch taps no longer pin a toast: hover holds use pointer events and count only `pointerType === 'mouse'`.
  - `remaining` is clamped to the time left, so a clock that steps back can't lengthen a toast.
  - A lint ban on `.focus()` outside `lib/focus.ts` (AD-18), merged with the AD-8 `no-restricted-syntax` entries.
  - Test gaps: an exact timer count after a toast is dropped, a known starting state for each region test, Up from row 1 on phone, `defaultPrevented` on Down from the last row, and Down during IME composition.
- **Rejected:**
  - Placement, because 1.9 mounts the layer.
  - `maxlength`, because the input has none (AD-12).
  - Inline-edit keys, because editing is not in scope.
  - The Retry prop seam, because 1.9 wires `tasks.retry()`.

## Ticket 8 — The task store

**Agents.** The dev persona (bmad-build) planned the ticket. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The plan's Design Notes fixed the model ahead of time: the view is the confirmed state with the pending ops folded over it, and because each task sends one op at a time, a failure always hits the head of the queue, so cutting the queue there leaves exactly the confirmed state.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, and the plan's grep for importers of `lib/api.ts`.

**What was built.**
- `lib/tasks.svelte.ts`: `createTasks()` and the `tasks` singleton. Each entry is `{key, confirmed, base, pending, inFlight}`. `rows` is derived: the held row first, then `sortTasks` of the rest.
- A per-task pump. It sends the head op only when nothing is in flight and the entry has a server id, so ops on an unconfirmed add wait for its POST.
- Rollback: a failed op clears that task's queue and raises one `action_failed` toast. A failed add removes the row, clears the hold if it was that row, picks `add_too_long` or `add_failed`, and rejects with `{text}`, or `{text: null}` when ops were queued behind it.
- Success announcements go through `toasts.announce`, once per action, when the change is applied. A delete that leaves the list empty passes `listEmpty`.

**Test generation.** The AI wrote one test per matrix row against a mocked `lib/api.ts`. Each api call returns its own deferred promise, so a test settles requests in any order. It also added tests for FIFO order within a task, independence across tasks, the held row's position, and a reactivity check inside `$effect.root`. The AI checked that the tests can fail with deliberate breaks, which it then reverted: removing the in-flight guard, the `{text: null}` rule, clearing the hold, or putting the held row first each failed a test. Shifting only the failed op instead of clearing the queue survived the first suite, so the AI added a test where the head fails with two ops behind it.

**Debugging with AI.** Svelte's deep state proxy means an object pushed into the entries array is not the object that is tracked. The store therefore looks every entry up by key before mutating it, which also handles an entry that disappeared while its request was in flight.

**What AI decided beyond the plan.**
- `load()` returns a promise, so callers and tests can await it. A failure resolves it silently.
- Unticking the held task leaves the hold in place; only tick and remove clear it, as the plan says.
- A failed add keeps a newer add's hold.
- The provisional base of an unconfirmed add uses an empty `id`. `Row.id` comes from `confirmed`, so it is `null` until the POST returns.

**What AI missed.**
- `crypto.randomUUID` exists only in a secure context. Phone access through `APP_BIND` on a Tailscale IP serves plain http, so `add()` threw a TypeError and nothing was added.
- The GET/POST ordering that drops a confirmed add: if an add is confirmed while the first GET is in flight, the plain replace in `load()` drops it, or duplicates it under a new key.

**Review.** Four lenses produced about 30 findings, each checked against the code. The plan's grep confirmed that only `App.svelte` and `tasks.svelte.ts` import the api.
- **Patched:**
  - The key falls back to a module counter (`local-N`) when `crypto.randomUUID` is unavailable.
  - `listEmpty` is passed only once the list has loaded (`loadState === 'ready'`), so deleting the last unconfirmed add during loading doesn't announce the empty state.
  - The announce test was misnamed: success is announced once when the change is applied, and nothing more follows a rollback. It now also covers a failed add.
  - Three missing tests: a failed untick rolls back to done; a failed tick queued on a confirmed add rolls back to the server Task, with the server `added_at`; the held row stays first after its POST confirms with a later `added_at`.
- **Deferred to 1.12:**
  - `load()` dropping or duplicating an add that is confirmed while the first GET is in flight.
  - `load()` re-entrancy.

  1.12 replaces the plain replace with the AD-10 merge.
- **Rejected:**
  - 404 handling, because AD-11 belongs to 1.12.
  - Wrapping `add`'s `{text}` rejection in an Error, because AD-9 specifies that shape.

## Ticket 9 — Capture UI

**Agents.** The dev persona (bmad-build) planned the ticket, and the user settled the font questions: metric-matched fallbacks now, `<link rel="preload">` deferred. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine, DESIGN.md and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The plan's Design Notes fixed the three awkward parts ahead of time: the 300 ms skeleton timer, the restore rule (capture the text, clear, put it back only into an empty input), and one sticky block holding the header, the input and the toast anchor.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the compose test stack and Playwright with the system Chrome. Screenshots of the built page at 1024 px and 320 px, taken with a throwaway Playwright script, served as the visual check against the DESIGN mockups.

**What was built.**
- `app.css`: the full light `--color-*` palette, the DESIGN spacing scale and radii as custom properties, base `html`/`body` styles, and the "Inter Fallback" and "JetBrains Mono Fallback" faces with `size-adjust` and the ascent, descent and line-gap overrides.
- `main.ts` imports `@fontsource/inter` 400 and 600 and `@fontsource/jetbrains-mono` 400. Vite bundles them.
- `App.svelte` as the composition root: a sticky top block (wordmark header, input, the toast layer positioned absolutely under it), a `main` list area with `aria-busy`, the delayed skeleton, the empty state and a plain-text `ul` keyed by `row.key`, and `LiveRegions`. On mount it registers the input, installs the safety net and type-to-focus, focuses the input and calls `tasks.load()`.
- The input handles Enter (trim, empty, IME and key code 229), paste (line breaks become spaces) and Down (`onInputKeydown`).
- `e2e/tests/capture.spec.ts`: one test per matrix row, with axe and a horizontal-overflow check at 320 px and 1280 px.

**Test generation.** The component tests run the real store on top of a mocked `lib/api`. The `tasks` singleton is mocked as a getter over a fresh `createTasks()` for each test. The AI checked that the tests can fail by breaking the code on purpose, then reverting: dropping the empty-input check on restore, the skeleton delay, the `isComposing` guard or the `returnToInput()` call each failed at least one test.

**Debugging with AI.**
- The first test setup re-imported App after `vi.resetModules()`. That loaded a second copy of the Svelte runtime, and every test failed with `effect_orphan`. The fix was the getter mock above.
- In the E2E suite, `getByText("Couldn't save new task.")` sometimes matched both the toast and the polite live region. Whether it did depended on timing, because the region merges announcements made in the same tick. The specs now target the toast card through `[data-toast-kind]`.
- Playwright's installed clock runs at real speed and also fakes `performance`, so resource-timing entries come back empty. The skeleton spec instead records, on `document.timeline`, when the first `GET /api/tasks` starts (a wrapped `fetch`) and when the skeleton first appears (a `MutationObserver`). It asserts the gap between the two.

**What AI decided beyond the plan.**
- `build.assetsInlineLimit: 0`. Several fontsource subsets are smaller than Vite's 4 KB inlining limit, and a `data:` font would break the `default-src 'self'` CSP.
- The skeleton bar widths are CSS classes, not `style:` directives, because a static inline style attribute would need `'unsafe-inline'`.
- The 36 px top padding sits on the sticky block, not on the page, so the header keeps its gap from the top edge while the page scrolls.
- On phones the empty-state box keeps the 12 px inset. Only the list goes full-bleed.
- The E2E "type right after load" spec waits for `aria-busy="false"` before typing, because the store's deferred GET/POST race could otherwise make it flaky.

**What AI missed.**
- Forced-colors mode drops `box-shadow`. The input's focus ring used `outline: none` plus a shadow, so in Windows High Contrast it had no focus indicator at all.
- The skeleton delay timer was tied to mount, not to the loading state. Any later load (Retry) would have shown the skeleton at once.

**Review.** Four lenses read the diff, and each of about 40 findings was checked against the code.
- **Patched:**
  - A transparent 2 px outline on the focused input, which forced-colors mode paints. The box-shadow ring stays.
  - The skeleton delay restarts on every transition into `loading`, through an `$effect` on the loading state.
  - The `add()` rejection guard: the text is restored only when the rejection carries a string `text`.
  - Paste: each run of `\r`, `\n`, U+2028 and U+2029 becomes one space.
  - The input and the toast anchor now sit inside the `header` landmark. The sticky block is the `<header>`.
  - Unit test gaps:
    - a paste over a selection, then Enter;
    - the safety net as App installs it, with its uninstall;
    - type-to-focus uninstall, checked with a `removeEventListener` spy;
    - a later load restarting the delay;
    - the non-AddFailure rejection.
  - E2E gaps:
    - skeleton timing measured from the GET's start, with a 250–900 ms window;
    - the provisional row gone after a failed add while typing on;
    - no POST on an IME Enter;
    - a pasted newline added as one row;
    - no autofocus on a phone.
  - A `headers.spec.ts` guard that the built stylesheet holds no `url(data:`.
- **Rejected:**
  - A `maxlength`, because the frontend never enforces the maximum (AD-12).
  - Changing the skeleton that stays up after a failed first load, because the user decided it, and epic 3 adds Retry.
  - Keeping the second failed text, because EXPERIENCE accepts that it is dropped.
  - Deferring JetBrains Mono until its first consumer, because the age labels arrive in 1.10 and epic 2.
- **Deferred:** typing during the first load stays with 1.12.

## Ticket 12 — Store sync

**Agents.** The dev persona (bmad-build) planned the ticket. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The plan spelled out the six merge rules and the POST-meets-GET rule, so the merge became one function that follows them in order.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Vitest with coverage, `vite build`, and the E2E suite against the compose `test` stack.

**What was built.**
- `lib/tasks.svelte.ts`:
  - A `seq` counter, bumped on every confirmed add, tick, untick and delete, and on every 404 removal. Each entry carries the `stamp` that confirmed it.
  - Tombstones: a plain `Map<id, seq>`, left by confirmed deletes and 404 removals, pruned once a GET sent at S ≥ their seq has merged.
  - `refresh()`: records S, keeps one GET in flight and at most one queued behind it. Any successful GET sets `ready`. `load()` sets `loading` and goes through `refresh()`.
  - `merge(server, S)`: matches by `confirmed.id` only. Entries stamped ≤ S take the server Task (or go), newer entries and unconfirmed adds stay, and unseen ids become entries keyed by id unless tombstoned after S. Pending ops stay on top.
  - POST meets GET: the add's entry absorbs a GET-created entry with the same id, keeping the optimistic key and the hold, and appending that entry's ops.
  - AD-11: a 404 on any op removes the entry with a tombstone and no toast.
  - Recovery: a `network_error` or `unavailable` failure, on an add or an op, also requests a GET.
- The resolution of the 1.8 deferred item (`load()` dropping or duplicating an add confirmed while the first GET is in flight, and `load()` re-entrancy).
- `capture.spec.ts`: "type right after load" types right after `goto`, then checks the row survives the first GET and a reload.

**Test generation.** The AI wrote one unit test per store matrix row, plus tests for a pruned tombstone, an untick 404 that clears the hold, the twin's ops queuing behind the add's own ops, no GET for non-recoverable failures, and no announcement on a merge. It checked that the tests can fail by applying eight deliberate breaks one at a time and reverting each one: ignoring stamps, ignoring tombstones, skipping the twin fold, treating 404 as an ordinary failure, dropping the recovery GET, letting the queue grow past one, sending while the twin's op is in flight, and keeping entries the server no longer lists. Every break failed at least one test. The changed E2E spec passed 15 runs in a row.

**What AI decided beyond the plan.**
- An entry created by a GET has a server id, so an op on it is sent at once. When the add's POST then returns the same id, that op is still in flight. Each op therefore carries an `n`, and a response finds its entry by `n`, not by key. The merged entry stays in flight until that op settles, so it never sends two requests at once.
- A 404 removal also clears the hold if the removed task was held.
- Tombstones and the merge's lookup maps are plain `Map`/`Set` with a scoped `svelte/prefer-svelte-reactivity` disable, because nothing renders them.

**What AI missed.**
- The twin fold overwrote the twin's newer state with the POST's creation state, so a twin whose tick had already settled showed open again.
- The first version of the E2E spec didn't force the race, so it would also have passed on the 1.8 store.

**Review.** Four lenses produced about 30 findings, each checked against the code.
- **Patched:**
  - The twin fold keeps the twin's `confirmed` state (GET-seen or op-confirmed), which is never older than the POST's. It uses the POST Task only when there is no twin.
  - If the twin was deleted (tombstoned) before the POST returned that id, the add drops its row, clears its hold and resolves, with no toast.
  - A merge that drops the held entry clears `heldKey`, as `bury` does.
  - A failed op cuts the queue at that op, not at the head, so after a fold the add's own earlier ops survive and are sent.
  - The queued GET runs whether the GET in flight resolved or threw, so the queue can never get stuck.
  - Op ids are per store, like `seq` and the tombstones.
  - The E2E spec now forces the race. It holds the first `GET /api/tasks` until the POST has returned 201, then answers with the pre-POST body (`[]`) or lets it reach the server. Both variants check one row whose element is never remounted, and that the row survives a reload. Both fail on the 1.8 store.
  - Tests for each patch, plus: a late response for an entry a merge dropped is ignored (no toast, no row coming back, no tombstone from a late 404), and two `load()` calls while a GET is in flight run one more GET and resolve both.
- **Rejected:**
  - Matching 404s on `task_not_found` as well as on status, because every task-path 404 from the backend carries that code and the plan fixes the check on status.
  - Polling, and `load()` after `ready`, because they belong to epic 3.
  - The duplicate risk after a timed-out POST, because AD-9 accepts that a change that landed shows up, and EXPERIENCE returns the text to the input.

**Residual risk.** After a fold, the twin's in-flight op reaches the server before the add's own queued ops, while the view applies the add's ops first, so the row can flip once when that op settles. This needs an op on the duplicate row in the brief window before the POST returns.

## Ticket 10 — List rows

**Agents.** The dev persona (bmad-build) planned the ticket, and the user left the "toasts sit below a held row" rule to epic 2 (logged in deferred-work). A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine, DESIGN.md and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets: "Read <plan> fully and implement it; the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The Design Notes gave the flip options, the delete-reveal CSS and the touch hit-area trick, so the row needed no design decisions of its own.

**MCP servers.** None. Verification used the shell: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the rebuilt compose test stack and Playwright with the system Chrome.

**What was built.**
- `components/TaskRow.svelte`: the tick button (an SVG ring, or the filled check when done), the plain-text task text that wraps anywhere, and the delete ×. The controls carry `data-row-control`, and their names are `Mark "X" done`, `Mark "X" not done` and `Delete "X"`, with every icon `aria-hidden`. Tick calls `tasks.tick` or `tasks.untick` by state, delete calls `tasks.remove`, and each then calls `returnToInput()`. Completed rows get muted text and no strike-through. Under `(hover: hover)` the row takes the hover tint, and the delete is at opacity 0 with `pointer-events: none` until the row is hovered or holds focus. Under `(hover: none)` the delete is always visible, and both hit areas stretch over the row padding to the full row height.
- `App.svelte`: each `<li data-task-row>` is keyed by `key`, with `animate:flip` (200 ms, `cubicOut`, and a duration function that reads `prefers-reduced-motion` when the animation runs). `onRowKeydown` is on the `ul`. A border-box `ResizeObserver` on the sticky header keeps `--sticky-height` on the page, set through the CSSOM, which the row controls use as `scroll-margin-top`.
- `e2e/tests/rows.spec.ts`: one test per matrix row, plus a sticky-clearance test, a companion motion test that sees a 200 ms animation, and a test that turns reduced motion on after load, which proves the duration is read when the animation runs.

**Test generation.** `TaskRow.test.ts` mocks the store and `lib/focus` and checks names, icons, state styling, plain text, and that each action calls the store by key before `returnToInput()`. `App.test.ts` runs the real store on a mocked api for reorder on tick and untick, delete, tick rollback, focus return, the arrow keys and Esc, and the sticky-height observer. The rows spec (18 tests) passed five runs in a row (90 test runs). A deliberate break, zeroing `scroll-margin-top`, failed the sticky test. The first version of that test passed without the margin, because Chrome centres an element it scrolls into view on `focus()`.

**What AI decided beyond the plan.**
- The `li` lives in App and `TaskRow` fills it, because Svelte allows `animate:` only on an element that is the keyed each block's direct child. The hover tint and the delete reveal therefore hang off TaskRow's root `div`, which fills the `li`.
- `vitest-setup.ts` stubs `Element.prototype.getAnimations`, which jsdom lacks. Svelte's flip calls it when a keyed row leaves. In jsdom every rect is zero, so no animation ever runs.
- On touch, the ring and the glyph stay on the first text line (padding-top inside the stretched button) rather than centring in the row, to match DESIGN's first-line alignment on wrapped rows.

**What AI missed.**
- The first touch styles used a `button` selector inside the media query, which lost to the `.tick`/`.delete` margins on specificity, so the hit areas did not stretch. The touch E2E test caught it.
- The touch block used the Level 4 `@media not (hover: hover)`, which iOS Safari before 16.4 drops, so those phones would have lost the touch hit areas.
- The reduced-motion check emulated the setting before load, so it couldn't fail if the setting were read only once at load.

**Review.** Four lenses produced about 30 findings, each checked against the code.
- **Patched:**
  - `(hover: none)` for the touch styles, for older iOS.
  - The sticky-height observer watches the border box, so a padding change at the 600 px breakpoint updates `--sticky-height`.
  - A `--line-height-body` token in `app.css`, used by the body rule and by the row's line calculation.
  - The sticky-height test's `ResizeObserver` stub and `getBoundingClientRect` spy are restored in a `finally`, so they can no longer leak into later tests.
  - A live reduced-motion E2E test: load without emulation, then `emulateMedia({ reducedMotion: 'reduce' })`, then tick.
  - The motion helper counts only animations inside `[data-task-row]` and clicks through a locator's element handle, so quotes in task text can't break it.
- **Rejected:**
  - Double-clicking tick then untick, because EXPERIENCE says the last intent wins and requests are applied in order.
  - Shorter names for long or quoted text, because EXPERIENCE fixes the verbatim `Mark "X" done` pattern.
  - Moving focus on touch, because EXPERIENCE › Touch focus keeps it in place.
  - Raw RGB values in the E2E colour checks.
- **Deferred to epic 2:** toasts sitting below a held row.
- **Manual check:** the app-profile `docker compose down` / `up` check passed. The task text and both times were identical afterwards, with the volume kept.
