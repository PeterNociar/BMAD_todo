---
id: SPEC-todo-app
companions:
  - ../prd-todo-app/prd-todo-app.md
  - ../ux-todo-app/DESIGN.md
  - ../ux-todo-app/EXPERIENCE.md
  - ../architecture-todo-app/architecture-todo-app.md
  - deliverables.md
sources:
  - ../brief-todo-app/brief-todo-app.md
  - ../brief-todo-app/addendum.md
  - ../prd-todo-app/addendum.md
  - ../../../docs/PRD.md
  - ../../../docs/bmad_exercise.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Todo App

## Why

**This is a vision to realise, plus a practice mandate.** The small tasks that come up in a working day are too minor for a ticket and get lost. The author wants a personal list that captures a task in seconds. It uses one idea, the **age nudge**: open tasks are listed oldest first and turn red after a day, so neglected tasks are hard to ignore without anyone setting priorities. The app is also the author's end-to-end BMad Method exercise. It is judged on tests, accessibility and containerised deployment (`deliverables.md`), so it has to feel like a finished product, not a demo.

**Precedence when documents conflict:** this kernel, then the architecture spine for technical decisions, then `EXPERIENCE.md`/`DESIGN.md` for behaviour and visuals, then the PRD. The PRD's glossary (§3) is used exactly. Each capability's detailed, testable consequences are in the PRD FRs it cites, as amended by the UX and architecture overrides.

## Capabilities

- **CAP-1 Quick capture** (FR-1, FR-2, FR-3)
  - **intent:** The user can add a task by typing one line and pressing Enter, with no click, form or required field first.
  - **success:** On laptop, typing right after load and pressing Enter adds the trimmed task. The input clears and keeps focus, and focus returns there after every task action. Empty or whitespace-only input does nothing. Text up to 2,000 characters is always accepted, and longer text is rejected through the CAP-8 rollback.
- **CAP-2 New task stays visible** (FR-4)
  - **intent:** A task the user has just added is visible even when its sorted place is off-screen.
  - **success:** With a full screen of older open tasks, the new task is visible straight after Enter. It is held under the input for about 3 s, then moves to its sorted place, instantly under `prefers-reduced-motion`.
- **CAP-3 One automatically ordered list** (FR-5, FR-6, FR-8)
  - **intent:** The user sees every task in one list that orders itself: open tasks oldest first, then completed tasks most recently completed first.
  - **success:** Given tasks with known times, the rendered order matches the rule exactly, with no manual reordering. A loading state shows while loading, and the input is already usable. With zero tasks, a calm empty state points to the input.
- **CAP-4 Age indicator** (FR-7, FR-9, FR-10)
  - **intent:** Every task shows how long it has been waiting (open) or since it was completed, as a text label, and open tasks also as a green-to-red colour.
  - **success:**
    - The label reads `now` / `12m` / `5h` / `3d`, rounded down, or `done 2h` for completed tasks.
    - Colour: green under 1 h, a gradient from 1 to 24 h, red from 24 h. Completed tasks have no colour.
    - Assistive technology hears the age in words.
    - Labels and colours are never more than 60 s stale, and a task crossing 24 h turns red with no refresh and no change of position.
- **CAP-5 Tick and untick** (FR-11, FR-12)
  - **intent:** The user can mark a task done with one action, and undo that mistake with the same control.
  - **success:** A ticked task moves to the top of the completed tasks with a `done` label. A 2-day-old task that is ticked and then unticked returns red to its original place, with its original added time.
- **CAP-6 Permanent delete** (FR-13)
  - **intent:** The user can delete any task with one action, with no confirmation.
  - **success:** The task disappears at once, does not come back after a refresh, and no dialog appears.
- **CAP-7 Durable storage and server-owned time** (FR-14, FR-15)
  - **intent:** Tasks and their timestamps are kept on the server, which is the only source of time.
  - **success:** The list survives a refresh, a browser restart and `docker-compose down`/`up` with the volume kept. Changing the browser's time zone changes no label, colour or order. A timestamp that appears to be in the future shows `now`.
- **CAP-8 Instant feedback with rollback** (FR-16, FR-18)
  - **intent:** Every action appears immediately, and if the server fails it, the UI reverts and says so without losing the user's text.
  - **success:**
    - With the API down, an add appears and is then removed, a toast explains the failure, and the text returns to the input if the input is empty.
    - A tick, untick or delete returns the task to its previous state, with a toast.
    - Toasts are calm and plain, never show codes, auto-dismiss after about 5 s, are announced to screen readers, and never take focus.
- **CAP-9 Load failure and Retry** (FR-17)
  - **intent:** If the list can't load, the user is told and can retry, and is never shown a misleading empty list.
  - **success:** With the API down on load, a toast with Retry stays up and no empty state is shown. A Retry after the API recovers loads the list and closes the toast. A failed Retry keeps it up.
- **CAP-10 Shared across laptop and phone**
  - **intent:** The user can use the same list from laptop and phone, and an open tab picks up changes made on the other device.
  - **success:** A task added on one device appears in a visible, idle tab on the other within about 30 s, with no refresh and no focus change.
- **CAP-11 Light and dark theme**
  - **intent:** The app follows the system colour scheme by default, and the user can override it in-app.
  - **success:** On first visit the theme matches the OS setting. The toggle switches the theme, and the choice survives a reload in the same browser with no flash of the other theme.
- **CAP-12 One-command local deployment** (NFR-4)
  - **intent:** Anyone can run the whole app locally with one command and see each service's health and logs.
  - **success:** `docker-compose up` on a clean checkout brings up a working app. Every service reports healthy, logs are available through `docker-compose logs`, and the dev and test environments start through compose profiles.

## Constraints

- **Stack:** FastAPI, SQLModel, Alembic and PostgreSQL on the backend, and a Svelte 5 + Vite SPA on the frontend. All technical rules are in the architecture spine (AD-1 to AD-20).
- **Deployment:** local only, with no authentication. The only remote access is from the phone over a private network (Tailscale), and the default bind is `127.0.0.1` (NFR-5). Nothing may prevent adding user accounts later (NFR-6).
- **Accessibility:** WCAG 2.1 AA, with zero critical automated (axe) violations. Fully usable by keyboard, and no information carried by colour alone (NFR-1).
- **Performance:** visible feedback within 100 ms, API responses under 300 ms locally, and 500 tasks render in under 200 ms with actions still under 100 ms (NFR-2).
- **Responsiveness:** laptop first, and fully usable down to 320 px width with no horizontal scrolling (NFR-3 as tightened by UX).
- **Quality gates:** at least 70% meaningful coverage and at least 5 passing Playwright E2E tests, covering every user journey including UJ-3. Every endpoint has an integration test, and tests control the current time (NFR-7).
- **Security:** task text is always rendered as text, never HTML, and all storage access is parameterised (NFR-5).
- **Tone:** simple and sleek, one screen, with the age colour as the only strong colour. Messages are short and calm, with no exclamation marks, jokes, jargon or error codes (PRD §6, EXPERIENCE Voice and Tone).
- **Maintainability:** a new developer can set up, run and test the app from the README alone (NFR-8).

## Non-goals

- Editing task text. Delete and re-add instead.
- Undoing a delete, a trash or any other recovery.
- Manual priorities, tags, deadlines, reminders or notifications. Age is the only ordering.
- User accounts, sharing, collaboration, multiple lists or folders.
- Public hosting, a multi-tenant service, an offline mode or a native mobile app.
- Clickable URLs in task text. Revisit after two weeks of use.
- Archiving or hiding old completed tasks. Revisit after two weeks of use (PRD OQ3).
- Pagination.

## Success signal

- **Over two weeks of daily use:**
  - Capturing a task takes under 5 s (SM-1).
  - Tasks are added on most workdays (SM-2).
  - At most 3 overdue tasks remain at the end (SM-3).
  - Zero tasks are lost across refreshes, sessions and restarts (SM-4).
- **Before handover:** the exercise gates in `deliverables.md` pass: coverage, E2E, zero critical accessibility violations, and a working `docker-compose up` (SM-5).
- **Counter-metrics:** the number of tasks added (SM-C1) and the rate of deleting overdue tasks (SM-C2) are watched, not optimised.

## Open Questions

None open.

### Resolved

- **Silent failed poll (architecture AD-10, CAP-10).** Decided (2026-10-01, user): a failed background poll after the first successful load stays silent; the list is kept and the next 30 s tick retries.
