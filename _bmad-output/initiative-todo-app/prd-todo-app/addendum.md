# Addendum: Todo App PRD

Detail that belongs in downstream documents (architecture, UX, stories), not in the PRD itself.

## Given technical constraints (for architecture)

These were set during brief discovery. See `../brief-todo-app/addendum.md`.

- Frontend: a responsive web app. The framework is still open.
- Backend: Python, FastAPI.
- Data access: SQLModel on SQLAlchemy.
- Migrations: Alembic.
- Database: PostgreSQL, with data kept on a Docker volume so it survives restarts (FR-14).

## Exercise deliverables that shape architecture and stories

Source: `docs/bmad_exercise.md`.

- Dockerfiles for the frontend and backend: multi-stage builds, non-root users, health checks.
- A `docker-compose.yml` that runs the whole app, with networking, volumes, and env-based dev/test profiles.
- Test tooling: Jest or Vitest for unit and frontend component tests, Playwright for E2E tests, and integration tests for every API endpoint.
- QA reports: coverage (at least 70%), accessibility (axe-core or Lighthouse), security review, and a performance check with Chrome DevTools.
- An AI integration log and a README with setup instructions.

## Implementation notes (for architecture)

- **Live ages (FR-7):** the frontend can recompute age labels and colours from the server timestamps on a 30 s timer, and immediately when the tab becomes visible again (`visibilitychange`), so labels never fall more than 60 s behind (FR-7). Order depends only on added time and completed time, so it does not change on the timer. With a single user and a single tab, server polling is not needed.
- **Timestamps (FR-15):** store them as timezone-aware UTC on the server (PostgreSQL `timestamptz`) and serialise them as ISO 8601 with `Z` (e.g. `2026-09-30T10:22:00Z`). Make sure FastAPI/Pydantic does not emit naive datetimes. In the browser, `Date.parse(iso)` gives epoch milliseconds and `Date.now()` is already UTC epoch milliseconds, so age is `Date.now() - Date.parse(addedAt)`, with no time-zone arithmetic. Clock drift between the browser and the server is acceptable, because the labels are coarse (minutes and up). If a task appears to be in the future because of drift, its age shows as "now".
- **Optimistic updates (FR-16):** a new task needs a temporary client ID until the server returns the real one. Rollback must restore the task's exact previous position.
- **Testable time (NFR-7):** the frontend should read the current time through one injectable clock, so E2E and unit tests can fake it (e.g. Playwright's `page.clock`). Seeding tasks with past added times, through the API or a test fixture, must be possible in the test profile only.
- **Length safeguard (FR-3):** enforce it on the server (for example, reject anything over 2,000 characters with a 4xx response). The UI shows no counter.

## UX notes carried from the brief

- **Colour-blind safety:** the age label (FR-10) is the second cue. UX may add a shape or icon on top of it.
- **New-task visibility (FR-4):** the brief suggests keeping the new task visible (e.g. near the input) for a few seconds, then animating it into its sorted place at the bottom of the open tasks. Respect `prefers-reduced-motion`.
- **Tone:** simple and sleek (PRD §6).
