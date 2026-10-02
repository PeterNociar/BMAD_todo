---
epic: epic-everywhere-and-handed-in
date: 2026-10-02
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Everywhere, and handed in

## Epic summary

**Epic:** `epic-everywhere-and-handed-in` (epic 3 of 3). It covers CAP-9, CAP-10 and CAP-11. Retro run interactively on `main` at `0f4f7c3`. The user named no areas to weight.

**Tickets** (build order from `tickets.py status`). Every ticket is `built`, and its tree `state` is `review`. None is `done` yet, and `pending_tickets` is empty.

| Ref  | Title                                 | Plan                                                | Range (baseline → next)                             | Commit / PR   | Files | +/−         |
| ---- | ------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ------------- | ----- | ----------- |
| 3.1  | Load failure and Retry                | story-load-failure-and-retry-plan.md                | `12bb0d7..5eb9101`                                  | 5eb9101 / #23 | 8     | +596/−27    |
| 3.2  | Background polling                    | story-background-polling-plan.md                    | `5eb9101..b1a1dfc`                                  | b1a1dfc / #24 | 8     | +559/−3     |
| 3.3  | Phone access over Tailscale (hitl)    | story-phone-access-over-tailscale-plan.md           | `b1a1dfc..d30b06c`                                  | d30b06c / #25 | 3     | +116/−3     |
| 3.4  | Dark theme and pre-paint theme script | story-dark-theme-and-pre-paint-theme-script-plan.md | `d30b06c..751fbf5`                                  | 751fbf5 / #26 | 18    | +1065/−7    |
| 3.5  | Theme toggle                          | story-theme-toggle-plan.md                          | `751fbf5..da5ca39`                                  | da5ca39 / #27 | 10    | +615/−12    |
| 3.6  | Refactor sweep                        | story-refactor-sweep-plan.md                        | `da5ca39..a63179a`                                  | a63179a / #28 | 13    | +802/−46    |
| 3.7  | User-journey E2E suite                | story-user-journey-e2e-suite-plan.md                | `a63179a..a1953b8`                                  | a1953b8 / #29 | 9     | +750/−99    |
| 3.8  | QA reports                            | story-qa-reports-plan.md                            | `a1953b8..dfe918f`                                  | dfe918f / #30 | 28    | +4939/−12   |
| 3.10 | Row motion within NFR-2 at 500 rows   | story-row-motion-within-nfr-2-at-500-rows-plan.md   | `dfe918f..7ae9b39`                                  | 7ae9b39 / #31 | 14    | +1826/−1416 |
| 3.9  | Hand-in documentation                 | story-hand-in-documentation-plan.md                 | `7ae9b39..0f4f7c3` (inferred: last baseline → HEAD) | 0f4f7c3 / #32 | 9     | +539/−25    |

Notes on the table:

- Each range holds exactly one squash commit and no merges, so the range is the attribution.
- Epic total: `12bb0d7..0f4f7c3`.
- The 3.8 and 3.10 volumes are inflated by generated JSON (`docs/qa-artifacts/*.json`: about 2,760 lines in 3.8, about 2,630 changed in 3.10).
- 3.10 was added to the tree after 3.8 found the NFR-2 miss. The plan commit is `78fd216`, on the 3.8 branch, which reached `main` in the #30 squash. The epic's Notes record the user's decision on 2026-10-02.

**Evidence inventory:**

- **Epic file:** present, with a declared Done when (5 items), so the verdict is judged against declared criteria. Notes hold 6 dated decisions.
- **Initiative requirements:** `initiative-todo-app.md` (CAP-9, CAP-10, CAP-11).
- **Entries:** `description`, `verify` and `covers` were read for every ticket. No story files exist, because no ticket was refined.
- **Plans:** all 10 are present, each with a `baseline_revision`.
  - Review Triage Log present in 9 of 10.
  - 3.3 (hitl, docs-only) has none, so no review ran for it.
  - `review_loop_iteration` is 0 everywhere, so there were no loopbacks.
  - One Plan Change Log entry exists (3.7).
  - Pass 1 totals across the 9 reviewed plans: high 0 · medium 12 · low 136 · false 29 · maybe-false 1.
- **Process record:** `docs/ai-log.md` has one section per ticket (3.1–3.10) plus the Summary. `deferred-work.md` holds this epic's deferrals.
- **Session logs:** 14 local Claude Code transcripts (`~/.claude.work/projects/-home-noco-repos-nearform-BMAD-todo/*.jsonl`). They were **not read**. Process lessons are drawn from the ai-log and the plans' triage logs instead, and this narrowing is recorded.
- **Previous retro:** none. Epics 1 and 2 have no retrospective, so there is no follow-through to check.

## Findings

Each finding has a source. The routing tag reads _fix now_, _defer_ or _accept_, followed by the upstream lesson. Finding ids (F1…) are referenced by the Action items. The scope is the epic diff `12bb0d7..0f4f7c3`, with `docs/qa-artifacts/*.json`, `_bmad-output/**` and `docs/ai-log.md` left out of the code review. Sub-agent reports were re-checked at the primary source before routing; the ones re-checked are marked ✔.

### Aggregate views

The import graph was derived with grep at both revisions (madge and depcruise aren't installed). It grew from 55 to 73 edges. Backend and CSS imports were not checked.

- **F1 · Architecture delta: clean.** The checks:
  - No cycles. The production graph still points downward: main → App → components → lib.
  - AD-9 holds: `fetch` appears only in `frontend/src/lib/api.ts:48`, and only `lib/tasks.svelte.ts` imports it.
  - AD-18 holds: `.focus()` appears only in `lib/focus.ts`, and `ThemeToggle.svelte` goes through it.
  - New edges: `App → ThemeToggle` (3.5), `App → lib/motion` (3.10), `TaskRow → lib/theme.svelte` (3.4), and `theme.svelte.ts:9 → age` (a type-only `Theme` import).

  _Accept._ Lesson: none.

- **F2 · Growth of the store closure.** `frontend/src/lib/tasks.svelte.ts` went from 393 to 503 lines across 3.1 and 3.2. One `createTasks()` closure (lines 105–499) now holds the hold timer, op queues, seq merge, GET coalescing, load state and Retry (3.1), plus polling, visibility and `dispose` (3.2), with about 15 mutable `let`s (106–128). Its test file grew from 983 to 1,453 lines. Each story added only about 60 lines, so no single review saw the whole. _Defer._ Lesson: a refactor sweep (3.6) ran before the QA stories, but it didn't target the store. Name the store as an explicit sweep target when a story adds a new state machine to it.
- **F3 · e2e/qa/perf.spec.ts is a 690-line single file.** About 20 helpers live at the top level (trace parsing, stats, request timing, poll watching, render probe, generators: `perf.spec.ts:55-417`). _Defer._ Lesson: none (a QA harness).
- **F4 · Duplicated test helpers.** `open()` is defined 4 times (`hold.spec.ts:48`, `journeys.spec.ts:84`, `theme-toggle.spec.ts:37`, `a11y.spec.ts:62`), with 5 seeding variants and 4 sets of locator helpers. Others:
  - WCAG contrast is reimplemented in `e2e/qa/a11y.spec.ts:229-243` against `frontend/src/lib/oklch.ts:91-103`.
  - Row-animation sampling appears in both `hold.spec.ts:78-91` and `rows.spec.ts:382-452`.
  - GET-delay routes appear in `a11y.spec.ts:74-88` and `capture.spec.ts:183-187`.

  3.7 had already moved `settled`, `HOLD_MS`, `stillHeld`, `POLL_MS` and `nextPoll` into `e2e/fixtures.ts:291-325`. _Defer._ Lesson: a story that adds a new spec should check `fixtures.ts` first. This is a candidate rule for AGENTS.md.

- **F5 · Story references in code comments.** 19 lines added in 17 code files, among them `e2e/qa/perf.spec.ts`, `frontend/nginx/default.conf.template`, `scripts/check-infra.sh` and `backend/tests/test_mutations.py`. The habit predates the epic (11 at `12bb0d7`). The developer persona forbids it, but no rule in the repo states it. _Defer._ Lesson: decide the convention and write it into the repo's agent instructions, so a fresh subagent sees it.

### Spec-to-implementation reconciliation

Every dated decision in the epic's Notes is implemented. Entry 2's claim was checked ✔: the silent failed poll is recorded in `spec-todo-app.md:110-112` and `architecture-todo-app.md:153,392-394`. The divergences below are docs that were not reconciled with the build.

- **F6 · EXPERIENCE › Motion doesn't match 3.10.** `EXPERIENCE.md:143-144` says rows slide on every move. As built, only rows whose old or new box is on screen slide (`frontend/src/lib/motion.ts:26-33`). The 3.10 triage rejected updating the spec (finding #10 in that plan). _Spec to reconcile._
- **F7 · Stale Deferred line in the architecture.** `architecture-todo-app.md:409` still reads "500 rows is well within budget. Revisit only if NFR-2 fails". NFR-2 failed in 3.8 and was fixed in 3.10. _Spec to reconcile._
- **F8 · AD-16's header list is out of date.** `architecture-todo-app.md:213` doesn't list 3.8's `frame-ancestors 'none'` or `X-Frame-Options: DENY` (`e2e/tests/headers.spec.ts:10-13`). _Spec to reconcile._
- **F9 · Two load-failure behaviours aren't in EXPERIENCE.**
  - Retry restarts a full 3 s hold (`tasks.svelte.ts:412-416`; epic Notes decision, 2026-10-01).
  - A recovery GET under `load_failed` restores the list with no Retry (`tasks.svelte.ts:237,453`). That matches AD-10 ("any successful GET sets ready"), but EXPERIENCE says "No auto-retry".

  EXPERIENCE is still `updated: 2026-09-30`. _Spec to reconcile._

- **F10 · Weaker or reinterpreted Done-when wording.** All accepted deviations:
  - DW-2 says "about 30 s". A poll is skipped while an add's POST is in flight (README:245, "up to a minute").
  - DW-2 says "a stale response never brings back a deleted task". Unit tests cover it (`tasks.svelte.test.ts:559`); E2E covers only deletion across polls (`sync.spec.ts:39-58`).
  - DW-3 says "no flash". It is checked as `data-theme` being set before `<body>` exists, not as paint timing.
  - DW-5 says "5 E2E tests covering UJ-1 to UJ-3". `journeys.spec.ts` holds 5 journeys, but 2 of them are CAP-9 and CAP-10 (`:345`, `:376`); the suite has 115 E2E tests in total.

  _Accept._ Lesson: Done-when wording should name the test level ("E2E proves …") when that matters.

- **Spec docs unchanged after 2026-10-01.** The last commit to touch the spec or architecture is 3.2 (`b1a1dfc`). This is the process side of F6–F9. Lesson: a story that makes a dated product decision should end with a spec-reconcile task, or the epic should have a closing reconcile entry.

### Diff-scope review (bmad-review: adversarial, edge-case, verification-gap)

- **F11 · The perf feedback gate reads a committed file, not this run's measurement** ✔. `e2e/qa/perf.spec.ts:681-688` parses `docs/qa-artifacts/perf-results*.json`, which is tracked in git. Running the gate alone (`-g "feedback"`), or after the measurement test was filtered out or aborted, passes on the 3.10 figures. 3.10's "plain test" claim depends on this. Raised by the adversarial, edge-case and verification-gap lenses together. _Fix now._ Lesson: a gate must assert on data produced in the same run. Stamp it with `QA_RUN_ID`, as `a11y.spec.ts` already does.
- **F12 · The NFR-2 guard is optional, and its margin is thin.**
  - `npm run qa` is "optional" in README:209, and the hand-in skipped the perf spec (`docs/hand-in-checklist.md:119`).
  - There is no CI.
  - Enter's p95 is 94.5 ms against 100 ms (`docs/qa-performance.md`).
  - Only the "off-screen rows don't animate" rule is guarded in `npm test` (`rows.spec.ts:453-477`, 40 rows).

  _Defer._ Lesson: decide whether the perf gate is required at hand-in.

- **F13 · `slideRow` calls `matchMedia` before the cheap viewport test** ✔. At `motion.ts:30-31`, every moved row (about 500 on an add) creates a `MediaQueryList`, inside the measured feedback span. The cost isn't measured. _Fix now (trivial):_ test on-screen first, and cache one `MediaQueryList`.
- **F14 · Two slides per tick.**
  - Observed in the behaviour check: each on-screen row gets 2 slides (calls `[0, 200, 0, 200]` about 30 ms apart; the second starts mid-flight from 35 px to 34.1 px).
  - Matches the 3.10 debugging notes: the server's response re-render restarts the slide (`docs/ai-log.md`, Ticket 3.10 › Debugging).
  - It looks continuous, and it doubles the per-tick animation work.

  _Defer._ Lesson: none.

- **F15 · Animation cost grows with viewport height.** The fix makes cost proportional to the number of rows on screen, and the gate measures only 1280×800, about 20 rows (`perf.spec.ts:435`). A tall monitor or zooming out is never measured. _Defer._
- **F16 · The journey works around a real UX obstruction** ✔. At `e2e/tests/journeys.spec.ts:258-261`, the action-error toast covers the top row's ×, and hovering holds the toast open, so the journey dismisses the toast before deleting. This isn't recorded in `qa-accessibility.md` or EXPERIENCE (WCAG 2.4.11 / 2.5.8 territory). _Defer._ Route it to UX. Lesson: a test that works around product behaviour should log that behaviour as a finding.
- **F17 · Ticking the held row under `load_failed` makes it vanish** ✔. `tasks.svelte.ts:250` releases the hold on a tick, and under `loadFailureShown` only the held row renders (`:135`). The row disappears at once, while "Marked done" is announced. EXPERIENCE (Add while … after load error) doesn't cover a tick. _Defer._ Spec gap: UX to decide.
- **F18 · A saved add vanishes after its 3 s hold under `load_failed`** ✔. This is the specified behaviour: EXPERIENCE says "the list, including these tasks, stays hidden until Retry succeeds; the held task still shows for its hold", and `tasks.svelte.test.ts:1151` pins it. The adversarial lens flags a duplicate-entry risk: a user may re-add the task before Retry. _Accept (by spec);_ see Open questions.
- **F19 · No polling or visibility recheck after a failed first load.** Polling starts only after the first successful GET (`tasks.svelte.ts:397-403`), so a tab whose first load failed never recovers on its own. This is consistent with EXPERIENCE's "No auto-retry" (an [ASSUMPTION]). _Accept;_ see Open questions.
- **F20 · Hidden/visible polling has no E2E.** No spec uses `visibilitychange` or `visibilityState`. Unit coverage exists (`tasks.svelte.test.ts:1207-1450`, by the verification-gap lens). _Defer._
- **F21 · `scripts/check-infra.sh` can migrate the app database** ✔. Its check 3 starts `backend-dev` from the working tree against the app's `db`. That runs `alembic upgrade head` there (header comment at `:14`: "a no-op when the app runs the same code"). On a branch with a new migration, it migrates the user's data forward. The README note (3.9) mentions this. _Defer._ Lesson: a smoke script should never point at real data.
- **F22 · The CSP lacks `base-uri`, `form-action` and `object-src`.** At `frontend/nginx/default.conf.template:41,51,60,69`, `base-uri` and `form-action` don't fall back to `default-src`, and `docs/qa-security.md` doesn't discuss them. _Defer._
- **F23 · The theme doesn't sync across tabs.** `frontend/src/lib/theme.svelte.ts:36-44` has no `storage` listener, so tabs diverge until a reload. _Defer._
- **F24 · Gaps in QA measurement robustness** (all low; _defer_):
  - A poll GET in flight when a span starts is not dropped (`perf.spec.ts:150-160,404,413,561-563`).
  - The a11y held-row cell can outlast the real-time 3 s hold on slow runners (`a11y.spec.ts:132-144,387-389`).
  - The perf gate's serial mode hides a feedback regression behind an API or render failure (`perf.spec.ts:424,670-673`).
  - `npm run qa` overwrites committed JSON on every run (`perf.spec.ts:665`, `a11y.spec.ts:363`).
- **F25 · Loose ends in tests and lifecycle** (low; _defer_, unverified):
  - `dispose()` doesn't stop a running hold timer or in-flight work (`tasks.svelte.ts:406-410`). Only tests call it.
  - The CAP-10 journey's phone clock lags after `advance()` (`journeys.spec.ts:410-431`).
  - The CAP-9 and CAP-10 journeys repeat `load-failure.spec.ts` and `sync.spec.ts` rather than covering the cross-story paths (add under `load_failed` then Retry; a poll while a row is held).
- **Lenses that found nothing.** The verification-gap lens found the load_failed × polling × Retry × hold seams and the theme × CSP × age-colour seams covered (its report lists the tests). The edge-case lens's "theme-init.js didn't run but storage holds dark" (`theme.svelte.ts:22-23`) needs a failed same-origin script load. _Reject:_ not reachable in normal use.

## Behavior verification

Exercised end to end against the running test stack (`:8082`, built from code identical to `main`). The tool was a standalone Playwright script with the system Chrome (`scratchpad/retro/behavior/check.mjs`, not committed). These are observations, not test results:

1. **Load failure + Retry (3.1): pass.**
   - With the GET aborted, a persistent "Couldn't load your tasks." toast with Retry was still up after 8 s. There was no empty state and no list.
   - After Retry the rows loaded, the toast closed, and focus was on the input.
2. **Background sync (3.2): pass.**
   - With two visible, idle contexts, an API-seeded task appeared in B after 30,452 ms.
   - A task deleted in A was gone from B after 28,217 ms and never came back over 70 s of 1 s sampling.
3. **Theme (3.4/3.5): pass.**
   - OS dark, nothing stored: the page rendered dark through CSS `prefers-color-scheme`, with no `data-theme`, as designed.
   - Toggled to light and reloaded: `data-theme=light` was already set when `<body>` was inserted.
   - Zero `securitypolicyviolation` events. The CSP header was `default-src 'self'; frame-ancestors 'none'`.
4. **Row motion (3.10): pass.**
   - 60 rows at 1280×800, tick the first: only the 20 rows on screen (19, plus the ticked row's on-screen origin) animated, at 200 ms. The 40 off-screen rows had 0 `animate()` calls.
   - With reduced motion there were 0 calls.
   - The double slide per tick is F14.
5. **Phone width 360 px: pass.** `scrollWidth` = `clientWidth` = 360, with long and unbroken texts.

Also: `POST :8081/api/test/reset` returned 404, so the gated router is absent from the app profile. Phone access over real Tailscale (3.3) was not re-exercised; it is recorded on the author's devices in `docs/ai-log.md` (Ticket 3.3).

## Previous-retro follow-through

Nothing to follow through: no previous retrospective file exists. Neither `epic-capture-and-keep` nor `epic-age-nudge` has a `-retrospective.md`, so this is the initiative's first retro. That is "no file", not "no outstanding items".

## Action items

All are proposals. Nothing here was applied, and the human decides what runs. **R** = remediation (for the dev loop); **S** = spec reconciliation (the human applies it to the contract); **P** = process lesson.

| #   | Kind | Action                                                                                                                                                                                                | From      | Owner                                       |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------- |
| A1  | R    | Make the NFR-2 feedback gate assert on this run's data: stamp `perf-results*.json` with `QA_RUN_ID` and fail on a mismatch, or move the feedback asserts into the measurement test with `expect.soft` | F11, F24  | Dev (Amelia), via `bmad-build`              |
| A2  | R    | In `slideRow`, test on-screen before reduced motion, and cache one `MediaQueryList`                                                                                                                   | F13       | Dev (Amelia)                                |
| A3  | S    | EXPERIENCE › Motion: only rows whose old or new box is on screen slide (3.10's rule)                                                                                                                  | F6        | User, with UX (Sally)                       |
| A4  | S    | Architecture: update the Deferred line (`:409`) to record the 3.8 miss and the 3.10 fix; add `frame-ancestors 'none'` and `X-Frame-Options: DENY` to AD-16 (`:213`)                                   | F7, F8    | User, with Architect (Winston)              |
| A5  | S    | EXPERIENCE › Load error: record that Retry restarts a full 3 s hold, and resolve "No auto-retry" against AD-10's recovery GET (pick one, and record it)                                               | F9        | User, with UX                               |
| A6  | S/R  | UX decision on the action-error toast covering the top row's × (F16), and on ticking the held row under `load_failed` (F17); then fix, and drop the journey's Dismiss workaround                      | F16, F17  | User, with UX, then Dev                     |
| A7  | P    | Decide whether `npm run qa` (perf) is required at hand-in or release; if it is, list it as required in README "Verify everything" and run it at the handed-in commit                                  | F12       | User                                        |
| A8  | P    | Write the "no story or epic references in code comments" convention, and "check `e2e/fixtures.ts` before adding helpers", into the repo's agent instructions (`bmad-project-context`)                 | F4, F5    | User, via `bmad-project-context`            |
| A9  | P    | End any story that takes a dated product decision with a spec-reconcile task (or add a closing reconcile entry per epic). Name the store as a refactor-sweep target when it gains a new state machine | F2, F6–F9 | User / PM (John) when slicing the next epic |
| A10 | R    | Point `scripts/check-infra.sh` check 3 at a throwaway database (or refuse when `alembic current` ≠ heads)                                                                                             | F21       | Dev                                         |

Deferred and not itemised: F2, F3, F4 (refactors), F14, F15, F20, F22, F23, F24 and F25. Each carries its source above, so it can be picked up without re-investigation. Appending them to `deferred-work.md` is the user's call, because this run writes only this document.

## Acceptance verdict

**Machine verdict: accepted-with-open-items** (criteria **declared**: the epic file's Done when 1–5). Every ticket is finished (`built`), and `pending_tickets` is empty.

| Done when                                                                                                                                                                  | Evidence                                                                                                                                           | Met |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1. API down on load → persistent Retry, no empty state; Retry after recovery loads                                                                                         | Behaviour check flow 1; `e2e/tests/load-failure.spec.ts:20-45`; `tasks.svelte.test.ts:929-1002`                                                    | yes |
| 2. Phone add appears in an idle, visible laptop tab within ~30 s, no refresh; a stale response never resurrects a delete                                                   | Flow 2: 30.5 s to appear; a delete stayed gone for 70 s; `sync.spec.ts`; `tasks.svelte.test.ts:559` (F10: the stale-race claim is unit-level only) | yes |
| 3. Follows the OS on first visit; the toggle survives reload with no flash; no CSP violations                                                                              | Flow 3; `theme.spec.ts:109`, `theme-toggle.spec.ts:93`; the CSP fixture `e2e/fixtures.ts:74-111`                                                   | yes |
| 4. `docs/` has coverage, accessibility (0 critical), security and performance reports, the AI log, the BMad record; the README covers setup, tests, profiles and Tailscale | `docs/qa-*.md`, `docs/ai-log.md`, `docs/bmad-process.md`, `docs/hand-in-checklist.md`; `qa-accessibility.md`: 0 violations                         | yes |
| 5. Features in the app profile; ≥5 E2E covering UJ-1–3 pass on the test profile; coverage ≥ 70%                                                                            | 115 E2E passed (3.9 run); `journeys.spec.ts` (5, F10 wording); backend 99.08% and frontend 99.3% (`qa-coverage.md`)                                | yes |

Why not plain **accepted**: these items stay open and tracked above.

- F11, the perf gate's integrity (A1).
- The stale spec docs F6–F9 (A3–A5).
- The UX obstruction F16 and the held-row tick F17 (A6).

None blocks a Done-when criterion. Tickets are still `built` (tree state `review`); closing them as `done` is the ticketing skill's job, once the user confirms.

**Human decision:** the user confirmed **accepted-with-open-items** (2026-10-02).

## Open questions

1. **Held tasks under load failure (F18, F19).** EXPERIENCE marks these [ASSUMPTION]: a saved add vanishes after its hold while the list is hidden, and nothing retries on its own. Is that still the wanted behaviour, given the duplicate-entry risk if a user re-adds before Retry? An answer changes A5 and could become a story.
2. **Is the perf gate required (A7)?** If yes, F12 becomes fix-now, and the hand-in needs a perf run at the delivered commit (`0f4f7c3`).
3. **Session logs** were not read (14 local transcripts). Process lessons come from the ai-log and the triage logs only. Reading them could add process lessons, especially for the 3.8 → 3.10 re-plan.
