---
title: 'Store sync: sequence merge, tombstones and recovery GET'
type: 'feature'
ticket: '12'
created: '2026-10-01'
status: 'built'
baseline_revision: 'a12c6950081894110cbfa63342a97ff44933784a'
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

**Problem:** The 1.8 store replaces every confirmed entry when a GET returns. So an add confirmed while the first GET is in flight either vanishes or comes back under a new key, losing its hold and its pending ops. A stale GET could also bring back a deleted task. In addition, 404s are treated as ordinary failures, and nothing re-reads the server after a network failure. This is the gap deferred from 1.8 (deferred-work.md).

**Approach:** In `lib/tasks.svelte.ts`, replace the plain replace with the AD-10 merge:
- a confirmation counter, with a per-entry seq stamp;
- GETs stamped with the counter value **S** when sent;
- unconfirmed adds never removed;
- tombstones for confirmed deletes and for removals after a 404;
- a GET-seen task merged into its optimistic entry, keeping the key.

Add the AD-11 404 rules, and one immediate GET after `network_error` or `unavailable`.

## Boundaries & Constraints

**Always:**
- **Rules that bind:** AD-4, AD-9, AD-10 and AD-11.
- **Counter:** `seq` increments on every confirmed mutation: an add confirmed, a tick or untick confirmed, a delete confirmed, and a removal after a 404. The entry or tombstone it confirms records that value.
- **GET:** records `S = seq` when sent. Only one GET is in flight at a time. A request for another GET while one is in flight runs one more GET after it, never more than one queued. Any successful GET sets `loadState` to `ready`.
- **Merge, for a GET sent at S:**
  1. A confirmed entry with stamp ≤ S takes the server version, keeping its key and its pending ops. If it is missing from the response, it is removed.
  2. A confirmed entry with stamp > S is kept as it is.
  3. Unconfirmed adds are never removed.
  4. A response task whose id matches no entry is ignored if it is tombstoned with seq > S. Otherwise it becomes an entry with key = id and stamp = S.
  5. Entries are matched by `confirmed.id`, never by key.
  6. Tombstones with seq ≤ S are pruned after the merge.
- **POST meets GET:** when an add's POST returns an id that a GET-created entry already holds, the two become one entry. It keeps the optimistic key and the held state, and takes the POST's Task with stamp = the new seq. The GET-created entry's pending ops are appended after the optimistic entry's ops.
- **404s (AD-11):**
  - `DELETE` → 404 counts as a confirmed delete: the entry is dropped, a tombstone is left, and there is no toast.
  - `tick`/`untick` → 404 removes the entry locally with a tombstone, drops its queue, and shows no toast.
  - A 404 means `ApiError.status === 404`.
- **Recovery GET:** any mutation (add or op) failing with `network_error` or `unavailable` does its normal rollback and toast, and also requests one immediate GET. A burst of such failures produces at most one GET in flight plus one queued.
- **Unchanged from 1.8:** announcements, toasts for other failures, and the `{text}` rejection rules. A merge never announces and never moves focus. `load()` keeps its signature, and a failed load still leaves the state `loading`.
- **E2E:** "type right after load" in `capture.spec.ts` now types right after `goto`, without waiting for `aria-busy="false"`.
- **Coverage:** the 70% gate holds.

**Decisions (2026-10-01, user):** The full plan is approved despite its roughly 2,250 tokens.

**Never:**
- Polling, visibility handling, `load_failed` or `retry()` (epic 3).
- Changes to components, `App.svelte`, `api.ts`, `sort.ts` or toasts.
- Matching GET tasks to entries by key, or by text.
- Removing an unconfirmed add because of a GET.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add confirmed during the initial GET, absent from the response | GET sent (S=0); add POST confirms (seq 1); GET returns without it | one row, key kept, held | — |
| Add confirmed during the GET, present in the response | as above, but the GET includes it | one row, key kept | — |
| GET sees the add before its POST returns | the GET includes the new id; the POST returns that id later | briefly two entries, then one with the optimistic key and the hold | — |
| Stale GET after a delete | GET sent at S; delete confirmed (seq > S); the GET still lists the task | the task stays gone | — |
| Missing from a fresh GET | a confirmed task with stamp ≤ S is absent from the response | removed (deleted elsewhere) | — |
| Newer local confirm | a tick confirmed after S; the GET shows it open | stays done | — |
| Pending ops survive a merge | a tick pending; the GET updates the text/times | the tick is still applied and still sent | — |
| Delete 404 | `deleteTask` → 404 `task_not_found` | gone, no toast, tombstoned | — |
| Tick 404 | `tickTask` → 404 | removed, no toast, the queue is dropped | — |
| Network error | `tickTask` → `network_error` | rollback with one toast, and exactly one GET | — |
| Burst | three ops fail with `unavailable` while a GET is in flight | one GET in flight plus one queued; no more | — |
| Recovery shows a landed change | the POST times out but the server saved it; the recovery GET lists it | the task appears (key = id) | — |
| Ready on any GET | the first load failed; the recovery GET succeeds | `loadState` is `ready` | — |
| E2E | goto, type at once, Enter | one row, still there after reload | — |

</frozen-after-approval>

## Code Map

- `frontend/src/lib/tasks.svelte.ts` -- the 1.8 store.
  - `createTasks()` holds `entries` (`{key, confirmed, base, pending, inFlight}`), `loadState` and `heldKey`, plus the derived `rows` (held first, then `sortTasks`).
  - `find(key)` mutates through the state proxy; never keep a raw entry object.
  - `pump(key)` sends the head op when there is an id and nothing is in flight. `settle(key, task)` shifts the op and either drops the entry (delete) or sets `confirmed`/`base`. `fail(key)` clears `pending` and calls `toasts.error('action_failed')`.
  - `load()` (around line 147) does the plain replace that this story replaces.
  - `add()` pushes an entry with `confirmed: null`, sets `heldKey`, and on POST confirm sets `confirmed`/`base` and pumps. `newKey()` falls back to `local-N`.
- `frontend/src/lib/api.ts` -- `ApiError {code, status}`. Client codes are `network_error` and `unavailable`; `task_not_found` comes with status 404.
- `frontend/src/lib/tasks.svelte.test.ts` -- 31 tests with per-call deferred api mocks, `vi.spyOn(toasts, …)`, and `createTasks()` for a fresh store. Extend it; keep every 1.8 test green, except the GET-replace semantics, which this story changes on purpose.
- `e2e/tests/capture.spec.ts:29` -- the `aria-busy="false"` wait before typing, which this story removes for the "type right after load" test.
- `_bmad-output/initiative-todo-app/deferred-work.md` -- the 1.8 entry that this story resolves. Don't edit it; the summary notes the resolution.
- `docs/ai-log.md` -- append `## Ticket 12`.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/lib/tasks.svelte.ts` -- `seq` and stamps; tombstones; `refresh()` with S, one in flight plus one queued; the merge; POST-meets-GET; the 404 rules; the recovery trigger; `load()` running through `refresh()` -- AD-10/11
- [x] `frontend/src/lib/tasks.svelte.test.ts` -- one test per store matrix row -- proves the merge
- [x] `e2e/tests/capture.spec.ts` -- type right after `goto`, then Enter, then reload -- end-to-end proof of the race fix
- [x] `docs/ai-log.md` -- `## Ticket 12 — Store sync`

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage` and `npm run build` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when `npm test` runs in `e2e/`, then every spec passes.

## Implementation Notes

- Ops carry a unique `n`; `settle`/`fail` find their entry by `n`, not key. A GET-created twin's op is already in flight when the add's POST returns (it has an id, so it was sent at once); the merged entry keeps `inFlight` until that op settles, so no two requests for one task overlap.
- A 404 removal also clears `heldKey` if it pointed at the removed entry.
- `tombstones` and the merge's local `Map`/`Set` use scoped `svelte/prefer-svelte-reactivity` disables (not rendered).

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-01): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 16 · false 0 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 10 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The twin fold overwrites the twin's newer confirmed state with the POST's creation state, so a ticked row shows open (BH) | medium | patch | The fold keeps the twin's `confirmed`; the POST Task is used only with no twin. Tested with the twin's tick settling first. |
| 2 | The E2E race test doesn't force the race and would pass on 1.8 (BH, IA) | medium | patch | Holds the first GET until the POST returns 201, with stale and fresh variants; asserts one row, no remount, and survival after reload. Both fail on the 1.8 store. |
| 3 | A twin deleted before its POST returns leaves the optimistic row (ECH) | low | patch | A tombstoned POST id drops the row and resolves `add`; tested. |
| 4 | A merge drop leaves `heldKey` dangling (ECH, IA) | low | patch | Cleared; tested. |
| 5 | A twin op failing after the fold wipes the add's earlier queued ops (ECH, BH) | low | patch | The queue is cut at the failed op; tested. |
| 6 | A rejected GET run leaves `getQueued` stuck forever (BH, ECH) | low | patch | `then(next, next)` restarts on either outcome. |
| 7 | `opCount` is module-level (BH) | low | patch | Moved into `createTasks()`. |
| 8 | Untested: a merge drop with an op in flight; `load()` re-entrancy (BH) | low | patch | Tests added. |
| 9 | ai-log residual risk understated (BH) | low | patch | Review and residual-risk notes updated. |
| 10 | Ticket 12 ai-log review entry | low | patch | Added. |
| 11 | `isNotFound` checks status, not `task_not_found` (BH, ECH, IA) | low | reject | The frozen plan defines a 404 as `status === 404`; every task-path 404 from the backend carries `task_not_found` (AD-11), and a misrouted 404 needs a broken deploy. |
| 12 | A timed-out POST that landed shows a toast, the row and the text, risking a duplicate re-add (BH) | low | reject | AD-9 ("a change that did reach the server shows up") and EXPERIENCE's restore rule accept it; raised to the user as a possible UX follow-up. |
| 13 | `load()` after `ready` flips to `loading` (BH, ECH) | low | reject | Only the unreachable Retry calls it before epic 3 adds `retry()`. |
| 14 | Tombstones grow while GETs fail (ECH) | low | reject | Bounded by user deletes; pruned on the next successful GET. |
| 15 | Merge drops pending ops of a server-gone task with no tombstone (ECH) | low | reject | The server says the task is gone; a late response is ignored (tested). |
| 16 | A burst waits behind an in-flight GET instead of an immediate one (IA reading C1) | low | reject | AD-10: only one GET in flight; the plan's burst row. |
| 17 | No re-read after a failed GET (IA reading C4) | low | reject | AD-9 scopes recovery to mutations; load failure is epic 3. |
| 18 | Duplicate rows shown briefly before the POST returns (IA reading A2) | low | reject | AD-10 accepts it; matching by text is forbidden by the plan. |

## Design Notes

- **Why stamps beat replace:** a GET reflects the server at about time S. Anything this tab confirmed after S is newer than the response, so it wins. Anything confirmed at or before S is older, so the server wins, including "it's gone".
- **Shape:** add `stamp: number` to `Entry`, and keep `tombstones: Map<id, seq>` (not rendered, so not reactive). `refresh()` captures `S` and sets `getInFlight`; on settle it merges, prunes, then runs the queued GET if one was requested.

```ts
function merge(server: Task[], S: number): void { /* rules 1–6 above, by confirmed.id */ }
```

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test` -- expected: all green
