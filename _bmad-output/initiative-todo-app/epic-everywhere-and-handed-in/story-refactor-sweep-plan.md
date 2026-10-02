---
title: 'Refactor sweep (epic-everywhere-and-handed-in)'
type: 'chore'
ticket: '6'
created: '2026-10-02'
status: done
baseline_revision: 'da5ca39769816ed3b3ec813664c9a7f0289490df'
route: 'full'
route_source: 'auto'
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** This epic's build records and deferred review findings leave several loose ends:
- **Motion flake:** `rows.spec.ts` "motion: tick slides the rows for about 200 ms" is flaky (deferred in 2.6).
- **Stale script:** nginx sends no `Cache-Control`, so the unhashed, render-blocking `theme-init.js` can run from a stale cache (3.4).
- **Forced colours:** no test exercises forced-colors styling (3.5).
- **Docs:** `docs/ai-log.md` fails Prettier, and nothing checks `docs/`.
- **Deferred-work list:** resolved entries carry no resolution note.
- **Profiles:** nothing automated checks the compose test/dev profiles, or that nginx follows a recreated backend's new IP (epic 1).

**Approach:** Behaviour-preserving cleanups, with the scope chosen by the user (2026-10-02):
- de-flake the motion test;
- cache headers in the nginx template;
- one forced-colors E2E describe;
- a docs Prettier check and a formatting pass;
- resolution notes in `deferred-work.md`;
- `scripts/check-infra.sh` for the profile and stale-IP checks.

Confirm the epic's Done when items 1–3 still hold on the app profile.

## Boundaries & Constraints

**Always:**
- **Motion test:** the sampler starts right after the click and collects every row animation seen until one appears or 1 s passes. It no longer takes one sample at +40 ms. A finished animation can't be missed, and the reduced-motion test still gets `[]`. Both tests keep their assertions: durations of 200, and `[]` with reduced motion.
- **Cache headers (`frontend/nginx/default.conf.template`):**
  - **`location = /index.html` and `location = /theme-init.js`:** `Cache-Control: no-cache`.
  - **`location /assets/`:** `Cache-Control: public, max-age=31536000, immutable`.
  - **Repeated headers:** every new location repeats `X-Content-Type-Options`, `Referrer-Policy` and the CSP `default-src 'self'` (an `add_header` in a location drops the inherited ones).
  - **SPA fallback:** `try_files` still falls back to `/index.html`, and `/` serves it with `no-cache`.
  - **Tests:** `frontend/tests/nginx-template.test.ts` pins this statically, and `e2e/tests/headers.spec.ts` checks the served headers on `/`, `/theme-init.js` and one `/assets/*.js`.
- **Forced colours:** a `test.describe` with `test.use({ forcedColors: 'active' })` in `e2e/tests/theme-toggle.spec.ts`. It asserts the computed outline on `.seg.on` (solid, 1 px) and none on the other segment, and that the focused input has a non-`none` outline style.
- **Docs format:** `frontend/package.json` gets `docs:format` and `docs:format:check` (`prettier --write|--check ../docs`). Run the write pass once over `docs/`; it may only reflow Markdown formatting, never change wording. The README "Frontend tests and lint" section mentions the check.
- **Deferred work:** append "Resolved by entry …" entries in the 2.6 sweep's style. Never edit existing entries. They cover:
  - 1.8's `load()` race (by 1.12);
  - the font preload (by 3.4);
  - the 2.4 hold reload (by 3.1);
  - the motion flake, `Cache-Control`, forced colours, the compose profiles and the nginx re-IP test (by 3.6).
- **`scripts/check-infra.sh`:** bash, `set -euo pipefail`, run from the repo root, with a clear PASS/FAIL line per check and exit 1 on any failure. It restores what it changed: it stops the dev services and removes the squatter container. The checks:
  1. **Test profile up:** `POST :8082/api/test/reset` → 204, and, when the app profile is up, `POST :8081/api/test/reset` → 404.
  2. **Stale IP:**
     - Note `backend-test`'s IP, stop it, and start a `busybox sleep` squatter on the same compose network.
     - If the squatter didn't take the old IP, report SKIP.
     - Otherwise start `backend-test`, which gets a new IP, and wait for it to be healthy.
     - `GET :8082/api/health` must return 200 within 15 s.
  3. **Dev profile:** `COMPOSE_PROFILES=dev docker compose up -d --build --wait backend-dev frontend-dev`. `backend-dev`'s running command must include `--reload`, and `GET 127.0.0.1:5173/api/health` → 200. Then stop the dev services.

  The README documents it under Compose profiles, including that it briefly stops `backend-test` and starts the dev services.
- **Coverage** holds ≥ 70%, and all suites pass.

**Never:**
- Behaviour changes to the app UI or the store.
- Editing existing `deferred-work.md` entries.
- Running `check-infra.sh` against the app profile's data beyond the one 404 probe.
- Rewording `docs/` prose.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Motion under load | a slow runner; the flip has started before the old +40 ms sample | durations `[200, …]` captured | — |
| Reduced motion | `reducedMotion: 'reduce'` | `[]` after the 1 s window | — |
| `/` | GET `:8082/` | `Cache-Control: no-cache`, the CSP and the shared headers | — |
| `/theme-init.js` | GET | `no-cache`, the shared headers | — |
| `/assets/*.js` | GET | `immutable`, max-age 1 year, the shared headers | — |
| Deep link | GET `/some/path` | index.html with `no-cache` and the CSP | — |
| Forced colours | `forcedColors: 'active'` | `.seg.on` outline 1 px solid; the other segment none; the focused input outline is not none | — |
| Infra: stale IP | the squatter holds the old IP | `/api/health` 200 within 15 s | SKIP when the IP wasn't reused |
| Infra: dev | dev profile up | `--reload` present; `:5173/api/health` 200; dev stopped afterwards | FAIL line, exit 1 |

</frozen-after-approval>

## Code Map

- `e2e/tests/rows.spec.ts:340-372` -- the `animationsAfterClick` helper samples once at rAF + 40 ms on the fixture's fake clock. The reduced-motion test at l.377–384 uses it too.
- `frontend/nginx/default.conf.template` -- the server-level `add_header`s, `location /api/` (leave it alone), and `location /`, which sets the CSP and `try_files`. `index index.html` and `try_files … /index.html` both redirect internally to `/index.html`, so `location = /index.html` serves the root and deep links.
- `frontend/tests/nginx-template.test.ts` -- a static test with an `apiLocation()` parser. Add parsers for the new location blocks.
- `e2e/tests/headers.spec.ts` -- the existing header assertions on `/` and `/api/health`. The stylesheet-href extraction (l.25–29) shows how to find an `/assets/` URL.
- `frontend/src/components/ThemeToggle.svelte:89-94` and `frontend/src/App.svelte:313-319` -- the two forced-colors rules under test.
- `e2e/tests/theme-toggle.spec.ts` -- add the forced-colors describe here.
- `frontend/package.json` -- the scripts (`format`, `format:check`). `frontend/.prettierrc` is the config the docs check uses.
- `_bmad-output/initiative-todo-app/deferred-work.md` -- the entry format. Entries 10–14 and 17 show the "Resolved by entry …" style.
- `docker-compose.yml` -- `backend-dev` (`command: ["--reload", …]`, `127.0.0.1:8000`), `frontend-dev` (`:5173`, `API_UPSTREAM: backend-dev:8000`), `backend-test`, `frontend-test` (`:8082`). The project name is `todo`. Find the network with `docker inspect` on a running container rather than hard-coding it.
- `README.md` -- `## Compose profiles` (l.39), and `## Frontend tests and lint` (l.122).
- `docs/ai-log.md` -- append `## Ticket 3.6 — Refactor sweep`, after the Prettier pass.

## Tasks & Acceptance

**Execution:**
- [x] `e2e/tests/rows.spec.ts` -- the polling animation sampler -- de-flake
- [x] `frontend/nginx/default.conf.template`, `frontend/tests/nginx-template.test.ts`, `e2e/tests/headers.spec.ts` -- the cache headers and their tests
- [x] `e2e/tests/theme-toggle.spec.ts` -- the forced-colors describe
- [x] `frontend/package.json`, `docs/` (the format pass), `README.md` -- the docs Prettier check
- [x] `scripts/check-infra.sh`, `README.md` -- the infra checks, documented
- [x] `_bmad-output/initiative-todo-app/deferred-work.md` -- the resolution entries
- [x] `docs/ai-log.md` -- the Ticket 3.6 section

**Acceptance Criteria:**
- Given `frontend/`, when `npm run check`, `npm run lint`, `npm run test:coverage`, `npm run build` and `npm run docs:format:check` run, then all pass with coverage ≥ 70%.
- Given the rebuilt test stack, when the e2e typecheck and `npm test` run, then every spec passes, and `rows.spec.ts` passes 10 repeats (`--repeat-each 10`).
- Given the test and app profiles up, when `scripts/check-infra.sh` runs, then every check prints PASS (or SKIP for the stale-IP check, with its reason) and it exits 0.
- Given the app profile rebuilt on this branch, when it is opened, then the epic's Done when 1–3 still hold: the Retry toast with the API down, sync within about 30 s, and the theme following the OS and surviving a reload.

## Implementation Notes

- The user approved rebuilding the app profile (`docker compose up -d --build`) for the Done-when check, and approved `check-infra.sh` briefly running the dev profile (2026-10-02).

## Plan Change Log

## Review Triage Log

### Pass 1 (2026-10-02): lenses blind-hunter, edge-case-hunter, verification-gap, intent-alignment

Counts: high 0 · medium 2 · low 19 · false 2 · maybe-false 0. There are no intent_gap or bad_plan entries, so there is no loopback: 12 patches, no deferrals.

| # | Finding (lenses) | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | `/assets/` `Cache-Control … immutable always` also caches a missing asset's 404 for a year; `try_files $uri =404` is untested (BH, ECH) | medium | patch | `always` dropped from that line only; the static test pins `try_files` and the absence of `always`; E2E asserts a missing asset returns 404 with no `immutable`. |
| 2 | `check-infra.sh` stops dev services it didn't start, and leaves `db` running if it started it (BH, ECH) | medium | patch | Records what was running beforehand and restores only what it started; the header and README say so. |
| 3 | Under `set -e`, a failed `stop`, `docker run` or SKIP-path `up` aborts with no FAIL line and skips the dev check (BH, ECH) | low | patch | Each is guarded with `fail` and `return`. |
| 4 | `docker top \| grep -q` under `pipefail` can SIGPIPE into a false FAIL; an empty container id gives the wrong message (BH, ECH) | low | patch | Output is captured before the grep; an explicit "backend-dev not running" FAIL. |
| 5 | Squatters stay up on the not-healthy return; the last curl can overrun the 15 s window (ECH) | low | patch | Squatters are removed first; each curl gets `-m 2`. |
| 6 | A quoted or CRLF `APP_BIND` gives a malformed probe host (ECH) | low | patch | Quotes and `\r` stripped. |
| 7 | README and header claim the 404 is the only request, but the dev check migrates the app db (BH) | low | patch | Reworded consistently. |
| 8 | `referrer-policy` is only checked for presence in E2E (BH) | low | patch | `toBe('no-referrer')`. |
| 9 | The forced-colours input check ignores outline width (BH) | low | patch | Asserts a non-zero width. |
| 10 | `docs:format:check` is in no aggregate (BH, IA) | low | patch | `format:check` runs it. |
| 11 | The "Resolved" wording for the profiles and re-IP checks overstates a manual script (VG, BH) | low | patch | Those two new entries now say "covered by the manual smoke script (no CI runs it)". |
| 12 | The docs reformat is mixed with the real changes (BH) | low | patch | The formatting pass is committed separately. |
| 13 | `favicon.svg` and other root files get no `Cache-Control` (BH, ECH) | low | reject | Heuristic caching of a favicon is harmless; the intent targets the render-blocking script. |
| 14 | The stale-IP check takes the first network only (BH, ECH) | low | reject | `backend-test` is on exactly one compose network. |
| 15 | The header-count regex misses unquoted or non-`always` `add_header`s (ECH) | low | reject | Every `add_header` in the template is quoted; the new test pins the one non-`always` line. |
| 16 | The reduced-motion `[]` can't tell a broken sampler from a working setting (BH, ECH) | low | reject | The non-reduced motion test in the same file proves the sampler records row animations. |
| 17 | "Entry" terminology in deferred-work is ambiguous (BH) | low | reject | It is the repo's convention throughout (`entry 1.12`, `entry 11`). |
| 18 | Done when 1–3 was confirmed by a simulated, uncommitted run (IA) | false | reject | Descriptive; the intent asks for confirmation, and 3.3 recorded the real two-device run. |
| 19 | The stale-IP check restarts the container rather than recreating it (IA) | false | reject | The fix concerns the IP changing behind the DNS name, which a restart onto a new IP reproduces (the epic 1 repro did the same). |

## Verification

**Commands:**
- `cd frontend && npm run check && npm run lint && npm run test:coverage && npm run build && npm run docs:format:check` -- expected: green
- `COMPOSE_PROFILES=test docker compose up -d --build --wait && cd e2e && npm run typecheck && E2E_BROWSER_CHANNEL=chrome npm test && E2E_BROWSER_CHANNEL=chrome npx playwright test tests/rows.spec.ts --repeat-each 10` -- expected: all green
- `scripts/check-infra.sh` -- expected: PASS (or SKIP) on every line, exit 0

### Post-patch verification (2026-10-02)

- The `rows.spec.ts --repeat-each 10` run failed 1 in 180. `a.effect!.getComputedTiming()` threw because Svelte had detached the finished animation's effect. Patched directly: the duration is recorded at first sight in a `Map<Animation, number>`. Two reruns passed 180/180 each.
