- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-walking-skeleton-through-every-layer-plan.md`
  summary: nginx resolves the `backend` hostname once at startup, so recreating only the backend container could leave the frontend proxying to a stale IP (502) until it restarts.
  evidence: Unverified, medium if true. To settle it, recreate `backend` so it gets a new IP (`docker compose up -d --force-recreate --no-deps backend`, having started another container first to take the old IP), keep `frontend` running, and curl `/api/health` through :8081. A fix would add `resolver 127.0.0.11 valid=10s;` and proxy through a variable while keeping no URI part (AD-16).
- source_plan: `_bmad-output/initiative-todo-app/plan-ad-21-backend-settings.md`
  summary: The AD-21 Alembic precedence step 1 (a caller-passed `config.attributes["connection"]`, reused and never closed) has no test, and a caller-set `sqlalchemy.url` containing `%` would break configparser interpolation.
  evidence: No caller exists yet; `env.py` is outside the coverage source. Entry 1.2's AD-15 migration test is the first consumer. It should pass a connection in online mode and assert the migration ran on it and the connection is still usable, and it should escape `%` as `%%` when it sets `sqlalchemy.url`.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-task-model-ordering-and-the-shared-ordering-fixtures-plan.md`
  summary: A caller-set `sqlalchemy.url` containing `%` still breaks configparser interpolation in `alembic/env.py`. The passed-connection half of the AD-21 entry above is now covered by `backend/tests/test_migrations.py`.
  evidence: `env.py` reads `config.get_main_option("sqlalchemy.url")` without escaping, so any caller that calls `set_main_option` must escape `%` as `%%`. No caller sets a URL today; revisit when one does.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-test-and-dev-compose-profiles-with-the-gated-testing-router-plan.md`
  summary: No automated check exercises the compose `test` and `dev` profiles, the `entrypoint.sh` argument pass-through (`--reload`), or `frontend-test` proxying to `backend-test`.
  evidence: pytest builds apps in-process and never reads compose; the repo has no CI. Entry 1.5's E2E suite, pointed at `:8082`, will cover the test stack. A smoke script (bring up `COMPOSE_PROFILES=test`, then `POST :8082/api/test/reset` gives 204 and `:8081` gives 404) could guard it sooner.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-e2e-harness-against-the-test-profile-plan.md`
  summary: Nothing tests that `failApi` lets non-matching `/api/**` requests through (`route.fallback()`); dropping the method/path guard would still pass the only `failApi` test.
  evidence: The only call site, `e2e/tests/harness.spec.ts`, fails `GET /api/tasks` and sees no other API request. The first story that injects a mutation failure (1.9 or 1.10) should assert that the seeded list still loads while `POST /api/tasks` is failed.
- source_plan: `_bmad-output/initiative-todo-app/plan-testing-task-service-docs.md`
  summary: The spine's backend dependency diagram has no `routers/* → services/*` arrow, though `routers/tasks.py` imports `TaskService` for its `Depends` type annotation; add the arrow or reword "Arrows are the only dependencies allowed".
  evidence: `backend/app/routers/tasks.py` imports `app.services.task_service.TaskService`; the mermaid graph only has `D --> SV`. This was already wrong before the TestingTaskService docs change, which fixed only the testing router's part of the note.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-frontend-pure-core-api-client-sort-mirror-and-clock-plan.md`
  summary: No automated check proves the AD-8 lint rule (`Date.now`, `new Date()`, `Date()` banned in `src/` outside the clock) still fires; a later config edit could switch it off silently.
  evidence: The rule was checked by hand with throwaway edits, and the repo has no CI that runs lint. A Vitest test using ESLint's Node API `lintText` on `src/x.ts`, `src/X.svelte` and `src/lib/clock.svelte.ts` would pin it; worth adding with CI.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-the-task-store-confirmed-state-and-op-queues-plan.md`
  summary: The 1.8 `load()` keeps only unconfirmed adds, so an add confirmed while the first GET is in flight either vanishes (the GET was served before the POST) or comes back re-keyed by id, losing its key, its hold and any pending ops. A second or overlapping `load()` also drops pending and in-flight ops, and has no stale-response guard.
  evidence: Medium if left in place; the user-visible case is typing right after page load. Entry 1.12's AD-10 seq merge owns it. Its tests should cover POST-before-GET with the task absent and with it present (one row, key kept, hold kept), and a load while an op is in flight. Found by four lenses in the 1.8 review.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-capture-ui-header-input-and-adding-tasks-plan.md`
  summary: DESIGN.md asks for both webfonts to be preloaded. 1.9 ships metric-matched fallbacks but no `<link rel="preload">`, because Vite's hashed asset URLs need a small plugin to inject it into `index.html`.
  evidence: User decision (2026-10-01). The metric-matched fallbacks already prevent layout jumps; preloading would only shorten the swap. Revisit with the theme work in epic 3, which also touches `index.html` (`theme-init.js`).
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-list-rows-tick-untick-and-delete-plan.md`
  summary: Toasts overlay the top of the list, so with no hold timer the newest (held) task stays first and an action-error toast covers it. EXPERIENCE says every toast sits 8 px below a held row.
  evidence: User decision (2026-10-01): epic-age-nudge owns the hold (the 3 s timer and the held row staying under the sticky input), and should offset the toast layer below the held row when it lands.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: Resolved by entry 11: the nginx stale-IP risk (the walking-skeleton entry). It was real.
  evidence: With `frontend-test` kept and `backend-test` restarted onto a new IP (a squatter container held the old one), `:8082/api/health` gave 502 and nginx logged the old upstream IP. `default.conf.template` now has `resolver 127.0.0.11 valid=10s ipv6=off;` and proxies through `set $api http://${API_UPSTREAM}; proxy_pass $api;`; the same repro then gave 200.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: Resolved by entry 11: the `%` caveat in a caller-set `sqlalchemy.url` (the AD-21 and task-model entries).
  evidence: `env.py`'s docstring states the `%%` contract. `tests/test_migrations.py` migrates a scratch database as a role whose password is `p%w` through a `%%`-escaped `set_main_option`, and shows an unescaped one is refused; `tests/test_config.py` migrates through `DATABASE_URL` with the raw `%`.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: Resolved by entry 11: no test pinned the AD-8 lint ban (the pure-core entry), nor the AD-18 `.focus()` ban.
  evidence: `frontend/tests/lint-rules.test.ts` lints snippets with ESLint's `lintText` at `src/x.ts`, `src/X.svelte`, `src/lib/clock.svelte.ts`, `src/lib/focus.ts` and a `*.test.ts` path. Turning the `Date.now` rule down to `warn` fails it.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: Resolved by entry 11: nothing tested that `failApi` passes non-matching requests through (the e2e-harness entry).
  evidence: A `harness.spec.ts` test fails `POST /api/tasks`, loads a seeded list through a real `GET` (200, row rendered), and checks a page `POST` still gets the injected 503.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: Resolved by entry 11: the spine diagram's missing `routers/* → services/*` arrow (the testing-task-service-docs entry).
  evidence: The backend graph now has dotted `R -. "annotation-only" .-> SV` and `R -. "annotation-only" .-> M`, matching `routers/tasks.py`, which imports both at runtime only to name types in signatures; the note under it says what a dotted arrow means.
- source_plan: `_bmad-output/initiative-todo-app/epic-capture-and-keep/story-refactor-sweep-plan.md`
  summary: No automated test recreates the backend onto a new IP and checks nginx follows it; entry 11 proved the fix by a manual repro, and `frontend/tests/nginx-template.test.ts` only pins the config statically.
  evidence: The repro needs container orchestration (stop `backend-test`, a squatter container on `todo_default`, `up --no-deps backend-test`, curl `:8082`), which sits outside pytest, Vitest and Playwright. A compose smoke script, ideally run by CI, could own it.
- source_plan: `_bmad-output/initiative-todo-app/epic-age-nudge/story-hold-timer-in-the-store-plan.md`
  summary: `load()` on a list that is already ready sets `loadState` back to `loading` but doesn't pause a running 3 s hold countdown, so a reload during a hold could end it while the list shows loading.
  evidence: Unreachable today: `load()` runs only on mount and from the load-failure Retry, both before the list is ready. Epic 3's `retry()` or polling should cancel or restart the countdown when it re-enters loading (low).
- source_plan: `_bmad-output/initiative-todo-app/epic-age-nudge/story-refactor-sweep-plan.md`
  summary: Resolved by entry 2.6: toasts over the held row (the list-rows entry), closed by entry 2.5.
  evidence: The toast stack sits at `top: calc(100% + var(--held-height, 0px))`, and `--held-height` is the held row plus the 8 px gap. `e2e/tests/hold.spec.ts` "toast below held" checks the toast lands 8 px (±1) below the held row and never over the input, and "no held row" checks it stays at the list top otherwise.
