---
title: "PRD: Todo App"
status: final
created: 2026-09-30
updated: 2026-09-30
---

# PRD: Todo App

## 0. Document Purpose

This PRD defines what v1 of the Todo App must do, for the downstream BMad workflows: UX (`bmad-ux`), architecture (`bmad-architecture`) and story slicing (`bmad-preview-ticketing`). It builds on the final product brief (`../brief-todo-app/brief-todo-app.md`) and its addendum, and refines the initial PRD in `docs/PRD.md`. Where the two differ, the brief wins, with one deliberate exception: list ordering (FR-6) replaces the brief's three-tier order. Terms are defined once in §3 and used exactly. Features are grouped in §4 with globally numbered FRs. Technical constraints and implementation notes live in `addendum.md`, not here.

## 1. Vision

A personal todo list for the small tasks that come up during the working day and are too minor for a ticket. The app opens straight to the input and the list. Type the task, press Enter, and it is saved. There is nothing to fill in and nothing to open first.

The one idea worth testing is the **age nudge**. Instead of asking the user to set priorities or deadlines, the app lists open tasks oldest first and shows how long each has been waiting, turning red after a day. Neglected tasks become hard to ignore without the user ever sorting or tagging anything.

The product is deliberately minimal: one user, one list, no accounts. It is also a practice project for learning the BMad Method end to end, and its quality is judged against the exercise targets in `docs/bmad_exercise.md` (tests, accessibility, containerised deployment).

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** capture a small task in the moment, in under 5 seconds, without breaking focus.
- **Functional:** see at a glance what has been waiting longest, without maintaining priorities.
- **Emotional:** trust that nothing jotted down gets lost, and feel a gentle push to deal with what has been neglected.
- **Builder:** practise spec-driven development with BMad on a product small enough to finish.

### 2.2 Key User Journeys

The single persona is the author: works mostly at a laptop, tracks project work in tickets, and checks this list whenever they have a spare minute.

- **UJ-1. Peter jots down a task mid-meeting.** A colleague asks Peter to check a setting later. Peter switches to the already-open tab. The cursor is already in the input, so Peter types "check SSO timeout setting" and presses Enter. The task appears in the list, green and labelled "now", and the input is empty and ready for the next one. Peter goes back to the meeting. **Edge case:** the save fails. The task disappears from the list, a toast says so, and the text is back in the input, so Peter just presses Enter again.
- **UJ-2. Peter clears the backlog over coffee.** Peter opens the app in the morning. At the top are two red tasks, "2d" and "1d", above a handful of green-to-amber ones. Peter ticks off the first red one, which moves down to the completed tasks, showing "done now". The second is no longer relevant, so Peter deletes it and it is gone. **Edge case:** Peter ticks the wrong task. Unticking it puts it straight back in its place near the top, still red, still showing its original age.
- **UJ-3. A task goes overdue while the tab is open.** Peter leaves the tab open all day. A task added yesterday afternoon crosses 24 hours. Without a refresh, it turns red and its age label ticks over to "1d". It is already near the top, because open tasks are listed oldest first.

## 3. Glossary

- **Task** — a single thing to do, entered as one line of text. Has **task text**, an **added time**, and optionally a **completed time**. Belongs to the one **list**.
- **Task text** — the text the user typed, trimmed of leading and trailing whitespace. It cannot be edited after the task is added.
- **List** — the single ordered collection of all tasks. There is exactly one list.
- **Open task** — a task with no completed time.
- **Completed task** — a task with a completed time. Completing is reversible.
- **Overdue task** — an open task whose added time is 24 hours or more in the past. It is shown in red. This is a state, not a separate section of the list, and it does not change the task's position.
- **Added time** — when the task was first saved. It never changes, including when a task is unticked.
- **Completed time** — when the task was last ticked. Cleared when the task is unticked.
- **Age** — for an open task, time since added time; for a completed task, time since completed time.
- **Age colour** — the colour on an open task that represents its age (§4.3). Completed tasks have none.
- **Age label** — the short text form of age shown on every task, e.g. "now", "12m", "5h", "3d".
- **Input** — the single-line text field at the top of the screen where tasks are added. There is exactly one.
- **Toast** — a short, non-blocking message that appears briefly to report a failure.

## 4. Features

### 4.1 Task Capture

**Description:** The input is the heart of the product. It has focus as soon as the page loads, and pressing Enter saves the task. There is no "New task" button, form or required field. After a task is added the input clears and keeps focus, so several tasks can be entered in a row. The user is not shown a character limit. Tasks may contain URLs or long notes, and they are shown in full, wrapping as needed. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Add a task with Enter

The user can add a task by typing task text into the input and pressing Enter. Realizes UJ-1.

**Consequences (testable):**
- Pressing Enter with non-empty input creates a task with the trimmed text and an added time of now.
- The new task appears in the list immediately, before the server confirms the save (see FR-16).
- The input clears and keeps focus after a successful add.

#### FR-2: Input is always ready

The input has keyboard focus when the page finishes loading, and focus returns to it after every action on a task. Typing and pressing Enter therefore always adds a new task, with no click required. Realizes UJ-1.

**Consequences (testable):**
- On page load, typing characters places them in the input without any prior click or Tab.
- After ticking, unticking or deleting a task, by mouse or keyboard, focus is back in the input. The next typed characters go into the input.
- Deleting the last task leaves focus in the input (see FR-8).
- Focus is never stolen while the user is typing, e.g. by a toast (FR-18) or a live age update (FR-7).

#### FR-3: Task text rules

Task text is trimmed. Empty or whitespace-only input is ignored. No user-facing length limit is shown.

**Consequences (testable):**
- Pressing Enter with empty or whitespace-only input does nothing: no task, no error message.
- Leading and trailing whitespace is removed before saving. Internal text is stored exactly as typed.
- Task text of 2,000 characters or fewer is always accepted. A technical safeguard above that may reject the add. If it does, the add is rolled back as in FR-16: the task is removed from the list, a toast explains why, and the text returns to the input.
- Long text and URLs wrap within the task and never cause horizontal scrolling.

**Out of Scope:**
- Editing task text after it is added (delete and re-add instead).
- Turning URLs into links. Task text is shown as plain text.

#### FR-4: A new task stays visible after adding

A newly added task is visible to the user immediately after adding, even when older open tasks fill the screen and push its sorted position (the bottom of the open tasks) off-screen. Realizes UJ-1.

**Consequences (testable):**
- With enough open tasks to fill the viewport, adding a task still shows the new task on screen right after Enter.

**Notes:** UX decides how. The brief addendum suggests keeping it visible near the input for a few seconds, then animating it into its sorted place.

### 4.2 Task List and Ordering

**Description:** Opening the app shows all tasks in one list, ordered automatically. There are no sections or manual sorting, just one list: open tasks oldest first, then completed tasks most recently completed first. Because the order follows added time, the oldest (and overdue) tasks are always at the top and positions do not shift as time passes. Age labels and age colours stay correct while the page is open. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-5: Show all tasks on open

The user sees the full list as soon as the page loads. Realizes UJ-2.

**Consequences (testable):**
- All tasks, open and completed, are shown. No pagination or archive in v1.
- While the list is loading, a loading state is shown in place of the list, and the input can already be used.

#### FR-6: Automatic ordering

The list is ordered in this sequence:
1. Open tasks, oldest added time first. Overdue tasks therefore always come first.
2. Completed tasks, most recent completed time first.

**Consequences (testable):**
- Given tasks with known added and completed times, the rendered order matches the rules above exactly.
- The user cannot reorder tasks manually.

#### FR-7: Live ages

Age labels and age colours update while the page stays open, with no refresh. Realizes UJ-3.

**Consequences (testable):**
- An open task that crosses 24 hours while the page is open turns red within 60 seconds. Its position does not change.
- Age labels are never more than 60 seconds out of date.

#### FR-8: Empty state

When there are no tasks, the list area shows a brief, calm empty state that points the user to the input.

**Consequences (testable):**
- With zero tasks, an empty-state message is visible and the input still has focus.
- Deleting the last task shows the empty state.

### 4.3 Task Age Indicator

**Description:** Each open task shows its age two ways: an age colour and an age label. Colour alone is not enough, because red and green are hard to tell apart for colour-blind users, so the label is always present. Completed tasks drop the colour and show how long ago they were completed. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-9: Age colour on open tasks

Every open task has an age colour:
- under 1 hour: green;
- 1 to 24 hours: a continuous gradient from green to red;
- 24 hours or more (overdue): red.

**Consequences (testable):**
- A task aged 30 minutes is green, a task aged 12 hours is an intermediate colour, and a task aged 25 hours is red.
- Completed tasks have no age colour.

#### FR-10: Age label on every task

Every task shows an age label. Open tasks show time since added time. Completed tasks show time since completed time, marked as completed (e.g. "done 2h").

**Consequences (testable):**
- Label format: "now" under 1 minute, then whole minutes ("12m") under 1 hour, whole hours ("5h") under 24 hours, whole days ("3d") after that. Values always round down, so "5h" means 5 hours up to just under 6, and a task shows "1d" exactly when it becomes overdue.
- Assistive technology receives the age in words (e.g. "added 5 hours ago", "completed 2 hours ago").

### 4.4 Completing Tasks

**Description:** A task is ticked off with one action and can be unticked. Unticking is for mistakes: it restores the task exactly as it was, including its original age, so an overdue task ticked by accident comes straight back to its original place near the top. Realizes UJ-2.

**Functional Requirements:**

#### FR-11: Tick a task

The user can mark an open task as completed with a single action.

**Consequences (testable):**
- Ticking records the completed time, removes the age colour, shows the completed age label, and styles the task as completed (visually distinct from open tasks, e.g. dimmed with strikethrough).
- The task moves to the top of the completed tasks, directly below the last open task.

#### FR-12: Untick a task

The user can mark a completed task as open again.

**Consequences (testable):**
- Unticking clears the completed time and keeps the original added time.
- A task added 2 days ago, ticked, then unticked, reappears red in its original position among the open tasks, oldest first.

### 4.5 Deleting Tasks

**Description:** Any task, open or completed, can be deleted with one action. There is no confirmation and no undo. Deletion is permanent. Realizes UJ-2.

**Functional Requirements:**

#### FR-13: Delete a task

The user can permanently delete any task with a single action, with no confirmation.

**Consequences (testable):**
- The task disappears from the list immediately and does not return after a refresh.
- No confirmation dialog is shown.

**Out of Scope:**
- Undo, trash or recovery of deleted tasks.

### 4.6 Persistence and Failure Handling

**Description:** Tasks are saved on the server and survive refreshes, new browser sessions and app restarts. The UI responds instantly to every action and reconciles with the server in the background. When the server fails, the user is told with a toast and nothing is silently lost. Realizes UJ-1 (edge case).

**Functional Requirements:**

#### FR-14: Durable storage

Every task, including its added time, completed time and task text, is stored on the server.

**Consequences (testable):**
- Tasks survive a page refresh, closing and reopening the browser, and a full `docker-compose down` / `up` cycle (data volume kept).
- The list shown after reload matches the list before it.

#### FR-15: Single source of time

The server records added time and completed time in UTC and is the source of truth for them. The frontend calculates ages (FR-7, FR-10) as the difference between the current UTC instant and those timestamps. Time zones play no part in an age. They would matter only if an absolute clock time were ever shown, and v1 shows none.

**Consequences (testable):**
- The server sends every timestamp as UTC with an explicit zone marker (ISO 8601 with `Z`), never as a bare local datetime.
- The frontend takes the current time as a UTC instant, not a local wall-clock time.
- Changing the browser's time zone does not change any age label, age colour or the order.
- Small drift between the browser clock and the server clock is tolerated. If the browser clock is behind the server, so that a timestamp appears to be in the future, the task shows "now" and never a negative age.

#### FR-16: Instant feedback with rollback

Add, tick, untick and delete appear in the UI immediately. If the server rejects or fails the change, the UI reverts to the previous state and shows a toast.

**Consequences (testable):**
- With the API unavailable, adding a task: the task briefly appears, is removed, a toast explains the failure, and the task text is back in the input.
- If the user has already typed something new into the input when the add fails, the new text is kept and the toast shows the failed task's text, so neither is lost.
- With the API unavailable, ticking, unticking or deleting: the task returns to its previous state and a toast explains the failure.

#### FR-17: List load failure

If the list cannot be loaded on page open, the user sees a toast explaining the failure, with a Retry action. Unlike other toasts, this one stays on screen until the list loads successfully.

**Consequences (testable):**
- With the API unavailable on load, a toast appears, the list area does not show a misleading empty state, and retrying after the API recovers loads the list.
- The load-failure toast does not disappear on a timer. It stays until a retry succeeds, and then it closes by itself.
- A retry that fails keeps the toast on screen with its Retry action.

#### FR-18: Toast behaviour

Toasts are short, plain-language and non-blocking. They dismiss themselves after about 5 seconds or on user action. The only exception is the load-failure toast (FR-17), which stays until the list loads.

**Consequences (testable):**
- Toasts are announced to screen readers (live region) and never steal focus from the input.
- A toast never shows raw error codes or stack traces.

## 5. Cross-Cutting NFRs

- **NFR-1 Accessibility.** WCAG 2.1 AA. Zero critical violations in automated audits (axe-core or Lighthouse). The app is fully usable by keyboard (add, tick, untick, delete), controls have accessible names, and no information is carried by colour alone (FR-10).
- **NFR-2 Performance.** Visible feedback within 100 ms for every user action. API responses under 300 ms when run locally. With 500 tasks, the list renders in under 200 ms and every action still gives feedback within 100 ms.
- **NFR-3 Responsiveness.** Designed for a laptop browser first. Still fully usable on a phone-width screen (360 px) with no horizontal scrolling.
- **NFR-4 Operability.** Runs locally with a single `docker-compose up`. Each service reports its health (a health-check endpoint for the backend, container health checks for all services), and logs are available through `docker-compose logs`. Dev and test environments are selected through environment variables and compose profiles.
- **NFR-5 Security.** No authentication, which is acceptable because the app runs locally only and is not exposed publicly. Task text is always shown as text, never interpreted as HTML (no XSS), and all storage access is parameterised (no injection).
- **NFR-6 Extensibility.** Nothing in the design may prevent adding user accounts later. It is not built in v1.
- **NFR-7 Quality gates.** At least 70% meaningful test coverage. At least 5 passing E2E tests. Together the E2E tests cover add, complete, untick (including an overdue task returning to its place), delete, ordering, age colours and labels, the empty state and error handling. That covers every user journey, including UJ-3. Tests can control the current time, so age-dependent behaviour can be tested without waiting.
- **NFR-8 Maintainability.** A new developer can understand, run and extend the code without help. Setup and test commands are documented in the README.

## 6. Aesthetic and Tone

Simple and sleek. Despite the minimal scope, it should feel like a complete, finished product, not a demo. One screen, with the input and the list and nothing else competing for attention. Plenty of whitespace, restrained typography, and the age colour as the only strong colour on screen. Messages (empty state, toasts) are short, calm and plain: no exclamation marks, jokes or jargon. UX (`bmad-ux`) owns the visual design within these limits.

## 7. Non-Goals (Explicit)

- Not a project or team tool. Project work stays in the ticket system.
- No manual priorities, tags, deadlines, reminders or notifications. The only ordering is the age-based one.
- No user accounts, sharing or collaboration.
- No multiple lists, projects or folders.
- Not hosted publicly and not a multi-tenant service.
- No offline mode or native mobile app.

## 8. MVP Scope

### 8.1 In Scope

- Add a task by typing and pressing Enter (FR-1 to FR-4).
- One automatically ordered list with live ages (FR-5 to FR-8).
- Age colour and age label (FR-9, FR-10).
- Tick and untick (FR-11, FR-12).
- Permanent delete (FR-13).
- Server persistence, instant feedback, failure toasts (FR-14 to FR-18).
- Local deployment via Docker Compose with health checks (NFR-4).

### 8.2 Out of Scope for MVP

- Editing task text. Delete and re-add is enough for a one-line task. This is deliberate: CRUD is still complete, with add as Create, the list as Read, tick and untick as Update, and delete as Delete.
- Undoing a delete. The brief accepts that deletion is permanent.
- Clickable URLs in task text. It would be nice to have; revisit after two weeks of use.
- Archiving or hiding old completed tasks. Revisit if the completed tasks pile up in practice.
- User accounts. Deferred; NFR-6 keeps the door open.

## 9. Success Metrics

**Primary**
- **SM-1 Capture speed:** from deciding to write a task down to it being saved takes under 5 seconds. Validates FR-1, FR-2.
- **SM-2 Habit:** over two weeks, the author adds tasks on most workdays. Validates the product as a whole.
- **SM-3 Nudge works:** overdue tasks are completed or deleted rather than left to pile up. At the end of two weeks, no more than 3 overdue tasks remain. Validates FR-6, FR-9.

**Secondary**
- **SM-4 Nothing lost:** zero tasks lost across refreshes, sessions and restarts during the two weeks. Validates FR-14, FR-16.
- **SM-5 Exercise gates met:** the NFR-1 and NFR-7 targets pass, and `docker-compose up` brings up a working app. Validates NFR-1, NFR-4, NFR-7.

**Counter-metrics (do not optimise)**
- **SM-C1 Number of tasks added:** more tasks is not better, and the app should not encourage padding the list. Counterbalances SM-2.
- **SM-C2 Deletion rate of overdue tasks:** deleting stale tasks is a legitimate outcome, but a list kept green only by deleting everything means the nudge is being dodged, not working. Counterbalances SM-3.

## 10. Open Questions

1. The exact intermediate colours of the green-to-red gradient, and whether they meet contrast requirements against the background. Owner: UX.
2. How the newly added task is kept visible (FR-4): pin and animate, scroll into view, or something else. Owner: UX.
3. How many completed tasks can build up before they hurt usability. Revisit after two weeks of use.

