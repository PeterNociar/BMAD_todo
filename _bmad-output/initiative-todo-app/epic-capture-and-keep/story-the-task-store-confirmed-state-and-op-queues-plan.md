---
title: 'The task store: confirmed state and op queues'
type: 'feature'
ticket: '8'
created: '2026-10-01'
status: done
baseline_revision: 'e91a474f2d941a4273827024dd47fa88cf35734e'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
  - '{project-root}/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no task state yet. AD-9 requires one store that applies every change optimistically and, when a request fails, rolls back to what the server last confirmed. Entries 1.9 and 1.10 render that store, and 1.12 adds the sync merge on top of it.

**Approach:** Add `lib/tasks.svelte.ts`. It keeps the confirmed server state and a FIFO queue of pending ops for each task. `rows` is the confirmed state with the pending ops applied on top, sorted by `lib/sort.ts`, with the held task first. Ops are sent one at a time per task, and an op on an unconfirmed add waits for that add's id. A failure drops the failed op and the ops behind it, and raises the toast. Successes are announced through `lib/toasts`.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-4, AD-6, AD-8, AD-9 and AD-17, and EXPERIENCE "State Patterns" (add rollback, unconfirmed task acted on, action error).
- **Interface:** `tasks` is a singleton built by an exported `createTasks()`, so each test gets a fresh store. It provides:
  - **`rows`:** a `Row` is `{key, id: string | null, text, added_at, completed_at}`.
  - **`loadState`:** `'loading' | 'ready'`.
  - **`heldKey`:** a `string | null`.
  - **`load()`:** starts the initial `GET`. Before it returns, `loadState` is `loading`. On success it becomes `ready`, and the loaded tasks replace the confirmed entries while unconfirmed adds are kept.
  - **`add(text)`:** returns `Promise<void>`.
  - **`tick(key)`, `untick(key)` and `remove(key)`.**
- **Add:**
  - The text is trimmed. If it is empty, `add` resolves at once and changes nothing.
  - Otherwise a row appears at once with a random `key` (`crypto.randomUUID()`), `id: null`, `added_at` from `clock.sample()` as a `.sssZ` string, and `completed_at: null`.
  - `heldKey` is set to that key, and "Added: X" is announced once.
  - On confirm, the server Task becomes the confirmed state, the key is kept, and the promise resolves.
- **Tick, untick, remove:**
  - The view changes at once. A provisional `completed_at` comes from `clock.sample()`.
  - Each announces once: "Marked done: X", "Marked not done: X" or "Deleted: X". A delete that leaves `rows` empty passes `{ listEmpty: true }`.
  - An op whose result matches the row's current view state, or whose key is unknown, does nothing.
  - Ticking or removing the held task clears `heldKey`.
- **Queues:** each task sends one request at a time, in FIFO order, always with the server `id`. Ops queued on an unconfirmed add are sent after its `POST` returns. Different tasks don't wait for each other.
- **Op failure:** the failed op and every op queued after it for that task are dropped. The row falls back to its confirmed state, in its FIFO position, and `toasts.error('action_failed')` fires once.
- **Add failure:**
  - The row is removed and `heldKey` is cleared if it was that row.
  - With `ApiError.code` `text_too_long` the toast is `error('add_too_long')`; otherwise `error('add_failed')`.
  - `add` rejects with `{ text }` (the trimmed text) when no ops were queued behind the add, and with `{ text: null }` when some were.
- **Ownership:** the store is the only importer of `lib/api.ts` apart from `App.svelte`'s current `listTasks` call (1.9 replaces it). It never moves focus, never retries a request, and never persists pending ops.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):**
- If the initial GET fails, `loadState` stays `loading`. There is no toast and no retry, and an unconfirmed add still shows. Epic 3 adds `load_failed` and Retry.
- The full plan is approved despite its roughly 2,350 tokens.

**Never:**
- The AD-10 seq merge, tombstones, de-duplicating a GET-seen task, the immediate GET after `network_error`, polling, or `load_failed`/`retry()`. Those belong to 1.12 and epic 3.
- Special handling of a 404 (AD-11 is 1.12's): in this story a 404 is an ordinary failure.
- A hold timer (epic-age-nudge), or changes to `App.svelte`, components or the 1.6/1.7 modules.
- Sorting anywhere but `sortTasks`, or a `Date.now()`/`new Date()` call.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Load fails | `load()`, GET rejects | stays `loading`; no toast | — |
| Load | `load()`, GET resolves 2 tasks | `loading` then `ready`; rows in `sortTasks` order with keys = ids | — |
| Add during load | `add('a')` before the GET resolves | the row shows at once and is kept after the load | — |
| Add confirmed | `add('milk')`, POST 201 | one row, key unchanged, id set, `held` = key; "Added: milk" once; resolves | — |
| Empty add | `add('   ')` | no request, no row, resolves | — |
| Tick on unconfirmed | `add('x')` then `tick(key)` before the POST returns | the tick is sent after the POST, to `/tasks/{serverId}/tick` | — |
| Rapid toggle, late fail | confirmed open task; tick, untick, tick; the 1st succeeds, the 2nd fails | the 3rd is never sent; the row shows done (confirmed); one `action_failed` toast | — |
| Tick fails | tick → 503 | the row returns to open in its place; one toast | — |
| Delete fails | remove → `network_error` | the row reappears where it was; one toast | — |
| Last delete | the only task removed | "Deleted: X" with `listEmpty: true` | — |
| Add fails | POST 503, nothing queued | row removed; `add_failed` toast; rejects `{text:'milk'}` | — |
| Add too long | POST 422 `text_too_long` | `add_too_long` toast; rejects `{text}` | — |
| Add fails, op queued | `add`, `tick(key)`, then POST fails | row gone; the tick is never sent; one `add_failed` toast; rejects `{text:null}` | — |
| Announce once | each successful action | exactly one `announce` call each; none on rollback | — |
| No-op | `tick` on an already-done row; an unknown key | no request, no announce | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/api.ts` -- `listTasks`, `addTask(text)`, `tickTask(id)`, `untickTask(id)` and `deleteTask(id)`; `ApiError {code, status}`; the `Task` type. In tests, mock it with `vi.mock('./api', …)` and control each call with a deferred promise.
- `frontend/src/lib/sort.ts` -- `sortTasks<T extends Sortable>(rows)`, which returns a new array. Id-less rows tie after confirmed ones, ordered by `key`. A `Row` satisfies `Sortable`.
- `frontend/src/lib/clock.svelte.ts` -- `clock.sample()` returns epoch ms; `new Date(ms).toISOString()` gives `.sssZ`. ESLint bans `Date.now()`, `new Date()` and `Date()` outside the clock.
- `frontend/src/lib/toasts.svelte.ts` -- `toasts.error(kind)` and `toasts.announce(kind, text, {listEmpty})`. Spy on them with `vi.spyOn(toasts, 'error')`. They are plain object methods.
- `frontend/src/lib/clock.svelte.test.ts` -- testing reactivity: `$effect.root` with `flushSync`. Don't call `vi.resetModules()` before a reactivity check. Fresh state comes from `createTasks()`.
- `frontend/src/App.svelte` -- still calls `listTasks()` directly. Leave it alone (1.9).
- `docs/ai-log.md` -- append-only, one section per ticket, with the standard headings.

## Tasks & Acceptance

**Execution:**
- [ ] `frontend/src/lib/tasks.svelte.ts` -- `createTasks()`, the `tasks` singleton, entries `{key, confirmed: Task | null, base, pending: Op[], inFlight}`, the derived `rows`, the per-task pump, rollback, toasts and announcements -- AD-9
- [ ] `frontend/src/lib/tasks.svelte.test.ts` -- one test per matrix row with a faked api, plus a reactivity check that `rows` updates inside `$effect.root` -- proves the store
- [ ] `docs/ai-log.md` -- append `## Ticket 8 — The task store` with the standard headings

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given `grep -rln "lib/api\|'./api'" frontend/src --include=*.ts --include=*.svelte` excluding tests, then only `tasks.svelte.ts` and `App.svelte` import the api.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 12 · false 2 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 5 patches and 1 deferral.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `crypto.randomUUID` is undefined in an insecure context (phone over `APP_BIND` http), so `add()` throws (ECH) | medium | patch | `newKey()` falls back to a `local-N` counter; tested with `crypto` stubbed. |
| 2 | `load()` drops an add confirmed while the first GET is in flight, or re-keys it by id and loses its hold and pending ops; a repeated or overlapping `load()` drops in-flight ops (BH, ECH ×5, VG) | medium | defer | The intent leaves the merge to 1.12, whose verify covers "an add confirmed while the initial GET is in flight". See deferred-work.md. |
| 3 | Deleting the last row while loading announces the empty-state text (ECH, BH) | low | patch | `listEmpty` requires `loadState === 'ready'`; tested with two cases. |
| 4 | The announce test's name ("nothing on rollback") contradicts its assertion (BH, IA, ECH) | low | patch | Renamed. AD-17 says the store "announces success when the optimistic change is applied", so the behaviour is correct. A failed-add case was added. |
| 5 | Missing tests: untick rollback, rollback to the server Task after a confirmed add, the held row staying first after confirm (BH) | low | patch | Three tests added. |
| 6 | The ai-log Ticket 8 entry has review placeholders (BH) | low | patch | Filled in, with the grep result. |
| 7 | A 404 on delete or tick reappears with a toast (ECH) | low | reject | Plan Never: AD-11 is 1.12's. |
| 8 | `fail()` discards the error; a throw in `settle` stalls the queue (BH, ECH) | low | reject | `settle` clears `inFlight` first, and no throwing path is shown. |
| 9 | `add()` rejects with a plain object (BH) | false | reject | AD-9 specifies a rejection with `{text}`. |
| 10 | Announcing on apply rather than on server success (IA reading B) | false | reject | AD-17 says success is announced when the optimistic change is applied. |
| 11 | The `id: ''` sentinel on the provisional base (BH) | low | reject | `pump` guards on `confirmed`; `Row.id` exposes `null`. |
| 12 | The exported singleton is untested (BH, IA) | low | reject | It is `createTasks()`; 1.9 is its first consumer. |
| 13 | `confirmed` isn't reachable for 1.12's merge (IA reading D) | low | reject | 1.12 changes the store itself. |
| 14 | Unticking the held task keeps the hold (IA) | low | reject | EXPERIENCE ends the hold only on tick or delete. |
| 15 | Entry dropped by a delete while a later op is queued (BH) | low | reject | A delete hides the row, so no later op can be queued on it. |
| 16 | No test of component rendering (IA) | low | reject | 1.9 and 1.10 render the store, with E2E. |

## Design Notes

- **View = confirmed + pending:** keep the confirmed `Task` (or, for an unconfirmed add, its provisional base) and fold the pending ops over it: `tick` sets the provisional `completed_at`, `untick` sets `null`, and `delete` hides the row. On success, the server Task becomes `confirmed` and the op leaves the queue. On failure, cut the queue at the failed op. Because ops are sent one at a time, the failed op is the head, so the queue empties and the view equals the confirmed state.
- **The pump:** after a change, `pump(entry)` sends the head op unless one is already in flight or the entry has no id yet. A confirmed add sets the id and pumps.
- **Held row:** `rows` = the held row (if present in the view) followed by `sortTasks` of the rest. With no hold timer, a held task stays first until the next add, or until it is ticked or removed. Epic-age-nudge adds the 3 s timer.

```ts
type Op = { kind: 'tick' | 'untick' | 'delete'; at: number }
type Entry = { key: string; confirmed: Task | null; base: Task; pending: Op[]; inFlight: boolean }
```

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green, coverage ≥ 70%
