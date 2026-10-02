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
- source_plan: `_bmad-output/initiative-todo-app/epic-age-nudge/story-refactor-sweep-plan.md`
  summary: `rows.spec.ts` "motion: tick slides the rows for about 200 ms" (from 1.10) failed once in a full E2E run under load, then passed 10 of 10 in isolation and 75 of 75 in a second full run.
  evidence: Likely timing: it samples `getAnimations()` 40 ms after a click, so a busy runner can miss the flip. Raise the sample window, or poll until an animation appears. Low; seen during 2.6 verification.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-dark-theme-and-pre-paint-theme-script-plan.md`
  summary: `public/theme-init.js` is a render-blocking script at a fixed, unhashed URL, and nginx sends no `Cache-Control` for it, so after a change a browser may run a heuristically cached old copy.
  evidence: `frontend/nginx/default.conf.template` sets no cache headers. Add `Cache-Control: no-cache` for `/theme-init.js` (and `immutable` for the hashed `/assets/`); fits the performance report in entry 8 or the sweep in entry 6. Low until the script changes.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-theme-toggle-plan.md`
  summary: Nothing tests forced-colors styling: the theme toggle's active-segment `CanvasText` outline (the only state marker once fills drop) and App's forced-colors focus ring can be deleted or misspelled with every test green.
  evidence: No spec sets `forcedColors: 'active'`; jsdom ignores media queries. One forced-colors E2E describe (computed `outline` on `.seg.on` and not on the other segment, plus the focus ring) would pin both; fits the accessibility report in entry 8 (verification-gap lens, story 3.5).
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: the 1.8 `load()` race (the task-store entry), closed by entry 1.12.
  evidence: The AD-10 seq merge only touches confirmed entries and never removes an unconfirmed add. `tasks.svelte.test.ts` covers POST-before-GET with the task absent ("keeps an add confirmed during the initial GET when the response lacks it") and present ("keeps one row, under the optimistic key, when the response has the confirmed add"), both keeping the key and the hold; "folds a GET-created entry into the add when its POST returns the same id", "keeps pending ops applied and queued across a merge" and "runs at most one more GET for two loads while one is in flight, resolving both" cover the rest.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: the missing webfont preloads (the capture-UI entry), closed by entry 3.4.
  evidence: `frontend/vite-plugins/preload-fonts.ts` adds a `<link rel="preload" as="font" type="font/woff2" crossorigin>` per latin face at build time and throws unless each face matches exactly one emitted woff2. `tests/preload-fonts.test.ts` covers the helper, and `e2e/tests/theme.spec.ts` checks the three preloads are in `index.html` and that the browser fetches each face exactly once.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: a reload during a hold leaving the countdown running while the list shows loading (the hold-timer entry), closed by entry 3.1.
  evidence: `load()` cancels a running countdown while keeping `heldKey`, and `startHoldTimer()` does nothing while `loadState` is `loading`, so a full 3 s starts when the load settles. `tasks.svelte.test.ts` "cancels the countdown on Retry and restarts a full 3 s when it settles" pins it.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: the `rows.spec.ts` motion flake (the 2.6 sweep entry).
  evidence: `animationsAfterClick` no longer takes one sample 40 ms after the click. From just before the click it records every row `Element.animate()` call and samples `document.getAnimations()` at once and on every frame, until a row animation appears or 1 s passes, so a flip that already finished on a slow runner is still counted. Both motion tests keep their assertions (every duration 200; `[]` with reduced motion), and `rows.spec.ts` passed `--repeat-each 10`.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: no `Cache-Control` for the unhashed `theme-init.js` (the dark-theme entry).
  evidence: `default.conf.template` has `location = /index.html` and `location = /theme-init.js` with `Cache-Control: no-cache`, and `location /assets/` with `public, max-age=31536000, immutable`; each repeats `X-Content-Type-Options`, `Referrer-Policy` and the CSP. `/` and deep links reach `index.html` through `index` and `try_files`. `frontend/tests/nginx-template.test.ts` pins the blocks, and `e2e/tests/headers.spec.ts` checks the served headers on `/`, a deep link, `/theme-init.js` and a hashed `/assets/*.js`.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: Resolved by entry 3.6: nothing tested forced-colors styling (the theme-toggle entry).
  evidence: `e2e/tests/theme-toggle.spec.ts` "under forced colours" runs with `forcedColors: 'active'`: `.seg.on` has a 1px solid outline and the other segment none, and the focused input's outline style is `solid` (not `none`, and not Chrome's default `auto`).
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: No automated check of the compose `test` and `dev` profiles or the `--reload` pass-through (the test-and-dev-profiles entry): covered by the manual smoke script `scripts/check-infra.sh` (no CI runs it), entry 3.6.
  evidence: `scripts/check-infra.sh` checks `POST :8082/api/test/reset` is 204 and, with the app profile up, `:8081` gives 404; it then brings up `backend-dev` and `frontend-dev`, finds `--reload` on the running uvicorn process (`docker top`), gets 200 from `:5173/api/health` through Vite, and stops them. `frontend-test` proxying to `backend-test` is covered by the E2E suite.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-refactor-sweep-plan.md`
  summary: No automated test that nginx follows a recreated backend's new IP (the entry-11 sweep entry): covered by the manual smoke script `scripts/check-infra.sh` (no CI runs it), entry 3.6.
  evidence: `scripts/check-infra.sh` stops `backend-test`, starts `busybox` squatters on the compose network until one takes the old IP (up to 8), then starts `backend-test` on a new one and requires `GET :8082/api/health` 200 within 15 s (SKIP if none did). Runs moved `backend-test` from 172.27.0.6 to 172.27.0.8 and from 172.27.0.8 to 172.27.0.9 (the second squatter filling a lower gap) and passed.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-qa-reports-plan.md`
  summary: NFR-2 miss — with 500 rows and default motion, action feedback p95 exceeds 100 ms (Enter, tick, delete) because `animate:flip` on every row forces hundreds of layouts per action; reduced motion passes.
  evidence: `docs/qa-performance.md` (CDP traces, layout counts per action). Architecture defers rendering optimisations "until NFR-2 fails" — it now fails. A fix (flip only rows near the viewport, or skip flip above a row count, or a cheaper FLIP) needs its own story; `npm run qa` marks the miss as an expected failure until then.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-qa-reports-plan.md`
  summary: Security follow-ups accepted in `docs/qa-security.md`: a `Host` allowlist against DNS rebinding (S-3; browsers other than Chrome don't enforce Local Network Access), pinning or SRI for the CDN Swagger UI on `/api/docs` (S-4), and a base-image CVE scan (no scanner installed).
  evidence: each is recorded with its reason in `docs/qa-security.md`; none is exploitable on the default `127.0.0.1` bind, but S-3 matters once the app is reached over Tailscale.
- source_plan: `_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-qa-reports-plan.md`
  summary: `frontend/tests/dockerignore.test.ts` checks the `.env` exclusion by the file's wording, not by what Docker actually sends in the build context.
  evidence: a re-include line or a moved build context would leak `.env` with the test green; a real check needs a `docker build` of the context with a dummy `.env`, which no suite runs (verification-gap lens, 3.8).
