---
title: 'Document the TestingTaskService split'
type: 'chore'
ticket: ''
created: '2026-10-01'
status: 'built'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
baseline_revision: 'b667996c9952f6af1504c7bf405fa168ca4ddaca'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PR #7 (`b667996`) moved `seed`/`remove_all` out of `TaskService` and `delete_all` off the `Task` model into `app/services/testing_task_service.py` (`TestingTaskService(TaskService)`), built by a provider inside `routers/testing.py`. The architecture spine (AD-14, AD-20, dependency note, source tree), the README and the AI log still describe the old shape or say nothing.

**Approach:** Check the PR #7 code against the docs, then update the living docs to match: spine + its memlog, README test-profile note, and an append-only `docs/ai-log.md` entry. Historical ticket plans stay untouched.

</frozen-after-approval>

## Tasks & Acceptance

**Execution:**
- [ ] `_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md` -- AD-14: bind `services/testing_task_service.py`; state test-only use cases live only there, imported only by `routers/testing.py`, and a test asserts the default app never imports either module. AD-20: `routers/testing.py` owns `get_testing_task_service()`, so `deps.py` never imports test code. Dependency note (line 59): testing router reaches `db.py` directly, like `health.py`. Source tree: add `services/testing_task_service.py`.
- [ ] `_bmad-output/initiative-todo-app/architecture-todo-app/.memlog.md` -- append one `(decision)` line; bump `updated`.
- [ ] `README.md` -- test-profile bullet: in `APP_ENV=app` the test-only code is not imported at all.
- [ ] `docs/ai-log.md` -- append a section for the refactor: human spotted it, review lenses on ticket 4 did not.

**Acceptance Criteria:**
- Given the spine, when a reader looks up AD-14/AD-20, then each names `TestingTaskService`, its module and its provider, and nothing claims `TaskService` has seeding methods.
- Given the docs, when grepping for `TaskService.seed`, `remove_all` or `delete_all` outside historical plans/reviews, then nothing stale is found.

## Implementation Notes

Oneshot: four doc files, ~30 lines, no code. Code check of PR #7 found one doc mismatch to fix rather than a code defect: the spine said `routers/testing.py` reaches `db.py` through `deps.py`, but both `health.py` (since ticket 1) and now `testing.py` import `get_session` from `app.db` directly.

## Verification

**Commands:**
- `grep -rnE "TaskService\.seed|remove_all|delete_all" README.md docs _bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md` -- expected: only the new, correct references
- `cd backend && uv run pytest -q` -- expected: 114 passed (no code change)

## Review Triage Log

Quick lens, 5 findings: 0 high, 2 medium, 2 low, 1 false.
- medium, patch: dependency note let `routers/testing.py` import `db.py`/`models/` but not `clock.py` or `services/testing_task_service.py`, which it does import. The note now names both. The older `routers/tasks.py → services/` gap was already there before this change and is deferred to `deferred-work.md`.
- medium, patch: the AD-14 gating paragraph had a leading space, so it rendered as part of the new "Test-only use cases" bullet. It is now its own `**Gate:**` bullet.
- low, patch: memlog `updated` was a placeholder `12:00`. It now has the real edit time.
- low, patch: the AD-14 rule line still listed `added_at`/`completed_at`, contradicting its own Bodies bullet and `TaskSeed`. It was already wrong before this change; this is a one-word correction, now `added_ago_ms`/`completed_ago_ms`.
- false: the memlog tag `(decision by user)` was flagged as differing from the plan's `(decision)`. Earlier entries already use `(decision by user)`, and the user asked for this refactor.
