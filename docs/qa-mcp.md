# QA report: MCP server passes

- **Date:** 2026-10-02 (14:17–14:40 UTC)
- **Commit:** `main` at `a19a61e` plus the `.mcp.json` added on `chore/mcp-servers`. No app code changed since the QA reports were measured.
- **Target:** the compose `test` profile on `:8082` (production Vite bundle behind nginx, FastAPI, Postgres 18), reset and seeded through the AD-14 test router.
- **Servers:** registered in [`.mcp.json`](../.mcp.json) and called as tools by Claude Code (Opus 5.5):
  - `@playwright/mcp@0.0.83`, system Chrome, isolated profile;
  - `chrome-devtools-mcp@1.10.1`, installed stable Chrome 154, isolated profile, headed window;
  - `@postman/postman-mcp-server@2.13.0`, pending (see Postman below).

These passes ran after the build was finished. They are a second look at the app with the tools the exercise suggests, not part of how it was built. The [AI log](ai-log.md) records that no MCP server was used during the build.

## Playwright MCP: user journeys

Data: `POST /api/test/reset`, then three tasks seeded at 1 day, 2 hours and 10 minutes old. Driven with `browser_navigate`, `browser_snapshot`, `browser_type` and `browser_run_code_unsafe`.

| Journey            | What the MCP session did                                                          | Observed                                                                                                                                                                             | Result |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Load               | Opened `/`                                                                        | Accessibility snapshot: three rows oldest first (`1d`, `2h`, `10m`), each with "Mark … done" and "Delete …" buttons and a spoken age (", added 1 day ago"); the input has focus      | pass   |
| Create             | Typed "file expenses", pressed Enter                                              | It showed as the first row (held) at once; after about 3 s it settled at the bottom of the open tasks. The input cleared and kept focus; the live region said "Added: file expenses" | pass   |
| Complete           | Clicked "Mark "email the landlord" done"                                          | The row moved to the end, below the open tasks; "Marked done: email the landlord" announced; focus returned to the input                                                             | pass   |
| Untick             | Clicked its tick again                                                            | The row returned to its sorted place among the open tasks                                                                                                                            | pass   |
| Delete             | Hovered the row, clicked "Delete "book dentist""                                  | The row was gone; "Deleted: book dentist" announced                                                                                                                                  | pass   |
| Persistence        | Reloaded                                                                          | Same four rows, same order                                                                                                                                                           | pass   |
| Error: failed save | Aborted the `POST /api/tasks` with `page.route`, then added "this save will fail" | The row rolled back; the toast and the live region said "Couldn't save new task."; the text returned to the empty input                                                              | pass   |
| Error: failed load | Aborted `GET /api/tasks`, then reloaded                                           | The toast "Couldn't load your tasks." with one Retry button; no list and no empty state                                                                                              | pass   |
| Retry              | Removed the abort, clicked Retry                                                  | The four rows loaded and the toast closed                                                                                                                                            | pass   |
| Empty state        | Reset the data, reloaded                                                          | "Nothing waiting. Type a task above and press Enter."; no list; the input has focus ([screenshot](qa-artifacts/mcp-playwright-empty-state.png))                                      | pass   |

Console: three `net::ERR_FAILED` errors for `/api/tasks`, all from the requests the session aborted on purpose. No other errors.

## Chrome DevTools MCP: performance and Lighthouse

Data: 500 tasks seeded (every 5th completed, every 10th with a long text and a URL). Window 1280×800, no CPU or network throttling. Traces are kept out of the repo, as in [qa-performance.md](qa-performance.md).

### Page load (`performance_start_trace` with reload)

| Metric           | Value                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| LCP              | 152 ms (TTFB 5 ms, render delay 147 ms)                                                                  |
| CLS              | 0.00                                                                                                     |
| DOM size insight | 6,024 elements; one `ul` with 500 children; depth 11; one layout pass of 47 ms over 7,508 of 7,530 nodes |

This agrees with the scripted check: the 500-row render p95 is 190.7 ms from `GET` resolved to paint (qa-performance.md, Issue 2).

### One tick with 500 rows (trace without reload, `click` on a row's tick ring)

| Sample       | INP    | Input delay | Processing | Presentation delay |
| ------------ | ------ | ----------- | ---------- | ------------------ |
| 1 (task 293) | 192 ms | 15 ms       | 61 ms      | 117 ms             |
| 2 (task 329) | 194 ms | —           | —          | —                  |

The forced-reflow insight names the row animation: 39 ms of forced layout inside Svelte's `animate` `apply` (the FLIP measure after the list changes), plus 0.2 to 0.3 ms elsewhere.

**Finding: NFR-2 measured as INP misses 100 ms.** The scripted QA check passes tick feedback at a p95 of 56.3 ms because its span ends when the renderer's `Paint` finishes. It leaves out the input delay and everything after paint (compositor, GPU, presentation), and qa-performance.md says so under "Not measured". INP, from input to the frame on screen, is about 190 ms here, well inside "good" for the Core Web Vital (≤ 200 ms) but not under NFR-2's 100 ms for visible feedback. Two samples, on a headed window, so this is a lead, not a measurement. It is recorded as Issue 4 in qa-performance.md and has not been fixed.

### Lighthouse 13.4.1 (`lighthouse_audit`, desktop, navigation)

| Category       | Score | Failed audits                                                                                |
| -------------- | ----- | -------------------------------------------------------------------------------------------- |
| Accessibility  | 100   | none                                                                                         |
| Best practices | 100   | none                                                                                         |
| SEO            | 82    | no meta description; `/robots.txt` is not valid (nginx serves the app's `index.html` for it) |

Lighthouse excludes performance from this tool; the traces above cover it. The SEO points don't apply to a local, unlisted app and are left as they are.

## Postman MCP: API contract

Pending. The server needs `POSTMAN_API_KEY` in the environment Claude Code starts with. In this session the key was in `.env` but not exported, so the server exited at start, and a broken npx cache entry (`Cannot find module 'ajv'`) also had to be cleared. Both are fixed; it runs once Claude Code is restarted with the key exported (see [README](../README.md#mcp-servers)).
