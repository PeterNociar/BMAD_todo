---
type: epic
title: "Capture and keep tasks"
parent: initiative-todo-app
covers: [CAP-1, CAP-3, CAP-5, CAP-6, CAP-7, CAP-8, CAP-12]
after: []
assignee: ""
risk: medium
---

# Capture and keep tasks

## Description

This epic is the platform baseline plus a list worth using. It covers:
- the repo scaffold, Docker Compose profiles and test tooling;
- the tasks API on Postgres;
- a Svelte list where the user adds, ticks, unticks and deletes tasks.

Every action is optimistic, with rollback and a toast on failure. The store is built once, on the confirmed-state-plus-queue model (AD-9).

## Outcome

The author can capture and manage tasks in the running app, and nothing is lost across restarts: CAP-1, 3, 5, 6, 7, 8 and 12 hold.

## Requirements

The spec is the requirement source: CAP-1, CAP-3, CAP-5, CAP-6, CAP-7, CAP-8 and CAP-12, with the testable consequences in the PRD FRs each one cites, as amended by EXPERIENCE.md. The architecture spine's ADs bind how they are built. Deliverables in scope: Containers and Test suites (`deliverables.md`).

## Done when

1. On a clean checkout, `docker-compose up` (app profile) serves the app on `127.0.0.1:8081`. All three services report healthy, and logs show in `docker-compose logs`.
2. On the laptop, typing and pressing Enter adds a task. Tick, untick and delete work. The order matches FR-6, and the empty and loading states show.
3. The tasks and their times survive a refresh and `docker-compose down`/`up` with the volume kept.
4. With the API stopped, add, tick, untick and delete roll back with the EXPERIENCE toasts, and failed text returns to an empty input.
5. The `dev` profile starts `backend-dev` with reload and `frontend-dev` with the Vite dev server. The `test` profile runs isolated from the app data (AD-16).
6. `uv run pytest`, `npm test` in `frontend/`, and `npm test` in `e2e/` against the test profile all pass, with coverage at 70% or more. The E2E suite covers add, tick/untick, delete, the empty state and add-failure rollback.

## Boundaries

This epic owns the platform baseline, the backend, and the frontend store and list. That includes the AD-10 seq merge and tombstones, because the initial load and the immediate GET after a network error (AD-9) need them. The UI it builds meets NFR-1 (keyboard, names, contrast) and NFR-3 (320 px, no horizontal scroll) for what it renders. It does not include live age colours or labels, the new-task hold (epic-age-nudge), background polling, load-failure Retry, or the theme (epic-everywhere-and-handed-in). Until epic 2, rows show no age label or colour. So this epic verifies the order and position parts of CAP-5 and the persistence parts of CAP-7. The `done` label, "returns red", and "a future timestamp shows `now`" are verified in epic-age-nudge. The spec's non-goals apply.

## References

- parent — _bmad-output/initiative-todo-app/initiative-todo-app.md
- spec — _bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md, CAP-1, 3, 5, 6, 7, 8, 12
- prd — _bmad-output/initiative-todo-app/prd-todo-app/prd-todo-app.md, FR-1–3, FR-5, FR-6, FR-8, FR-11–16, FR-18, NFR-4, NFR-7
- architecture — _bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md, all ADs
- ux — _bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md and DESIGN.md
- deliverables — _bmad-output/initiative-todo-app/spec-todo-app/deliverables.md, Containers and Test suites

## Notes

- Decision: tracer bullet is entry 1, a walking skeleton from nginx through FastAPI to Postgres, run by the user (2026-09-30).
- Decision: the backend lane (2→3→4→5) runs in parallel with the frontend core (6, 7 → 8 → 12). The UI (9 → 10) joins both lanes (2026-09-30).
- Decision: the store is split into entry 8 (queues and rollback) and entry 12 (seq merge, tombstones, recovery GET) to fit one session each (2026-09-30).
- Decision: no closing E2E suite in this epic. Each UI story carries its E2E tests, and the UJ-1 to UJ-3 journey suite needs ages, so it closes in epic-everywhere-and-handed-in (2026-09-30).

- Hands on to epic-age-nudge: `lib/clock.svelte.ts`, the list rows, the store's `heldKey` slot, the E2E harness and the testing router (AD-14).
- Hands on to epic-everywhere-and-handed-in: the store's confirmed state, seq merge and tombstones, `loadState` = `loading`/`ready`, `lib/toasts.svelte.ts`, and the compose profiles.
- Touch point: `docs/ai-log.md`. Created here, and appended to as each story is built.

- Unknown: whether Vitest 5 works with @testing-library/svelte 5.4. The scaffold story spikes it, with Vitest 4.1 as the fallback (spine Stack).
