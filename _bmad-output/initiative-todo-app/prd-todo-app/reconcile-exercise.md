# Reconcile: docs/bmad_exercise.md vs PRD

Scope: only items that should shape a product PRD. Process deliverables are marked n/a (process).

| # | Item from exercise | Status | PRD location |
|---|---|---|---|
| 1 | Full-stack todo app (frontend + backend) | captured | §1, addendum |
| 2 | All CRUD operations work | captured (update = tick/untick; text editing out of scope by brief) | FR-1, FR-5, FR-11..13, §8.2 |
| 3 | Backend validation and error handling | captured | FR-3, FR-16..18, addendum length safeguard |
| 4 | Unit tests (Jest/Vitest), E2E tests (Playwright) | captured | addendum |
| 5 | Integration tests for every API endpoint | captured | addendum |
| 6 | Component tests for the frontend | weakened (addendum says "unit"; component tests not named) | addendum |
| 7 | E2E covers create, complete, delete, empty state, error handling | captured | NFR-7 |
| 8 | E2E covers all user journeys defined in stories | weakened | NFR-7 lists 5 flows. Untick-returns-overdue (UJ-2) and live overdue (UJ-3) not required |
| 9 | Minimum 5 passing Playwright tests | captured | NFR-7, SM-5 |
| 10 | Minimum 70% meaningful coverage | captured | NFR-7 |
| 11 | Dockerfiles: multi-stage builds, non-root users, health checks | captured | addendum |
| 12 | docker-compose: networking, volumes, env config; runs with `docker-compose up` | captured | NFR-4, FR-14, addendum |
| 13 | Health check endpoints; logs via `docker-compose logs` | captured | NFR-4 |
| 14 | Dev/test environments via env vars and compose profiles | captured | NFR-4 |
| 15 | Performance analysis (Chrome DevTools), document issues | captured (testable targets set) | NFR-2, addendum |
| 16 | Accessibility: WCAG AA, zero critical violations (axe/Lighthouse) | captured | NFR-1, SM-5 |
| 17 | Security review: XSS, injection | captured | NFR-5, addendum |
| 18 | Architecture: API contracts, component structure | n/a (downstream: architecture) | addendum defers |
| 19 | Stories with acceptance criteria; test strategy in stories | n/a (downstream: ticketing). FR "Consequences (testable)" support it | §4 |
| 20 | QA reports, README, AI integration log, BMAD process docs | n/a (process) | addendum lists them |
| 21 | Framework comparison | n/a (no target in source) | — |

Testable targets: coverage 70%, >=5 E2E, zero critical WCAG, `docker-compose up` all have PRD homes (NFR-1, NFR-4, NFR-7, SM-5). The exercise sets no number for performance. The PRD adds its own (NFR-2), which is fine.

## Gaps

1. **E2E coverage of the product's own journeys (minor).** NFR-7 names only the exercise's 5 generic flows. The exercise asks E2E to cover all user journeys in the stories, so the E2E set should also include untick-restores-overdue (UJ-2) and the ordering and age behaviour (FR-6, FR-9). The live-overdue case (UJ-3) needs a way to control the clock in tests, which architecture should note.
2. **Component tests (minor).** The addendum lists unit, integration and E2E but not frontend component tests, which the exercise expects.
