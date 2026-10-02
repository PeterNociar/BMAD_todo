---
title: 'Phone access over Tailscale'
type: 'chore'
ticket: '3'
created: '2026-10-01'
status: done
baseline_revision: 'b1a1dfc8d2f6a6c4a87b927bd1d15848d916514f'
route: 'oneshot'
route_source: 'auto'
review: 'quick'
review_source: 'auto'
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/initiative-todo-app/architecture-todo-app/architecture-todo-app.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The README's "Phone access" section (`README.md:156`) was written before any device test. It skips the preconditions: a rebuilt app profile, MagicDNS and HTTPS enabled on the tailnet, and the operator permission `tailscale serve` may need. It doesn't say how to find the URL or stop serving, and it misses the `APP_BIND` trap: binding to the Tailscale IP takes the app off `localhost:8081` on the laptop. CAP-10 needs the author to prove on real devices that a phone add reaches the idle laptop tab within about 30 s (AD-16).

**Approach:** Correct the README section against Tailscale 1.98 on this laptop (this laptop and the author's phone on the same tailnet). The author then runs the README steps on the real devices. Their observed result is recorded in a `## Ticket 3.3 — Phone access over Tailscale` section of `docs/ai-log.md`, never written ahead of the run. No code change.

</frozen-after-approval>

## Implementation Notes

**Why oneshot:** the change is docs only, about 30 lines across `README.md` and `docs/ai-log.md`.

- `README.md` › Phone access is split into Tailscale Serve, `APP_BIND` and Sync subsections. Serve gained these steps:
  - rebuild the app profile first;
  - the MagicDNS and HTTPS Certificates toggles;
  - the operator fix for "Access denied";
  - `tailscale serve status` for the URL;
  - stopping with `--https=443 off` or `reset`.

  `APP_BIND` gained three warnings: `localhost:8081` stops working on the laptop, the page is plain HTTP and not a secure context, and binding to `0.0.0.0` is risky.
- Checked on this laptop: Tailscale 1.98.4, `tailscale serve status` shows "No serve config", MagicDNS is on, and the author's phone is on the tailnet.

## Verification

**Manual checks (hitl):**
- On the laptop, the README steps give an `https://<machine>.<tailnet>.ts.net` URL that loads the app on the phone over mobile data with Wi-Fi off.
- With the laptop tab visible and idle, a task added on the phone shows there within about 30 s, with no reload and no focus change.
- `tailscale serve --https=443 off` stops it, and the phone URL no longer loads.

## Review Triage Log

### Quick review (2026-10-01)

- No `docs/ai-log.md` section yet. **Pending, not a defect:** the intent says to write it only after the author's device run.
- **Low, patched.** "Use the same Tailscale URL there" under `APP_BIND` could be read as the Serve URL, which can't work in that mode. It now names `http://<that IP>:8081` and notes that Serve stops working.
- **Low, patched.** With `APP_BIND` set to the Tailscale IP, the frontend can fail to bind at boot if Docker starts before `tailscaled` has its IP, because a published port needs an existing address. Added a caveat and the fix: run `docker compose up -d` again.
- **Low, patched.** The Sync line stated "within about 30 s" as firm. `poll()` skips a tick while the tab's own add is in flight, so it now says "usually within 30 s", up to a minute.
- **Low, patched.** The plan named the real tailnet host and phone, so it now uses generic wording.
