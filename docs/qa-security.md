# QA report: security review

- **Date:** 2026-10-02
- **Commit reviewed:** the commit that adds this report (story 3.8, on top of `a1953b8`). The findings were found on `a1953b8`, and the fixes are in this commit. Probes ran against the test profile on `:8082`, rebuilt with the fixes.
- **Probes against the app stack on `:8081`:** that stack was still the **pre-3.8 build** (`a1953b8`), with no fixes, throughout this review. It got three kinds of requests: the `/api/test/*` 404 probes (see "The gated test router" below); `curl` header probes of `/` and `/api/health` (the "before" evidence for S-1); and one framing check. The framing check loaded `/favicon.svg` in an iframe, and one earlier variant loaded `/` with every `/api` request answered inside the browser, so nothing reached the app's API. No request wrote to the app's data.
- **Scope:** the code (frontend, backend, nginx, compose, Dockerfiles), the running stack, and the dependencies. The threat model is the one in NFR-5: a single user, local only, no authentication. So the review asks what another website the user visits, or another device on the same network, could do.

## Commands

The exact probe commands are in the finding they support. The audits and the regressions:

```sh
cd frontend && npm audit --omit=dev && npm audit
cd e2e && npm audit --omit=dev && npm audit
cd backend && uv export --frozen --no-dev --no-emit-project --format requirements-txt -o /tmp/req-prod.txt \
  && uvx pip-audit -r /tmp/req-prod.txt --disable-pip --no-deps
cd backend && uv export --frozen --no-emit-project --format requirements-txt -o /tmp/req-all.txt \
  && uvx pip-audit -r /tmp/req-all.txt --disable-pip --no-deps
grep -rnE '@html|innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function' \
  frontend/src frontend/public frontend/index.html | grep -v '\.test\.ts'
# Regressions for the fixes, in the existing suites:
cd frontend && npx vitest run tests/nginx-template.test.ts tests/dockerignore.test.ts
cd e2e && E2E_BROWSER_CHANNEL=chrome npx playwright test tests/headers.spec.ts tests/rows.spec.ts
```

## Summary

| #   | Finding                                                                                                  | Severity | Status                                            |
| --- | -------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| S-1 | Any site could frame the app and `/api/docs` (clickjacking)                                              | Medium   | **Fixed** in this story, with regression tests    |
| S-2 | The frontend image build context did not exclude `.env` files                                            | Low      | **Fixed** in this story, with a regression test   |
| S-3 | No `Host` check: the app answers any `Host` header (DNS rebinding)                                       | Medium   | **Accepted**, with reason                         |
| S-4 | `/api/docs` loads Swagger UI from a CDN with no SRI, and has no CSP                                      | Low      | **Accepted**, with reason                         |
| S-5 | Default database credentials `todo`/`todo`                                                               | Info     | **Accepted**, with reason                         |
| S-6 | `.env` was tracked in four early commits                                                                 | Info     | **Accepted**: it held only `COMPOSE_PROFILES=app` |
| S-7 | No rate limiting, and `GET /api/tasks` is unpaginated                                                    | Info     | **Accepted**, with reason                         |
| —   | XSS, injection, the test-router gate, non-root containers, bind address, CORS, size limits, dependencies | —        | **Pass**, no finding (details below)              |

## Findings

### S-1. Clickjacking: any site could frame the app and the API docs (Medium, fixed)

**Evidence.** No response set `X-Frame-Options` or a CSP `frame-ancestors`. The CSP's `default-src` does not cover framing. On the `a1953b8` build (`:8081`):

```text
$ curl -s -D - -o /dev/null http://127.0.0.1:8081/
HTTP/1.1 200 OK
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'
Cache-Control: no-cache
```

A page served from another loopback origin (`python3 -m http.server 8790`) framed `http://127.0.0.1:8081/favicon.svg` and Chrome displayed it. The same page framing `:8082` with the fix in place got Chrome's error page (`chrome-error://chromewebdata/`). With no login, any site the user visits could put the list, or Swagger UI's "Try it out", in an invisible frame and trick clicks into ticking or deleting tasks.

**Fix.** `frontend/nginx/default.conf.template`:

- `X-Frame-Options: DENY` at server level (line 16), so `/api/*`, including `/api/docs`, inherits it;
- the same header repeated in every static location;
- the static CSP is now `default-src 'self'; frame-ancestors 'none'` (lines 41, 51, 60, 69).

`default-src 'self'` is unchanged, so AD-19 still holds.

```text
$ curl -s -D - -o /dev/null http://127.0.0.1:8082/
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; frame-ancestors 'none'
$ curl -s -D - -o /dev/null http://127.0.0.1:8082/api/docs
X-Frame-Options: DENY
```

**Regression tests.**

- `frontend/tests/nginx-template.test.ts`: every static location sends exactly the shared set, now including `X-Frame-Options` and the new CSP. A new test checks the server-level headers.
- `e2e/tests/headers.spec.ts`: the header assertions now cover `X-Frame-Options` on static files and on `/api`. A new test, "another site cannot frame the app or /api/docs", serves an attacker page and a control page from two real loopback servers. The control frame renders. The app frame and the docs frame end on `chrome-error://chromewebdata/`, with no `#app` or `#swagger-ui`.
- Before the stack was rebuilt, the updated header tests failed against the old build (6 failed). They pass after the rebuild.

### S-2. `.env` files could reach the frontend image build (Low, fixed)

**Evidence.** `frontend/Dockerfile` copies the whole directory into the build stage (`COPY . .`) before `npm run build`, and Vite reads `.env*` files. `backend/.dockerignore` lists `**/.env` (AD-21), but `frontend/.dockerignore` listed only `node_modules`, `dist`, `coverage`, `Dockerfile` and `.dockerignore`. No `frontend/.env` exists today, and the app has no runtime config. Vite only inlines `VITE_`-prefixed variables, so nothing has leaked. The gap is latent.

**Fix.** `frontend/.dockerignore` now ends with `**/.env` and `**/.env.*`. `backend/.dockerignore` gains `**/.env.*` next to its `**/.env`, so a `backend/.env.local` is excluded too.

**Regression test.** A new test, `frontend/tests/dockerignore.test.ts`, asserts that both `.dockerignore` files list `**/.env` and `**/.env.*`. It checks the files' wording, not a real build context: it would not catch a Dockerfile that copies files around `.dockerignore`.

### S-3. The app answers any `Host` header, so DNS rebinding is possible (Medium, accepted)

**Evidence.** `server_name _;` (`frontend/nginx/default.conf.template:3`), and the backend has no trusted-host check:

```text
$ curl -s -o /dev/null -w "%{http_code}\n" -H 'Host: evil.example' http://127.0.0.1:8082/api/tasks
200
```

A site that re-points its own DNS name to `127.0.0.1` could, in principle, read and change tasks as same-origin.

**What the acceptance relies on, and where it doesn't hold.** Current Chrome blocks a public page from reaching loopback and private addresses (Private / Local Network Access), and that covers the rebound requests. **Firefox and Safari do not enforce that**, and Safari is the likely browser on the phone that reaches the app over Tailscale. There, the attack works against:

- the laptop's `127.0.0.1:8081`, when a non-Chrome browser on the laptop visits the attacker's site;
- an `APP_BIND` Tailscale IP (plain HTTP) from any device on the tailnet.

Tailscale Serve, the README's recommended way to reach the app from the phone, is HTTPS on the `*.ts.net` name. A rebound request there fails the TLS name check, so Serve is not exposed. The rating is Medium rather than Low because the protection is browser-specific: an attacker who keeps the user on a page for the rebinding window can read, add, tick and delete tasks.

**Reason for accepting anyway.** The data is one person's to-do list, with no credentials or other users behind it. A correct allowlist would have to include `127.0.0.1:8081`, `localhost:8081`, the Tailscale Serve name and any `APP_BIND` IP. That is new configuration (an `ALLOWED_HOSTS` variable across compose, `.env.example` and the README), out of scope for a QA story. **Follow-up:** a ticket to add a `Host` allowlist in nginx if the app is ever reachable beyond loopback and the tailnet.

### S-4. `/api/docs` uses a CDN without SRI, and has no CSP (Low, accepted)

**Evidence.** FastAPI's docs page loads `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js` and its CSS with no `integrity` attribute. `curl -s http://127.0.0.1:8082/api/docs | grep -o 'https://[^"]*'` lists three external URLs. AD-16/AD-19 deliberately keep the CSP off `/api/*` so the docs work.

**Reason for accepting.** AD-3 requires the docs. The CDN script runs only when the user opens `/api/docs`, never in the app. The docs can no longer be framed (S-1). Self-hosting Swagger UI would add a dependency. **Note:** a compromised CDN file would run with the app's origin while the docs page is open.

### S-5. Default database credentials (Info, accepted)

`.env.example` and `docker-compose.yml` default to `POSTGRES_USER`/`POSTGRES_PASSWORD` `todo`/`todo`. **Accepted:** the app profile's `db` publishes no port (`docker compose ps`: `todo-db-1 5432/tcp`), so it is reachable only on the compose network. `db-test` is published on `127.0.0.1:5436` only and holds throwaway test data. Users can override the credentials in `.env`.

### S-6. `.env` in early history (Info, accepted)

`git log --all -- .env` shows it tracked in `5863fe2`, `f26a89d`, `7bd4b1c` and `518dd2f`. The last of these stopped tracking it. Its only setting in every commit was `COMPOSE_PROFILES=app` (`git show <commit>:.env`). No secret was ever committed, so the history needs no rewrite.

### S-7. No rate limiting; unpaginated list (Info, accepted)

There is no rate limiting, and `GET /api/tasks` returns every task. **Accepted:** there is one local user and no public exposure (NFR-5). Pagination is deferred by the architecture. With 500 tasks, the `GET` takes 37.7 ms at p95 (default motion, the story 3.10 run in [qa-performance.md](qa-performance.md)).

## Areas reviewed with no finding

### XSS: task text is always text (AD-13)

- Task text is rendered only by Svelte text interpolation: `<span class="text">{row.text}</span>` (`frontend/src/components/TaskRow.svelte:68`). Attribute values such as `aria-label` are bound as attributes.
- The `grep` above for `@html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(` and `new Function` over `frontend/src` (tests excluded), `frontend/public` and `frontend/index.html` finds **0 matches**. ESLint makes `{@html}` an error: `'svelte/no-at-html-tags': 'error'` (`frontend/eslint.config.js:42`).
- The CSP `default-src 'self'` has no `'unsafe-inline'` or `'unsafe-eval'`, so injected markup could not run script anyway. Every E2E test fails on any `securitypolicyviolation` (AD-19).
- Probe: `POST :8082/api/tasks {"text":"<img src=x onerror=alert(1)>"}` → `201`, stored and returned verbatim.
- New E2E test: `e2e/tests/rows.spec.ts` › "markup in task text renders as literal text and never runs". It seeds `<img src=x onerror=alert(1)>`, `<script>alert(2)</script>` and `"><b>bold</b>`, and checks four things: the rows show them as literal text, no `img`, `script` or `b` element exists in the list, no dialog opened, and no CSP violation occurred. The component test `TaskRow.test.ts:72` covers the same case in jsdom.

### Injection: parameterised storage, validated input (AD-12, AD-13)

- Every query is a SQLAlchemy expression: `select(cls).order_by(…)` and `select(cls).where(col(cls.id) == task_id)` (`backend/app/models/task.py:25`, `:35`). The only raw SQL is the constant `text("SELECT 1")` in the health check (`backend/app/routers/health.py:21`), with no input.
- `TaskCreate.text` must be a `StrictStr`. It is trimmed, must not be empty, may not contain NUL and has at most 2000 characters (`backend/app/schemas/task.py:43-63`). Path ids are typed `UUID`, so a malformed id never reaches SQL.
- Probes on `:8082`:

| Request                                     | Response                                    |
| ------------------------------------------- | ------------------------------------------- |
| `POST {"text":"x'); DROP TABLE tasks; --"}` | `201`, stored verbatim; the table is intact |
| `POST` with 2001 characters                 | `422 {"code":"text_too_long"}`              |
| `POST {"text":"a\u0000b"}`                  | `422 validation_error`                      |
| `POST {"text":{"$ne":1}}`                   | `422 validation_error`                      |
| `POST {"text":` (broken JSON)               | `422 validation_error`                      |
| `DELETE /api/tasks/1%20OR%201=1`            | `404 task_not_found`                        |
| `PUT /api/tasks/'%3B--/tick`                | `404 task_not_found`                        |

No error body includes a stack trace or the input. Every error is `{detail, code}` (AD-5, covered by `test_errors.py`).

### CSP and headers (AD-16, AD-19, story 3.6)

After the S-1 fix, every static response (`/`, deep links, `/theme-init.js`, `/assets/*`) sends:

- `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-Frame-Options: DENY`

`/` and `/theme-init.js` are `Cache-Control: no-cache`, and hashed `/assets/*` are `public, max-age=31536000, immutable`, with a missing asset's 404 never marked immutable. `/api/*` sends the shared headers without the CSP. `server_tokens off` (line 9) keeps the nginx version out of `Server: nginx`. Checked by `e2e/tests/headers.spec.ts` (9 tests) and `frontend/tests/nginx-template.test.ts`. No HSTS: the local app is plain HTTP, and Tailscale Serve provides HTTPS (architecture › Deferred).

### The gated test router (AD-14)

`backend/app/main.py:26-28` imports and mounts `routers/testing.py` only when `settings.app_env == "test"`. Only `backend-test` sets that, and compose sets `APP_ENV: app` on `backend` and `backend-dev`. Probes on the app profile:

```text
POST :8081/api/test/reset -> 404
POST :8081/api/test/tasks -> 404
POST :8081/api/test/clock -> 404
$ curl -s -XPOST http://127.0.0.1:8081/api/test/reset
{"detail":"Not Found","code":"not_found"}
```

`backend/tests/test_testing_router.py:63` (404 under the default config), `:73` (absent from OpenAPI) and `:81` (building the default app in a fresh interpreter imports neither test-only module) keep this from regressing.

### Secrets

- `.env` is gitignored (`.gitignore:12`, `git check-ignore -v .env backend/.env frontend/.env`), and `git ls-files` tracks only `.env.example`. `.env.example` holds only local defaults (S-5).
- Images: `find / -xdev -name ".env*"` in `todo-backend-test` and `todo-frontend-test` finds nothing; the only matches for `*.pem` are the OS CA bundles. Each image's `Config.Env` holds only `PATH`, version variables and `PYTHONUNBUFFERED`. `DATABASE_URL` and `APP_ENV` come from compose at run time. `backend/.dockerignore` excludes `tests` and, after S-2, `**/.env` and `**/.env.*`; `frontend/.dockerignore` now excludes both patterns too.

### Containers run as non-root

- `backend/Dockerfile:15,20` creates a system user `app` and sets `USER app`. The frontend runs `nginxinc/nginx-unprivileged`.
- Running containers: `docker compose exec backend-test id` → `uid=999(app)`; `frontend-test` → `uid=101(nginx)`; the same for `backend` and `frontend` on the app profile.

### Bind address (AD-16)

Every published port binds `127.0.0.1` by default: `docker-compose.yml:41` (`${APP_BIND:-127.0.0.1}:8081`), `:61` (`8000`, dev), `:78` (`5173`, dev), `:104` (`5436`, db-test) and `:130` (`8082`, test). `docker compose ps` shows `127.0.0.1:8081->8080`, `127.0.0.1:8082->8080` and `127.0.0.1:5436->5432`. `db` and the backends publish nothing. The README warns against `APP_BIND=0.0.0.0` on untrusted networks and recommends Tailscale Serve.

### CORS and cross-site requests

- There is no CORS middleware (AD-2), so a cross-origin read gets no `Access-Control-Allow-Origin`. `curl -H 'Origin: https://evil.example' :8082/api/tasks` returns no ACAO header. A preflight `OPTIONS` (`Access-Control-Request-Method: DELETE`) gets `405` with no CORS headers, so the browser blocks cross-site `PUT` and `DELETE`, and JSON `POST`s.
- CSRF through "simple" requests, which need no preflight: a JSON body sent as `text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`, or with no content type, gets `422 validation_error`, and nothing is stored. FastAPI parses JSON only from a JSON content type. Four new cases in `backend/tests/test_mutations.py` pin each of these: `json-as-text-plain`, `json-as-form-urlencoded`, `json-as-multipart` and `json-no-content-type` (the request carries no `Content-Type` header at all). The existing `not-json` case covers a form-encoded `text/plain` body.

### Request size limits

- nginx `client_max_body_size 64k` (`frontend/nginx/default.conf.template:8`). A 70,013-byte `POST` gets `413 Request Entity Too Large` from nginx before it reaches the backend. The client maps 413 to the "too long" toast (`frontend/src/lib/api.test.ts:166`).
- Under that, the schema limits text to 2000 characters (above). uvicorn is reachable only through nginx in the app and test profiles. The dev profile's `:8000` is loopback-only.

### Dependency audit

| Package set                                           | Command                                                                    | Result                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `frontend` runtime                                    | `npm audit --omit=dev`                                                     | `found 0 vulnerabilities`        |
| `frontend` all                                        | `npm audit`                                                                | `found 0 vulnerabilities`        |
| `e2e` runtime                                         | `npm audit --omit=dev`                                                     | `found 0 vulnerabilities`        |
| `e2e` all                                             | `npm audit`                                                                | `found 0 vulnerabilities`        |
| `backend` runtime (25 pinned packages from `uv.lock`) | `uvx pip-audit -r req-prod.txt --disable-pip --no-deps` (pip-audit 2.10.1) | `No known vulnerabilities found` |
| `backend` with dev group (38 packages)                | same, on `req-all.txt`                                                     | `No known vulnerabilities found` |

pip-audit ran in an isolated `uvx` environment against requirements exported from `uv.lock`. It installed nothing into the project. It needs network access to query the PyPI advisory data, so it is not an offline check. The base images (`python:3.14-slim`, `nginx-unprivileged:1.30-alpine`, `postgres:18`) were not scanned. No image scanner is installed, and adding one would be a new heavy dependency.
