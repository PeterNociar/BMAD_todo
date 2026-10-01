---
type: epic
title: "Everywhere, and handed in"
parent: initiative-todo-app
covers: [CAP-9, CAP-10, CAP-11]
after: []
assignee: ""
risk: medium
---

# Everywhere, and handed in

## Description

This epic makes the list trustworthy across devices and failures, and hands the exercise in:
- load failure with a persistent Retry;
- background sync with the AD-10 merge rules, so the laptop and phone share one list;
- the light and dark theme toggle;
- phone access over Tailscale;
- the QA reports, README and AI log required by `deliverables.md`.

## Outcome

The author uses one list from the laptop and the phone, and the exercise is handed in with every gate green: CAP-9, 10 and 11, plus SM-5.

## Done when

1. With the API down on load, a Retry toast stays up with no empty state, and a Retry after recovery loads the list.
2. A task added on the phone appears in an idle, visible laptop tab within about 30 s, with no refresh and no focus change. A stale response never brings back a deleted task.
3. The theme follows the OS on first visit, the toggle choice survives a reload with no flash, and the production build raises no CSP violations.
4. `docs/` holds the coverage, accessibility (zero critical axe violations), security and performance reports, the completed AI integration log, and a record of how BMad guided the build. The README covers setup, tests, profiles and Tailscale.
5. The features are delivered in the app profile. At least 5 E2E tests covering UJ-1 to UJ-3 pass against the test profile, and coverage is 70% or more.

## Boundaries

This epic covers sync, resilience, the theme and the hand-in, on top of epics 1 and 2. It does not change the API contract. It adds polling, visibility-driven fetches, `load_failed` and Retry on top of epic 1's seq merge (AD-10). What it adds meets NFR-1 and NFR-3, and its reports audit the whole app. The QA reports audit the whole app, so they run last.

- Touch point: `docs/ai-log.md`, appended to during this epic and completed here.
- Touch point: Tailscale on the author's devices. `tailscale serve` is configured and documented, with no code change.

## References

- parent — _bmad-output/initiative-todo-app/initiative-todo-app.md
- spec — _bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md, CAP-9, CAP-10, CAP-11, Open Questions
- prd — _bmad-output/initiative-todo-app/prd-todo-app/prd-todo-app.md, FR-17, NFR-1, NFR-2, NFR-5, NFR-8
- architecture — _bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md, AD-10, AD-11, AD-16, AD-17, AD-19
- ux — _bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md (Theme toggle, load-failure toast)
- deliverables — _bmad-output/initiative-todo-app/spec-todo-app/deliverables.md, QA reports and Documentation

## Notes

- Waits on epic-capture-and-keep because: polling builds on the store's confirmed state and seq merge, and it uses the toasts module and compose profiles.
- Waits on epic-age-nudge because: the reports audit the finished UI.
- Unknown: UX has not yet confirmed that a failed background poll stays silent once the list has loaded (AD-10). Only the polling story waits on it, and it is recorded as that entry's `unknown` at inception.
- Touch point: epic-age-nudge computes the age colour for both themes with `ageColour(timestamp, now, theme)` in `lib/age.ts`, and shows light. This epic switches the theme argument to `'dark'` under the dark theme. Its dark CSS tokens must match the surface and hover reference values in age.ts (2026-10-01).
