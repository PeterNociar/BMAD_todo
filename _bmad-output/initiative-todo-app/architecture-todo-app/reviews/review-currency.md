# Currency & Reality-Check Review — Architecture Spine (Todo App)

- **Reviewed:** `architecture-todo-app.md` + `.memlog.md` (two `(version)` entries, 2026-09-30)
- **Review date:** 2026-09-30
- **Method:** live registry queries (PyPI JSON API, npm registry, Docker Hub v2 API, endoflife.date v1 API), upstream source files on GitHub (docker-nginx-unprivileged, docker-library/postgres, create-vite template, svelte-testing-library), official docs (Alembic, Playwright, Vitest 5 release notes), web search.
- **Spine not edited.**

## Verdict

The Stack table is current and internally compatible as of today: every pinned minor matches the latest registry release, and the memlog's `(version)` entries show the versions were checked, not recalled. Two things were never reality-checked and need action: the Postgres 18 image's new volume path, and Vitest 5 with `@testing-library/svelte`, a pairing nobody has tested yet. A few transitive pins the stack depends on (SQLAlchemy <2.1, test DOM environment, svelte-check) are also missing from the table.

## 1. Stack table vs registries

| Name | Spine | Registry latest (2026-09-30) | Status |
|---|---|---|---|
| Python | 3.14 | 3.14.7 (EOL 2030-10); `python:3.14-slim` / `3.14.7-slim` exist | OK |
| FastAPI | 0.142 | 0.142.2 (uploaded 2026-09-30), classifier 3.14, `pydantic>=2.9` | OK |
| SQLModel | 0.0.47 | 0.0.47 (2026-09-23), classifier 3.14, **`SQLAlchemy>=2.0.14,<2.1.0`**, `pydantic>=2.11` | OK, see F3 |
| Pydantic | *(not listed)* | 2.13.5 | Missing from table (transitive) |
| SQLAlchemy | *(not listed)* | 2.1.1 latest; 2.0.54 (cp314 wheels) is what SQLModel allows | Missing, F3 |
| Alembic | 1.20 | 1.20.0 (2026-09-11), `SQLAlchemy>=2.0` | OK |
| psycopg | 3.3 | 3.3.6; `psycopg-binary` 3.3.6 has cp314 wheels | OK |
| uvicorn | 0.54 | 0.54.0 | OK |
| pytest | 9.1 | 9.1.1 | OK |
| pytest-cov | 7.1 | 7.1.0 | OK |
| uv | 0.12 | 0.12.21 (2026-09-29) | OK |
| PostgreSQL | 18 | 18.6; tags `18`, `18-alpine`, `18-trixie`, `18.6-*` exist; EOL 2030-11 | Version OK; F1 |
| Node.js | 24 LTS | 24.21.0, LTS since 2025-10-28, EOL 2028-04-30. Node 26 becomes LTS on 2026-10-28 | OK, see F6 |
| TypeScript | 6.0 (not 7) | latest **7.0.2**; 6.0.3 is the newest 6.x; svelte-check 4.7.6 peer `typescript ^5 \|\| ^6`; create-vite 9.2.1 `svelte-ts` template pins `typescript ~6.0.2` | OK, correctly reasoned |
| Svelte | 5.57 | 5.57.1 | OK |
| Vite | 8.3 | 8.3.1 (engines `^20.19 \|\| >=22.12`) | OK |
| @sveltejs/vite-plugin-svelte | 7.3 | 7.3.1, peer `vite ^8`, `svelte ^5.46.4` | OK, compatible |
| Vitest | 5.0 | 5.0.3 (5.0.0 released 2026-09-03), peer `vite ^6.4 \|\| ^7 \|\| ^8`, engines `node ^22.12 \|\| ^24 \|\| >=26` | OK on paper; F2 |
| @vitest/coverage-v8 | 5.0 | 5.0.3, peer `vitest 5.0.3` exact | OK, must match Vitest exactly |
| @testing-library/svelte | 5.4 | 5.4.2 (2026-06-23), peer `svelte ^3–^5`, `vitest *` (optional) | Unconfirmed with Vitest 5, F2 |
| @playwright/test | 1.63 | 1.63.0 (2026-09-04) | OK |
| @axe-core/playwright | 4.13 | 4.13.0, peer `playwright-core >=1.0.0` | OK |
| nginx | `nginxinc/nginx-unprivileged:1.30-alpine` | tag exists, updated 2026-09-28, nginx 1.30.5 = current **stable** (1.31.x is mainline) | OK |

All pinned minors are the current latest. None are out of date.

## 2. Technology fit checks

| Claim in spine | Evidence | Result |
|---|---|---|
| Svelte 5 + Vite 8 + vite-plugin-svelte 7 (AD-1) | plugin 7.3.1 peers `vite ^8`, `svelte ^5.46.4`; the official create-vite 9.2.1 `svelte-ts` template ships exactly svelte ^5.57, vite ^8.3, plugin ^7.3 | Confirmed |
| TS 6 because svelte-check doesn't support 7 | svelte-check 4.7.6 (latest, 2026-08-13) peer `^5.0.0 \|\| ^6.0.0`; template pins `~6.0.2` | Confirmed |
| Vitest + @testing-library/svelte for Svelte 5 | TL-svelte 5.4.2 has a `./svelte5` export and a `./vite` plugin; peers accept any vitest. **Its own repo still develops against `vitest ^4.0.16`, jsdom ^29.** No release since Vitest 5 came out | Unconfirmed, F2 |
| SQLModel on Python 3.14 + current FastAPI/Pydantic | SQLModel 0.0.47 lists a 3.14 classifier; pydantic 2.13.5 ≥ both floors (2.9 / 2.11). PEP 649 deferred annotations have broken some FastAPI/SQLModel codebases that use `TYPE_CHECKING`-only imports in annotations (a third-party `sqlmodel-ext` exists to patch it). A single model with no relationships is low risk | Confirmed with caveat, F5 |
| psycopg 3 with SQLAlchemy | SQLAlchemy 2.0 ships the `postgresql+psycopg` dialect; psycopg-binary 3.3.6 has cp314 wheels | Confirmed. The spine never states the URL scheme (`postgresql+psycopg://`, not `postgresql://`, which selects psycopg2) |
| nginx-unprivileged listens on 8080 | upstream `stable/alpine-slim/Dockerfile`: `sed 's,listen 80;,listen 8080;,'`, `EXPOSE 8080`, pid → `/tmp/nginx.pid`, `USER 101` | Confirmed |
| nginx template step reads `API_UPSTREAM` | the image ships `gettext-envsubst` + `/docker-entrypoint.d/20-envsubst-on-templates.sh` (template dir `/etc/nginx/templates`, suffix `.template`, output `/etc/nginx/conf.d`, made writable by `chown -R 101:0 /etc/nginx`); it substitutes only variables defined in the environment, so nginx `$host` etc. survive | Confirmed, F4 on file naming |
| Frontend HEALTHCHECK "fetches /" | the non-slim `alpine` variant does `apk add curl ca-certificates` (busybox `wget` exists too) | Confirmed for `1.30-alpine` (not for `-slim`) |
| `alembic check` (AD-15) | Alembic docs: added in 1.9.0; runs autogenerate compare, non-zero exit + op list on drift | Confirmed (1.20 ≫ 1.9) |
| Playwright `page.clock` (AD-8, AD-14) | playwright.dev/docs/clock: `install`, `setFixedTime`, `setSystemTime`, `pauseAt`, `fastForward`, `runFor`, `resume`; overrides `Date`, `setInterval`, `setTimeout`, etc. `install` must come before any other clock call. (Added in 1.45; present in 1.63) | Confirmed |
| Node 24 LTS | endoflife.date: 24 is LTS, 24.21.0; `node:24-*` images exist | Confirmed |
| Postgres 18 image with a named volume | docker-library `18/trixie/Dockerfile`: **"in 18+, PGDATA has changed … VOLUME has moved from /var/lib/postgresql/data to /var/lib/postgresql"**, `ENV PGDATA /var/lib/postgresql/18/docker` | Version confirmed; mount path is a trap, F1 |

## 3. Findings

### F1 — Postgres 18 image moved PGDATA/VOLUME (HIGH, not reality-checked)
From 18 on, the official image uses `PGDATA=/var/lib/postgresql/18/docker` and `VOLUME /var/lib/postgresql`. If a dev agent writes the long-standing `- pgdata:/var/lib/postgresql/data` mount, data goes into the image's anonymous `/var/lib/postgresql` volume instead of the named one. FR-14 persistence then fails silently, or the container errors on start, depending on the entrypoint checks. The spine and memlog say "named volume" but never name the mount path. **Action:** add to AD-16 / Consistency Conventions: `db` and `db-test` mount their named volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data`, and add a persistence check (restart → data still there) to the tests.

### F2 — Vitest 5 + @testing-library/svelte 5.4 is unproven (MEDIUM, unconfirmed)
Vitest 5.0.0 is four weeks old (2026-09-03). TL-svelte 5.4.2 predates it (2026-06-23), and its repo still tests on `vitest ^4.0.16`. The peer ranges (`vitest *`) accept it, so nothing blocks the install, but nobody has shown the pair works. Vitest 5 breaking changes that bite this spine: `clearMocks` now defaults to `true`, fake timers also fake `Temporal`, unawaited `resolves`/`rejects` now fail tests, and reporter output moves into `.vitest/` (add it to `.gitignore`). **Action:** make the first frontend story a spike that mounts one runes component with `svelteTesting()` under Vitest 5.0.x. If it fails, fall back to Vitest 4.1.11 + `@vitest/coverage-v8` 4.1.x (both fit Vite 8). Record the result in the memlog.

### F3 — Transitive pins the stack relies on are not in the table (MEDIUM)
- **SQLAlchemy:** SQLModel 0.0.47 requires `<2.1.0`, but the latest SQLAlchemy is 2.1.1. Alembic (`>=2.0`) doesn't cap it. uv resolves 2.0.54 fine, but an agent that adds `sqlalchemy>=2.1` or copies 2.1 docs/APIs will hit a resolver conflict. List `SQLAlchemy 2.0 (capped <2.1 by SQLModel)`.
- **Pydantic** 2.13 (AD-7 relies on its serializer): not listed.
- **Test DOM environment:** component tests need `jsdom` (30.1.1 latest; engines `^22.22.2 || ^24.15.0 || >=26`) or `happy-dom`. None is named, so agents will pick different ones.
- **svelte-check** 4.7 is the reason for the TS 6 pin, but it is not a row itself.
- **DB driver URL:** say `postgresql+psycopg://` explicitly (psycopg 3). Plain `postgresql://` makes SQLAlchemy load psycopg2.

### F4 — nginx template file name/location not stated (LOW)
The template step only processes `/etc/nginx/templates/*.template` → `/etc/nginx/conf.d/`. The Structural Seed lists `frontend/nginx.conf`. If that file is copied over `/etc/nginx/nginx.conf` or into `conf.d/`, `${API_UPSTREAM}` is never substituted. **Action:** name it `frontend/default.conf.template`, copied to `/etc/nginx/templates/`, holding a `server {}` block with `listen 8080;`. Keep the `1.30-alpine` variant, not `-slim`, because the HEALTHCHECK needs curl.

### F5 — Python 3.14 PEP 649 caveat for SQLModel/FastAPI (LOW)
The support is declared (classifiers) but newer than the 3.13 path. Annotations that name a type imported only under `TYPE_CHECKING` break at runtime under 3.14's deferred evaluation, because FastAPI and SQLModel resolve annotations. **Action:** a convention line, "no `TYPE_CHECKING`-only imports in model/schema/router annotations". Otherwise fine.

### F6 — Node 26 becomes LTS in four weeks (INFO)
Node 26 is promoted to LTS on 2026-10-28. Node 24 stays in LTS until 2028-04, so the choice holds. Pin the image by major (`node:24-alpine`) in the build stage and record that a move to 26 is a deliberate change.

### F7 — Memlog hygiene (INFO)
The Svelte decision entry says "Verified current: Svelte 5.57.0 (2026-08-28)", and the later `(version)` entry says 5.57.1. That is fine because the later entry supersedes it, but the verified sources for nginx template/envsubst, `alembic check` and `page.clock` are asserted in decision lines, not in `(version)`/evidence entries. This review supplies the evidence. Consider adding a single `(version)` line citing it.

## 4. Not a problem (checked)
- No pinned version is stale. Every minor equals the registry's latest minor, and "latest" dist-tags match.
- The Vite 8 / Vitest 5 / plugin 7 / Node 24 engine ranges all overlap.
- `@vitest/coverage-v8` must equal the Vitest version exactly (peer `5.0.3`). The spine pins both at 5.0 ✔.
- The TypeScript 6 pin is right and matches the official template.
- `nginxinc/nginx-unprivileged:1.30-alpine` is the current stable line, rebuilt 2026-09-28.

## Sources
- PyPI JSON API: fastapi, sqlmodel, alembic, psycopg, psycopg-binary, uvicorn, pytest, pytest-cov, uv, pydantic, sqlalchemy (queried 2026-09-30)
- npm registry: svelte, vite, @sveltejs/vite-plugin-svelte, vitest, @vitest/coverage-v8, @testing-library/svelte, @playwright/test, @axe-core/playwright, typescript, svelte-check, create-vite (9.2.1 template-svelte-ts), jsdom
- Docker Hub v2 API: nginxinc/nginx-unprivileged, library/postgres, library/python, library/node
- endoflife.date API v1: nodejs, python, postgresql, nginx
- https://github.com/nginx/docker-nginx-unprivileged (stable/alpine, stable/alpine-slim Dockerfile, 20-envsubst-on-templates.sh)
- https://github.com/docker-library/postgres/blob/master/18/trixie/Dockerfile
- https://github.com/testing-library/svelte-testing-library (package.json on main)
- https://alembic.sqlalchemy.org/en/latest/autogenerate.html (alembic check, 1.9.0)
- https://playwright.dev/docs/clock
- https://vitest.dev/blog/vitest-5.html, https://vitest.dev/guide/migration/
- https://mergify.com/blog/python-314-what-pep-649-actually-breaks
