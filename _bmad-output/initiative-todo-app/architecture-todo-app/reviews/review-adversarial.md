---
review: adversarial (unit-pair divergence)
target: ../architecture-todo-app.md (status: draft, updated 2026-09-30)
context: ../.memlog.md, ../../ux-todo-app/EXPERIENCE.md, ../../ux-todo-app/DESIGN.md
date: 2026-09-30
spine_edited: no
---

# Adversarial Review — Architecture Spine, Todo App

## Verdict

The backend half and the sync algorithm hold up well. The frontend module boundaries do not: the spine names `tasks.svelte.ts`, `toasts.svelte.ts` and `clock.svelte.ts` and says who owns what, but it never pins down their public interfaces. So separate stories can each follow every AD exactly and still fail to fit together. Close holes 1–4 before slicing stories.

## Method

For each seam, I took two units that different agents would build as separate stories. I gave each one the most natural implementation that still obeys every AD to the letter. Then I checked whether the two units still fit together. I only kept divergences a competent agent is likely to produce. The last section lists seams I tried and found closed.

Severity: **High** = shipped behaviour is wrong or a story fails to integrate; **Medium** = visible glitch, flaky tests, or a prod-only break; **Low** = cosmetic or unlikely.

## Summary

| # | Sev | Unit A ↔ Unit B | Divergence in one line |
|---|---|---|---|
| 1 | High | `tasks.svelte.ts` ↔ list / row / input components | Store read model and action signatures are undefined (key vs id, held-first vs sorted, `add()` settle semantics) |
| 2 | High | `tasks.svelte.ts` (sync merge) ↔ `tasks.svelte.ts` (optimistic add), two stories | The AD-10 "remove if missing and seq ≤ S" rule does not exclude unconfirmed adds, so a poll or initial load can delete an in-flight add |
| 3 | High | `toasts.svelte.ts` ↔ store ↔ Toast / live-region components | No toast or announce API: success announcements, alert region, load-failure handle + Retry, and code→copy mapping each have two or zero owners |
| 4 | High | `nginx.conf` (CSP, AD-16) ↔ frontend shell (fonts, theme pre-paint) | `default-src 'self'` blocks Google-hosted webfonts and the inline no-flash theme script, and this only fails behind nginx, never in Vite dev |
| 5 | Medium | `clock.svelte.ts` ↔ store (provisional timestamps, timers) | The only `Date.now()` is a value up to 30 s stale, so optimistic rows sort in the wrong place and slide twice. The 3 s, 5 s and 30 s timers have no clock seam |
| 6 | Medium | E2E helpers ↔ `routers/testing.py` ↔ `clock.svelte.ts` | `/api/test/clock` body, whether reset clears the offset, and which `page.clock` mode is used are all unspecified |
| 7 | Medium | `backend Dockerfile` / `frontend Dockerfile` ↔ `docker-compose.yml` ↔ `vite.config.ts` | Two owners of each healthcheck, a missing `curl`, the `API_UPSTREAM` format and template filename, and the Vite proxy target inside a container |
| 8 | Medium | Pydantic serializer ↔ `lib/sort.ts` / `ordering-cases.json` | Variable fractional seconds (`…:00Z` vs `…:00.5Z`) break string comparison. µs vs ms precision breaks tie behaviour |
| 9 | Medium | `lib/api.ts` (timeout) ↔ store (rollback) ↔ backend (commit) | A 10 s timeout after the server committed rolls back a real change. For an add, the user's re-Enter creates a duplicate |
| 10 | Medium | TaskRow / Toast / theme toggle ↔ Input / App | Nobody owns "return focus to input", and the phone check (`hover: hover` vs `pointer: coarse`) can differ per component |
| 11 | Low | `lib/api.ts` status mapping ↔ nginx 413 / backend 503 | The order of "non-JSON → unavailable" vs "413 → text_too_long" is ambiguous, and `/api/health` 503 has no listed `code` |
| 12 | Low | store (GET merge) ↔ store (POST confirm) | A GET that lands before its own POST response shows a duplicate row until the POST returns |

---

## 1. High — Store read model and action signatures are undefined

**Units:** `lib/tasks.svelte.ts` (story "optimistic store") ↔ `components/TaskList.svelte`, `TaskRow.svelte`, `TaskInput.svelte` (stories "list", "input").

**What the ADs say:** AD-9 says that components call `add`, `tick`, `untick`, `remove`. The rendered list is "confirmed + pending, ordered by `lib/sort.ts`". The store "owns `heldKey`… and the view renders the held task first, then the sorted rest". A failed `add()` "rejects with `{text}`", and "if a failed add had ops queued behind it, no text returns". AD-4 says `{#each}` keys by `key`, and the API is only called with a server `id`.

**How two compliant builds diverge:**

- **Action argument.** The store agent writes `tick(key)`, because unconfirmed tasks have no `id` and AD-9 queues ops on them. The row agent sees a `Task` type with an `id`, reads AD-4's "the API is only ever called with a server id", and calls `tasks.tick(task.id)`. Ticking a held, unconfirmed task then passes `undefined`. Both followed the rules.
- **Read model.** Reading "the view renders the held task first", the store agent exposes `tasks` (sorted) plus `heldKey` and leaves the view to hoist the held row. The list agent expects the store to return final render order. The result is a held row that is either never hoisted, or rendered twice (once hoisted, once in sorted position). This breaks `animate:flip`, which needs one `{#each}` over the final order.
- **Row type.** Is `pending` or `unconfirmed` exposed? Is the provisional `completed_at` exposed (the row needs it for "done now")? Is `id` nullable? Each agent invents its own shape.
- **Load state vs held row.** EXPERIENCE says the held task shows during loading and after a load error while the list stays hidden. If the store exposes rows only when `loadState === 'ready'`, the list agent cannot show the held task over the skeleton or error.
- **`add()` settle semantics.** Does `add()` resolve on POST success or return synchronously? If the input agent writes `await tasks.add(t); input.value = ''`, the clear waits for the network. That violates NFR-2's 100 ms and the UJ-1 climax. The rejection payload when ops were queued is also undefined: `{text: null}`, `{}`, or no rejection at all? An input that does `value = err.text` then shows the literal string "undefined". If the input doesn't catch the rejection at all, it becomes an unhandled promise rejection.

**Proposed AD-9 tightening (store interface):**

> `tasks.svelte.ts` exports a single object `tasks` with:
> - `readonly rows: Row[]`, which is the **final render order** (held row first, then the `sort.ts` order), and includes unconfirmed rows. It is populated whenever `loadState !== 'ready'` only with unconfirmed rows, so the view can show the held row over the skeleton or error.
> - `readonly heldKey: string | null`, `readonly loadState`, `readonly hasPending: boolean`.
> - `Row = { key: string; id: string | null; text: string; added_at: string; completed_at: string | null; unconfirmed: boolean }`, where timestamps are the effective (provisional or confirmed) values.
> - Actions take **`key`**, never `id`: `tick(key)`, `untick(key)`, `remove(key)`, `retry()`. They return `void` and never throw.
> - `add(text: string): Promise<void>` applies the optimistic row synchronously before returning. The caller clears the input without awaiting. On failure it rejects with `AddFailed { text: string | null }`, where `text` is `null` if ops were queued behind the add. The store has already raised the toast. The input sets its value to `text` only if `text !== null` and the input is empty.

## 2. High — AD-10's removal rule can delete an in-flight optimistic add

**Units:** the sync and poll logic in `tasks.svelte.ts` ↔ the optimistic add logic in `tasks.svelte.ts`. These are likely separate stories: "background sync" (FR-5, FR-7 polling) and "capture + optimistic add" (FR-1, FR-16).

**What the ADs say:** a GET sent at S "replaces confirmed tasks whose value is ≤ S, keeps those whose value is > S, and removes **tasks** that are missing from the response only if their value is ≤ S".

**How it diverges:** the replace and keep clauses say "confirmed tasks", but the remove clause says "tasks". An unconfirmed add is by definition missing from the response. The add story stores entries in one map, `Map<key, Entry>`, with `seq: 0` as the default for "not confirmed yet", which is natural and type-safe. The sync story iterates over every entry. `0 ≤ S`, so the add is removed. The case EXPERIENCE calls out explicitly, "add while loading… nothing dropped", then loses the task on the initial load. The same thing happens to any add in flight when a 30 s poll lands. The later POST success has no entry to confirm, so the store either drops it (the task silently exists on the server and reappears on the next poll) or throws.

A second variant: the sync story stamps GET-imported tasks with the counter value at *response* time. The add story stamps with seq at *confirm* time. Both obey "records the counter value that confirmed it". Either works on its own, but a mixed codebase stamps inconsistently.

**Proposed AD-10 tightening:**

> The GET merge operates only on entries with a confirmed server state. Entries with no confirmed state (unconfirmed adds) are never replaced or removed by a GET, and their pending ops stay. A task first seen in a GET sent at S is stamped with S. Add a fixture test: an add started before the initial GET, confirmed after it, appears exactly once.

## 3. High — No toast or live-region API, so owners are missing or doubled

**Units:** `lib/toasts.svelte.ts` ↔ `lib/tasks.svelte.ts` ↔ `components/ToastLayer.svelte` ↔ whatever renders the live regions (probably `App.svelte`).

**What the ADs say:** AD-9 says the store raises the toast through `toasts.svelte.ts`, "which owns the toast queue and the polite live-region announcements". AD-10 says the store keeps the persistent load-failure toast up and closes it on any successful GET. The dependency diagram allows `S → T` and `C → T` only, so toasts may not import the store.

**Divergences, all compliant:**

- **Success announcements** ("Added: X", "Marked done: X", "Deleted: X", plus the empty-state text after the last delete). The store agent announces on *optimistic apply*. The row agent, seeing "polite live-region announcements" in the toasts module, calls `toasts.announce()` from the click handler. The result is double announcements. Or each agent assumes the other does it, and nothing is announced. The spine also doesn't say whether the announcement is optimistic or confirmed. After a rollback, an optimistic announce has already said "Marked done: X".
- **Alert region.** Load failure goes to an *alert* region per EXPERIENCE. AD-9 gives the toasts module the polite region only. The alert region and "Still couldn't load your tasks." (announced only, on repeated Retry failure) have no owner.
- **Load-failure toast handle and Retry.** The toasts module cannot call `tasks.retry()`. One agent stores an `onRetry` callback in the toast record, which the store passes in. Another renders a `kind: 'load_failed'` toast whose component calls `tasks.retry()` directly. Closing it "on any successful GET" needs either a returned handle or a `dismissKind()` call. Neither is specified.
- **Code → copy.** AD-5 says the frontend branches on `code`. One agent passes `code` to `toasts.error(code)` and maps it to copy inside the toasts module. Another maps it in the store and passes a message. Both are compliant, and the copy table then gets duplicated or goes missing.
- **Element semantics.** The ToastLayer agent adds `role="status"` to each toast element, which is the common pattern. The toasts module also writes the same text into the polite region. Screen readers announce twice. axe does not catch this.

**Proposed AD (new AD-17, or an extension of AD-9):**

> `toasts.svelte.ts` exports `toasts` with:
> - `readonly items: Toast[]`, newest first, at most 2, with load-failure pinned.
> - `error(kind: 'add_failed' | 'add_too_long' | 'action_failed')`, where the module owns the verbatim copy.
> - `showLoadFailure()` and `hideLoadFailure()`, which are idempotent.
> - `announce(kind, taskText)` for success, and `alert(text)`.
> - `dismiss(id)`.
>
> The store is the only caller of `error`, `announce`, `showLoadFailure` and `hideLoadFailure`. It announces success at optimistic apply and composes the last-delete empty-state suffix. The Retry button in the toast component calls `tasks.retry()`. One `LiveRegions.svelte`, rendered at first paint, binds the polite and alert text from `toasts`. No other element in the app has `aria-live` or a `status`/`alert` role.

## 4. High — CSP vs webfonts and the pre-paint theme script (fails only behind nginx)

**Units:** `frontend/nginx.conf` (AD-16 story "containers") ↔ the frontend shell, `index.html` plus global CSS (DESIGN.md Typography, EXPERIENCE Theme toggle).

**What the documents say:** AD-16 sets `Content-Security-Policy` with `default-src 'self'`. DESIGN.md requires Inter and JetBrains Mono webfonts, preloaded. EXPERIENCE requires the stored theme to be "applied before first paint, with no flash".

**How it diverges:** the shell agent does the textbook things: a Google Fonts `<link>` and a small inline `<script>` in `<head>` that reads `localStorage` and sets `data-theme`. Both obey every AD. `default-src 'self'` blocks `fonts.googleapis.com`/`fonts.gstatic.com` and the inline script. In the dev profile, Vite serves the page without nginx or the CSP, so every developer and every Vitest test sees it working. In the `app` and `test` profiles, fonts silently fall back and the theme flashes on every load, because the script is blocked. That fallback also breaks DESIGN.md's metric-matched no-jump promise. The only error is in the browser console. The Vite dev server's injected HMR scripts are not affected, but the prod build is.

**Proposed AD-16 tightening (or AD-1):**

> The build is CSP-clean under `default-src 'self'`: no inline `<script>`, no third-party origins. Webfonts are self-hosted (for example `@fontsource/inter` and `@fontsource/jetbrains-mono`, bundled by Vite). The pre-paint theme code is a tiny external file, `public/theme-init.js`, loaded with a blocking `<script src>` in `<head>`. The E2E suite fails on any CSP violation (`page.on('console')` / `securitypolicyviolation`).

## 5. Medium — The only clock is up to 30 s stale; timers have no seam

**Units:** `lib/clock.svelte.ts` ↔ `lib/tasks.svelte.ts` (provisional timestamps, the 3 s hold, the 30 s poll) and `lib/toasts.svelte.ts` (5 s auto-dismiss).

**What the ADs say:** AD-8 says `now` updates every 30 s and on visibility, focus and pageshow, and that it is "the only `Date.now()` call site". AD-6 says a pending task sorts on "provisional timestamps taken from the frontend clock".

**Divergences:**

- **Stale provisional time.** The store agent, forbidden from calling `Date.now()`, uses `clock.now`. That value can be up to 30 s old. Tick task B 10 s after task A was confirmed: B's provisional `completed_at` is *older* than A's server `completed_at`. `sort.ts` places B second among completed tasks, and the confirm moves it to first. The user sees two slides in quick succession instead of the "slides to the top of the completed tasks" that EXPERIENCE specifies. The same thing affects an add that settles while unconfirmed. Another agent might add a `Date.now()` call inside the store "just for this", which breaks AD-8.
- **Timers.** The hold (3 s), toast auto-dismiss (5 s, paused on hover) and poll (30 s) all need time. The spine says the clock is faked "through `lib/clock.svelte.ts`". The clock agent exposes a test hook `__setNow(ms)`. The store and toast agents use raw `setTimeout`/`setInterval`, so tests of those units need `vi.useFakeTimers()`, which the clock hook doesn't drive. A third agent drives polling from an `$effect` on `clock.now`, which is what the memlog's "same tick as clock" suggests. Then every faked `now` change in a component test fires an unmocked `fetch`.

**Proposed AD-8 tightening:**

> - `clock` exports `readonly now` and `sample(): number`. `sample()` reads the wall clock, updates `now` and returns it. Provisional timestamps use `sample()`.
> - All timers use the global `setTimeout`/`setInterval`, and no module derives behaviour from changes to `now` except age rendering.
> - Unit tests fake time with `vi.useFakeTimers()` + `vi.setSystemTime()`. `clock.svelte.ts` has no private test hook.
> - Polling is a separate 30 s interval in the store and does not depend on `now`.

## 6. Medium — The E2E time and seeding interface is underspecified

**Units:** `e2e/` helpers ↔ `backend/app/routers/testing.py` ↔ `lib/clock.svelte.ts`.

**Divergences:**

- **`/api/test/clock` body.** The router agent accepts `{"offset_seconds": int | null}`. The E2E agent, thinking in `page.clock` absolute times, posts `{"now": "2026-10-01T09:00:00Z"}`, and the request fails with 422. Neither shape is written down.
- **Reset scope.** `POST /api/test/reset` clears tasks. Does it also clear the clock offset? If it doesn't, the "overdue" test's +25 h offset leaks into the next test, and with one worker the order decides the result. The spine doesn't say.
- **`page.clock` mode.** The E2E agent uses `page.clock.setFixedTime()`, which is the simplest API for "labels at time T". Fixed time does not run timers, and `clock.svelte.ts` only updates `now` on its interval and on visibility or focus, so labels never change. The test fails. The correct pattern is `install()` before `goto`, then `fastForward`/`runFor`. The spine only says "browser time through `page.clock`".
- **Seeding after load.** A task seeded after `goto` only appears on the next 30 s poll. A helper that seeds and then asserts will be flaky, or will always `reload`.
- **Timestamp base.** `POST /api/test/tasks` accepts `added_at` as absolute ISO. Is that relative to real time or to offset time? The helper computes "25 h ago" from `Date.now()` in Node, which is not the offset server time.

**Proposed AD-14 tightening:**

> - `POST /api/test/clock {"offset_ms": int}`, where 0 clears it. `POST /api/test/reset` deletes all tasks **and** resets the offset to 0.
> - Seeding returns the Task.
> - E2E helpers expose `seed(...)` (seeds *before* `page.goto`, or seeds and then `reload`) and `advance(ms)` (`page.clock.fastForward(ms)` + an offset += ms).
> - Every spec calls `page.clock.install()` before its first `goto`. `setFixedTime` and `pauseAt` are not used.
> - Seeded timestamps are computed from the server's offset time.

## 7. Medium — Compose ↔ Dockerfiles ↔ nginx template ↔ Vite config

**Units:** `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml`, `frontend/vite.config.ts`. These are likely one or two stories, but they are often split between an "infra" agent and each app agent.

**Divergences:**

- **Two healthcheck owners.** AD-16 says both "Each Dockerfile declares a `HEALTHCHECK`" and "Health checks: `db` uses `pg_isready`, `backend` uses `/api/health`…". The backend agent writes `HEALTHCHECK CMD curl -f …`, and Python slim has no `curl`. The compose agent writes its own `healthcheck:` with `wget`, which is also not in slim. The backend stays `unhealthy`. With `depends_on: condition: service_healthy`, the frontend never starts, and the stack hangs on `up` with no error. Neither check has a `start_period` that covers `alembic upgrade head`.
- **`API_UPSTREAM` format.** Compose sets `API_UPSTREAM=backend:8000`, and the template has `proxy_pass ${API_UPSTREAM};`. Or compose sets `http://backend:8000` and the template adds `http://` again. Either way nginx fails to start.
- **Template filename.** The structure lists `frontend/nginx.conf`. The image's envsubst step only processes `/etc/nginx/templates/*.template`. A Dockerfile that copies `nginx.conf` to `conf.d/default.conf` ships a literal `${API_UPSTREAM}`.
- **Vite proxy target.** AD-2 says the Vite `server.proxy` does what nginx does. The frontend agent hardcodes `http://localhost:8000`. That works on the host but fails inside `frontend-dev`, where the backend is `backend-dev:8000`. The compose agent assumes `API_UPSTREAM` is also read by Vite. It also needs `server.host: true` to be reachable through the published port.

**Proposed AD-16 tightening:**

> - `HEALTHCHECK` lives only in the Dockerfiles, and compose does not redefine it. The backend check uses `python -c "urllib.request.urlopen('http://127.0.0.1:8000/api/health')"` with `start_period` ≥ 30 s. The frontend uses busybox `wget -qO- http://127.0.0.1:8080/`.
> - `API_UPSTREAM` is `host:port` with no scheme. The file is `frontend/nginx/default.conf.template` → `/etc/nginx/templates/`, with `proxy_pass http://${API_UPSTREAM};` and no URI part.
> - `vite.config.ts` proxies `/api` to `http://${API_UPSTREAM ?? 'localhost:8000'}` and sets `server.host: true`. Compose sets `API_UPSTREAM` for `frontend`, `frontend-test` and `frontend-dev`.

## 8. Medium — Wire timestamp format is not fixed-width

**Units:** the backend Pydantic serializer (AD-7) ↔ `lib/sort.ts` and `contracts/ordering-cases.json` (AD-6).

**How it diverges:** AD-7 guarantees UTC with `Z`, but not the precision. Python's `isoformat()` and Pydantic emit microseconds, and they **omit the fractional part when it is zero** (`12:00:00Z` vs `12:00:00.500000Z`). The `sort.ts` agent compares ISO strings lexicographically, which is valid for fixed-width ISO. Because `'.' < 'Z'`, `12:00:00.5Z` sorts *before* `12:00:00Z`, so the order is wrong. Provisional timestamps from JS `toISOString()` are fixed at milliseconds, so comparisons between the two sources are also wrong. If the agent uses `Date.parse` instead, microsecond precision is truncated to ms. Two server timestamps in the same millisecond then tie in the frontend, fall through to the `id` tiebreak, and can disagree with the backend's microsecond order. The fixture author picks whichever precision the backend happened to emit.

**Proposed AD-7 tightening:**

> - `Clock` truncates to milliseconds, and the DB stores what the Clock returns.
> - The serializer always emits `YYYY-MM-DDTHH:MM:SS.sssZ`, fixed width with 3 fractional digits. An integration test asserts the regex.
> - `sort.ts` compares `Date.parse` numbers, not strings.
> - Fixtures use the fixed format and include at least one same-millisecond tie.

## 9. Medium — A timeout after the server commits

**Units:** `lib/api.ts` (AD-5: 10 s timeout → `network_error`) ↔ store rollback (AD-9) ↔ backend commit.

**How it diverges:** the request reaches FastAPI and commits, but the response is lost, or arrives after 10 s because a laptop wakes, Wi-Fi drops, or a phone switches networks over Tailscale. `api.ts` aborts and reports `network_error`. The store rolls back and shows "It's back as it was" for a tick that actually happened, and the next poll silently moves the row to completed. For an **add**, the failed text returns to the input and the user presses Enter again, following the UJ-1 failure path. The server now has two tasks. AD-9's "the client never retries a POST" is kept, but the duplicate still happens. This is plausible on the phone over Tailscale, which the memlog calls out as a real usage mode.

**Proposed AD-9/AD-10 tightening (minimal):**

> On `network_error` or `unavailable` for any mutation, the store rolls back as specified **and** triggers an immediate GET, merged by AD-10 rules, so a ghost success shows up within one round trip, not up to 30 s later. Optionally (cheap and stronger), `POST /api/tasks` accepts an optional client `key` (UUID). The backend uses it as an idempotency key within one process and ignores a duplicate, and the input's re-Enter after a `network_error` reuses the same key. If this is rejected, record "duplicate on timeout" as an accepted risk in the spine.

## 10. Medium — Focus return has no owner

**Units:** `TaskRow.svelte` (tick/delete), `ToastLayer.svelte` (close, Retry), `ThemeToggle.svelte` ↔ `TaskInput.svelte` / `App.svelte`.

**How it diverges:** EXPERIENCE requires focus to return to the input after every task action (laptop only), a focus safety net when the focused element disappears, and type-to-focus. The spine defers the component tree to UX, but this is a *cross-component interface*. Each row agent writes `document.getElementById('new-task')?.focus()` with whatever id it guesses. The input agent names its id `task-input`. One agent detects phone by `(pointer: coarse)` and another by `(hover: none)`. EXPERIENCE defines phone as "not `hover: hover`". A hybrid laptop with a touchscreen then gets focus return from tick but not from delete.

**Proposed rule (AD-9 companion or new AD):**

> `lib/focus.ts` is the only code that moves focus programmatically. It exports:
> - `registerInput(el)`
> - `returnToInput({ via: 'pointer' | 'keyboard' })`, a no-op when `!matchMedia('(hover: hover)').matches`, and without `preventScroll` side effects beyond `{ preventScroll: true }`
> - `installSafetyNet()`
>
> Components call it after invoking a store action. The store never touches focus.

## 11. Low — `api.ts` mapping precedence; health 503 code

**Units:** `lib/api.ts` ↔ nginx (413 HTML page) and ↔ `routers/health.py`.

**How it diverges:** AD-5 lists "502/503/504 or non-JSON body → `unavailable`" and "413 → `text_too_long`". nginx's 413 is an HTML body. An agent that parses the body first maps it to `unavailable`, and the user gets "Couldn't save new task." instead of "…It's too long." The backend's `/api/health` 503 must carry a `code` under AD-5, but none is listed, so the agent invents `db_unavailable`. That's harmless, but it goes undocumented in OpenAPI.

**Fix:** AD-5 says "map by status first (413, 502/503/504), then parse JSON `code`, and treat non-JSON otherwise as `unavailable`". Add `service_unavailable` to the backend code list for `/api/health`.

## 12. Low — GET lands before its own POST response (duplicate flash)

**Units:** the store's GET merge ↔ the store's POST confirm.

**How it diverges:** the server commits the POST, and a poll GET runs before the POST response reaches the client. The GET imports the task with `key = id`. The optimistic row (random key) is still unconfirmed, so both render until the POST returns and AD-10's merge removes the GET-keyed row. That produces a duplicate row, a remount and a `flip` jump. The window is small on localhost.

**Fix:** during the merge, if the GET contains a task not known by `id` whose `text` equals an unconfirmed add's text, defer inserting it until that POST settles. The simpler alternative is to skip a poll tick while any POST is in flight.

---

## Seams attacked and found closed

- **Backend router ↔ frontend `api.ts` verbs and payloads:** AD-3 pins verbs, paths, bodies and statuses, and snake_case is fixed.
- **Tick/untick idempotency vs `completed_at` reset:** "repeating one returns the same state" means that re-ticking does not bump `completed_at`.
- **Stale GET vs newer confirm (AD-10 seq/tombstones):** sound for confirmed entries, including a confirm that lands between GET send and GET receive. The only hole is the unconfirmed-entry scope (hole 2).
- **Tick 404 vs rollback toast (AD-11):** unambiguous.
- **Ordering tie-break by UUID:** Postgres uuid order, Python `UUID` order and lowercase hex string order agree.
- **Migration heads from parallel stories:** AD-15's single-head test catches this in CI.
- **Test router reachable in prod:** it is structurally gated and asserted by a test.
- **Two owners of task state / API callers:** AD-9 is unambiguous. Only the *interface* is missing (hole 1).
- **Op coalescing (tick→untick→tick):** coalescing or not changes server traffic, not the final state. AD-9 FIFO is sufficient.
