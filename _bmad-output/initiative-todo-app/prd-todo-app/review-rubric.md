# PRD Quality Review — Todo App (re-review)

## Overall verdict
The fixes worked. Ordering is now stated one way everywhere: §0, §1, §4.2, FR-6, FR-7, FR-11, FR-12, UJ-2, UJ-3 and the addendum all agree. Clock handling (FR-15) is consistent and testable, and every earlier finding is resolved. What remains is small and mostly about behaviour at the edges. The FR-17 retry affordance conflicts with toasts that dismiss themselves (FR-18). Keyboard focus after tick, untick or delete is never specified, even though UJ-1's "cursor is already in the input" depends on it. The PRD is ready to hand to UX, architecture and story slicing. Those two items can be settled in `bmad-ux` if not fixed here.

## Resolution of prior findings

| # | Prior finding (severity) | Status | Evidence |
|---|---|---|---|
| 1 | Ordering override not recorded against "brief wins" (medium) | Resolved | §0: "with one deliberate exception: list ordering (FR-6) replaces the brief's three-tier order." |
| 2 | Vision describes a "pushes to the top" mechanic (low) | Resolved | §1: "lists open tasks oldest first and shows how long each has been waiting, turning red after a day." |
| 3 | FR-6 specifies the superseded ordering (critical) | Resolved | FR-6: "1. Open tasks, oldest added time first … 2. Completed tasks, most recent completed time first." |
| 4 | "Moves to the top" language in §4.2, FR-7, UJ-3 (high) | Resolved | §4.2 "positions do not shift as time passes"; FR-7 "Its position does not change"; UJ-3 "It is already near the top". |
| 5 | FR-15 self-contradiction on browser clock and time zone (medium) | Resolved | FR-15 now says time zone plays no part, drift is tolerated, and future timestamps show "now". Each point has a consequence, and the addendum matches. |
| 6 | FR-4 premise tied to overdue tasks (low) | Resolved | FR-4: "even when older open tasks fill the screen". |
| 7 | Untick missing from FR-16 rollback consequences (low) | Resolved | FR-16: "ticking, unticking or deleting". |
| 8 | Adjective bounds in FR-18 and NFR-2 (low) | Resolved | FR-18 "about 5 seconds"; NFR-2 "With 500 tasks, the list renders in under 200 ms". |
| 9 | Failed add when the input already holds new text (low) | Resolved | FR-16: "the new text is kept and the toast shows the failed task's text". |
| 10 | PRD and addendum disagree on where a new task lands (medium) | Resolved | FR-6 and the addendum both put it at the bottom of the open tasks. |
| M1 | Glossary drift, "part(s)" of the list (mechanical) | Resolved | Text now says "the completed tasks" (UJ-2, FR-11, §8.2). "Overdue part" is gone. |
| M2 | UJ-1 and FR-16 word a failed add differently (mechanical) | Resolved | UJ-1: "The task disappears from the list, a toast says so, and the text is back in the input". |
| M3 | Unindexed `[ASSUMPTION]` on FR-10 (mechanical) | Resolved | The tag is gone, and the label format is confirmed per `.memlog.md`. |

**10 of 10 findings resolved (13 of 13 including mechanical notes).**

## Decision-readiness — strong
Decisions read as decisions, and each carries the reason it was made. There is "no confirmation and no undo" on delete (§4.5). No auth is needed "because the app runs locally only" (NFR-5). The one departure from the brief is declared in §0 rather than left for the reader to find. §8.2 gives a reason and a revisit trigger for every deferral. SM-C2 admits openly that the nudge can be gamed by deleting tasks. The three Open Questions in §10 are genuinely open and each has an owner. No findings.

## Substance over theater — strong
There is one persona, and it drives decisions: laptop-first in NFR-3, "too minor for a ticket" in §1, and two weeks of self-use as the metric window. The Vision is specific to this product. Each NFR has a product-specific number (100 ms, 300 ms, 200 ms at 500 tasks, 360 px, 70%, 5 E2E tests). The one claimed differentiator is framed modestly. No furniture found.

## Strategic coherence — strong
The thesis in §1 is coherent now that the Vision matches the mechanism: the nudge comes from position, which is stable and oldest first, combined with colour and label. It is not a reorder. Features follow from the thesis. SM-3 tests the thesis directly with a threshold ("no more than 3 overdue tasks remain"), and SM-C1 and SM-C2 guard against gaming it. The MVP scope targets the problem and holds together. No findings.

## Done-ness clarity — adequate
Almost every FR now has a sharp, testable consequence. The best are FR-6's exact order, FR-7's "within 60 seconds … position does not change", FR-12's 2-day untick case, FR-15's time-zone and future-timestamp checks, and FR-16's two rollback cases. The gaps sit at the edges: one rule where two FRs conflict, and one behaviour that the headline journey assumes but no FR specifies.

### Findings
- **medium** Load-failure retry conflicts with toasts that dismiss themselves (FR-17, "a toast explaining the failure and a way to retry"; FR-18, "dismiss themselves after about 5 seconds") — If the retry control is in the toast, it disappears after about 5 s. The user is then left with a list area that FR-17 says must "not show a misleading empty state", but nothing says what it does show, and there is no way to retry short of reloading. A timed-out action control also sits uneasily with WCAG 2.1 SC 2.2.1 (Timing Adjustable), which is in scope through NFR-1. It is also unstated whether the user can add tasks while the list has failed to load. FR-5 allows adding while the list is loading, but not after a failure. *Fix:* In FR-17, say the retry affordance stays visible until used, either as a toast that does not auto-dismiss or as an inline error state in the list area. State what the list area shows, and whether adding is allowed. Alternatively, exempt this toast from FR-18's auto-dismiss.
- **medium** Focus after list actions is unspecified, yet UJ-1 depends on it (UJ-1, "The cursor is already in the input"; FR-2 covers focus only "when the page finishes loading"; FR-8, "With zero tasks … the input still has focus") — Ticking, unticking or deleting by keyboard (required by NFR-1) or by mouse leaves focus on a list control. When a task is deleted, its control vanishes, and focus may fall to `<body>`. When Peter later switches back to the tab (UJ-1), typing would not reach the input. That breaks the core capture journey and SM-1's 5-second target. The FR-8 consequence "Deleting the last task shows the empty state" can also leave focus nowhere, which contradicts the first FR-8 consequence. *Fix:* Add a rule, either to FR-2 or as a new consequence under FR-11/FR-13: after a task is deleted, focus moves to a defined place (the next task's control, or the input). Separately, decide whether the input regains focus when the tab becomes visible again. If the answer is "no", reword UJ-1.
- **low** Length-safeguard wording skips the optimistic-add path (FR-3, "a toast explains why and the text stays in the input") — Under FR-1 and FR-16 the input has already cleared and the task has appeared, so a server rejection is a rollback in which the text comes back. "Stays" is inaccurate, and it ignores FR-16's rule for when new text has already been typed. *Fix:* Change to "the add is rolled back as in FR-16, with a toast explaining the length limit."
- **low** Label rounding rule not stated (FR-10, "whole minutes ('12m') … whole hours ('5h') … whole days ('3d')") — "Whole" suggests truncation, but tests need the rule to be exact. For example, 59 min 40 s could show "59m" or "60m", and 23 h 50 m could show "23h" or "24h" / "1d". UJ-3 ("ticks over to '1d'" at 24 h) implies floor. *Fix:* Add "rounded down", which keeps "1d" aligned with the 24-hour overdue boundary.

## Scope honesty — strong
§7 Non-Goals and §8.2 do real work, and each deferral has a reason and a revisit trigger. The open-items count (3 OQs, 0 assumptions, 0 NOTE FOR PM) is appropriate for the stakes. Per the memlog, the missing assumptions index is intentional and not a gap.

### Findings
- **low** Exercise "all CRUD operations" criterion versus no text editing (`docs/bmad_exercise.md` Success Criteria, "fully functional with all CRUD operations"; §8.2, "Editing task text" out of scope) — This is a deliberate and sensible omission. A grader reading the checklist literally might still see a missing "U". *Fix:* Add one line (in §8.2 or the addendum's exercise section) saying that Update is covered by tick and untick (FR-11, FR-12), and that editing text is intentionally excluded.

## Downstream usability — strong
The glossary is used consistently. The new **Input** term appears throughout (§4.1, FR-1–3, FR-8, FR-16, FR-18, UJ-1). IDs are contiguous and unique: UJ-1–3, FR-1–18, NFR-1–8, SM-1–5, SM-C1–C2. Every "Realizes" and "Validates" reference resolves, and each UJ has a named protagonist. The PRD and addendum now agree on ordering, timestamps, the length safeguard and new-task placement.

### Findings
- **low** Addendum timer cadence can breach FR-7's bound (addendum Implementation notes, "on a timer of about 60 s"; FR-7, "never more than 60 seconds out of date") — A timer of "about" 60 s, plus drift or throttling in background tabs, can exceed 60 s, and a strict test would fail. *Fix:* In the addendum, suggest a shorter interval (for example 30 s), or recompute on `visibilitychange` so the bound holds when the tab regains focus.

## Shape fit — strong
This is a solo single-user tool at the top of a UX → architecture → stories chain. Three short UJs with edge cases is the right density. Exercise grading targets are placed where downstream will find them (NFR-1, NFR-4, NFR-7, SM-5, and the addendum's exercise section). The business narrative is appropriately light. No findings.

## Mechanical notes
- **Glossary:** consistent. "Tick" and "untick" are used as verbs but not defined. "Complete" appears in NFR-7 ("add, complete, untick"). This is harmless, but "tick" would match FR-11. "List area" (FR-8, FR-17) is not a glossary term. It is fine as layout language.
- **UJ-2 "green-to-amber":** this names an intermediate colour that OQ1 leaves to UX. It works as illustration, but UX should not read it as a requirement.
- **SM-2 "most workdays":** loose, but it can be computed from stored added times (more than 50% of workdays with at least one add). Fine for the stakes.
- **IDs and cross-references:** all contiguous and resolving. NFR-8 was added cleanly, and §8.1 maps every FR range.
- **Assumptions Index:** none needed. There are no inline `[ASSUMPTION]` tags, and the roundtrip is clean.
- **Required sections:** all present for the stakes.
