# Reconcile: brief-todo-app.md + addendum.md vs PRD

| # | Item from brief / brief addendum | Status | PRD location |
|---|---|---|---|
| 1 | For small workday tasks too minor for a ticket | captured | §1, §2.2, §7 |
| 2 | Add a task with one line of text and Enter | captured | FR-1 |
| 3 | Tasks open over a day go to the top in red, so neglect is hard to ignore | captured (with override below) | §1, FR-6, FR-9 |
| 4 | Deliberately minimal: one user, one list, no priorities, deadlines or accounts | captured | §1, §3, §7 |
| 5 | Also a BMad practice project | captured | §1, JTBD Builder |
| 6 | Problem: small tasks end up on scraps of paper and get lost | captured | JTBD Emotional ("nothing gets lost"), SM-4 |
| 7 | Opens straight to a text box and the list; no fields, nothing to open first | captured | §1, §4.1, FR-2 |
| 8 | Age colour from green (<1h) to red (>1d) | captured | FR-9 |
| 9 | Tick, untick, delete | captured | FR-11, FR-12, FR-13 |
| 10 | Differentiator: the age nudge; the user never sorts or tags | captured | §1, §7 |
| 11 | No competitive advantage claimed; one idea worth testing | captured | §1 |
| 12 | User: works at a laptop, checks the list in spare minutes | captured | §2.2 |
| 13 | Success: capture in <5 s | captured | SM-1 |
| 14 | Success: adds tasks on most workdays over two weeks | captured | SM-2 |
| 15 | Success: overdue tasks completed or deleted, not piling up | captured (made measurable: <=3) | SM-3 |
| 16 | Success: survives refreshes and new sessions | captured | FR-14, SM-4 |
| 17 | Ordering: overdue oldest first, then other open newest first, then completed | overridden per memlog (all open oldest first, then completed most recent first). **PRD body not updated** | FR-6 (still brief order), UJ-3, FR-7, §4.2 |
| 18 | Laptop first, still usable on a phone | captured | NFR-3 |
| 19 | Out: manual priorities, editing text, undo delete, accounts, collaboration, deadlines, notifications | captured | §7, §8.2, FR-3, FR-13 |
| A1 | Stack: FastAPI, SQLModel/SQLAlchemy, Alembic, PostgreSQL, responsive web FE | captured | PRD addendum |
| A2 | Architecture to decide FE framework, API shape, hosting/deployment | captured (deployment settled: local compose) | PRD addendum, NFR-4 |
| A3 | Colour thresholds <1h green / 1-24h gradient / >24h red | captured | FR-9 |
| A4 | Colour-blind users need a second cue (text age or shape) | captured | FR-10, NFR-1, addendum |
| A5 | Open point: do completed tasks keep the indicator | captured (resolved: no colour, label shows "done" age) | FR-9, FR-10 |
| A6 | A new task may scroll out of view below overdue tasks; keep it visible, then animate into place | captured | FR-4, addendum UX notes, §10 Q2 |
| A7 | Input has focus on open; no "New task" button or form | captured | FR-2, §4.1 |
| A8 | Unticking keeps the original added time; the task returns overdue at the top | captured | FR-12, §3 |
| Q1 | Tone: nudge, not nag ("hard to ignore", glance shows what has waited longest) | captured | JTBD ("gentle push"), §6 |

## Gaps

1. **The ordering override was not applied to the PRD body.** The memlog records that the user changed the order to: all open tasks oldest added first, then completed tasks most recently completed first. FR-6 still has the brief's three-tier order ("Other open tasks, newest added time first"). The PRD addendum (lines 27, 35) already assumes the new order: positions do not change on the timer, and new tasks land at the bottom of the open tasks.
2. **Follow-on text still describes live reordering.** UJ-3 ("moves to the top of the list"), the §4.2 description ("moves to the top without a refresh") and FR-7's first consequence ("moves into the overdue part of the order within 60 seconds") describe the tasks jumping position. Under the override, positions stay stable and only the colour and label change. FR-4's wording ("overdue tasks fill the screen above its sorted position") should also say "open tasks", because every open task now sits above the new one.
