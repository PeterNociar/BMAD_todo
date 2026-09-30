# PRD Quality Review — Todo App

## Overall verdict
For a solo practice project this is a tight PRD. It has a real thesis (the age nudge instead of priorities), 18 FRs that are mostly testable, honest non-goals, and a shape that fits a single-user tool. Its one serious weakness is that the user's recent ordering change (all open tasks oldest-added first, then completed tasks most-recently-completed first, per `.memlog.md`) never made it into the PRD text. FR-6 still states the old brief ordering. §1, §4.2, FR-7 and UJ-3 still describe tasks "moving to the top" as they turn overdue. The addendum already follows the new rule. As a result, the core behaviour of the product is specified two different ways. Fix that cluster and the PRD is ready to hand to UX, architecture and story slicing.

## Decision-readiness — adequate
Decisions are stated as decisions: delete has "no confirmation and no undo" (§4.5), no auth "because the app runs locally only" (NFR-5), and there is no user-facing length limit but there is a 2,000-character safeguard (FR-3). Trade-offs name what was given up: §8.2 gives a reason for each deferral ("Delete and re-add is enough for a one-line task"), and SM-C2 openly admits that deleting tasks can game the nudge. The Open Questions in §10 are genuinely open and each has an owner.

The weak spot is how the PRD states its own authority. §0 says "Where the two differ, the brief wins". The user then overrode the brief on ordering, and the PRD does not record that exception anywhere. A downstream reader who follows §0 literally, and who sees FR-6 still matching the brief, would reasonably build the old ordering.

### Findings
- **medium** Ordering override not recorded against the "brief wins" rule (§0, "Where the two differ, the brief wins") — This is the one place the user deliberately departed from the brief, but the PRD reads as if the brief still governs ordering. *Fix:* In §0 (or as a note under FR-6), add a line saying ordering intentionally differs from the brief: all open tasks oldest-added first, so positions stay stable over time.

## Substance over theater — strong
There is one persona (the author) and it drives decisions: the laptop-first choice in NFR-3, "too minor for a ticket" in §1, and the two-week self-use metrics. The Vision is specific to this product. Each NFR has a product-specific threshold (100 ms feedback, 300 ms API time locally, 360 px width, 70% coverage, 5 E2E tests). The age nudge is the only claimed differentiator and it is framed modestly ("the one idea worth testing"). No furniture found.

## Strategic coherence — adequate
The thesis is clear: surface neglect through age instead of asking the user to prioritise (§1, JTBD 2). The features follow from it, and SM-3 plus SM-C2 test the thesis rather than activity, which is good. SM-C1 guards against SM-2 becoming a vanity metric. MVP scope is a problem-solving scope and is coherent.

The ordering change weakens the way the thesis is told, though not the thesis itself. §1 says the app "pushes tasks older than a day to the top, in red". Under oldest-first ordering nothing is pushed: overdue tasks are always on top simply because they are oldest, and the nudge now comes from colour and label alone. The story still holds, but the Vision describes a mechanism the product no longer has.

### Findings
- **low** Vision describes a movement mechanic that no longer exists (§1, "pushes tasks older than a day to the top, in red") — Under the new ordering, overdue tasks stay on top because they are oldest. They do not get pushed there. *Fix:* Reword, for example: "keeps the oldest tasks at the top and turns them red once they pass a day."

## Done-ness clarity — thin
Most FRs have concrete, testable consequences. FR-3's whitespace rules and 2,000-character floor, FR-9's example ages (30 min, 12 h, 25 h), FR-10's label format, FR-12's "added 2 days ago, ticked, then unticked" case, and FR-16's API-down scenarios are all good. The verdict is *thin* only because the most important testable rule, FR-6, is testable but wrong. FR-7's consequence also tests a behaviour that should now never happen. An engineer following the PRD would ship, and test, the old ordering. Beyond that there are a few adjective leftovers.

### Findings
- **critical** FR-6 still specifies the superseded ordering (§4.2 FR-6, "1. Overdue tasks, oldest added time first. 2. Other open tasks, newest added time first.") — This contradicts the user's logged override (all open tasks oldest-added first) and the addendum ("Order depends only on added time and completed time, so it does not change on the timer"; new task goes "at the bottom of the open tasks"). The consequence "rendered order matches the rules above exactly" would lock the wrong rule into the tests. *Fix:* Replace with "1. Open tasks, oldest added time first (overdue tasks are therefore always on top). 2. Completed tasks, most recent completed time first."
- **high** "Moves to the top" language contradicts stable ordering (§4.2 description, "a task that turns overdue moves to the top without a refresh"; FR-7, "turns red and moves into the overdue part of the order within 60 seconds"; UJ-3, "it turns red and moves to the top of the list") — Under oldest-first ordering, a task crossing 24 h is already directly below every older (overdue) task, so its position does not change. Only its colour and label change. As written, the FR-7 consequence tests a reorder that should not happen. *Fix:* In FR-7, say ordering does not change over time and the consequence is "turns red within 60 seconds, with its position unchanged". In §4.2 and UJ-3, drop "moves to the top".
- **medium** FR-15 contradicts itself and the addendum on whose clock is used (§4.6 FR-15, "ages are correct regardless of the browser's clock or time zone. FE can adjust the ages based on the Browser Timezone offset"; addendum, "The frontend works out ages from these timestamps using the browser's current clock") — Ages are differences between UTC timestamps, so time zone does not affect them and there is nothing to "adjust". Ages do depend on the browser clock, though, which directly contradicts "regardless of the browser's clock". The consequence only tests time zone. *Fix:* Delete the "FE can adjust" sentence. Either say "small browser clock drift is tolerated" (matching the addendum), or require the client to correct for clock offset using the server time, and add a consequence for whichever you choose.
- **low** FR-4 test premise tied to the old ordering (§4.1 FR-4, "even when overdue tasks fill the screen above its sorted position") — New tasks now land at the bottom of *all* open tasks, so any open tasks, not just overdue ones, can push them off screen. This makes FR-4 matter more, as the memlog notes. *Fix:* Change "overdue tasks" to "open tasks" in the FR statement and its consequence.
- **low** Untick missing from rollback consequences (§4.6 FR-16, "With the API unavailable, ticking or deleting") — The FR text covers untick but no consequence tests it. *Fix:* Change to "ticking, unticking or deleting".
- **low** Adjective bounds left in (FR-18, "dismiss themselves after a few seconds"; NFR-2, "No noticeable slowdown with 500 tasks") — Given the stakes, these are fine for UX to settle, but they cannot be tested as written. *Fix:* Give a number for each, for example "4–8 s" and "interactions still meet the 100 ms feedback bound with 500 tasks".

## Scope honesty — strong
§7 Non-Goals does real work (no priorities or deadlines, no offline mode, not hosted). Each FR has its own Out of Scope entries (FR-3, FR-13), and §8.2 gives a reason and a revisit trigger for each deferral. Open items are few: 3 Open Questions and 1 `[ASSUMPTION]`, which is appropriate for low stakes. The memlog records that the other assumptions were confirmed and the index was removed on purpose.

### Findings
- **low** Edge case of add rollback when the input is no longer empty (§4.6 FR-16, "the task text is back in the input"; FR-1, "The input clears and keeps focus") — Tasks can be entered in a row (§4.1), so the user may already have typed the next task when the first add fails. The PRD does not say whether the restored text overwrites what is there, is prepended to it, or waits. *Fix:* Add one line (for example "if the input is not empty, the failed text is not restored; the toast quotes it"), or send it to UX as an Open Question.

## Downstream usability — adequate
The glossary is present and mostly used exactly. IDs are contiguous and unique (FR-1–18, NFR-1–7, SM-1–5, SM-C1–C2), and every "Realizes UJ-n" and "Validates FR-n" reference resolves. Each UJ has a named protagonist (Peter). The main risk for downstream is the ordering contradiction above: UX will read the addendum ("bottom of the open tasks") while stories get sliced from FR-6. There is also some vocabulary drift around list "parts".

### Findings
- **medium** PRD body and addendum disagree on where a new task lands (FR-6 puts a new task at the top of the non-overdue open tasks (newest first); addendum UX notes put it "at the bottom of the open tasks") — Downstream workflows pulling from different files will get conflicting rules. The fix is covered by the FR-6 finding. *Fix:* Resolve through the FR-6 fix, then re-check that the addendum matches.

## Shape fit — strong
This is a solo, single-user tool at the top of a UX, architecture and stories chain. Three short UJs with edge cases is the right density. They carry the behaviour that matters (focus on load, rollback, untick restoring age, live colour change) without over-formalising. The business narrative is appropriately light, and the exercise grading targets sit in NFR-1, NFR-4, NFR-7 and SM-5, where downstream will find them.

## Mechanical notes
- **Glossary drift, "part(s)" of the list:** Glossary says Overdue task "is a state, not a separate section of the list", but the text uses "the overdue part of the order" (FR-7), "the completed part of the list" (UJ-2, FR-11, §8.2, §10.3) and "among the overdue tasks" (FR-12). The completed/open split is a real ordering band, so either add a glossary term (for example **Completed part** = the completed tasks at the end of the list) or phrase it as "after all open tasks". Under the new ordering, "overdue part" disappears once FR-7 is fixed.
- **UJ-1 vs FR-16 on a failed add:** UJ-1 says "the text is still in the box", which implies the input never cleared. FR-16 says the task "briefly appears, is removed … and the task text is back in the input", which implies it cleared and was restored. The end result is the same, but align the wording.
- **Assumptions Index:** there is one inline `[ASSUMPTION]` (FR-10 label format) and no index. The index was removed on purpose per the memlog. It is acceptable at this size, but either index the one entry or turn it into a UX note so the roundtrip is clean.
- **IDs and cross-references:** all contiguous and resolving. SM-3 "Validates FR-6, FR-9" is still valid after the ordering fix.
- **Required sections:** all present for the stakes (Vision, users/UJs, glossary, FRs, NFRs, non-goals, MVP scope, SMs with counter-metrics, open questions).
