---
type: initiative
title: "Todo App v1: a personal list that nudges neglected tasks"
parent: none
covers: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-8, CAP-9, CAP-10, CAP-11, CAP-12]
after: []
assignee: ""
risk: medium
---

# Todo App v1: a personal list that nudges neglected tasks

## Description

The author captures small tasks in seconds, and open tasks show their age until they are dealt with. The app runs locally with Docker Compose and is used from the laptop and the phone. It is also the author's end-to-end BMad exercise. The spec owns the capabilities, constraints and non-goals, and this initiative delivers all of them.

## Outcome

The author uses the list daily, and the exercise hands in with every gate green: the spec's success signal (SM-1 to SM-5).

## Done when

1. `docker-compose up` on a clean checkout brings up the app with every service healthy.
2. CAP-1 to CAP-12 can be demonstrated on the laptop browser and on the phone over Tailscale.
3. The exercise gates pass: at least 70% coverage, at least 5 green Playwright tests covering UJ-1 to UJ-3, and zero critical axe violations.
4. The QA reports (coverage, accessibility, security, performance), the README and the AI integration log are in the repo, as listed in `deliverables.md`.
5. After two weeks of use: capture takes under 5 s, at most 3 overdue tasks remain, and zero tasks were lost.

## Boundaries

This initiative covers the whole product, split by usable outcome: a working list first, then the age nudge, then multi-device use and the hand-in. The spec's non-goals apply. Everything is in one repo with one owner. Tracer path: one task typed on the laptop, saved through nginx → FastAPI → Postgres, and shown back in the list.

- Touch point: Tailscale on the author's devices. `tailscale serve` is configured, with no code change. Owner: epic-everywhere-and-handed-in.
- Touch point: `docs/ai-log.md`. Created in epic-capture-and-keep, and every epic appends to it as it builds.

## References

- spec — _bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md, Capabilities
- constraint — the same spec, Constraints
- architecture — _bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md, AD-1 to AD-20 (every cross-epic decision lives here)
- deliverables — _bmad-output/initiative-todo-app/spec-todo-app/deliverables.md

## Notes

- Decision: three epics, split by usable outcome rather than one epic for a solo owner (user, 2026-09-30).
- Decision: the optimistic store and rollback (CAP-8) go in the opening epic, so the store is built once (AD-9) (user, 2026-09-30).
- Open question: UX should confirm that a failed background poll stays silent once the list has loaded (spec Open Questions, AD-10). Only epic-everywhere-and-handed-in's polling story waits on it.
- Decision: Done when #5 (two weeks of use, SM-1 to SM-4) is an initiative-level signal checked after delivery, not owned by an epic (2026-09-30, architect's call, open to change).
- Decision: epic files keep `after: []`, because no epic is a whole-epic gate. The dependencies live in `tickets.toml` and move to the entries at inception (slice.md).
