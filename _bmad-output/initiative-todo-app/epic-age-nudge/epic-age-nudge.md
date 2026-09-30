---
type: epic
title: "The age nudge"
parent: initiative-todo-app
covers: [CAP-4, CAP-2]
after: []
assignee: ""
risk: medium
---

# The age nudge

## Description

This epic delivers the product's one idea:
- every task shows its age as a label, and open tasks also show a green-to-red colour;
- both update live without a refresh;
- a new task stays visible under the input before it settles into its sorted place.

## Outcome

Neglected tasks are hard to ignore. Overdue tasks are red at the top, and new tasks are always seen: CAP-4 and CAP-2 hold.

## Done when

1. Labels read `now`, `12m`, `5h`, `3d` and `done 2h`, rounded down. Assistive technology hears the age in words.
2. The colour is green under 1 h, a gradient from 1 to 24 h, and red from 24 h, in light and dark per DESIGN.md. Completed tasks have no colour.
3. With the page open, a task crossing 24 h turns red within 60 s without moving, as tested in E2E with the synced browser and server clocks (UJ-3).
4. With a full screen of older tasks, a new task shows under the input for about 3 s, then slides to its place, instantly under reduced motion.
5. This is delivered in the app profile, with E2E and unit tests green and coverage at 70% or more.

## Boundaries

This epic covers the age cue and the new-task hold on top of epic 1's store and list. It changes no API or data shape. It fills in the store's `heldKey` behaviour (AD-9), whose slot epic 1 owns. It verifies the age-dependent parts of CAP-5 (the `done` label, an unticked task returning red) and CAP-7 (the time-zone change and a future timestamp showing `now`). What it adds meets NFR-1 and NFR-3. It does not include background sync or the theme toggle (epic-everywhere-and-handed-in).

## References

- parent — _bmad-output/initiative-todo-app/initiative-todo-app.md
- spec — _bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md, CAP-2, CAP-4
- prd — _bmad-output/initiative-todo-app/prd-todo-app/prd-todo-app.md, FR-4, FR-7, FR-9, FR-10
- architecture — _bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md, AD-6, AD-8, AD-9 (heldKey), AD-14
- ux — _bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md (age gradient) and EXPERIENCE.md (Age Nudge and New-Task Hold)

## Notes

- Touch point: `docs/ai-log.md`, appended to as each story is built.
- Waits on epic-capture-and-keep because: it builds on the task store, the list rows, the clock module and the E2E harness with the test router.
