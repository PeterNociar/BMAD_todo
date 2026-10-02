---
title: 'Hand-in documentation'
type: 'chore'
ticket: '9'
created: '2026-10-02'
status: 'built'
baseline_revision: '7ae9b391c70bf4477b4337858996cc4eba8e98ac'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/spec-todo-app/deliverables.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The exercise is handed in against `deliverables.md`, and four things are still missing:
- the record of how BMad guided the build;
- a synthesis in the AI log (per-ticket sections exist, but there are no epic summaries and no overall limitations or human-expertise view);
- a checklist that maps each deliverable to its evidence;
- a README a fresh reader can follow alone.

Story 3.10 also left some QA figures stale.

**Approach:** Complete the README and prove the clean-checkout path. Write `docs/bmad-process.md` and `docs/hand-in-checklist.md`. Append synthesis sections to `docs/ai-log.md`. Refresh the stale QA figures so every link in the checklist points at current evidence.

## Boundaries & Constraints

**Always:**
- **README:**
  - Prerequisites: Docker with Compose v2, git, Node 24 with npm, uv (backend tests outside Docker), Google Chrome (`E2E_BROWSER_CHANNEL=chrome`, needed for `npm run qa`), and Tailscale (phone access only).
  - Drop the `docker-compose` v1 "either works" claim and say Compose v2 only.
  - Fix "three side effects" (four are listed), and change the qa duration to about 6 minutes.
  - Add the missing commands: e2e `npm run format:check`, frontend `npm run build`.
  - Add a short "Verify everything" block that runs every suite in order.
  - Add `contracts/` and `scripts/` to the repository layout, plus the two new docs.
  - Add a "Hand-in" section linking `docs/bmad-process.md`, `docs/ai-log.md`, `docs/hand-in-checklist.md`, `deliverables.md` and the QA reports.
- **Clean checkout:** per AD-16, the path is `git clone` → `cp .env.example .env` → `docker compose up`. The checklist states this, citing AD-16, as the reading of "runs with `docker-compose up`". Decision (user, 2026-10-02): stop the user's running `app` profile briefly (`COMPOSE_PROFILES=app docker compose stop` in this repo; the data stays in `db-data`). Bring a fresh clone up under its own project name on the real 8081, check that it is healthy and answers 200, then `down -v` only the clone's project (its own `-p` name), and run `COMPOSE_PROFILES=app docker compose up -d` again for the user's stack. Leave the test stack alone. The output is recorded in the checklist.
- **`docs/bmad-process.md`:**
  - Covers the chain: the exercise brief (`docs/bmad_exercise.md`) and the original `docs/PRD.md`, then the brief, PRD, UX (DESIGN, EXPERIENCE, mockups), architecture spine, spec with deliverables, initiative, epics, ticket trees, story plans, and the review loops, using the git-history phases with dates and PR numbers.
  - For each stage: the BMad skill or agent that ran it, what it produced (relative links), the reviews and reconciles that hardened it, and one or two concrete examples of a decision it fixed that later stories relied on (AD-10 seq merge, the NFR-2 miss → 3.10).
  - Says how a story ran: the plan's frozen intent, the implementing subagent, the four review lenses, triage, and `deferred-work.md`.
- **`docs/ai-log.md`:** append only, keeping the line-3 rule. Add `## Ticket 3.9 — Hand-in documentation`, then a final `## Summary` with:
  - one paragraph per epic: what was built, its PR range, and the notable AI wins and misses;
  - **MCP servers:** none were used; say why, and name the equivalents (Playwright + scripted CDP for DevTools/Playwright MCP; pytest and curl for the API contract, instead of Postman MCP);
  - **How AI generated tests, and what it missed:** patterns drawn from the per-ticket sections;
  - **Debugging with AI:** the top cases;
  - **Limitations, and where human expertise was critical:** the decisions the user made (cite the dated decisions in the epic files), the dev-machine constraints, and the review findings AI tests had missed.
  - Every claim cites the ticket section it comes from. Nothing is invented.
- **`docs/hand-in-checklist.md`:** one row per `deliverables.md` item and sub-item, including the five AI-log bullets and the suggested tooling. Each row has a status (✅ met / ⚠️ met with a note) and relative links to the evidence. Notes, at least:
  - networking is compose's default `todo_default` network, with services reached by name;
  - the suggested MCP tools weren't used, and the equivalents are named;
  - `docker compose up` needs the AD-16 `.env` copy first.
- **Refreshed figures:**
  - `docs/qa-coverage.md`: re-run the frontend `test:coverage` and `npx playwright test --list`, and update the counts, the table (now including `motion.ts`) and the commit line. Backend unchanged unless a re-run differs.
  - `docs/qa-security.md`: the GET p95 cites the current `qa-performance.md` value.
  - `docs/qa-accessibility.md`: re-run `qa/a11y.spec.ts` only, then update its header, run and counts to match the regenerated `a11y-summary.json`.
- `npm run docs:format:check` (in `frontend/`) passes. Every relative link in the new and changed docs resolves.

**Never:**
- Rewriting or reordering existing ai-log sections, or any `_bmad-output/` planning artifact.
- Re-running `qa/perf.spec.ts`: its figures and JSON come from the 3.10 run.
- Changing app code, compose, `.env.example` or the AD-16 decision.
- Claiming a check that didn't run. A skipped check is recorded as skipped, with the reason.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Clean checkout | a fresh clone, `cp .env.example .env`, `docker compose up -d --build --wait` | db, backend and frontend healthy; `GET /` and `/api/tasks` answer 200 | a failure is fixed in the docs, or reported; never papered over |
| Link check | every relative link in `README.md` and `docs/*.md` touched here | each target exists | a broken link is fixed |
| Deliverable with no evidence | an item can't be linked | ⚠️ with the reason; never ✅ | — |

</frozen-after-approval>

## Code Map

- `_bmad-output/initiative-todo-app/spec-todo-app/deliverables.md` -- the list the checklist mirrors item by item.
- `README.md` -- sections at :9 Prerequisites, :15 Setup, :24 Run, :39 Profiles, :106 Backend tests, :139 Frontend, :154 E2E, :174 QA, :193 Phone access (:214 "three side effects"), :224 Layout. Port tables already match compose.
- `docker-compose.yml`, `.env.example` -- every service has a profile, and every variable has a `:-` default. The default network is implicit. Don't edit them.
- `_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md:195-200` -- AD-16: copying `.env` is required, and the README makes it a required step.
- `backend/Dockerfile:3,14,20,22`, `frontend/Dockerfile:3,10,14` -- the multi-stage builds, non-root user and HEALTHCHECK, as evidence links.
- `backend/tests/` -- `test_tasks.py`, `test_ordering.py`, `test_mutations.py`, `test_errors.py`, `test_health.py` and `test_testing_router.py` cover every endpoint (`backend/app/routers/tasks.py:34-59`).
- `docs/ai-log.md` -- 1,113 lines. Line 3 is the append-only rule. Sections cover tickets 1–12, AD-21, the PR #7 refactor, 2.1–2.6, 3.1–3.8 and 3.10. Every MCP line says "None".
- **Artifact chain** (under `_bmad-output/initiative-todo-app/`):
  - brief: `brief-todo-app/`;
  - PRD: `prd-todo-app/`, with its reconciles and rubrics;
  - UX: `ux-todo-app/`, with DESIGN, EXPERIENCE, the reviews, the validation report and `mockups/`;
  - architecture: `architecture-todo-app/`, with `reviews/`;
  - spec: `spec-todo-app/`;
  - `initiative-todo-app.md`, the `tickets.toml` files, the three `epic-*/` folders (27 story plans), the two off-tree `plan-*.md` and `deferred-work.md`.
- **Git phases** (`git log --reverse --date=short`):
  - 2026-09-30: planning (683e666 → b7d90c4);
  - epic 1: PRs #1–#14, with AD-21 as #2 and the refactor as #7;
  - epic 2: #15–#21;
  - epic 3: #22–#31.
- **Stale figures:**
  - `docs/qa-security.md:122` says the GET p95 is 46.5 ms; `qa-performance.md` now says 37.7.
  - `docs/qa-coverage.md:38,42-45,51`: frontend 444 is now 456, the table lacks `motion.ts`, and E2E 114 is now 115.
  - `docs/qa-accessibility.md:4` names the 3.8 run, but the JSON comes from the 3.10 run.

## Tasks & Acceptance

**Execution:**
- [ ] Clean-checkout check per the Boundaries decision -- the evidence for the checklist
- [ ] `docs/qa-coverage.md`, `docs/qa-accessibility.md`, `docs/qa-security.md` -- re-run and refresh, as in Boundaries
- [ ] `README.md` -- the fixes, the Verify-everything block, the Hand-in section and the layout
- [ ] `docs/bmad-process.md` -- the chain, with links and examples
- [ ] `docs/ai-log.md` -- the Ticket 3.9 section, then `## Summary`
- [ ] `docs/hand-in-checklist.md` -- every deliverable, with status and links
- [ ] A link check over the touched docs, plus `docs:format:check`

**Acceptance Criteria:**
- Given only the README, when a reader follows Setup, Run, every test section and Phone access, then each command exists in the repo's scripts or compose and matches the checked-in config.
- Given `docs/hand-in-checklist.md`, when each row's links are followed, then they reach existing evidence, and every ⚠️ row carries its reason.
- Given `docs/ai-log.md`, when it is compared with its version at the baseline, then the only change is the content appended after the last existing section.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

The review diff covered README.md and docs/; the regenerated `a11y-summary.json` and this plan were left out on purpose. Verification gap found no gaps: docs only, and the referenced scripts and lines exist.

Counts: high 0 · medium 0 · low 18 · false 1 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 13 patches, 0 deferrals, 6 rejections.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | The checklist says "Each section's" Test generation / Debugging part; only 12 and 9 of the sections have one (BH, ECH) | low | patch | Say "where a ticket section has one; the Summary collects them". |
| 2 | The ai-log Summary says every section records MCP as None; 7 sections have no MCP line (ECH) | low | patch | The Summary is new text, so append-only allows the edit: "every section that has an MCP line says None". |
| 3 | The Verify-everything lines aren't chained, so a failure scrolls past (ECH, BH) | low | patch | Add a note to stop at the first failing line (or `set -e`). |
| 4 | The README note on `check-infra.sh` omits that it starts the dev profile on the app's db and migrates it (ECH) | low | patch | Add it to the note. |
| 5 | "Drop `E2E_BROWSER_CHANNEL=chrome`" contradicts the Prerequisites for `npm run qa` (ECH) | low | patch | Scope the drop to `npm test`; qa stays on Chrome. |
| 6 | The README clone command has a placeholder; the repo is public (BH) | low | patch | Use `https://github.com/PeterNociar/BMAD_todo.git`. |
| 7 | Epic 1's "Ticket N" vs "story 1.N" numbering has no mapping (BH) | low | patch | One line in the ai-log Summary and in bmad-process.md. |
| 8 | The clean-checkout run used `7ae9b39`, without the 3.9 README; the checklist line implies otherwise (BH, IA) | low | patch | Say plainly that it validated the app at `7ae9b39` with the AD-16 commands, which 3.9 doesn't change. |
| 9 | qa-accessibility says "the same session"; the runs were separate (BH) | low | patch | "on the same commit (`7ae9b39`)". |
| 10 | "Four side effects": one is a warning (BH) | low | patch | "Three side effects and one warning". |
| 11 | The compose rows look contradictory ("every variable has a default" vs nothing starts) (BH) | low | patch | Explain that `COMPOSE_PROFILES` is read by the compose CLI, not interpolated in the file, and quote what happens without `.env`. |
| 12 | No known-gaps view, and the performance row omits Enter's thin margin (BH) | low | patch | A short "Known gaps" section linking the sources: Enter 94.5 ms; no throttling or phone measurement; no screen-reader pass; no CVE scan; the open deferred-work items. |
| 13 | bmad-process.md doesn't say how 3.10 entered the tree, or how epics close (BH) | low | patch | 3.10 was added by plan commit 78fd216, recording the user's dated decision in the epic Notes. `bmad-retrospective` wasn't run before hand-in; the user marks epics done. |
| 14 | The patch leaves out the a11y JSON and the plan (BH, IA) | false | reject | Left out on purpose when staging; the JSON change is `generatedAt`/`runId` only. |
| 15 | Verify-block gaps: `install:browsers`, the db-test port, undoing qa changes (BH) | low | reject | Line 1 brings up the test stack (5436); the browser case is covered by #5; the README already warns that qa rewrites `docs/qa-artifacts/`. |
| 16 | The checklist cites line numbers (BH) | low | reject | Correct today, and docs-only drift. Restructuring the links adds churn for little gain. |
| 17 | The qa-security header still names the 3.8 commit (IA) | low | reject | The security review covers 3.8 code. 3.10 touched only row motion and 3.9 only docs, so no security surface changed; the figure that moved was refreshed. |
| 18 | The README was never run as a block from a clean machine, and there's no committed link checker (IA) | low | reject | The checklist records which checks ran and which were skipped. A link-check script was out of scope. |
| 19 | "None with equivalents" may read as not meeting the MCP deliverable (IA) | low | reject | It is marked ⚠️ with the reason, which is the honest status. |

## Verification

**Commands:**
- `cd frontend && npm run test:coverage && npm run docs:format:check` -- expected: green; the counts match `qa-coverage.md`
- `cd e2e && npx playwright test --list | tail -1` -- expected: the count matches the checklist and `qa-coverage.md`
- `cd e2e && E2E_BROWSER_CHANNEL=chrome npx playwright test -c playwright.qa.config.ts qa/a11y.spec.ts` -- expected: 36 passed, 0 critical
- `git diff <baseline> -- docs/ai-log.md | grep '^-[^-]'` -- expected: no output (append only)
