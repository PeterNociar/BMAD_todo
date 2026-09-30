---
type: review
lens: reconcile-ux
target: ../architecture-todo-app.md
against:
  - ../../ux-todo-app/EXPERIENCE.md
  - ../../ux-todo-app/DESIGN.md
  - ../../ux-todo-app/.memlog.md
date: 2026-09-30
---

# Reconcile: architecture spine vs UX spec

Scope: UX behaviours with architectural, data or state implications. Purely visual items are ignored.
Each finding is something the spine does not support, leaves open enough that two independent builders would diverge, or contradicts.
The spine is not rewritten here. "Suggested fix" says what the spine should decide.

**Totals:** 17 findings: 5 High, 6 Medium, 6 Low.

| # | Sev | Area | Gap |
|---|---|---|---|
| F1 | High | Adds during loading / poll | A GET can return a task whose POST has not returned yet, which gives a duplicate row |
| F2 | High | Poll merge / delete | A stale GET brings back a task that was deleted after the GET was sent (no tombstone) |
| F3 | High | Held task | Hold ownership and ordering are unassigned, and AD-6/AD-9 wording forbids it |
| F4 | High | Loading / load failure | No load-lifecycle state or Retry action. Polling contradicts "no auto-retry" |
| F5 | High | Poll failure | Behaviour when a background poll fails is undefined |
| F6 | Medium | Failures | No request timeout, and no rule for errors without `{detail, code}` (502, network) |
| F7 | Medium | Add rollback | No channel from the store to the input for returning the failed text |
| F8 | Medium | Toasts / live regions | Ownership of the toast queue and announcements is unassigned. Timing of success announcements is unclear |
| F9 | Medium | Optimistic ordering | `sort.ts` contract does not cover pending tasks (no `id`, client-time timestamps) |
| F10 | Medium | Clock / refetch (OQ3) | Recompute and refetch triggers are narrower than UX asks |
| F11 | Medium | Theme persistence | Not in the spine at all (storage key, pre-paint, system listener, fallback) |
| F12 | Low | Focus | AD-10 "focus is never moved" reads against the UX focus safety net |
| F13 | Low | Store API | Unclear whether store actions take the client `key` or the server `id` |
| F14 | Low | Poll vs pending ops | A task removed by a poll while it has pending ops; ops queued behind a 404 |
| F15 | Low | Sync OQs | OQ2 choice is still an unconfirmed assumption. UX Open Questions are not closed |
| F16 | Low | Validation | JS and Python trimming differ. The `validation_error` → toast mapping is unstated |
| F17 | Low | Rapid tick/untick | Whether "last intent wins" survives an earlier failure; no coalescing rule |

---

## F1 — GET/POST race duplicates an unconfirmed add (High)

- **UX:** EXPERIENCE › State Patterns › "Add while loading": the add "merges into sorted order when the list arrives (no duplicates, nothing dropped)".
- **Spine:** AD-4 (key = random for optimistic add, `id` for GET-sourced tasks), AD-10 (merge by `id`, seq ≤ S).
- **Gap:** The server can commit the POST before it serves a GET, and the client can receive the GET response before the POST response. The GET then contains task `X`, which the store does not know by `id` yet: it only holds an unconfirmed entry with a random key. AD-10 adds `X` as a new confirmed task (key = `X`), so two rows show. When the POST later returns `id = X`, nothing says the two entries merge, or which key survives. One builder dedupes, another does not.
- **Suggested fix:** Add a rule to AD-10. While any add is unconfirmed, the store holds back tasks from a GET response that it does not recognise and that are newer than the oldest in-flight POST, and places them when the POST resolves. Or: when a POST returns `id = X` and a confirmed entry `X` already exists, drop the GET-sourced entry and keep the optimistic key (AD-4 "key never changes"). Add this case to the store unit tests.

## F2 — A stale GET resurrects a confirmed delete (High)

- **UX:** Delete is immediate and permanent (FR-13). A deleted row only reappears on a *failed* delete.
- **Spine:** AD-10: a response "replaces confirmed tasks whose value is ≤ S, keeps those whose value is > S".
- **Gap:** The seq guard protects only tasks that are still in the store. Take a GET sent at S, then a DELETE confirmed at S+1 that removes the entry. When the GET returns with the task in it, there is no local entry to compare, so the task is re-added and the row comes back until the next poll. AD-11's local removal (tick/untick → 404) has the same hole.
- **Suggested fix:** On a confirmed delete or a local 404 removal, keep a tombstone `{id, seq}`. A GET at S ignores a tombstoned `id` when tombstone seq > S. Tombstones can be pruned after any GET whose S ≥ their seq. Add a store test for "GET in flight across a delete".

## F3 — Held-task ownership and ordering are unassigned, and the spine's wording forbids them (High)

- **UX:** EXPERIENCE › Age Nudge and New-Task Hold, and State Patterns. The newest add is shown first, in DOM order too, for about 3 s whether or not it is confirmed. A new add ends the previous hold. A tick or delete ends the hold. During loading the hold does not end before the list renders. After a load error the held row still shows while the list is hidden. When the hold ends, the row slides with focus kept on it.
- **Spine:** AD-9: "rendered list = confirmed + pending, ordered by `lib/sort.ts`". AD-6: "Nothing else sorts tasks". The Deferred section hands "component tree" to UX. Nothing mentions hold state.
- **Gap:** The hold changes list order, which is state that the spine says only `sort.ts` produces. One builder puts `heldKey` and its timer in the store. Another keeps a local override in the list component, so DOM order and `animate:flip` behave differently. Nothing ties the hold's end to "list rendered" or to an action, or says whether a poll during the hold may move the held row.
- **Suggested fix:** Add to AD-9. The store owns `heldKey` plus its timer, and the view is `held ? [held, ...sort(rest)] : sort(all)`. The hold ends on the timer (started, or extended, once the initial load has settled), on a new add, on a tick or delete of the held task, and on add rollback. Polls never displace the held row. AD-6 is amended to "nothing else sorts; the hold is a view-level prefix".

## F4 — The load lifecycle is not modelled, and polling contradicts "no auto-retry" (High)

- **UX:** State Patterns › Cold load / Load error / Empty. The skeleton shows only after about 300 ms. The empty state never shows while loading or after a failure. On failure the list is hidden and a persistent toast with Retry appears. Retry shows the skeleton again. A repeat failure announces "Still couldn't load your tasks." Success closes the toast and moves focus to the input. "No auto-retry [ASSUMPTION]". Adds after a failure are sent but stay hidden until Retry succeeds.
- **Spine:** The store API is `add`, `tick`, `untick`, `remove` only. AD-10 polls every 30 s and on becoming visible, "initial load and every poll", with no condition on load state.
- **Gap:** (a) There is no `loadState` (`idle | loading | failed | loaded`) and no `retry()` action, so each builder invents its own. (b) Nothing says whether polling runs before the first successful load. If it does, a successful poll is an automatic retry (the toast closes by itself), which contradicts UX. If it does not, the app never recovers without the user acting. Either could be right, but the spine must pick one. (c) Nothing says whether confirmed adds made while `failed` are shown (UX: hidden).
- **Suggested fix:** Add a rule. The store exposes `loadState` plus `retry()`. The poller and visibility refetch start only after the first successful load. While `failed`, the only GET is an explicit `retry()`. Components derive skeleton, empty or hidden list from `loadState`. The skeleton delay is a component concern. Alternatively, record a deliberate change to the UX assumption: polling acts as auto-retry.

## F5 — Background poll failure is undefined (High)

- **UX:** The only load-failure UX is for the first load (FR-17). Once a list is on screen, nothing says what a failed refetch looks like.
- **Spine:** AD-10 describes a successful merge only.
- **Gap:** One builder reuses the load-failure path: the list is hidden, a persistent toast appears and the user must Retry. That wipes a usable list off the screen every time Wi-Fi drops. Another builder fails silently. A third shows a transient toast every 30 s.
- **Suggested fix:** Decide in AD-10. After the first successful load, a failed poll is silent: keep the current list and try again on the next tick. Record it as a UX-facing decision so EXPERIENCE.md can confirm it.

## F6 — No request timeout, and no rule for errors that are not `{detail, code}` (Medium)

- **UX:** Every failure surfaces as a toast plus a rollback. The `beforeunload` warning shows only while ops are pending.
- **Spine:** AD-5: "The frontend branches on `code` only". AD-9: ops are sent one at a time per task.
- **Gap:** A hung request leaves the op pending forever. That blocks the task's queue (later ticks never go out), keeps the `beforeunload` warning on, and never shows the toast. nginx 502/504 bodies (HTML) and `fetch` rejections have no `code`, so "branch on code" is undefined for the most common real failure.
- **Suggested fix:** In `lib/api.ts`, set a request timeout (for example 10 s, via `AbortSignal.timeout`). Map timeout, network error and any non-JSON or code-less error to a synthetic `network_error` / `internal_error`. State the failure → toast mapping: add failure → "Couldn't save new task."; `text_too_long` → "…It's too long."; tick/untick/delete → "Couldn't update that task…".

## F7 — No channel for returning the failed text to the input (Medium)

- **UX:** Add rollback. The failed text returns to the input only if the input is empty. Only the first failed text returns. It never returns if the failed task was acted on.
- **Spine:** AD-9 says "no text returns" for the acted-on case only. The store owns task state. Input value is component state.
- **Gap:** The spine does not say how the store tells the input "restore this text", or who checks "input is empty". Builders will pick a callback, a store field or a returned promise from `add()`, and will check emptiness at different moments.
- **Suggested fix:** `add(text)` returns a promise resolving to `{ok} | {ok:false, restoreText?: string}`. `restoreText` is omitted when ops were queued behind the add. The input component applies it only if its value is empty (and no IME composition is active) at that moment.

## F8 — Ownership of the toast queue and live-region announcements (Medium)

- **UX:** At most 2 toasts. The load-failure toast is never dropped. Transient toasts last about 5 s and pause on hover or focus. There is a polite status region (success messages plus action and add errors) and an alert region (load failure). Success copy is "Added: X", and so on.
- **Spine:** AD-9 says "a toast is shown". The capability map names a "toast component". The structural seed has no toast or announcer module.
- **Gap:** Nothing says whether the store pushes toasts into a module or components watch store error state, or which module enforces the cap and the pinning. Nothing says whether "Added: X" is announced when the optimistic add appears or when it is confirmed. Announcing on the optimistic add can be followed by a "Couldn't save" toast. Announcing on confirmation is delayed.
- **Suggested fix:** Add `lib/notify.svelte.ts` (toasts plus announcements) to the seed. The store is its only producer. Rules: max 2, load-failure pinned, newest first. Success messages are announced when the optimistic change applies (in line with NFR-2's under-100 ms feedback). Failure messages come from the rollback.

## F9 — `sort.ts` contract does not cover pending tasks (Medium)

- **UX:** An unconfirmed add settles to "the bottom of the open tasks". A tick slides the row "to the top of the completed tasks" at once.
- **Spine:** AD-6: ties broken by `id`. `sort.ts` is fixture-locked against `contracts/ordering-cases.json`. AD-3: "the client never sends a timestamp".
- **Gap:** An unconfirmed add has no `id` and no server `added_at`. An optimistic tick has no server `completed_at`. If the client stamps its own `Date.now()` (through the clock), a client clock behind the server (OQ1 accepted) can place a just-ticked row *below* recently completed tasks. It then jumps when confirmed, which breaks "top of completed". The fixtures cannot express these cases.
- **Suggested fix:** State placeholder rules. An unconfirmed add sorts after every open task, with ties among unconfirmed adds by insertion order. A pending tick sorts before every completed task. Add these cases to `sort.ts` unit tests (not to the shared fixture, which is server-only).

## F10 — Recompute and refetch triggers are narrower than UX (OQ3) (Medium)

- **UX:** Age Nudge: recompute on the timer, on becoming visible, on window `focus`, on `pageshow` from bfcache, and when the timer sees a wall-clock gap (wake from sleep). "Nothing more than 60 s stale". UJ-3 failure: "On wake the page detects the gap and … update[s] at once."
- **Spine:** AD-8: every 30 s plus `visibilitychange`. AD-10: poll every 30 s, plus a fetch when the tab becomes visible.
- **Gap:** A laptop that wakes with the tab still visible fires no `visibilitychange`, so ages and data wait up to 30 s. Restoring from bfcache and regaining window focus are not covered. Builders who follow the spine literally will fail the UJ-3 failure path.
- **Suggested fix:** Extend AD-8 and AD-10 triggers with `focus`, `pageshow` (persisted) and a gap detector (tick delta > 2× interval → immediate `now` update and immediate poll). The clock stays the only `Date.now()` call site.

## F11 — Theme persistence is missing from the spine (Medium)

- **UX:** EXPERIENCE › Theme toggle. Follow the system while nothing is stored. The toggle stores the choice in local storage. Live system changes are followed while nothing is stored. The stored theme is applied before first paint, with no flash. If storage is unavailable, the choice lasts for the session. DESIGN › "one CSS variable per light name", swapped under dark.
- **Spine:** No mention. "The frontend has no runtime config." The seed has no theme module and no `index.html` script.
- **Gap:** "No flash" needs a small inline script in `index.html` that runs before the Svelte bundle. That sits outside AD-1's "one root `App.svelte`" and may be missed. The storage key, the value format, and the DOM hook (`data-theme` on `<html>` or a class) are unspecified. E2E tests need the key to seed a theme.
- **Suggested fix:** Add a small AD. The `localStorage` key is `todo-theme`, with values `light | dark`. An inline pre-paint script in `index.html` sets `<html data-theme>` from storage (inside try/catch). `lib/theme.svelte.ts` owns the toggle, the `matchMedia('(prefers-color-scheme: dark)')` listener while nothing is stored, and an in-memory fallback. CSS tokens switch on `[data-theme=dark]`, falling back to the media query.

## F12 — "Focus is never moved" vs the focus safety net (Low)

- **UX:** Interaction Primitives › Focus safety net. When the focused element disappears (a row removed or re-rendered, a toast closed, Retry succeeds), focus goes to the input (laptop).
- **Spine:** AD-10: "Keys are preserved by `id`, and focus is never moved." The memlog notes the safety net applies, but the spine text does not.
- **Gap:** Read literally, AD-10 forbids moving focus even when the focused row is removed by a poll, a 404 (AD-11) or a rollback, which leaves focus on `<body>`.
- **Suggested fix:** Reword: "a merge never moves focus by itself; if the focused element is removed, the UX focus safety net applies". State who implements the net: one global `focusout` handler, or the list component.

## F13 — Do store actions take the key or the id? (Low)

- **UX:** Tick or delete on an unconfirmed task must work.
- **Spine:** AD-4: "The API is only ever called with a server `id`." AD-9 lists the actions but not their parameters.
- **Gap:** A builder who writes `tick(id)` cannot act on unconfirmed tasks.
- **Suggested fix:** State that `tick(key)`, `untick(key)` and `remove(key)` take the client key, and the store resolves the `id` when it sends.

## F14 — A poll removes a task that has pending ops; ops queued behind a 404 (Low)

- **Spine:** AD-10 removes a confirmed task missing from the response (seq ≤ S) but keeps pending ops "applied on top". AD-11 handles the 404 for the in-flight op.
- **Gap:** Nothing says whether the row vanishes when the GET arrives or when the in-flight op later returns 404, or what happens to the ops queued behind that 404 (dropped, or sent and 404ed one by one).
- **Suggested fix:** A removal by GET also drops that task's queued ops. AD-11's 404 drops the rest of the queue with no toast.

## F15 — Sync open questions not fully closed (Low)

- **UX:** EXPERIENCE › Open Questions 1–3 are still open with owner `bmad-architecture`.
- **Spine:** OQ1 is accepted (Deferred), OQ2 is answered by AD-9 (warn before unload, no replay), and OQ3 by AD-10. The memlog marks keeping the `beforeunload` warning as an **assumption, "confirm in review"**.
- **Gap:** The OQ2 choice is unconfirmed, and EXPERIENCE.md still lists all three as open, so a story writer reading only UX will reopen them. The spine also never says in words that OQ1's acceptance means a fresh task can briefly look a minute or so older.
- **Suggested fix:** Confirm OQ2 with the user, then add a short "UX open questions resolved" line per OQ in the spine (or a Decisions note), and ask UX to close them in EXPERIENCE.md.

## F16 — Trim semantics and the `validation_error` mapping (Low)

- **UX:** Whitespace-only Enter does nothing, silently. Add failure → "Couldn't save new task."
- **Spine:** AD-12: the frontend trims and ignores empty text, and the server trims and returns `422 validation_error` for empty text.
- **Gap:** JS `trim()` and Python `str.strip()` treat different characters as whitespace (for example U+001C–U+001F). Text the client sends can be empty to the server, which shows a toast where UX promises silence. The mapping from `validation_error` to a toast is not stated.
- **Suggested fix:** Name one whitespace definition (for example Python `str.strip()` semantics, mirrored in TS), or accept the edge case and map `validation_error` to "Couldn't save new task."

## F17 — Rapid tick/untick: "last intent wins" after an earlier failure (Low)

- **UX:** "Rapid tick/untick: last user intent wins; requests are applied in order." On failure, roll back to the last server-confirmed state.
- **Spine:** AD-9 drops the failed op and every op queued after it.
- **Gap:** Take tick → untick → tick, where the first tick fails. AD-9 shows "open" (confirmed), while the user's last intent was "done". Both specs can be read as correct, so builders may differ on whether later ops are dropped or replayed. Nothing says whether consecutive opposite ops are coalesced before sending.
- **Suggested fix:** Say outright that on failure the whole queue for that task is dropped, the view shows the confirmed state, and one toast appears (UX rollback wins over last-intent). Optionally coalesce an unsent tick followed by an untick into nothing.
