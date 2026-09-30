# Deliverables — Todo App exercise

This file lists the exercise hand-in requirements from `docs/bmad_exercise.md`. Every item is required for SM-5.

## Artifacts

- **BMad artifacts:** the brief, PRD, UX spec, architecture spine, this spec, and stories with acceptance criteria and test scenarios (unit, integration, E2E) defined in each story.
- **The app:** a working frontend and backend with full CRUD: add is Create, the list is Read, tick/untick is Update, and delete is Delete.
- **Test suites:**
  - Unit and component tests with Vitest.
  - Integration tests for every API endpoint.
  - Playwright E2E tests covering create, complete, delete, the empty state and error handling. There must be at least 5, all passing.
  - Test infrastructure is set up in the first story, and the test commands are defined in `package.json` / `pyproject.toml`.
- **Containers:**
  - Multi-stage Dockerfiles for the frontend and backend, each running as a non-root user with a health check.
  - A `docker-compose.yml` with networking, volumes, and dev/test profiles selected by environment variables.
  - The app runs with `docker-compose up`.
- **QA reports in `docs/`:**
  - Coverage, at least 70% meaningful.
  - Accessibility, from axe-core or Lighthouse, with zero critical WCAG violations.
  - A security review of XSS, injection and similar issues, with findings and fixes.
  - A performance check in Chrome DevTools, with any issues found.
- **Documentation:**
  - A README with setup and test instructions.
  - A record of how BMad guided the implementation.
- **An AI integration log in `docs/`,** kept throughout the build. It records:
  - which agents did which tasks, and which prompts worked;
  - which MCP servers were used, and how they helped;
  - how AI helped generate tests, and what it missed;
  - cases where AI helped debug;
  - limitations, and where human expertise was critical.

## Suggested tooling (from the exercise)

- Postman MCP or similar to validate the API contract.
- Chrome DevTools MCP for debugging and performance.
- Playwright MCP for browser automation.
