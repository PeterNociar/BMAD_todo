# Addendum: Todo App Brief

Detail supplied during brief discovery that belongs in downstream documents (PRD, UX, architecture) rather than the brief itself.

## Technical constraints (for architecture)

Given stack:

- **Frontend:** responsive web app, laptop browser first and still usable on a phone.
- **Backend:** Python, FastAPI.
- **Data access:** SQLModel on top of SQLAlchemy.
- **Migrations:** Alembic.
- **Database:** PostgreSQL.

Architecture should record these as given constraints and focus on the decisions that remain open, such as the frontend framework, the API shape, hosting and deployment.

## Task age indicator (for PRD and UX)

Each task shows how long ago it was added, as a colour:

- under 1 hour: green
- between 1 and 24 hours: a gradient from green to red
- over 24 hours: red

Open points for UX: red and green alone are hard to tell apart for colour-blind users, so the indicator likely needs a second cue such as a text age ("3h") or a shape. It is also undecided whether completed tasks keep showing the indicator.

## List ordering (for PRD and UX)

1. Overdue open tasks (added over 24 hours ago), oldest first.
2. Other open tasks, newest first.
3. Completed tasks.

Known problem for UX to solve: when many tasks are overdue, a newly added task lands below them and may scroll out of view right after the user adds it. Suggested approach: keep the new task visible (for example, at the top) for a few seconds, then animate it into its sorted place.

## Behaviour details (for PRD)

- **Capture:** adding a task by typing and pressing Enter means the text input has focus when the page opens. There is no "New task" button, form or required field.
- **Unticking:** a task keeps its original added time. A two-day-old task that is ticked by mistake and then unticked comes straight back as overdue (red) at the top.
