# How BMad guided the build

This is the record of how the BMad Method took the exercise from two short documents to a handed-in app. Each stage below names the BMad skill or agent that ran it, what it produced, the reviews that hardened it, and a decision it fixed that later work relied on. Every planning artifact lives in [`_bmad-output/initiative-todo-app/`](../_bmad-output/initiative-todo-app/). The per-ticket detail of how the AI agents worked is in [ai-log.md](ai-log.md). There, epic 1's sections are headed "Ticket N", which is story 1.N; epics 2 and 3 use "Ticket E.N".

## The chain at a glance

```text
docs/bmad_exercise.md + docs/PRD.md        (the inputs)
  → brief → PRD → UX (DESIGN, EXPERIENCE, mockups) → architecture spine
  → spec + deliverables.md
  → initiative → 3 epics → ticket trees (tickets.toml)
  → one plan per story → implementing subagent → 4 review lenses → triage → deferred-work.md
```

| Phase                | Dates               | Commits / PRs                         | What landed                                                                     |
| -------------------- | ------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Planning             | 2026-09-30          | `683e666` → `b7d90c4` (no PRs)        | initial PRD, BMad install, brief, final PRD, exercise, UX, spine, spec, tickets |
| Epic 1, capture/keep | 2026-09-30 to 10-01 | #1–#14 (AD-21 is #2, the refactor #7) | stories 1.1–1.12, the off-tree AD-21 and TestingTaskService plans               |
| Epic 2, age nudge    | 2026-10-01          | #15–#21 (#15 is the story breakdown)  | stories 2.1–2.6                                                                 |
| Epic 3, everywhere   | 2026-10-01 to 10-02 | #22–#31 (#22 is the story breakdown)  | stories 3.1–3.8 and 3.10; this story (3.9) hands in                             |

## The inputs

- [`docs/bmad_exercise.md`](bmad_exercise.md), the exercise brief: the stack, the QA targets and the hand-in list. Added in `8fa47a9`.
- [`docs/PRD.md`](PRD.md), the original short prose PRD for a single-user CRUD todo app. Added in `683e666`.

`579adac` installed BMad into the repo (`_bmad/`) and opened the `todo-app` initiative folder.

## Stage 1: Product brief

- **Skill:** `bmad-product-brief`, on the coaching path, because the goal was to learn BMad end to end ([memlog](../_bmad-output/initiative-todo-app/brief-todo-app/.memlog.md)).
- **Produced:** [brief-todo-app.md](../_bmad-output/initiative-todo-app/brief-todo-app/brief-todo-app.md) and its [addendum](../_bmad-output/initiative-todo-app/brief-todo-app/addendum.md), which carries the stack and other detail meant for later stages.
- **Hardened by:** a memlog audit, then a `bmad-review` structure and prose pass (7 fixes to the brief, 8 to the addendum).
- **Decisions later work relied on:** the product's one idea, the age indicator (green under 1 h, a gradient, red after 24 h) as a nudge to act on neglected tasks; capture is "type and press Enter, nothing more"; no editing, no undo, no priorities.

## Stage 2: PRD

- **Skill:** `bmad-prd`, on the fast path ([memlog](../_bmad-output/initiative-todo-app/prd-todo-app/.memlog.md)).
- **Produced:** [prd-todo-app.md](../_bmad-output/initiative-todo-app/prd-todo-app/prd-todo-app.md) (FR-1 to FR-18, NFR-1 to NFR-8, SM-1 to SM-5) and an [addendum](../_bmad-output/initiative-todo-app/prd-todo-app/addendum.md).
- **Hardened by:** three reconciles, against the [brief](../_bmad-output/initiative-todo-app/prd-todo-app/reconcile-brief.md), the [exercise](../_bmad-output/initiative-todo-app/prd-todo-app/reconcile-exercise.md) and the [original PRD](../_bmad-output/initiative-todo-app/prd-todo-app/reconcile-initial-prd.md), and two rubric reviews ([draft](../_bmad-output/initiative-todo-app/prd-todo-app/review-rubric-draft.md), [re-review](../_bmad-output/initiative-todo-app/prd-todo-app/review-rubric.md)).
- **Decisions later work relied on:**
  - The user overrode the brief's ordering: all open tasks oldest first, then completed tasks most recently completed first (FR-6). That one rule became the shared ordering fixture in stage 4.
  - NFR-2: feedback under 100 ms, the API under 300 ms, 500 tasks rendering under 200 ms. Story 3.8 measured against exactly these figures (see the second example below).
  - The load-failure toast stays until a Retry succeeds (FR-17), which became story 3.1.

## Stage 3: UX

- **Skill:** `bmad-ux`, on the coaching path ([memlog](../_bmad-output/initiative-todo-app/ux-todo-app/.memlog.md)).
- **Produced:** [DESIGN.md](../_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md) (tokens, palette, the age gradient's stops, components), [EXPERIENCE.md](../_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md) (behaviour, states, keyboard, motion, copy), the index [ux-todo-app.md](../_bmad-output/initiative-todo-app/ux-todo-app/ux-todo-app.md), and three key-screen mockups: [laptop](../_bmad-output/initiative-todo-app/ux-todo-app/mockups/key-main-laptop.html), [phone](../_bmad-output/initiative-todo-app/ux-todo-app/mockups/key-main-phone.html) and [states](../_bmad-output/initiative-todo-app/ux-todo-app/mockups/key-states.html).
- **Hardened by:** an [accessibility review](../_bmad-output/initiative-todo-app/ux-todo-app/review-accessibility.md), an [adversarial review](../_bmad-output/initiative-todo-app/ux-todo-app/review-adversarial.md) (2 critical and 6 high findings, mostly overlapping actions and long lists), a [rubric review](../_bmad-output/initiative-todo-app/ux-todo-app/review-rubric.md) and a [validation report](../_bmad-output/initiative-todo-app/ux-todo-app/validation-report.md).
- **Decisions later work relied on:**
  - FR-4's new-task hold: a new task stays under the input for about 3 s, then slides to its place (stories 2.4 and 2.5).
  - Rows slide for about 200 ms when they move, instantly under reduced motion. This is the animation that later missed NFR-2 at 500 rows.
  - The `/` shortcut was dropped for WCAG 2.1.4, and touch devices get no autofocus. Both shaped `lib/focus.ts` in story 1.7.

## Stage 4: Architecture spine

- **Skill:** `bmad-architecture`, on the coaching path, with the architect persona ([memlog](../_bmad-output/initiative-todo-app/architecture-todo-app/.memlog.md)).
- **Produced:** [architecture-todo-app.md](../_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md), the spine of architecture decisions (AD-1 to AD-20, later AD-21), the stack with verified versions, and the source tree.
- **Hardened by:** reconciles against the [PRD](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/reconcile-prd.md), the [UX](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/reconcile-ux.md) and the [exercise](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/reconcile-exercise.md), then a reviewer gate: [rubric](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-rubric.md), [currency](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-currency.md) (live registry checks of every pinned version) and [adversarial](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-adversarial.md). AD-21 went through the same three reviews later ([rubric](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-ad21-rubric.md), [currency](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-ad21-currency.md), [adversarial](../_bmad-output/initiative-todo-app/architecture-todo-app/reviews/review-ad21-adversarial.md)).
- **Decisions later work relied on:** AD-6 makes the backend the ordering authority, with a frontend mirror for optimistic placement, both tested against one fixture file ([`contracts/ordering-cases.json`](../contracts/ordering-cases.json)); AD-9's confirmed-state-plus-queue store; AD-10's seq merge (example below); AD-14's test-only router and server clock offset, which let every E2E test control time; AD-16's compose profiles and the `cp .env.example .env` step.

## Stage 5: Spec and deliverables

- **Skill:** `bmad-spec` ([memlog](../_bmad-output/initiative-todo-app/spec-todo-app/.memlog.md)).
- **Produced:** [spec-todo-app.md](../_bmad-output/initiative-todo-app/spec-todo-app/spec-todo-app.md), which groups the FRs into twelve capabilities (CAP-1 to CAP-12) with constraints and non-goals, and [deliverables.md](../_bmad-output/initiative-todo-app/spec-todo-app/deliverables.md), the exercise's hand-in list lifted out of `bmad_exercise.md`. [hand-in-checklist.md](hand-in-checklist.md) mirrors it item by item.
- **Hardened by:** two self-validation passes (coherence and preservation), each recorded in the memlog.
- **Decision later work relied on:** a precedence rule for conflicts, confirmed by the user: spec, then architecture, then UX, then PRD. Story plans cite it whenever two documents disagree.

## Stage 6: Initiative, epics and ticket trees

- **Skill:** `bmad-preview-ticketing`.
- **Produced:** [initiative-todo-app.md](../_bmad-output/initiative-todo-app/initiative-todo-app.md) with its Done-when list, the epic order in [tickets.toml](../_bmad-output/initiative-todo-app/tickets.toml), and three epics, each with its own `tickets.toml` of stories, dependencies and verify lines:
  - [epic-capture-and-keep](../_bmad-output/initiative-todo-app/epic-capture-and-keep/epic-capture-and-keep.md) ([tickets](../_bmad-output/initiative-todo-app/epic-capture-and-keep/tickets.toml)), sliced with the spine in `b7d90c4`;
  - [epic-age-nudge](../_bmad-output/initiative-todo-app/epic-age-nudge/epic-age-nudge.md) ([tickets](../_bmad-output/initiative-todo-app/epic-age-nudge/tickets.toml)), broken into six stories in PR #15;
  - [epic-everywhere-and-handed-in](../_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/epic-everywhere-and-handed-in.md) ([tickets](../_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/tickets.toml)), broken into nine stories in PR #22, and a tenth (3.10) added on 2026-10-02.
- **Decisions later work relied on:** the epics split by usable outcome, and the optimistic store built once in epic 1 (user, 2026-09-30); the store split into entries 1.8 and 1.12 to fit one session each; no closing E2E suite in epic 1, because the journey suite needs ages (it became story 3.7). Each epic file keeps these dated decisions in its Notes.

## Stage 7: Stories

Every story was built through `bmad-build`, with the dev persona (`bmad-agent-dev`) planning it. A story ran like this:

1. **Plan.** The dev persona wrote a plan file next to the epic, for example [story-store-sync-sequence-merge-tombstones-and-recovery-get-plan.md](../_bmad-output/initiative-todo-app/epic-capture-and-keep/story-store-sync-sequence-merge-tombstones-and-recovery-get-plan.md). Its Intent, Boundaries (Always and Never) and I/O matrix sit inside a `<frozen-after-approval>` block: once the user approved the plan, only the user could change them. The Code Map, tasks and verification commands below that block guide the build. Open questions went to the user before the build, and the answers were dated in the plan, the epic or the spine.
2. **Implement.** A Claude Code subagent got one prompt: read the plan, treat it as the sole source of truth, load its `context:` files, and report what changed, how it was verified and what is left. It had no other context, so the plan had to be complete.
3. **Review.** Four independent reviewer subagents read the diff, each through one lens: blind hunter (the diff alone), edge-case hunter, verification gap (tests that can't fail) and intent alignment (the diff against the frozen intent). Two small changes, 2.4 and 3.3, took the oneshot route with one quick lens instead. The lenses each plan ran are in its frontmatter (`lenses_ran`).
4. **Triage.** The main session checked every finding against the code and recorded a verdict in the plan's Review Triage Log: patch, defer, or reject with evidence. In ticket 1, about two thirds were rejected on evidence (ai-log Ticket 1).
5. **Defer.** Deferred findings went to [deferred-work.md](../_bmad-output/initiative-todo-app/deferred-work.md), which is append-only. Each epic closed with a refactor-sweep story (1.11, 2.6, 3.6) whose scope the user picked from that file and the epic's build records.
6. **Log.** The story appended its section to [ai-log.md](ai-log.md).
7. **Close.** A plan ends at status `built`. The user marks tickets and epics done. `bmad-retrospective` has not been run for any epic before the hand-in.

Two changes ran outside the ticket tree, each with its own plan: [AD-21, backend settings](../_bmad-output/initiative-todo-app/plan-ad-21-backend-settings.md) (PR #2, after an architecture update), and the [TestingTaskService docs](../_bmad-output/initiative-todo-app/plan-testing-task-service-docs.md) that followed the PR #7 refactor.

## Two decisions that carried through

### AD-10: the seq merge

- **Architecture.** The first stale-response guard discarded any GET that a mutation overtook. The architect found the hole: adds are allowed during the first load, so a whole-GET discard could leave the list never loaded. AD-10 replaced it with a confirmation sequence. Each confirmed task records the seq that confirmed it; a GET sent at S replaces only entries with seq ≤ S, and tombstones stop a stale GET bringing back a deleted task ([spine memlog](../_bmad-output/initiative-todo-app/architecture-todo-app/.memlog.md)).
- **Ticketing.** Epic 1 put the merge in the opening epic, because the first load and the recovery GET after a network error already need it, and split the store into 1.8 and 1.12 ([epic-capture-and-keep](../_bmad-output/initiative-todo-app/epic-capture-and-keep/epic-capture-and-keep.md), Notes).
- **Build.** Story 1.12 built `merge(server, S)` by following the plan's six rules in order, and closed the race that 1.8 had deferred: an add confirmed while the first GET was in flight was dropped or duplicated (ai-log Ticket 8 and Ticket 12). Story 3.2's 30 s polling then reused it: a poll goes through the same `refresh()` and merge (ai-log Ticket 3.2), and the CAP-10 journey in 3.7 tests it end to end.

### NFR-2: the miss found at 500 rows, fixed by 3.10

- **PRD and UX.** NFR-2 set feedback under 100 ms with 500 tasks, and EXPERIENCE asked rows to slide for about 200 ms when they move.
- **QA.** Story 3.8's plan said "a miss is reported as a miss". Its CDP-traced check found that every action changed the DOM fast, but the paint came late: feedback p95 was 201.8 ms for Enter, 118.8 ms for tick and 168.4 ms for delete. A reduced-motion run pinned the cost on the row animation (ai-log Ticket 3.8; [qa-performance.md](qa-performance.md), Issue 1).
- **Decision.** The user had it fixed before the hand-in, as a new entry 10 that this story (3.9) waits on ([epic-everywhere-and-handed-in](../_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/epic-everywhere-and-handed-in.md), Notes, 2026-10-02). Entry 3.10 entered the ticket tree through plan commit `78fd216` ("plan: add entry 3.10"), which added it to the epic's `tickets.toml` and recorded that dated decision in the epic's Notes. It reached `main` inside the squash merge of PR #30.
- **Fix.** Story 3.10's plan read the reduced-motion figures as proof that layout reads were not the cost, and pointed at the per-row `element.animate()` calls. Now only rows on screen slide. The p95s fell to 94.5, 62.7 and 74.3 ms (ai-log Ticket 3.10; [plan](../_bmad-output/initiative-todo-app/epic-everywhere-and-handed-in/story-row-motion-within-nfr-2-at-500-rows-plan.md)).
