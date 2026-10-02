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

## Ticket 11 — Refactor sweep

**Agents.** The dev persona (bmad-build) planned the sweep from deferred-work.md, and the user picked the scope: the nginx stale IP, the small test and code gaps, and the spine fix. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets. The plan gave the nginx repro step by step (squatter container, `up --no-deps backend-test`, curl `:8082`) and the exact fix to apply only if it returned 502, so the experiment decided the change.

**MCP servers.** None. Verification used the shell and Docker: ruff and pytest, `svelte-check`, ESLint, Vitest with coverage, `vite build`, the rebuilt test stack with Playwright on the system Chrome, and the rebuilt app profile.

**What was built.**

- nginx: the stale-IP risk was real (502, with nginx still dialling the old IP). `default.conf.template` now re-resolves through Docker's DNS every 10 s and proxies through a variable with no URI part. The same repro then gave 200, and the path, query, error bodies and headers passed through unchanged.
- Alembic: `env.py` documents the `%%` contract. Tests migrate a scratch database owned by a role whose password is `p%w`, once through an escaped `sqlalchemy.url` and once through `DATABASE_URL` with a raw `%`; only a password that arrives intact can log in. A third test shows an unescaped `set_main_option` is refused.
- `frontend/tests/lint-rules.test.ts` pins the AD-8 and AD-18 bans with ESLint's `lintText`.
- A harness test proves `failApi` lets a non-matching `GET` through.
- The spine diagram gains dotted annotation-only arrows from routers to services and models, and AD-16's nginx line describes the resolver and its side effects.

**What AI decided beyond the plan.**

- The lint test overrides `projectService` to `false` for `src/X.svelte` only, because that file is not on disk and the typed project service refuses it. The bans are syntax rules, so the real config is otherwise used unchanged. Only ban-rule errors are counted, and any parse error fails the test, so an "allowed" case cannot pass by linting nothing.
- The `failApi` test also sends a page `POST` and expects the injected 503, so it fails if the route were never installed.
- The `%` tests use a real role and password rather than inspecting the parsed URL, after checking that `db-test` enforces passwords on the forwarded port.
- AD-16's `proxy_pass` sentence in the spine was updated to match the new config.

**What AI missed.**

- The first lint test also failed on `svelte/prefer-svelte-reactivity`, which flags `new Date()` in `.svelte.ts` files, so it now ignores rules other than the two bans.
- The spine arrows were first labelled "type-only", but `routers/tasks.py` imports `TaskService` and `Task` at runtime, because FastAPI reads the annotations.
- The first `env.py` docstring said `DATABASE_URL` is used "exactly as given, raw `%` included". SQLAlchemy's `make_url` percent-decodes the password (`p%41w` becomes `pAw`); `p%w` only survived because `%w` is no valid escape.

**Review.** Four lenses produced about 30 findings, each checked against the code.

- **Patched:**
  - The `env.py` docstring: URL passwords are URL-encoded (a literal `%` is `%25`) on both paths, plus `%%` for `set_main_option`. A new test migrates through `DATABASE_URL` with a `%25`-encoded password.
  - The settings-path test proves the path: `sqlalchemy.url` is empty before the upgrade, and `get_settings` was called once.
  - The scratch-role fixture drops the database and the role in `finally` even if creating the database fails. `PERCENT_PASSWORD` is asserted quote-free, and it and `public_tables` live in `tests/helpers.py`.
  - The lint test pins the cross-bans (Date calls in `lib/focus.ts`, `.focus()` in `lib/clock.svelte.ts`), `.focus()` in a `.svelte` file, the Date ban in another `.svelte.ts` file, and the AD-8 rule ids. A "File ignored" warning fails it, like a parse error.
  - A static guard, `frontend/tests/nginx-template.test.ts`, fails if `/api/` loses the resolver or goes back to a literal `proxy_pass`.
  - The nginx comment and AD-16 document the side effects: Docker's embedded DNS only (no `/etc/hosts`), and an unresolvable backend no longer stops nginx starting; each `/api` request gets a 502, which the client maps to `unavailable` and rolls back.
  - The spine's dotted arrows read "annotation-only": imported to name types in signatures, never called.
  - The `failApi` tests wait for the `GET` by method too, and a new case fails `GET /api/health` while `GET /api/tasks` loads the seeded row, which exercises the path half of the guard.
- **Deferred:** an automated recreate-the-backend repro, which needs container orchestration outside the test layers (logged in deferred-work).
- **Main-session checks:** with `backend-test` stopped, the page still serves and `/api` returns 502. Once it is back, `/api/health` is 200 again without restarting nginx.

## Ticket 2.1 — Age label on every row

**Agents.** The dev persona (bmad-build) wrote the plan for the epic's tracer bullet, and the user approved it. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine, DESIGN.md and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets. The plan's label/words table and its boundary matrix (59 s, 60 s, 59 m 59 s, 1 h, 23 h 59 m, 24 h, 47 h, 3 d, plus a future timestamp) became the core of the unit tests, which add the 0 s and 100 d cases and the same boundaries for completed tasks.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Vitest with coverage, `vite build`, the rebuilt test stack, the e2e typecheck and Playwright on the system Chrome.

**What was built.**

- `lib/age.ts`: pure `ageLabel(timestamp, now, done)` → `{ label, words }`. The age is clamped to 0 and rounded down to whole days, hours or minutes. Completed tasks get `done …` and `completed … ago`, and the words are singular for 1.
- `TaskRow`: a `$derived` age from `clock.now` (`completed_at` on done rows, `added_at` otherwise). The label is an `aria-hidden` column between the text and the delete button: 12 px tabular JetBrains Mono, at least `9ch` wide, right-aligned, in `text-secondary` (open) or `text-muted` (done), and centred on the first text line. Its size and width come from new `app.css` tokens (`--font-size-age-label`, `--space-age-column-min`). The words sit in a `.visually-hidden` span right after the task text, led by ", " so the two don't run together. Neither is in a live region.
- Epic 1's whole-row text assertions (the rows, capture and harness E2E specs, plus `App.test.ts`) now target the task-text element through a `rowTexts` helper, so the age doesn't change their meaning.
- `e2e/tests/age.spec.ts` has four tests:
  - **Live:** 5h becomes 6h after `advance(1 h)` with no reload. An ARIA snapshot shows the text and the words, and never the label.
  - **Visual contract:** each label's font, tabular figures, right alignment, `9ch` minimum and colour are checked through `toHaveCSS`, and labels of different lengths share one right edge.
  - **Not live:** a MutationObserver on both live regions records no writes across the whole `advance` window.
  - **Wide label:** added 120 d and completed 100 d shows `done 100d`, beside a 300-character word at 320 px, with no horizontal scroll, the labels fully visible and axe clean.
- **Results:**
  - Frontend: 269 Vitest tests in 14 files pass, with coverage at 98.49% statements, 94.77% branches, 100% functions and 99.51% lines against the 70% gate.
  - E2E: 55 Playwright tests pass, including 4 for age. One harness test fails on purpose (`test.fail()`).

**What AI decided beyond the plan.**

- The words span carries `data-age-words`, so tests can find it without relying on its CSS class.
- The not-live E2E uses the 24 h crossing (23h → 1d), so the same test also covers the UJ-3 label change.
- TaskRow unit tests drive time with `vi.setSystemTime` and `clock.sample()`, because the clock's interval is registered with real timers at import. They sample again after restoring real timers.
- The accessibility tree reads "aged , added 5 hours ago": the hidden span is its own box, so a space separates it from the text even with no whitespace in the markup. The comma provides the pause.

**What AI missed.**

- The label and the task text ran together for screen readers ("aged added 5 hours ago").
- The wide-label test seeded added and completed both at 100 d, so it couldn't tell which timestamp was used.
- Running the frontend's Prettier over the e2e specs reformatted them wholesale (e2e has no Prettier config). The specs were restored and edited again by hand.

**Review.** Four lenses produced about 25 findings, each checked against the code.

- **Patched:**
  - The screen-reader separator.
  - The age tokens in `app.css`.
  - The stale "epic 2" header comment in `age.ts`.
  - The visual-contract E2E checks.
  - The timestamp-choice and long-text E2E cases.
  - A MutationObserver check for "not live".
  - Re-sampling the clock after the unit tests.
  - The `0 s` and `47 h` boundary cases for completed tasks.
  - The harness `rowTexts` helper.
- **Rejected:**
  - Guarding against NaN timestamps: the server always sends `.sssZ` (AD-7).
  - Labels over 999 days overflowing `9ch`.
  - The three-argument signature: the plan specifies it.
  - Unifying test selectors: cosmetic.
- **Found during verification:** the 1.11 lint-rules test timed out intermittently under coverage; given a longer timeout.

## Ticket 2.2 — Age colour function for light and dark

**Agents.** The dev persona (bmad-build) wrote the plan, and the user approved it, with one decision: each stop must be within ±2/255 per sRGB channel. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading DESIGN.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets. The plan's edge-case matrix and DESIGN.md's stop table became the unit tests.

**MCP servers.** None. Verification used the shell: `svelte-check` and `tsc`, ESLint, Prettier, Vitest with coverage, and `vite build`. Throwaway Node scripts compared gamut-reduction methods against the stored stops.

**What was built.**

- `lib/age.ts`: pure `ageColour(timestamp, now, done, theme)` → `#RRGGBB`, or `null` for a completed task. Below 1 h it returns the fresh endpoint, from 24 h the overdue one, and in between `t = (hours − 1) / 23` with L, C and H linear (hue 155 → 25).
  - The colour maths lives in the same file: OKLCH → OKLab → linear sRGB (Ottosson's matrices), the sRGB transfer functions, WCAG relative luminance and contrast, and `hexToOklch` for the tests.
  - `fitGamut` reduces chroma, keeping L and H. `nudgeContrast` (exported) moves L away from the backgrounds in 0.005 steps until every background reaches 3:1, and stops at the end of the L range.
  - `THEME_SURFACES` holds DESIGN's light and dark `surface` and `hover`.
- `lib/age.test.ts`: every DESIGN stop in both themes (plus 25 h and 10 d) within ±2/255. A 0–30 h sweep in 15-minute steps keeps 3:1 on surface and hover, and its measured hue never rises by more than 0.5° (8-bit rounding). The suite also covers the fresh colour under 1 h, future timestamps, `null` when done, and the nudge darkening, lightening and running out of range.
- `tests/theme-surfaces.test.ts` (node): the light `THEME_SURFACES` must equal `--color-surface` and `--color-hover` on `:root` in `app.css`.
- **Results:** 293 Vitest tests in 15 files pass, with coverage at 98.65% statements, 94.75% branches, 100% functions and 99.57% lines against the 70% gate. Check, lint, Prettier and build are green.

**What AI decided beyond the plan.**

- **Gamut reduction uses a fixed 0.002 chroma step, not bisection.** Bisection to the gamut edge gives light 12 h `#8F7500`, which is 6/255 off DESIGN's `#8F7506` on blue and breaks the user's ±2/255 decision. No bisection margin brings every stop within tolerance in both themes: light 12 h wants blue 6 and dark 12 h wants blue 0. A 0.002 step reproduces all 14 stops exactly, so it's very likely the method that rendered them. The plan's design note had it backwards: a fixed step lands inside the edge, and that is where the stored stop sits.
- The OKLCH helpers stay in `age.ts`, not in a sibling `oklch.ts`. The node tsconfig type-checks whatever `tests/` imports and requires file extensions, while `src/` imports never use them.
- The hue test measures the hue from the output hex, so it checks the result rather than the formula's input.

**What AI missed.**

- An unparseable timestamp made `Date.parse` return NaN, which flowed into L, C and H. Light returned `#NANNANNAN`, and dark looped forever in `nudgeContrast` because NaN never trips the L-range exit.
- A plan rule that couldn't meet its own tolerance: bisection to the gamut edge misses light 12 h by 6/255. The user signed off on the 0.002 chroma step instead.

**Review.** Four lenses produced about 30 findings, each checked against the code.

- **Patched:**
  - A non-finite age now counts as 0 (the fresh colour), and the nudge loop exits on a non-finite L.
  - `hexToRgb` throws on anything that isn't `#RRGGBB`.
  - `fitGamut` clamps a negative chroma to 0.
  - A sweep test checks that `ageColour` equals the un-nudged formula, so the nudge stays idle on the real path.
  - Tests for the dark "ran out of lightness" exit, and for 3:1 on both backgrounds in the light nudge.
  - Docstrings now say the chroma is lowered out of gamut, the stops are held within ±2/255, and which helpers are exported for tests and story 2.3.
  - The drift guard reads every `:root` block and normalises 3-digit hex.
- **Rejected:**
  - Rendering the colour: that is story 2.3.
  - A CSS guard for the dark pair: there is no dark CSS until epic 3, and that requirement is noted there.
  - Signalling when the nudge can't reach 3:1: this can't happen with DESIGN's backgrounds.
  - Validating the theme at runtime: it is typed.

## Ticket 2.3 — Age bar and live overdue

**Agents.** The dev persona (bmad-build) wrote the plan, and the user approved it at about 1,650 tokens. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading the architecture spine, DESIGN.md and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** The same prompt as earlier tickets. The plan's I/O matrix became the E2E spec, one test per row, and its Code Map pointed at the existing `--sticky-height` CSSOM pattern in `App.svelte`, which the bar reuses.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the rebuilt test stack, the e2e typecheck and Playwright on the system Chrome.

**What was built.**

- `TaskRow`: an `aria-hidden` `[data-age-bar]` span on open rows only, absolutely positioned on the row's left edge, 3 px wide (new `--space-age-bar` token in `app.css`) and full row height, inside the existing 15 px inset. Its `background` is `var(--age-colour)`, which an `$effect` sets with `style.setProperty` on a `bind:this` element, so no `style` attribute is ever written from markup (CSP `default-src 'self'`). `clock.now` is read once into a `$derived` `now`, and both `ageLabel` and `ageColour(…, 'light')` derive from it. A comment says epic 3 switches the theme argument.
- `TaskRow.test.ts`: seven new tests: the bar's presence and position, `--age-colour` equal to `ageColour` (12 h → `#8F7506`), the only declaration on the bar, no bar when done, the colour and label moving together on `clock.sample()` (12 h → 24 h → `#C43F3E` and `1d`), a future `added_at` → fresh and `now`, and the bar leaving on tick and returning on untick. The row-order test now skips the bar, which sits outside the flex flow.
- `e2e/fixtures.ts`: a `serverClock` fixture owns the one offset counter. `advance(ms)` shifts it and then fast-forwards the page; the new `skewServer(ms)` shifts only the server, with a docstring naming it the single, deliberate exception to AD-8. The page set-up (CSP listener, binding, `clock.install()`) moved into an exported `preparePage(page)`, so a spec that opens its own contexts gets the same checks.
- `e2e/tests/age-bar.spec.ts`: nine tests, one per matrix row plus a shared-counter test (the CSP row is the fixture's teardown check on every test): bar colour and geometry at 12 h, no bar when done, UJ-3 (23 h 59 m crosses on `advance(60_000)`, reads `1d` in overdue at the same index on the same DOM element, no live-region writes, input still focused), the same seed under `UTC` and `Pacific/Kiritimati` in two contexts, the server an hour ahead with an add through the UI (`now`, fresh), and tick (`done now`, no bar) and untick (index 1, `2d`, overdue) of a 2-day task, plus axe at 1280 px.
- **Results:** 311 Vitest tests in 15 files pass, with coverage at 98.69% statements, 94.93% branches, 100% functions and 99.57% lines against the 70% gate. Check, lint, Prettier and build are green. All 63 E2E tests passed before review (two full runs); after review `age-bar.spec.ts` passed three runs in a row.

**What AI decided beyond the plan.**

- The colour derives from `added_at` only, since only open rows have a bar; the label keeps `completed_at ?? added_at`.
- A `preparePage` helper, so the time-zone test's own contexts install the fake clock and fail on CSP violations like the `page` fixture.
- The UJ-3 test tags the row's element before the crossing and checks the same element is still at index 1, which proves no remount as well as no move.
- The future test reads the POST response and asserts the confirmed `added_at` is more than 55 minutes ahead of the browser's `Date.now()`, so it can't pass on the optimistic row alone.

**What AI missed.**

- Exact-colour E2E checks (`toHaveCSS('background-color', …)`) against a colour that moves continuously with real time between seeding and reading.
- A UJ-3 colour assertion that couldn't see a change: at 23 h 59 m 30 s the bar is already the overdue colour, and the seed sat only 30 s from the boundary.

**Review.** Four lenses produced about 25 findings, each checked against the code.

- **Patched:**
  - A ±2-per-channel colour helper, used for every bar-colour assertion.
  - The UJ-3 and time-zone seeds now have minutes of slack; UJ-3 says honestly that its recolour is proved by the label and the TaskRow unit test.
  - The time-zone "mid" colour is pinned (`rgb(146, 115, 2)` at 12 h 30 m).
  - The time-zone contexts use `devices['Desktop Chrome']`, and their CSP check and close run in a `finally`.
  - `skewServer`/`advance` throw on a non-integer or a negative running offset, the docstring no longer invites a negative skew, and a shared-counter test (`skewServer(1 h)` then `advance(1 h)` → `added_at` about 2 h ahead, browser shows `now`).
  - The bar's `bind:this` type is `HTMLSpanElement | null`, and its CSS falls back to `transparent` before the effect runs.
  - Honest unit-test names, and a real recolour on untick (the clock moves between tick and untick).
- **Rejected:**
  - Forced-colours handling: the label carries the age; the bar is decorative.
  - The skew fixture in the live tests, and the visibility/wake triggers in E2E: the ticket scopes skew to the future case, and the triggers are unit-tested in 1.6.
  - Running E2E on the app profile: it has no test router.

## Ticket 2.4 — Hold timer in the store

**Agents.** Built by the main session on the oneshot route (about 40 lines in one module), then reviewed by one quick-lens reviewer subagent.

**What was built.** The store's `heldKey` gets its 3 s countdown (FR-4). One `setHeld` helper now owns every change to the hold and cancels any running timer. The timer releases only the key it started for. It counts down only once the list is ready, so a hold taken while loading starts its 3 s when the first GET lands. Untick keeps the hold.

**Test generation.** A fake-timer suite covers:

- release at exactly 3 s;
- a newer add restarting the countdown;
- tick, delete and a failed add cancelling it;
- untick keeping it;
- a hold taken while loading surviving until 3 s after ready;
- a list that never loads keeping it.

Mutation checks on the ready gate and on `clearTimeout` each failed tests. Frontend: 319 tests; E2E: 64.

**What AI missed or could not do.** A bulk text replacement also rewrote the new helper's own body into a self-call; I caught it on read-back before running anything. One test claimed to prove a guard that no code path could reach.

**Review.** The quick lens raised four low findings. I patched three: an honest test name, an untick test and a failed-add cancel test. I deferred one: a `load()` re-entering loading doesn't pause the countdown, which only becomes reachable with epic 3's retry.

## Ticket 2.5 — Held row under the input

**Agents.** The dev persona (bmad-build) wrote the plan, and the user approved it at about 1,950 tokens. A Claude Code subagent (Claude Opus) implemented it from the plan alone, after loading DESIGN.md and EXPERIENCE.md as the plan's `context:` requires.

**Prompt that worked.** "Read the plan fully and implement it — the plan is the sole source of truth. Load every file listed in its frontmatter `context:` before you start." The I/O matrix became `e2e/tests/hold.spec.ts`, one test per row. The Code Map's pointer to the `--sticky-height` observer became one shared height watcher.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the rebuilt test stack, the e2e typecheck and Playwright on the system Chrome.

**What was built.**

- `App.svelte`: the `li` whose key is `tasks.heldKey` gets `class:held`, which is `position: sticky` at `top: var(--sticky-height)` on a `surface` background, `z-index: 1` (below the header and its toasts). `.list` is `overflow: clip`, so the corners stay rounded without a scroll container.
- A `watchHeight` helper watches one element's border box at a time, and writes `--sticky-height`, `--held-height` and `--toast-height` on `.page` through `setProperty` (CSP). `--held-height` is the held row plus the 8 px gap, 0 with nothing held, so the toast stack's `top: calc(100% + var(--held-height, 0px))` puts toasts 8 px below the held row, or at the list top as before.
- `TaskRow.svelte`: the controls' `scroll-margin-top` is the sum of the three heights. Inside the held row both extra heights are reset to 0, so its own controls only clear the header.
- Settling: an `$effect.pre` records the control inside the held row that has keyboard focus (`:focus-visible`) before the DOM update. After the update, the effect watches the new held row. If the hold ended with keyboard focus inside, it puts focus back through a new `keepFocus()` in `lib/focus.ts` and calls `scrollIntoView({ block: 'nearest' })` on that control. A tapped or clicked control is left alone, and the page never scrolls.
- Unit cover in `App.test.ts`: the observer stub now records each observer and its targets. Tests cover the sticky height, the toast height, the no-`ResizeObserver` fallback, the held class following `heldKey` and clearing at `HOLD_MS`, `--held-height` re-targeting on a newer add, keyboard focus kept with one `scrollIntoView`, a focused control without `:focus-visible` neither restored nor scrolled, and no scroll with focus elsewhere. `focus.test.ts` covers `keepFocus` connected, already active and disconnected.
- **Results:** 325 Vitest tests pass, with coverage at 98.88% statements, 95.01% branches, 100% functions and 99.59% lines against the 70% gate. Check, lint, Prettier and build are green. All 74 E2E tests pass, and `hold.spec.ts` passed three repeats in a row.

**What AI decided beyond the plan.**

- `overflow-anchor: none` on `.list`. Without it, Chrome's scroll anchoring moved `scrollY` by one row when the held row was inserted at the top, and the "visible on add" test failed. A mutation run proved it.
- `keepFocus()` in `lib/focus.ts`. The plan expected focus to stay on the held tick by itself. But Svelte's keyed `{#each}` moves the row with `before()`, which blurs it, and the "focused held control" test failed without the restore. Focus still moves only through `lib/focus.ts` (AD-18).
- The 8 px gap is folded into `--held-height` rather than toggling a class on the toast anchor. The gap then also counts in the controls' clearance.
- Overriding `--held-height` and `--toast-height` to 0 on the held row itself, so tabbing to its tick never asks the browser to scroll a sticky row clear of itself.

**What AI missed or could not do.**

- The tap-focus path after an early tick. On phone, `returnToInput` does nothing, so the tapped tick keeps focus. The first settle restored that focus and scrolled the page to where the done row landed.
- A clearance test that couldn't fail: it focused the last row, which can never scroll under the header.
- The fixture's page clock also runs in real time, so a hold ends after 3 s of wall time. Each E2E test checks `li.held` is still present when it measures, so a slow run fails loudly instead of passing on a settled row.

**Review.** Four lenses raised about 30 findings, each checked against the code.

- **Patched:**
  - The settle restores only keyboard focus, so a tap-tick on phone no longer makes the page jump.
  - `overflow: hidden` before `overflow: clip`, as a fallback for Safari before 16.
  - The clearance test now uses a middle row and checks it lands within 2 px of header + held row + gap + toast, so it can fail.
  - New E2E checks: Tab to the held tick doesn't scroll, and settling to an off-screen place with focus in the input doesn't follow.
  - Unit tests for `keepFocus`.
  - Test cleanup: `afterEach` restores mocks, globals and timers, and `scrollIntoView` is spied on rather than assigned and deleted.
  - Honest comments: the settle scrolls the focused control, and the unproven "slides from where it was" claim is gone.
- **Rejected:**
  - Pausing the page clock: AD-8 forbids `pauseAt` and `setFixedTime`, and each test asserts the hold is still on.
  - Cross-browser runs of `overflow: clip` and `overflow-anchor`: E2E is Chrome-only by design.
  - Capping the held row on short viewports.
  - Querying the held `li` some other way than by its class.

## Ticket 2.6 — Refactor sweep

**Agents.** The dev persona (bmad-build) planned the sweep from the epic's build records, and the user picked the scope: an e2e Prettier config, ignoring `.vitest/`, the `age.ts`/`oklch.ts` split and a shared hold guard in E2E. A Claude Code subagent (Claude Opus) implemented it from the plan alone; the plan's `context:` was empty.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map named the 2.2 blocker (`tsconfig.node.json` demands explicit extensions on relative imports, and `tests/theme-surfaces.test.ts` pulls `age.ts` in) and offered two ways out, so the split needed no exploration.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check` with `tsc -p tsconfig.node.json`, ESLint, Prettier, Vitest with coverage, `vite build`, the e2e Prettier check and typecheck, the rebuilt test stack with Playwright on the system Chrome, and the rebuilt app profile.

**What was built.**

- `e2e/` gets `prettier` (`^3.9.9`, the frontend's), an `.prettierrc` with the frontend's options and no Svelte plugin, and `format` / `format:check`. One mechanical pass, in its own commit, reformatted `fixtures.ts` (one signature) and `tests/hold.spec.ts` (double quotes and semicolons left by an earlier default-options reformat); every other file was already clean.
- `frontend/.gitignore` ignores `.vitest/`, where the rtk CLI wrapper writes its Vitest JSON report, so wrapper runs never show as untracked.
- `lib/oklch.ts` now holds the OKLab/OKLCH conversion, `fitGamut`, `toHex`, `hexToRgb`, `hexToOklch`, `relativeLuminance` and `contrastRatio`; only comments changed in the moved code. After review, `fitGamut` and `toHex` throw a `RangeError` on a non-finite L, C or H (and `fitGamut` on a chroma too large to step down, which used to loop forever), and `relativeLuminance` is no longer exported. `lib/age.ts` keeps the labels, `ageColour`, `nudgeContrast`, `THEME_SURFACES` and the endpoints, and imports `./oklch`. The two maths tests (`hexToRgb` rejects, `fitGamut` clamps a negative chroma) moved to `oklch.test.ts`; every other test stayed in `age.test.ts`, with only its imports changed. After review, `oklch.test.ts` also pins known contrast values (21 for black on white, 1 for a colour on itself), a `hexToOklch` → `toHex` round trip on the 14 DESIGN stops, a hue in [0, 360) where atan2 is negative, and the non-finite throws.
- `tests/**/*.ts` moves to its own `tsconfig.tests.json`, which extends `tsconfig.node.json` with `module: "esnext"` and `moduleResolution: "bundler"`, so the extensionless `./oklch` that `tests/theme-surfaces.test.ts` pulls in typechecks. `npm run check` runs it, and `tsconfig.json` references it. The Node-run files (`vite.config.ts`, `vitest-setup.ts`, `eslint.config.js`) stay on `nodenext` in `tsconfig.node.json`, and `src/`'s import style is unchanged.
- `hold.spec.ts` has `stillHeld(page, text)`: within 500 ms it asserts exactly one `li.held` row and that it holds `text`, failing with "no single held row for "<text>" — the 3 s hold may have ended (slow run; AD-8 forbids pausing the page clock)", the duration built from `HOLD_MS`. It returns the held row, and the measurements read that locator. It replaces every inline `toHaveCount(1)`, runs before every `runFor(HOLD_MS)` (including inside `animationsAfterSettle`), and after each set of hold-time box reads and the axe scan.
- **Results:** 329 Vitest tests before the sweep (2.5's verification) and 329 after the split, since tests only moved; after the review fixes the run prints 356, at 98.89% statements, 95.69% branches, 100% functions and 99.59% lines. Before review, coverage was 98.88% statements, 95.32% branches, 100% functions and 99.59% lines against the 70% gate; check, lint, Prettier and build were green, all 75 E2E tests passed, and `hold.spec.ts` passed three repeats in a row (and again after the review fixes). The app profile rebuilt healthy, with `:8081` serving the app and `/api/health` at 200.

**What AI decided beyond the plan.**

- `stillHeld` runs before and after the hold-time reads: a check after a measurement is what proves the hold was still on while it was taken, and a check before turns a `boundingBox` timeout on a missing row into the clear message.
- The "Exported for tests and story 2.3" notes went from the functions `age.ts` now imports; `hexToOklch` keeps "For tests and review".
- A mutation run, a `runFor(3_000)` slipped in before a `stillHeld`, showed the test failing with the guard's message.

**What AI missed.**

- Settle tests ("settles", both motion tests, "no follow") that could pass after the hold had already ended on its own, because nothing checked the row was still held before `runFor(HOLD_MS)`.
- A tsconfig fix that loosened checks for the Node-run files: putting all of `tsconfig.node.json` on bundler resolution would have let an extensionless import there typecheck and then fail at run time.

**Review.** Four lenses produced about 30 findings, each checked against the code.

- **Patched:**
  - Guards on the settle tests: `stillHeld` before every `runFor(HOLD_MS)`.
  - A stricter and faster `stillHeld`: exactly one held row, the returned locator used by the measurements, a 500 ms timeout, a message built from `HOLD_MS` that no longer blames a slow run for every missing row, and no redundant guard straight after `add()`.
  - The tsconfig split: `tests/` on bundler resolution in `tsconfig.tests.json`, the Node-run files kept on `nodenext`.
  - The non-finite guards in `oklch.ts`.
  - `oklch.test.ts` basics.
  - Honest comments: `fitGamut` says the stop tests live in `age.test.ts`, and `.gitignore` says what writes `.vitest/`.
- **Rejected:**
  - Enforcing `format:check` in CI or a hook: there is no CI, and the gap predates this ticket.
  - A shared root Prettier config.
  - The review diff leaving out the lockfile and deferred-work.md: by design.

## Ticket 3.1 — Load failure and Retry

**Agents.** The dev persona (bmad-build) wrote the plan for the first story of epic-everywhere-and-handed-in. A Claude Code subagent (Claude Opus) implemented it from the plan alone, with the architecture spine as its only `context:` file.

**Prompt that worked.** The same prompt as earlier tickets. The plan's Code Map gave line numbers for every touch point (the `runGet` placeholder, the hold guard, `getQueued`, the `onretry` wiring, `failApi`), and the I/O matrix mapped one test to each row, so no exploration was needed beyond reading the named files.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the e2e typecheck and Prettier check, and the rebuilt test stack with Playwright on the system Chrome.

**What was built.**

- `lib/tasks.svelte.ts`: `LoadState` gains `load_failed`. A failed GET goes through `loadFailed()`: silent unless the state is `loading`; if a GET is queued behind it, that GET decides; otherwise the state becomes `load_failed` and the store raises the load-failure toast, or, after a failed Retry, keeps it and calls `toasts.alert(COPY.retryFailed)`. Every successful GET sets `ready` and hides the toast. `retry()` acts only in `load_failed` and delegates to `load()`. Under `load_failed`, `rows` is the held row alone, if any. The hold countdown now runs whenever the state is not `loading`, and entering `loading` cancels a running countdown while keeping `heldKey`, so a full 3 s starts when the load settles. The header comment states the failure rules.
- `App.svelte`: `onretry` calls `tasks.retry()`. No other change: the empty state was already `ready`-only, the skeleton follows `loading`, and the focus safety net returns focus to the input when Retry disappears.
- `e2e/fixtures.ts`: `failApi` keeps its handler in a const and returns `() => page.unroute('**/api/**', handler)`. Existing call sites ignore the return value.
- `e2e/tests/load-failure.spec.ts`: a failed first GET shows the `load_failed` toast with Retry, no empty state, no list and no skeleton, and passes axe; after the failure is cleared, Retry renders the seeded list, the toast goes, and focus is on the input.
- Unit cover: `tasks.svelte.test.ts` spies on `showLoadFailure`, `hideLoadFailure` and `alert`, and has one test per store matrix row (first load fails, Retry succeeds, Retry fails, double Retry, silent while ready, recovery GET recovers, queued GET decides, add under `load_failed`, Retry restarts the countdown), plus a queued GET that also fails, Retry outside `load_failed`, and a hold taken while loading released 3 s after the load fails. `App.test.ts` checks the Retry wiring end to end on the real store.
- **Results:** 366 Vitest tests pass, with coverage at 99.23% statements, 96.16% branches, 100% functions and 100% lines against the 70% gate. Check, lint, Prettier and build are green. All 76 E2E tests pass.

**What AI decided beyond the plan.**

- The store tracks whether it raised the toast in a private `loadFailureShown` flag instead of reading `toasts.items`. Only the store raises or hides that toast, it cannot be dismissed, and the flag keeps the rule testable with the toast calls mocked.
- `load()` itself cancels the running hold countdown, and `retry()` is `load()` behind the `load_failed` guard, so every entry into `loading` follows the same rule.
- Three tests written for the old "a failed GET changes nothing" behaviour were rewritten for `load_failed`: the first-load failure, the recovery GET after a failed load, and the hold that never counted down while loading.

**What AI missed or could not do.**

- One full E2E run failed `rows.spec.ts` "motion: tick slides the rows for about 200 ms" (no animation captured). The spec passed three repeats on its own and the next full run was green. It is a timing flake in an older test that this change does not touch.

**Review.** Four lenses (blind hunter, edge-case hunter, verification gap, intent alignment) gave 18 findings: 2 medium, 9 low, 7 false. Nine were patched and nothing was deferred.

- Rows hidden under `load_failed` came back while the Retry GET was loading. `rows` now hides the list whenever the load-failure toast is up, so the list stays hidden until a GET succeeds.
- The double-Retry test passed without the guard. It now settles the GET, and an App test double-clicks Retry, which pins `onretry` to `retry()`.
- After a load that lasted over 300 ms failed, `skeletonDue` stayed true, so Retry skipped the anti-flash delay. The effect's cleanup now resets it.
- Tests added:
  - App: a failed Retry (the toast and the alert text), and a task added under `load_failed` showing as the only row.
  - Store: a recovery GET failing silently under `load_failed`, and Retry racing a recovery GET.
- After the fixes, 372 Vitest tests pass with 99.23% statement coverage, and all 76 E2E tests pass.

## Ticket 3.2 — Background polling

**Agents.** The dev persona (bmad-build) wrote the plan for the second story of epic-everywhere-and-handed-in. A Claude Code subagent (Claude Opus) implemented it from the plan alone, with the architecture spine as its only `context:` file.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map named the touch points (`runGet`'s success path, `getInFlight`, the `confirmed === null` test for an add's POST, the clock's `visibilitychange` pattern and the test's visibility stub), and the I/O matrix mapped one test to each row.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the e2e typecheck and Prettier check, and the rebuilt test stack with Playwright on the system Chrome.

**What was built.**

- `lib/tasks.svelte.ts`: exports `POLL_MS = 30_000`. The first successful GET calls `startPolling()`, which runs once per store: it adds the store's own `visibilitychange` listener and, if the tab is visible, starts a `setInterval`. Hidden clears the interval; visible again polls once and starts a fresh interval, so the next tick is 30 s later. `poll()` is skipped, never queued, while a GET is in flight, or while any entry has `confirmed === null` (an add's POST); tick, untick and delete ops do not block it. A poll goes through `refresh()` and the existing merge, and a failure is silent because `loadFailed()` already ignores failures once `ready`. `dispose()` clears the interval and removes the listener; the app singleton never calls it. The header comment gains the polling rules.
- `tasks.svelte.test.ts`: the global `afterEach` calls `store.dispose()`. A new `background polling (AD-10)` suite fakes `setInterval` and stubs `document.visibilityState` as `clock.test.ts` does, with one test per store matrix row (no poll while loading or under `load_failed`, the 30 s/60 s cadence, a remote add, a remote delete that ends the hold, hidden for 90 s, the visible-refetch, GET in flight on a tick and on visible, an add's POST in flight, a tick op in flight, a silent failure, `dispose()`), plus one cadence per store across several successful GETs and a first load that lands while hidden.
- `e2e/tests/sync.spec.ts`: the test's `request` context plays the other device. A POST shows up on the idle tab after `advance(30 s)` with focus still on the input; a DELETE removes the row after one poll and it stays gone after a second. Each step waits for the poll's `GET /api/tasks` response.
- Spec and architecture: the Open Questions item on the silent failed poll moved to a Resolved list with the user's decision (2026-10-01).
- **Results:** 388 Vitest tests pass, with coverage at 99.26% statements, 96.33% branches, 100% functions and 100% lines against the 70% gate. Check, lint, Prettier and build are green. All 78 E2E tests pass, including the existing ones that `advance` past 30 s.

**What AI decided beyond the plan.**

- The listener is added when polling starts rather than when the store is created, so the module singleton, which tests never load, registers nothing.
- If the first load lands while the tab is hidden, no interval starts; the first visible change polls and starts it.
- The resolved Open Questions keep their heading with "None open." and a short Resolved list, in both the spec and the architecture spine.

**Review.** Four lenses (blind hunter, edge-case hunter, verification gap, intent alignment) gave 15 findings: 1 medium, 9 low, 5 false. Five were patched and nothing was deferred.

- `App.test.ts` never disposed the store it swapped out, so each test left a polling interval and a listener behind. `resetTasks()` now disposes the old store first.
- The `visibilityState` stub leaked into later suites. It is deleted after each test.
- The `getQueued` guard in `poll()` could never fire, so it was dropped.
- The skipped-refetch tests now also check that the cadence restarts from the visible event.
- After the fixes, 388 Vitest tests pass with 99.26% statement coverage, and all 78 E2E tests pass.

## Ticket 3.3 — Phone access over Tailscale

**Agents.** The dev persona (bmad-build) took the oneshot route, because the change is docs only. It checked the README against Tailscale 1.98.4 on the laptop and edited it directly. A quick-review subagent checked the diff.

**MCP servers.** None. The checks used the `tailscale` CLI (`version`, `status`, `serve status`) and `docker compose ps`.

**What was built.**

- `README.md` › Phone access is split into three subsections:
  - **Tailscale Serve:**
    - rebuild the app profile first;
    - turn on MagicDNS and HTTPS Certificates;
    - fix an "Access denied" from `tailscale serve` with `tailscale set --operator`;
    - find the URL with `tailscale serve status`;
    - stop with `--https=443 off` or `reset`.
  - **`APP_BIND`:**
    - `127.0.0.1:8081` and Serve both stop working on the laptop;
    - the page is plain HTTP;
    - the app can fail to bind at boot if Docker starts before Tailscale;
    - avoid `0.0.0.0`.
  - **Sync between devices:** usually within 30 s, and up to a minute while the tab is saving a task of its own.

**Device run (author, 2026-10-02).** The author followed the README's Tailscale Serve steps on the laptop and their phone. They report that every check passed:

- the phone loaded the app over the tailnet;
- a task added on the phone appeared in the idle laptop tab within the expected window, without a reload;
- the stop step worked.

The author didn't record exact timings.

**What AI decided beyond the plan.** The author ran the commands that expose the app or rebuild the real stack (`docker compose up -d --build`, `tailscale serve`), not the agent.

**Review.** The quick lens made 5 findings. Four were patched: an ambiguous laptop URL under `APP_BIND`, the boot-time bind caveat, the softened sync timing, and the real tailnet names removed from the plan. The fifth (this section was missing) was pending until the device run.

## Ticket 3.4 — Dark theme and pre-paint theme script

**Agents.** The dev persona (bmad-build) wrote the plan for the fourth story of epic-everywhere-and-handed-in. A Claude Code subagent (Claude Opus) implemented it from the plan alone, with the architecture spine as its only `context:` file.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map gave the DESIGN line range for the dark hexes, the clock module as the singleton pattern to copy, the one `'light'` literal in `TaskRow`, and the Vite hook to use (`transformIndexHtml` post, with `ctx.bundle`). The I/O matrix mapped to unit tests for the module and the script, and to E2E tests for paint, tokens and preloads.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the e2e typecheck and Prettier check, and the rebuilt test stack with Playwright on the system Chrome.

**What was built.**

- `app.css`: `:root` gets `color-scheme: light`. Two dark blocks, `:root[data-theme='dark']` and `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`, each set `color-scheme: dark` and the 16 DESIGN `-dark` hexes, written out literally.
- `public/theme-init.js`: a plain ES5 script. Inside `try/catch` it reads `localStorage.theme` and sets `data-theme` only for `'light'` or `'dark'`. `index.html` loads it with a blocking `<script src>` as the first element after `<meta charset>`.
- `lib/theme.svelte.ts`: `theme.current` is the painted `data-theme` if valid, otherwise the `prefers-color-scheme` query, followed live; with no `matchMedia` it is light. `theme.set(t)` sets the attribute and `current`, then stores the choice inside `try/catch`. Exports `THEME_STORAGE_KEY`.
- `TaskRow.svelte`: `ageColour(…, theme.current)`.
- `vite-plugins/preload-fonts.ts`: a build-only plugin whose post `transformIndexHtml` hook adds three `<link rel="preload" as="font" type="font/woff2" crossorigin>` tags. The pure `preloadTags(fileNames, base)` throws unless each face matches exactly one emitted woff2.
- Tests:
  - `theme.svelte.test.ts` loads a fresh module per case under a fake `matchMedia`;
  - `tests/theme-init.test.ts` runs the real script file under jsdom;
  - `tests/theme-surfaces.test.ts` adds name parity with `:root` for each dark block, value parity between the two, and `THEME_SURFACES.dark` against both;
  - `tests/preload-fonts.test.ts` covers the helper;
  - `TaskRow.test.ts` adds dark cases, including a live recolour on `theme.set`;
  - `e2e/tests/theme.spec.ts` covers OS dark and OS light, stored light on a dark OS, stored dark recorded at `<body>` insertion, an invalid value, a throwing `getItem`, the script tag's position, and the three preloads (in the HTML and fetched by the browser).
- **Results:** 422 Vitest tests pass, with coverage at 99.28% statements, 96.43% branches, 100% functions and 100% lines against the 70% gate. Check, lint, Prettier and build are green, and `dist/index.html` has 3 preloads. All 87 E2E tests pass.

**What AI decided beyond the plan.**

- `tests/theme-init.test.ts`, a unit test of the pre-paint script itself, which the plan did not list. It reads the file through `import.meta.dirname`, because under jsdom `import.meta.url` is not a `file:` URL, and it adds `/// <reference lib="dom" />` because `tsconfig.tests.json` has no DOM lib.
- An ESLint override for `public/theme-init.js` allows an unused `catch (e)`, because ES5 has no optional catch binding. ESLint cannot enforce ES5 here: the typescript-eslint parser ignores `ecmaVersion`, and `espree` is not a direct dependency.
- `preloadTags` also fails when a face matches more than one woff2, not only when it matches none.
- E2E: the extra matrix rows (invalid value, throwing `getItem`) run in the browser too, and a `pageerror` listener proves no error escapes.

**Review.** Four lenses (blind hunter, edge-case hunter, verification gap, intent alignment) gave 18 findings: 13 low and 5 false. Six were patched, one was deferred, and the rest were rejected with evidence.

- A test now ties `theme-init.js`'s storage key to `THEME_STORAGE_KEY`.
- The drift test now checks every dark token against DESIGN.md's `-dark` values, not just `surface` and `hover`. It also matches token names whatever their value, so a non-hex token can't slip out of the parity check.
- `theme.svelte.ts` falls back to `addListener` where `addEventListener` is missing (Safari < 14).
- The E2E preload test now proves each face is fetched exactly once.
- A test comment was corrected.
- Deferred: a `Cache-Control` header for the unhashed `theme-init.js` (nginx sets none today).
- After the fixes, 427 Vitest tests pass with 99.28% statement coverage, and all 87 E2E tests pass.

## Ticket 3.5 — Theme toggle

**Agents.** The dev persona (bmad-build) wrote the plan for the fifth story of epic-everywhere-and-handed-in. A Claude Code subagent (Claude Opus) implemented it from the plan alone; the plan's `context:` list was empty, so the Code Map's files (DESIGN and EXPERIENCE sections, the laptop mockup, `TaskRow`, `theme.svelte.ts`, `focus.ts`, `theme.spec.ts`, `fixtures.ts`) were the only inputs.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map pointed at `TaskRow` as the pattern for `returnToInput` and the focus ring, at the mockup for the SVG paths and `.toggle`/`.seg` CSS, and at the 3.4 E2E helpers to reuse. The I/O matrix mapped one-to-one to E2E tests.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier, Vitest with coverage, `vite build`, the e2e typecheck and Prettier check, and the rebuilt test stack with Playwright on the system Chrome.

**What was built.**

- `components/ThemeToggle.svelte`: one `<button type="button">` with two `aria-hidden` segments (sun, then moon), each a 16 px stroke SVG copied from the laptop mockup. `aria-label` is "Switch to dark theme" or "Switch to light theme" from `theme.current`; no `aria-pressed`. A click calls `theme.set` with the other mode, then `returnToInput()` only when `event.detail > 0`, so Enter or Space leave focus on the toggle. CSS per DESIGN `theme-toggle`: a divider pill with `--space-1` padding, 22×18 border-box segments with `1px 3px` padding and no gap, the active segment filled `--color-surface` with an inset divider hairline and a primary icon, the other icon muted. No hover state; a `:focus-visible` accent outline as in `TaskRow`; a `1px solid CanvasText` outline on the active segment under `forced-colors: active`. No inline styles.
- `App.svelte`: `<ThemeToggle />` after the wordmark in `.header`, which already spaces them apart, so the toggle comes before the input in the DOM.
- Tests:
  - `ThemeToggle.test.ts` (7 tests): the markup, the name and active segment per theme, `set` with the other mode and the UI following it, `returnToInput` after `set` only for `detail > 0`, focus kept for `detail === 0`, and a throwing `setItem`.
  - `App.test.ts`: the toggle is in the header, after the wordmark and before the input.
  - `e2e/tests/theme-toggle.spec.ts` (13 tests): one per matrix row ("no way back" runs twice, stored dark and stored light), with a11y at 320 and 1280 px under each theme.
  - The `<body>`-insertion `MutationObserver` moved from `theme.spec.ts` to `fixtures.ts` as `recordThemeAtBody` / `themeAtBody`, since both specs need it.
- **Results:** 435 Vitest tests pass, with coverage at 99.29% statements, 96.53% branches, 100% functions and 100% lines against the 70% gate. Check, lint, Prettier and build are green. All 99 E2E tests passed before the review fixes, the layout specs included (87 earlier plus 12 new). The fixes brought the toggle spec to 13 tests.

**What AI decided beyond the plan.**

- Each segment carries `data-segment="light|dark"`, so the tests can name the active segment without depending on order.
- The storage-blocked matrix row is also covered by a unit test, not only E2E.
- The "no way back" E2E test stores the choice with a click, flips the emulated OS so it ends up differing from the stored theme (waiting until `matchMedia` reports each scheme), and checks the name, the active segment and the background stay on the stored theme.
- `themeAtBody` throws when `recordThemeAtBody` was never installed, so a missing set-up never reads as "no data-theme".

**Review.** Four lenses (blind hunter, edge-case hunter, verification gap, intent alignment) gave 14 findings: 1 medium, 12 low, 1 false. Five were patched, one was deferred, and the rest were rejected with evidence.

- The "no way back" E2E could not fail. It now waits for each emulated OS change, and ends with the stored theme differing from the OS, in both directions.
- `expectTheme` now retries its checks.
- A unit-test assertion that could never fail was dropped.
- The icon is sized in px to match its px segment.
- `themeAtBody` now throws if its recorder was never installed.
- Deferred: an E2E pass under forced colours (the active segment's `CanvasText` outline, and App's focus ring).
- After the fixes, 435 Vitest tests pass with 99.29% statement coverage, and all 100 E2E tests pass.

## Ticket 3.6 — Refactor sweep

**Agents.** The dev persona (bmad-build) planned the sweep from the epic's build records and deferred review findings, and the user picked the scope (2026-10-02): de-flake the motion test, cache headers in nginx, a forced-colours E2E describe, a Prettier check for `docs/`, resolution notes in `deferred-work.md`, and a script for the compose profile and stale-IP checks. A Claude Code subagent (Claude Opus) implemented it from the plan alone, with the architecture spine as its only `context:` file.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map named the sampler's line range, the `index`/`try_files` internal redirect that lets `location = /index.html` cover `/` and deep links, the stylesheet-href extraction to copy for an `/assets/` URL, and the two forced-colours rules under test, so little exploration was needed.

**MCP servers.** None. Verification used the shell and Docker: `svelte-check`, ESLint, Prettier (code and `docs/`), Vitest with coverage, `vite build`, the e2e typecheck and Prettier check, the rebuilt test stack with Playwright on the system Chrome, `scripts/check-infra.sh`, and the rebuilt app profile.

**What was built.**

- `e2e/tests/rows.spec.ts`: `animationsAfterClick` no longer takes one sample 40 ms after the click. From just before the click it records every row `Element.animate()` call and samples `document.getAnimations()` at once and on every frame, until a row animation appears or 1 s passes, then restores `Element.prototype.animate`. Both motion tests keep their assertions.
- `frontend/nginx/default.conf.template`: `location = /index.html` and `location = /theme-init.js` send `Cache-Control: no-cache`; `location /assets/` sends `public, max-age=31536000, immutable`. Each repeats `X-Content-Type-Options`, `Referrer-Policy` and the CSP, because an `add_header` in a location drops the inherited ones. `location /` keeps its `try_files … /index.html` fallback, and `/` and deep links reach the exact `/index.html` location through internal redirects.
- Tests for the headers: `frontend/tests/nginx-template.test.ts` parses each static location and checks its exact header set, plus the fallback; `e2e/tests/headers.spec.ts` checks the served headers on `/`, a deep link, `/theme-init.js` and a hashed `/assets/*.js` from `index.html`.
- `e2e/tests/theme-toggle.spec.ts` "under forced colours" (`forcedColors: 'active'`): the active segment has a 1px solid outline and the other none, and the focused input's outline style is `solid`.
- `frontend/package.json`: `docs:format` and `docs:format:check` run Prettier over `../docs` with `frontend/.prettierrc`. One write pass reformatted `ai-log.md` (blank lines before lists), `bmad_exercise.md` (padded tables, `_` emphasis) and `PRD.md` (leading and trailing blank lines); a word-level comparison found no wording change. The README's frontend section lists the check.
- `scripts/check-infra.sh`: bash with `set -euo pipefail`, one PASS/FAIL/SKIP line per check, exit 1 on any failure. It checks the test profile (`:8082` reset 204, and `:8081` reset 404 when the app profile is running), the stale IP (stop `backend-test`, `busybox` squatters on the compose network until one holds its IP, `backend-test` back on a new IP, `:8082/api/health` 200 within 15 s, SKIP if none got the old IP), and the dev profile (`--reload` on the running uvicorn, `:5173/api/health` 200 through Vite, then stop). An `EXIT` trap removes the squatters, makes sure `backend-test` runs and stops only the dev-profile services the script started. The README documents it under Compose profiles.
- `deferred-work.md`: six "Resolved by entry 3.6" entries: the 1.8 `load()` race (closed by 1.12), the font preloads (3.4), the hold countdown during a reload (3.1), and the motion flake, `Cache-Control` and forced colours (3.6). Two more say the compose profiles and the nginx re-IP test are covered by the manual smoke script, which no CI runs.
- **Results:** 440 Vitest tests pass, with coverage at 99.29% statements, 96.53% branches, 100% functions and 100% lines against the 70% gate. Check, lint, Prettier, the docs check and build are green. All 106 E2E tests pass, and `rows.spec.ts` passed `--repeat-each 10` (180 of 180). `scripts/check-infra.sh` printed PASS on all five lines and exited 0, three times; its stale-IP check moved `backend-test` from 172.27.0.6 to 172.27.0.8, and later from 172.27.0.8 to 172.27.0.9. On the rebuilt app profile, `/` and `/theme-init.js` send `no-cache`, and a throwaway read-only Playwright run against `:8081` confirmed Done when 1–3: the Retry toast with `GET /api/tasks` failed and the list after Retry, a simulated remote task shown after one 30 s poll with focus still on the input, and the theme following a dark OS and keeping the light choice after a reload, with no CSP violations.

**What AI decided beyond the plan.**

- The sampler also wraps `Element.prototype.animate`, not only `getAnimations()`, because a finished animation can drop out of `getAnimations()` before the next sample, while a recorded `animate()` call cannot be missed.
- `location /assets/` has `try_files $uri =404`: a missing hashed file is a 404 instead of `index.html` served with a one-year `immutable` header.
- The forced-colours input test asserts `solid`, not only "not `none`": Chrome's own focus ring is `auto`, so only `solid` proves App's transparent ring is the one painted.
- `headers.spec.ts` also checks a deep link, the I/O matrix's "Deep link" row.
- The docs scripts pass `--config .prettierrc`, since Prettier would otherwise look for a config above `docs/` and find none.
- `check-infra.sh` reads `--reload` from the running process (`docker top`), not the compose `command`, so it proves the `entrypoint.sh` pass-through; it reads `APP_BIND` from the shell or `.env` for the app probe; it pulls `busybox` quietly on first use.
- `check-infra.sh` starts up to 8 squatters instead of one. With a single squatter the second run reported SKIP: Docker gave it a lower free address left by the first run, not `backend-test`'s.
- The Done-when check on the app profile simulated the API failure and the other device with `page.route`, so it wrote nothing to the app's data.

**What AI missed or could not do.**

- The dev check runs `backend-dev` against the app's `db`, so it runs `alembic upgrade head` there (a no-op on the same code). The README says so; the plan allowed running the dev profile.
- Done when 2 was checked with a simulated remote task, not a real second device; the device run in 3.3 covers the real path.

**Review.** Four lenses (blind hunter, edge-case hunter, verification gap, intent alignment) gave 23 findings: 2 medium, 19 low, 2 false. Twelve were patched, none were deferred, and the rest were rejected with evidence.

- A missing `/assets/` file's 404 was being stamped `immutable` for a year. That `Cache-Control` line no longer uses `always`, and the static test and E2E now pin the 404.
- `check-infra.sh`:
  - restores only the services it started (`db` included);
  - prints a FAIL line instead of aborting under `set -e`;
  - captures `docker top` output before grepping it, avoiding a false FAIL under `pipefail`;
  - removes squatters on every path;
  - caps each health curl at 2 s;
  - accepts a quoted or CRLF `APP_BIND`.
- Stricter assertions: `Referrer-Policy`, and the forced-colours outline width.
- `format:check` now runs `docs:format:check`.
- The two infra entries in deferred-work say "covered by the manual smoke script" rather than "Resolved".
- **One more fix after review.** The repeat run caught the new motion sampler crashing once in 180: Svelte had detached a finished animation's `effect` before the final read. The sampler now records each duration when it first sees the animation. Two more runs of `rows.spec.ts --repeat-each 10` passed 180 of 180 each.
- After the fixes, 441 Vitest tests pass with 99.29% statement coverage, all 107 E2E tests pass, and `check-infra.sh` prints PASS on all 5 lines.

## Ticket 3.7 — User-journey E2E suite

**Agents.** The dev persona (bmad-build) planned the ticket for the epic's Done when 5 (at least 5 E2E tests covering UJ-1 to UJ-3, plus CAP-9 and CAP-10). A Claude Code subagent (Claude Opus) implemented it from the plan alone; the plan listed no `context:` files.

**Prompt that worked.** The same prompt as earlier tickets. The Code Map pointed at the helpers to copy (`stillHeld`, `expectBarColour`, `nextPoll`, the second-context set-up) and at EXPERIENCE › Key Flows for the step names, so each journey's `test.step` titles follow the numbered steps.

**MCP servers.** None. Verification used the shell, Docker and Playwright on the system Chrome.

**What was built.**

- `e2e/tests/journeys.spec.ts`: five tests, one per journey, each with a `test.step` per Key Flows step and an axe check at the end.
  - UJ-1: eight older tasks, then type and Enter. The input clears and keeps focus. The task is the held row, with "now" and a green bar. It settles last after `runFor(3_000)`. Then a failed `POST` shows the add toast and puts the text back in the input, and Enter after clearing the failure saves it.
  - UJ-2: two overdue tasks, two fresher ones and one completed task. Tick the 2-day task ("done now", top of the completed tasks), untick it (back in place, "2d", red), tick it again. A rejected tick on the 1-day task leaves it as it was, with the action toast. Every remaining task is then deleted with its ×, and the run ends on the empty state.
  - UJ-3: a 23 h 59 m task reads "23h". After `advance(60_000)` it reads "1d", its bar is overdue red, it has not moved, the document was not reloaded and the input keeps focus.
  - CAP-9: a failed first `GET` shows the Retry toast with no list and no empty state. After clearing the failure, Retry shows the list, closes the toast and focuses the input.
  - CAP-10: a second context with the Pixel 7 profile, set up with `preparePage`. It adds a task through its UI, and the laptop shows it after one poll. It deletes a task, and the laptop drops it after the next poll. The laptop's focus stays on the input, and the phone's axe and CSP checks run.
- `e2e/fixtures.ts` now holds the helpers that had copies in two or more specs: `near` and `expectBarColour` (from `age-bar` and `theme`), `settled` (from `age-bar` and `rows`), `stillHeld` with `HOLD_MS` (from `hold`), and `nextPoll` with `POLL_MS` (from `sync`). Those specs import them now, with no change in behaviour.
- **Results:** typecheck and Prettier check are green. All 112 E2E tests pass, and `journeys.spec.ts --repeat-each 3` passed 15 of 15.

**What AI decided beyond the plan.**

- Row order is read from the `Delete "<text>"` buttons' names, and an age label with `getByText(label, { exact: true })` inside the row, so no locator uses `.text` or `.age`.
- UJ-2 seeds one already-completed task, so "moves to the top of the completed tasks" is a real check.
- UJ-2 dismisses the action toast before the deletes. The toast sits over the top row's ×, and the mouse resting on it holds it open, so the first delete click was intercepted until the test timed out.
- UJ-3 proves "no reload" with a flag set on `window` before `advance` and read back after.

**Review.** The coordinator's review asked for nine fixes, all made:

- CAP-10 reads the laptop's order once before the poll, so the check can't pass by waiting for a poll the laptop ran on its own.
- The "30m" label also accepts "31m".
- The duplicated helpers moved to `fixtures.ts`.
- Docblock fixes, and a redundant position check dropped.
- UJ-1 runs at 1280×360 and asserts the bottom open row is below the fold, which proves "older tasks fill the screen".
- UJ-2 now follows Key Flows: delete the second overdue task, assert the top open row is no longer overdue red, then clear the rest.
- UJ-3 asserts both live regions are empty and no toast shows.
- The phone's CSP check runs in `finally`.
- Axe now also runs on a populated list (UJ-2) and with the add-failure toast showing (UJ-1).

After the fixes, `journeys.spec.ts --repeat-each 3` passed 15 of 15, and the five specs that lost their copies pass.

**What AI missed or could not do.**

- UJ-3's "not yet red" is shown by the "23h" label only. At 23 h 59 m `ageColour` already returns the overdue hex (`#C43F3E`), so no colour check can tell it from 24 h, as the `age-bar.spec.ts` UJ-3 test also notes.

## Ticket 3.8 — QA reports

**Agents.** The dev persona (bmad-build) wrote the plan. A Claude Code subagent (Claude Opus) implemented it from the plan, after loading its two `context:` files: the architecture spine and `deliverables.md`.

**Prompt that worked.** The same prompt as earlier tickets. The plan's "Never" list did the most work: no Lighthouse, no QA specs against `:8081`, and "a miss is reported as a miss". When the performance check failed, that line ruled out loosening the measurement until it passed.

**MCP servers.** None. The Chrome DevTools part ran through the Chrome DevTools Protocol from Playwright (a CDP session for `Tracing`, `Performance.getMetrics` and Network timing), not through a DevTools MCP server.

**What was built.**

- `e2e/playwright.qa.config.ts` and `npm run qa`: the QA runner, with `testDir: './qa'`. `npm test` is unchanged.
- `e2e/qa/a11y.spec.ts`: 9 states × 2 themes × 2 widths, 36 axe runs that record every violation and every "needs review" node, plus a computed contrast check on the toasts, where axe can't work out the background.
- `e2e/qa/perf.spec.ts`: 500 seeded tasks, then API timing (25 per call type), 20 traced first loads and 20 traced actions of each kind. It runs twice: default motion and reduced motion.
- `docs/qa-coverage.md`, `docs/qa-accessibility.md`, `docs/qa-security.md`, `docs/qa-performance.md`, the README "QA reports" section, and the trace files and per-cell files under `docs/qa-artifacts/` in `.gitignore`.
- **Security fixes**, each with regression tests:
  - **Clickjacking:** `X-Frame-Options: DENY` everywhere, and `frame-ancestors 'none'` in the static CSP. Tests: `nginx-template.test.ts`, the `headers.spec.ts` header checks, and a new framing E2E test.
  - **`.env` in the build context:** `frontend/.dockerignore` now excludes `.env` files. `backend/.dockerignore` gains `**/.env.*`. Test: `tests/dockerignore.test.ts`.
- **New guard tests:** an XSS E2E test in `rows.spec.ts`, and backend cases for a JSON body sent as `text/plain`, form-encoded, multipart or with no content type (CSRF).
- **Results:**
  - Backend: 122 passed, 99.08%.
  - Frontend: 444 passed, 99.29% statements, 96.53% branches.
  - E2E: 114 passed.
  - `npm run qa`: 40 passed, including one expected failure, the default-motion feedback gate. The accessibility sweep found zero violations of any impact. The performance check met the API and render targets and missed the 100 ms feedback target with 500 rows under default motion.

**Debugging with AI.**

- Probing showed what the fixture's fake clock replaces. `performance.now`, `performance.mark` (a stub returning 0), `requestAnimationFrame` (even inside a fresh iframe) and the Resource Timing buffer are all replaced, so none of them could time the app. The spec instead uses `console.timeStamp` markers (not faked) inside a CDP trace, and `request.timing()` for the API.
- The first in-page numbers (tick 20 ms) looked like an easy pass. A single trace showed the paint landing 125 ms after the click, behind a long task. Tracing every sample made input → paint the pass/fail figure. A second run with `prefers-reduced-motion: reduce` showed the cost was the row animation: layouts fell from 16,297 to 229, and every target passed.
- The first framing test used a page fulfilled by `page.route` as the attacker. Chrome treats that page as public and refuses every loopback frame, headers or not, so even the unfixed build looked "protected". Switching to real loopback servers, with a control frame, made the test meaningful.

**What AI decided beyond the plan.**

- The performance check also runs under reduced motion, to isolate the cause of the miss rather than only report it.
- The accessibility sweep records axe's "needs review" nodes and computes toast contrast itself.
- The `.dockerignore` gap (S-2) and the `Host` header (S-3) were not on the plan's checklist. One was fixed, the other accepted with a follow-up.

**What AI missed or could not do.**

- The feedback miss (issue 1 in `qa-performance.md`) is reported, not fixed. Fixing `animate:flip` for long lists is its own ticket.
- Not checked: base-image CVEs (no scanner installed), throttled or phone performance, and a screen-reader pass by hand.

**Review.** The coordinator's review asked for these fixes, all made:

- **Performance spec:**
  - API probes carry a unique `?qa=<n>` tag, so the app's 30 s poll can't be taken for one.
  - A traced span that sees a background poll is dropped and replaced, and the drops are counted (default motion: 0/1/1/2 for render, add, tick and delete).
  - A `-1` timing throws instead of being recorded. A failed probe `fetch` surfaces its own error.
  - A `Paint` must be a complete event or a begin/end pair.
  - The longest task is bounded at the span's paint, and the task after paint is reported separately.
  - Long texts are now on open tasks too: 40 open, 10 completed.
  - The samples went from 10 and 15 to 20.
  - A gate fails `npm run qa` on a regression in a target that is met today. The default-motion feedback miss is a `test.fail()` test.
- **Accessibility spec:**
  - The summary counts only the current run's cells (`QA_RUN_ID`).
  - The held-GET routes are released in `finally`.
  - Each toast state must check at least one element by hand, and the close × glyph is checked at 3:1.
- **Security:** backend cases for form-encoded, multipart and no-content-type bodies, and `**/.env.*` in `backend/.dockerignore`.
- **Reports:**
  - Every number comes from the new run.
  - The performance report says the render span includes the body download and JSON parse.
  - S-3 is now Medium, because only Chrome enforces Local Network Access.
  - The `:8081` probes are listed as hitting the pre-3.8 build.
  - The summary JSONs are committed; the traces stay gitignored.
- **Result:** the second run gave the same verdicts as the first. The heap growth seen in the first run did not reproduce, so the report no longer calls it a finding.

## Ticket 3.10 — Row motion within NFR-2 at 500 rows

**Agents.** The dev persona (bmad-build) wrote the plan from issue 1 of `qa-performance.md`. A Claude Code subagent (Claude Opus) implemented it from the plan alone; the plan listed no `context:` files.

**Prompt that worked.** The same prompt as earlier tickets. The plan's Design Notes did the most work: they read the reduced-motion figures as proof that layout reads were not the cost (Svelte still measures every row there) and pointed at the per-row `element.animate()`, so the fix had a clear target. Its "Never" list ruled out a row-count threshold and a hand-rolled FLIP.

**MCP servers.** None. Verification used the shell, Docker and Playwright on the system Chrome.

**What was built.**

- `frontend/src/lib/motion.ts`: `SLIDE_MS`, `prefersReducedMotion()` and `slideRow(node, { from, to })`. It returns `{ duration: 0 }` under reduced motion, or when the row's old and new boxes are both outside the viewport (`bottom > 0 && top < innerHeight` is "visible"), and otherwise `flip` with 200 ms and `cubicOut`. A zero duration means Svelte skips `element.animate()`, and `flip` is never called.
- `frontend/src/lib/motion.test.ts`: 12 tests, written red first, one or more per matrix row, including the viewport edges, a live change of the setting and a missing `matchMedia`. The zero cases check the return shape and that `getComputedStyle` is never called.
- `frontend/src/App.svelte`: the local motion code is gone; the rows use `animate:slideRow`.
- `e2e/tests/rows.spec.ts`: `animationsAfterClick` became `rowMotionAfterClick`, which also reads every row's box before the click and after the animations end. The new "motion: only rows on screen slide" test seeds 40 open rows at 1280×800 and ticks the first. All 40 rows move; fewer than 40 animate, all for 200 ms, and each animated row's box before or after the move is on screen.
- `e2e/qa/perf.spec.ts`: the `test.fail()` mark on the default-motion feedback gate is removed, and the comments updated.
- `docs/qa-performance.md`: regenerated from the new `perf-results*.json`. Issue 1 is recorded as fixed, with the before and after figures. The README's QA paragraph no longer mentions an expected failure.
- **Results:**
  - Frontend: 456 passed, 99.3% statements, 96.62% branches.
  - E2E: 115 passed.
  - `npm run qa`: 40 passed, with no expected failures. Default-motion feedback p95 with 500 rows: Enter 94.5 ms (was 201.8), tick 62.7 ms (was 118.8), delete 74.3 ms (was 168.4). Layouts over the feedback set fell from 23,484 (64 actions) to 1,405 (62 actions).

**Debugging with AI.**

- The new E2E failed at first on a row whose "after" box was 813 px, off-screen. The wait for the recorded animations' `finished` promises returned early: the server's response re-render can abort a slide and start a new one after recording has stopped. The helper now waits until no row animation is left before reading the final boxes.
- One run in eight then recorded 40 animations for about 20 visible rows: the same restart, this time inside the recording window. The test now counts animated rows, not animations.

**What AI decided beyond the plan.**

- The plan asked that each animated target's box intersect the viewport "at click time". A row that slides into view from just below the fold is animated by design but starts off-screen, so the test checks the box before or after the move, which is the rule itself.
- The README's QA paragraph was updated, since it described the removed expected failure.

**What AI missed or could not do.**

- Enter has the least margin: p95 94.5 ms against 100 ms on this machine, unthrottled. A slower machine could miss it.
- The new E2E was not run against the old `animate:flip` build to watch it fail. With every moved row animated it would see 40 animated rows and fail the "fewer than moved" check.

**Review.** Four lenses ran (blind hunter, edge-case hunter, verification gap, intent alignment). Five low findings were patched:

- The new E2E gained a completeness check: every moved row that is on screen before or after the move must be animated.
- `rowMotionAfterClick` throws if row animations haven't settled within 2 s, instead of reading boxes mid-slide.
- Two stale comments were corrected (`motion.ts`, `TaskRow.svelte`).
- `qa-performance.md`: per-action units on both sides, a before-and-after table label, and a Gate note on Enter's margin.

Unexplained heap figures were deferred, pending a heap snapshot. Ten findings were rejected, among them "a row crossing the whole viewport jumps": the approved rule is old and new boxes both outside the viewport. No runtime code changed after the QA run (comments only), so the measured figures stand.

## Ticket 3.9 — Hand-in documentation

**Agents.** The dev persona (bmad-build) wrote the plan, and the user decided how the clean-checkout check could touch their running stack (2026-10-02): stop the app profile briefly, bring a fresh clone up under its own project name on the real `:8081`, remove only the clone's project, then start the app profile again. A Claude Code subagent (Claude Opus) implemented the plan alone, after loading its one `context:` file, `deliverables.md`.

**Prompt that worked.** The same prompt as earlier tickets. The plan's "Never" list did the most work: no rewriting earlier log sections, no re-running `qa/perf.spec.ts`, and "a skipped check is recorded as skipped".

**MCP servers.** None. The checks used the shell, git, Docker Compose, curl, Vitest and Playwright on the system Chrome.

**What was built.**

- `README.md`: the full prerequisites (Docker with Compose v2 only, git, Node 24, uv, Chrome, Tailscale), the clean-checkout path (AD-16), the missing `npm run build` and e2e `format:check`, a "Verify everything" block, a "Hand-in" section, `contracts/` and `scripts/` in the layout, "four side effects" and "about 6 minutes".
- `docs/bmad-process.md`: the BMad chain from the exercise brief to the story plans and reviews, with two decisions traced end to end (AD-10's seq merge, and the NFR-2 miss fixed by 3.10).
- `docs/hand-in-checklist.md`: one row per `deliverables.md` item, with a status and links to the evidence.
- Refreshed QA figures on `7ae9b39`: `qa-coverage.md` (frontend 456 tests and a per-file table that includes `motion.ts`; E2E 115 tests), `qa-accessibility.md` (a re-run of the accessibility sweep alone), and the `GET` p95 in `qa-security.md` (37.7 ms, the 3.10 figure).
- The summary below.

**Verification.**

- Clean checkout: a fresh `git clone` of `origin/main` (`7ae9b39`), `cp .env.example .env`, then `docker compose -p todo-clean up -d --build --wait`. `db`, `backend` and `frontend` were healthy after 23 s, and `GET /`, `/api/tasks` and `/api/health` answered 200 on `127.0.0.1:8081`. The build reused cached image layers, so 23 s is not a cold-build time. The clone's project was then removed with `down -v`, and the app profile came back with its tasks.
- `npm run test:coverage`: 456 passed. `npx playwright test --list`: 115 tests in 13 files. `E2E_BROWSER_CHANNEL=chrome npm test`: 115 passed. `qa/a11y.spec.ts`: 36 passed, zero violations. The backend re-run gave 122 passed and 99.08%, as in 3.8.

**What AI missed or could not do.**

- `scripts/check-infra.sh` was not run for this ticket. It resets the test stack and starts the dev profile against the app's database, and the 3.6 runs are the evidence the checklist cites.
- `qa/perf.spec.ts` was not re-run, on purpose: its figures come from the 3.10 run.

## Summary

This closes the log. Each claim below cites the ticket section it comes from. Epic 1's sections are headed "Ticket N", which is story 1.N; epics 2 and 3 use "Ticket E.N".

### The three epics

**Epic 1, capture and keep (PRs #1–#14).** The platform and a usable list: the walking skeleton through nginx, FastAPI and Postgres (Ticket 1), the ordering fixtures and the error contract (Tickets 2 and 3), the compose profiles with the gated testing router (Ticket 4), the E2E harness (Ticket 5), the frontend core, toasts and focus (Tickets 6 and 7), the optimistic store and its sync (Tickets 8 and 12), and the capture UI and rows (Tickets 9 and 10). Plus AD-21, the PR #7 refactor and the Ticket 11 sweep. **Wins:** the implementers checked their own tests with deliberate breaks, then reverted them (Tickets 2, 6, 7, 8, 12), and Ticket 11 proved the nginx stale-IP risk with a repro before fixing it. Review caught two 500s that the AI's tests had missed: a NUL character and a tick racing a delete (Ticket 3). **Misses:** tests that passed for the wrong reason (Ticket 1's DB-down test, Ticket 5's CSP test under `test.fail()`), `crypto.randomUUID` breaking adds over plain HTTP (Ticket 8), and test-only methods shipping in the production `TaskService`, which the user spotted and the review lenses had not (Refactor PR #7).

**Epic 2, the age nudge (PRs #15–#21).** The age label, the colour function for both themes, the age bar with live overdue, the 3 s hold timer, the held row under the input, and a sweep (Tickets 2.1 to 2.6). **Wins:** the AI showed that the plan's bisection rule could not meet the user's ±2/255 tolerance, and that a fixed 0.002 chroma step reproduces all 14 DESIGN stops (Ticket 2.2). Mutation runs found that `overflow-anchor: none` and a `keepFocus()` were needed (Ticket 2.5). **Misses:** a NaN timestamp that looped forever in dark mode (Ticket 2.2), exact-colour E2E checks against a colour that moves with real time (Ticket 2.3), the age label and the task text running together for screen readers (Ticket 2.1), and settle tests that could pass after the hold had already ended (Ticket 2.6).

**Epic 3, everywhere and handed in (PRs #22–#31).** Load failure with Retry, background polling, phone access over Tailscale, the dark theme and its toggle, a sweep, the user-journey suite, the QA reports, and the row-motion fix (Tickets 3.1 to 3.8 and 3.10), then this hand-in. **Wins:** the CDP-traced performance check found the NFR-2 miss that in-page timing had hidden, and a reduced-motion run isolated its cause (Ticket 3.8). Story 3.10 then fixed it with a clear target (Ticket 3.10). The security review found and fixed clickjacking and the `.env` build-context gap (Ticket 3.8). **Misses:** a "no way back" E2E test that could not fail (Ticket 3.5), a motion-test flake that took until the 3.6 sweep to fix (Tickets 3.1 and 3.6), and Enter's thin margin after the fix, 94.5 ms against 100 ms on an unthrottled machine (Ticket 3.10).

### MCP servers

None were used in any ticket; every section that records MCP servers says None. The exercise suggests three, and each had a scripted equivalent:

- **Chrome DevTools MCP:** the performance check drives Chrome through the Chrome DevTools Protocol from Playwright (a CDP session for `Tracing`, `Performance.getMetrics` and Network timing) (Ticket 3.8). The epic decided that the performance report is scripted by the agent through CDP (epic-everywhere-and-handed-in, Notes, 2026-10-01).
- **Playwright MCP:** the Playwright suite itself, run with the system Chrome, plus throwaway Playwright scripts for screenshots and one-off checks (Tickets 5, 9 and 3.6).
- **Postman MCP:** pytest integration tests for every endpoint and the error contract (Tickets 1, 3 and 4), with `curl` for manual probes (Tickets 1 and 11).

Why: the epic chose the scripted route, and it leaves evidence in the repo that anyone can re-run. Each QA report starts with the commands that produced it, and the API contract is checked on every `uv run pytest`. An interactive MCP session would have left only its transcript.

### How AI generated tests, and what it missed

- **One test per plan row.** The plans' I/O matrices became the tests almost one to one (Tickets 1, 3, 6, 7, 8, 2.3, 2.5, 3.1, 3.2, 3.5).
- **Proving a test can fail.** Implementers broke the code on purpose and reverted it (Tickets 2, 6, 7, 8, 9, 12, 2.4). Where they did not, review found tests that could never fail: the DB-down test (Ticket 1), four AD-21 tests (AD-21), the CSP row (Ticket 5), the UJ-3 colour check (Ticket 2.3), a clearance test (Ticket 2.5), the double-Retry test (Ticket 3.1) and "no way back" (Ticket 3.5).
- **Shared fixtures and controlled time.** One ordering fixture serves pytest and Vitest (Tickets 2 and 6). Time is injected everywhere: a fixed server clock (Ticket 3), `advance()` moving both clocks (Ticket 5), and fake timers in Vitest (Ticket 6).
- **What it missed most:** edge cases outside the plan (NUL text in Ticket 3, a same-timestamp tie in Ticket 2, NaN in Ticket 2.2), and platform behaviour that jsdom and desktop Chrome don't show: secure-context APIs (Ticket 8), forced colours (Ticket 9), older iOS media queries (Ticket 10) and touch-synthesised hover (Ticket 7).

### Debugging with AI

- **The fake clock hides timing.** Playwright's installed clock replaces `performance.now`, `performance.mark`, `requestAnimationFrame` and the Resource Timing buffer. The AI found that by probing and moved the timing to `console.timeStamp` markers in a CDP trace (Tickets 9 and 3.8).
- **A framing test that couldn't fail.** Chrome treats a page fulfilled by `page.route` as public and blocks every loopback frame, so even the unfixed build looked protected. Real loopback servers made the test meaningful (Ticket 3.8).
- **A stalled response body.** The fetch signal never reaches a hand-built `Response`, so `api.ts` races the body read against the abort as well (Ticket 6).
- **Two Svelte runtimes.** Re-importing App after `vi.resetModules()` loaded a second Svelte runtime and every test failed with `effect_orphan`; the fix was a getter mock (Ticket 9).
- **Restarted animations.** A server re-render aborts a slide and starts a new one, which misled the 3.10 E2E twice before it counted animated rows (Ticket 3.10).

### Limitations, and where human expertise was critical

- **The user's decisions.** The epic split by usable outcome and the store built once in epic 1 (initiative, Notes, 2026-09-30). A silent failed poll once the list has loaded (epic-everywhere-and-handed-in, Notes, 2026-10-01). Fixing the NFR-2 miss before the hand-in (same Notes, 2026-10-02). In the tickets: the host ports (Ticket 1), reading `backend/.env` and no longer committing `.env` (AD-21), the error-code vocabulary (Ticket 3), recreating only the `db-test` volume (Ticket 4), the ±2/255 colour tolerance and sign-off on the 0.002 step (Ticket 2.2), the scope of each sweep (Tickets 11, 2.6, 3.6), no Lighthouse ([qa-performance.md](qa-performance.md), 2026-10-02), and how the clean-checkout check could touch the running stack (Ticket 3.9).
- **What only a human could check.** The phone run over Tailscale on real devices (Ticket 3.3). The test-only code in the production service, which four review lenses missed (Refactor PR #7).
- **Dev-machine constraints.** The default host ports were taken, so the stack moved to `8081`, `5436` and `8082` (Ticket 1). Playwright's Chromium download timed out, so every E2E run used the system Chrome (Tickets 1 and 5). No CVE scanner was installed, so base images were not scanned (Ticket 3.8).
- **What the review lenses caught that the AI's tests missed.** Two 500s (Ticket 3), a health check that ignored a missing database (Ticket 4), Alembic silently disabling the app's loggers (Ticket 2), same-tick announcements overwriting each other (Ticket 7), and the twin fold resurrecting a ticked task as open (Ticket 12).
- **Not checked at all.** Throttled or phone-class performance, and a screen-reader pass by hand (Ticket 3.8).

## Retro A1 + A2 — perf gate on same-run data, cheaper slideRow

**Agents.** The dev persona (bmad-build) wrote a oneshot plan from actions A1 and A2 of the epic 3 retrospective ([plan](../_bmad-output/initiative-todo-app/plan-retro-a1-a2-perf-gate-and-slide-row.md)) and implemented it. A Claude Code subagent (Claude Opus) refreshed the docs from the new QA run.

**Prompt that worked.** The user picked "two quick code fixes as one small story", and the plan's Intent named the findings (F11, F24, F13) and the exact change for each, so there was nothing to interpret.

**MCP servers.** None. Verification used the shell, Docker and Playwright on the system Chrome.

**What was built.**

- `frontend/src/lib/motion.ts`: `slideRow` tests the viewport before reduced motion, so a row that stays off-screen never calls `matchMedia` (F13). `motion.test.ts` › "never queries the motion setting for a row that stays off-screen" failed against the old order, then passed.
- `e2e/qa/perf.spec.ts`: the API, render and feedback asserts are all `expect.soft` at the end of the measurement test, on that run's samples. The separate "NFR-2 feedback under 100 ms" test, which read the committed JSON from disk, is gone, with the serial-mode config and the `readFileSync` import (F11, F24).
- `docs/qa-performance.md` regenerated from the new `perf-results*.json`, plus the stale perf and QA-run figures in the README, `hand-in-checklist.md`, `qa-security.md`, `qa-coverage.md` and `qa-accessibility.md`. The frontend unit count (456) in `qa-coverage.md` and the checklist stays as the 3.9 snapshot on `7ae9b39`; this run counted 457 with the new `motion.test.ts` case.
- **Results:**
  - Frontend: 457 passed, 99.3% statements.
  - E2E: 115 passed.
  - `npm run qa`: 38 passed (36 accessibility cells, 2 measurement tests). Default-motion feedback p95 with 500 rows: Enter 79.0 ms, tick 56.3 ms, delete 55.9 ms. Render p95 190.7 ms.

**What AI decided beyond the plan.**

- Caching a `MediaQueryList`, the second half of A2, was deliberately not done: the option the user chose left it out, and after the reorder only the ~20 rows on screen query it.

**What AI missed or could not do.**

- The render p95 (190.7 ms, max 201.1 ms) is now the thinnest NFR-2 margin, about 9 ms on an unthrottled machine. It was 164.4 ms in the 3.10 run, and nothing on the render path changed, so the spread between runs is large; this run alone doesn't show what the reorder saved.
