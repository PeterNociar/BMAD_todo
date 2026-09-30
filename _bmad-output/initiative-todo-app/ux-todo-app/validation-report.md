# Validation Report — BMAD_todo

- **DESIGN.md:** `/home/noco/repos/nearform/BMAD_todo/_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md`
- **EXPERIENCE.md:** `/home/noco/repos/nearform/BMAD_todo/_bmad-output/initiative-todo-app/ux-todo-app/EXPERIENCE.md`
- **Run at:** 2026-09-30

## Overall verdict

The pair is a clean contract that a downstream consumer can extract from. Every one of the 34 distinct token references resolves, all 19 light colour tokens have `-dark` twins with hex values, the contrast table checks out when recomputed, UJ-1..3 are reused verbatim with Peter, numbered steps and a climax each, and component names match across both files. What still blocks a consumer is a few load-bearing behaviours that are left open or contradicted: focus return on touch (the soft keyboard), scroll and focus return on long lists, several adds during the ~3s hold, and two decisions that DESIGN.md commits to while EXPERIENCE.md still lists them as open questions. Settle those before story slicing. The rest is polish.

The accessibility and adversarial reviewers shift that picture. The rubric saw no critical issues; after dedupe there are three. The `/` jump-to-input shortcut is a single-character key active anywhere outside the input, which fails WCAG 2.1.4 as written and would fail a manual AA audit even though axe passes. The adversarial pass found that the optimistic model has no identity or ordering rules: a tick or delete on a new task whose save has not been confirmed has nothing to target and can resurrect or wrongly toast the task, and a quick tick then untick can leave the row out of step with the server. Both reviewers also add high-severity gaps around focus when a focused toast or row disappears, screen-reader success feedback, toasts covering the held task, merging adds made during a failed load, lost texts after several failed adds, and an invisible but tappable delete on hybrid devices. On the other side of the ledger, the user has since settled OQ1 (2-state theme toggle), OQ2 (each add settles the previous one), OQ3 ("Couldn't save new task. It's too long.") and OQ5 (no strikethrough) in the memlog, which clears the rubric's hold-stacking blocker and both cross-spine contradictions. The spines still show them as open, so they belong in the next Update along with the unresolved criticals and highs.

## Category verdicts

- Flow coverage — adequate
- Token completeness — adequate
- Component coverage — adequate
- State coverage — adequate
- Visual reference coverage — adequate
- Bloat & overspecification — strong
- Inheritance discipline — adequate
- Shape fit — strong

## Findings by severity

Deduplicated: 66 raw findings (rubric 29, accessibility 21, adversarial 16) consolidated to 57. Findings marked *resolved in memlog* were settled by the user on 2026-09-30 but are not yet reflected in the spines.

### Critical (3)

**[Accessibility]** — `/` single-key shortcut fails SC 2.1.4 Character Key Shortcuts (§ EXPERIENCE § Interaction Primitives › Keyboard; memlog keyboard decision)
The `/` shortcut is a single printable-character shortcut active "from anywhere outside" the input, with no way to turn it off or remap it, and not limited to one component having focus. That fails SC 2.1.4 as written. Speech-input users can trigger it by accident. axe will not catch this; a manual audit will.
Fix: Esc and Up-from-first-row already reach the input, so drop `/`. Or make it fire only while focus is inside the list, or put it behind a modifier (Alt+/ or Ctrl+/). Record the choice in the memlog.
Raised by: accessibility

**[Adversarial]** — Actions on a held task whose add has not been confirmed yet (§ EXPERIENCE § Age Nudge and New-Task Hold, last bullet; § State Patterns › Add rollback)
Peter presses Enter, then immediately ticks or deletes the held row while the POST is still in flight. The spine says "the action applies immediately", but the task has no server id yet, so the tick/delete request has nothing to target. Worse, if Peter deletes it and the add then fails, add rollback runs on a row that is already gone: a "Couldn't save new task." toast appears for a task he chose to delete, and its text comes back into his empty input. If the add succeeds after the delete was dropped client-side, the task comes back on the next load (breaks FR-13). The rubric raised the same gap at medium ("optimistic rows still in flight have no defined state").
Fix: Define an identity and queueing rule: a client-generated id (UUID) accepted by the API, or queue row actions until the add confirms. Specify every pairing: delete then add fails means silent (no toast, no text restore); delete then add succeeds means send the delete; tick then add fails means row removed plus the add toast only.
Raised by: adversarial, rubric

**[Adversarial]** — Rapid tick/untick and out-of-order server responses (§ EXPERIENCE § State Patterns › Action error; § Component Patterns › Tick ring)
Peter ticks, notices the wrong row and unticks within 300ms. Two requests are in flight. The untick succeeds, then the tick's failure arrives late, and "the row returns to its exact previous state" puts it back as open… or as completed if the builder snapshots state per request. Either way the UI no longer matches the server. Who sets the completed time? If the server does, the completed group re-sorts on response and rows jump with no user action. "Exact previous position" is undefined when other rows moved meanwhile. The rubric raised the tick-then-quick-untick case at medium.
Fix: One in-flight mutation per task, later intents coalesced or queued (last intent wins; reconcile only the final server state). Rollback re-derives position from FR-6 instead of restoring an index. The server timestamp replaces the optimistic one without animation unless order actually changes.
Raised by: adversarial, rubric

### High (9, 1 resolved in memlog)

**[Flow coverage]** — Focus return on touch opens the soft keyboard after every tick or delete (§ EXPERIENCE § Component Patterns; § Responsive & Platform; § Key Flows UJ-2)
The flows only show laptop use, but the memlog says phone use mirrors laptop use. On touch, "focus returns to the input after every task action" (FR-2) means every tick or delete tap focuses the input; `input.focus()` inside a tap handler counts as a user gesture on iOS and Android, so the keyboard slides up, the visual viewport shrinks by about half and the list reflows, on every action during UJ-2 backlog clearing. Autofocus on load, by contrast, does not open the keyboard on iOS or Android, so behaviour differs by entry point. None of this is decided.
Fix: Add a Responsive & Platform row "Focus return on touch": return focus to the input only for fine/hover-capable pointers or keyboard activation (the PRD says "by mouse or keyboard"); on touch (`pointerType === 'touch'`) do not move focus after row actions and blur the input if it was not already focused. State that phone autofocus is best-effort and walk UJ-2 on a phone in one line.
Raised by: rubric, adversarial

**[State coverage]** — Scroll and long-list behaviour uncommitted: input is not sticky, so focus return, FR-4 and scroll collide (§ EXPERIENCE § State Patterns; § Age Nudge › New-task hold; § Interaction Primitives; § Information Architecture; DESIGN § Layout & Spacing)
With 500 tasks (NFR-2), Peter scrolls to row 300 and ticks it. Focus returns to the input and a plain `focus()` scrolls the page to the top, losing his place on every action. With `preventScroll`, the next Enter adds into an off-screen input, the held task "directly under the input" is off-screen too (breaks FR-4), and the toast layer is off-screen so failures go unseen. The spines imply both "never scroll" and "always visible".
Fix: Pick one model: (a) header, input and toast layer are `position: sticky`, focus return uses `preventScroll`, and the held row renders in the sticky zone; or (b) refocus with `preventScroll` and scroll the input into view on Enter.
Raised by: rubric, adversarial

**[State coverage]** — Several adds within the ~3s hold left as Open Question 2 — resolved in memlog (§ EXPERIENCE § Open Questions 2; § Age Nudge › New-task hold)
FR-1 explicitly supports entering several tasks in a row, so the case is certain to occur and changes both the list model and the animation. The adversarial reviewer raised the same gap (a builder would pick a stacking rule at random).
Fix: Decide before stories. Record the chosen rule in EXPERIENCE.md and remove OQ2.
Raised by: rubric, adversarial
Status: Resolved in memlog (2026-09-30): each new add ends the previous task's hold at once (it slides to its sorted place); only the newest task is held under the input. Resolves OQ2. The spines still list OQ2 as open, so fold this into the next Update.

**[Accessibility]** — Focus has no defined destination when the focused element disappears (toasts, rows, Retry) (§ EXPERIENCE § Component Patterns › Toast; § State Patterns › Load error)
Cases: (a) a keyboard user is on a toast's × or Retry when it auto-dismisses or closes after a successful retry; (b) a toast closed from the keyboard, since only pointer close returns focus; (c) a row control has focus while the row re-renders; (d) Retry succeeds. In each case focus drops to `<body>`, breaking FR-2 and SC 2.4.3. The rubric adds that every toast, including the persistent load-failure toast, gets a close × with no rule for retrying afterwards. The adversarial reviewer: "his next keystrokes go nowhere."
Fix: One rule: "whenever the focused element is removed, focus moves to the input". Closing any toast by any means returns focus to the input. Pause a toast's auto-dismiss while it has focus or hover. The load-failure toast has no close × (Retry only).
Raised by: accessibility, rubric, adversarial

**[Accessibility]** — Screen-reader users get no feedback when add, tick, untick or delete succeeds (§ EXPERIENCE § Accessibility Floor › Live regions; § Open Questions 4)
Focus jumps back to the input, the row moves or vanishes, and nothing is announced. OQ4 covers add only (and is still open). Under SC 4.1.3 the user cannot tell the action worked.
Fix: One polite, visually hidden status region announcing "Added: X", "Marked done: X", "Marked not done: X", "Deleted: X"; don't announce the held task's move; announce "No tasks left" after the last delete. Close OQ4.
Raised by: accessibility

**[Adversarial]** — Toasts cover the held task, and the load-failure toast covers it indefinitely (§ EXPERIENCE § Component Patterns › Toast; § Age Nudge; § State Patterns › Add while loading or after load error)
Peter adds A, which fails, then adds B: the A-failure toast sits exactly where held B is, so FR-4 fails. With the list failed to load, the persistent toast overlays the top of the list; every task he adds is held under it, then "slides into its sorted place" in a blank list area. His new tasks are hidden for as long as the API is down. No cap on toast count: ticking 10 rows with the server down stacks 10 toasts over the rings he is trying to tap.
Fix: Cap visible toasts (e.g. 2, collapsing the rest, or dedupe identical messages with a count). Reserve space instead of overlaying while a held task or persistent toast is present, or render held rows above the toast stack. Define where post-load-error adds render.
Raised by: adversarial

**[Adversarial]** — Merge rules for adds during loading or after a load error are a single [ASSUMPTION] (§ EXPERIENCE § State Patterns › Add while loading or after load error; Load error)
Peter adds X during a slow first load. If the GET was issued before the POST, a naive "replace list with response" deletes X from view even though it saved; if served after, X appears twice. After a load error, does Retry's skeleton replace tasks he added meanwhile? If the 3s hold expires before the list arrives, slide into what? If he deletes all tasks added during a failed load, is that the empty state (forbidden after load failure) or blank?
Fix: Reconcile by id (server list ∪ pending optimistic, dedupe by client id). Skeleton rows render below locally added rows, never replacing them. A hold never ends into an unloaded list. After a load error, local tasks show in a list container and the empty state stays suppressed until a load succeeds.
Raised by: adversarial

**[Adversarial]** — Multiple failed adds break "nothing lost" (§ EXPERIENCE § Voice and Tone › Override of FR-16; § State Patterns › Add rollback)
With the API down, Peter types and enters three tasks in 2s. All three fail while the input is empty. Which text returns? If "each on failure", the second overwrites the first and the third the second, so two tasks vanish with no trace, which goes beyond the accepted override (that only covered "user already typed new text"). The held-task stacking (OQ2) and over-length copy (OQ3) parts of this finding are now resolved in the memlog; the multi-failure text loss is not.
Fix: Restore only the most recent failed text and name the loss explicitly as accepted, or keep a small failed-text queue.
Raised by: adversarial

**[Adversarial]** — On hybrid devices an invisible delete button can be tapped (§ EXPERIENCE § Component Patterns › Delete button; § Interaction Primitives › Pointer vs touch; DESIGN § Components)
On a touchscreen laptop or iPad with trackpad, `(hover: hover)` reports the primary pointer as fine, so delete is hidden until hover but stays in the Tab order (hidden by opacity). Peter touches the right edge of a row to scroll or tap, hits the invisible ×, and the task is permanently deleted with no undo.
Fix: Show delete whenever `(any-pointer: coarse)` matches, or make the hidden state `pointer-events: none`, re-enabled on hover/focus-within only for `pointerType === 'mouse'`. State it in the spine because the failure is irreversible.
Raised by: adversarial

### Medium (17, 2 resolved in memlog)

**[Flow coverage]** — UJ-1 climax assumes focus is in the input when Peter returns to the tab (§ EXPERIENCE § Key Flows UJ-1 step 2; § Interaction Primitives)
Nothing says what happens if focus was elsewhere when he left: on the theme toggle after a keyboard toggle, on a row after arrow-key navigation, or on the page body after a click in empty space. No behaviour is specified for a click on blank page area, nor for `visibilitychange`.
Fix: Commit a rule, e.g. "a click on non-interactive page area, or the tab becoming visible with focus on `body`, focuses the input", or explicitly accept a keyboard shortcut as the recovery path (see the `/` critical finding).
Raised by: rubric

**[Token completeness]** — Toast shadow is a hard-coded colour outside the token set (§ DESIGN § Elevation & Depth; frontmatter components.toast)
`rgba(24,32,44,.12)` / `rgba(0,0,0,.45)` sit inside an [ASSUMPTION]. This breaks DESIGN.md's own Don't ("Hard-code a colour outside the token set") and has no frontmatter home, so the resolver cannot emit it.
Fix: Add `shadow-toast` / `shadow-toast-dark` tokens (or an `elevation` key) and reference them from `components.toast`.
Raised by: rubric

**[Token completeness]** — Age gradient's normative method is ambiguous (§ DESIGN § Colors › Age gradient)
The spine allows continuous computation or interpolation between stops, both of which "must reproduce these hexes". But the gamut-reduction method and the "L nudge" are unspecified and per-stop OKLCH values live only in `.working/color-themes-1.html`, so a continuous implementation cannot reproduce the hexes deterministically.
Fix: Make one method normative (e.g. "interpolate linearly in OKLCH between the stored stops") and add each stop's OKLCH triplet next to its hex.
Raised by: rubric

**[Token completeness]** — Unfocused input boundary is below 3:1 (SC 1.4.11) and missing from the contrast table (§ DESIGN § Colors › Border; Contrast table)
`border` on `bg` is 1.41 light / 1.55 dark and `surface` on `bg` is 1.10 / 1.08. The spine leans on the surface step to identify the input ([ASSUMPTION]). When focus is elsewhere (on a row, the toggle) and text has been typed so there is no placeholder cue, the boundary fails 1.4.11.
Fix: Use `{colors.check-ring}` for the unfocused input border (3.18 on bg / 3.51 on surface light; 3.87 / 3.59 dark), or add a text-muted bottom rule. Alternatively record the 1.4.11 reasoning explicitly and accept the risk.
Raised by: rubric, accessibility

**[Component coverage]** — List has no behavioural row; list and page semantics are unset (§ EXPERIENCE § Component Patterns; § Information Architecture; DESIGN § Typography)
List semantics (`ul`/`li`, accessible name), behaviour with hundreds of rows (page scroll or own scroll region) and its role as container for empty state and skeleton are not committed. Landmarks, `<title>` and `lang` are not set, and DESIGN says "No headings", so axe best-practice rules (`page-has-heading-one`, `region`) will flag moderate issues and add noise to the zero-violations gate.
Fix: Add a List row: `<ul aria-label="Tasks">` with one `<li>` per task, `aria-busy="true"` while loading, scroll owner, FR-6 ordering by reference. Specify `<html lang="en">`, `<title>Todo</title>`, `<header>` + `<main>`, and the wordmark as a visually unchanged `<h1>`.
Raised by: rubric, accessibility

**[Inheritance discipline]** — Strikethrough committed in DESIGN.md but open in EXPERIENCE.md (OQ5) — resolved in memlog (§ EXPERIENCE § Open Questions 5 vs DESIGN § Components, Do's and Don'ts)
DESIGN.md says "no strikethrough (Ledger render)" and forbids it, while EXPERIENCE.md OQ5 asks to confirm. A consumer cannot tell which is binding, and FR-11's example suggests strikethrough.
Fix: Close OQ5 as decided in EXPERIENCE.md.
Raised by: rubric
Status: Resolved in memlog (2026-09-30): no strikethrough confirmed. Completed style stays Ledger: filled round check, muted text, no age bar, 'done 2h' label (FR-11's strikethrough was only an example). Resolves OQ5. EXPERIENCE.md still lists OQ5 as open, so fold this into the next Update.

**[Inheritance discipline]** — Returning to "follow system" after a manual theme choice left as Open Question 1 — resolved in memlog (§ EXPERIENCE § Open Questions 1; § Component Patterns › Theme toggle)
It decides the toggle's state model and what goes into local storage; the memlog's "three-way effective behaviour" wording suggested it was meant to be settled. The adversarial reviewer also asked to close it ("one click locks the user out of follow-system permanently").
Fix: Record the decision in the Theme toggle row and remove OQ1.
Raised by: rubric, adversarial
Status: Resolved in memlog (2026-09-30): the theme toggle is 2-state (light/dark) once chosen; there is no in-app way back to following the system (clearing site data resets it). Resolves OQ1. The spines still list OQ1 as open, so fold this into the next Update.

**[Accessibility]** — Input has no specified accessible name (§ EXPERIENCE § Voice and Tone › Screen-reader labels; DESIGN § Components › Input)
The placeholder "What needs doing?" is the only label. It disappears once the user types and some SR/browser pairs don't read it as a name reliably (SC 3.3.2, 4.1.2).
Fix: Add a visually hidden `<label>` "New task" (or `aria-label`) to the label table; add `autocomplete="off"` and `enterkeyhint="enter"`.
Raised by: accessibility

**[Accessibility]** — Focus handling for the held new task and arrow navigation onto moving rows undefined (§ EXPERIENCE § Age Nudge and New-Task Hold; § Interaction Primitives › Shortcuts)
If a keyboard or SR user arrows onto the held task, the row slides away under them three seconds later; if it re-renders, focus is lost; if placed first with CSS `order`, DOM and visual order diverge (SC 1.3.2, 2.4.3). The adversarial reviewer adds that focus riding along auto-scrolls the page, rollbacks re-inserting rows shift "next", and it's unclear whether Down from the input targets the held row or the oldest task.
Fix: Make the held row first in the DOM; key rows by id so focus survives the move; postpone settling while any control in the held row has focus. Compute arrow navigation from current DOM order at keypress time.
Raised by: accessibility, adversarial

**[Accessibility]** — Reflow target is 360px; SC 1.4.10 needs 320 CSS px (§ EXPERIENCE § Foundation, § Responsive; DESIGN § Layout & Spacing › Phone)
At 400% zoom a laptop viewport is about 190px tall, and toast overlay plus header plus input could cover most of it.
Fix: State "no horizontal scroll and no loss of function from 320px"; add a 320×256 check to the Playwright a11y suite.
Raised by: accessibility

**[Accessibility]** — ~5s toast auto-dismiss is short for magnifier users (§ EXPERIENCE § Component Patterns › Toast; PRD FR-18)
The toast sits under the input, possibly outside the magnified view. Info-only toasts pass SC 2.2.1, but only just.
Fix: Pause the timer on hover, focus-within and window blur; consider 6–8s; never put an action other than close on a timed toast.
Raised by: accessibility

**[Accessibility]** — Arrow keys clash with native behaviour (§ EXPERIENCE § Interaction Primitives › Shortcuts)
Down moves the caret to the end on macOS and opens the autofill history list. Rows are not a composite widget, so arrow navigation is undiscoverable and SR browse mode swallows it.
Fix: Set `autocomplete="off"`; keep Tab as the documented primary path; consider a visually hidden hint linked via `aria-describedby` on the first tick ring.
Raised by: accessibility

**[Adversarial]** — Theme resolution: first paint, live system change and storage failure (§ EXPERIENCE § Component Patterns › Theme toggle)
A stored "dark" preference read after the framework mounts flashes light first. With no stored choice, the OS switches to dark at sunset and nothing says the app listens to `matchMedia('(prefers-color-scheme: dark)')`. In a private window `localStorage` throws and the toggle may crash. The rubric raised the storage case at low. The OQ1 part of the original finding is resolved (2-state, no way back to system), which makes the "nothing stored yet" path the only one that follows the system.
Fix: Apply the theme in an inline pre-paint script. Follow live system changes while nothing is stored. Wrap storage in try/catch, falling back to session-only.
Raised by: adversarial, rubric

**[Adversarial]** — Enlarged touch hit areas overlap neighbouring rows' delete buttons (§ EXPERIENCE § Interaction Primitives › Hit areas; DESIGN § Layout › Task row)
A single-line row is about 35px tall. Extending the delete target towards 44px vertically overlaps the row above or below. A tap near a divider deletes the neighbour, permanently.
Fix: Hit areas extend horizontally only or are clamped to the row box, or raise the coarse-pointer row min-height to 44px. Pick one.
Raised by: adversarial

**[Adversarial]** — Client clock ahead of the server is unhandled (§ EXPERIENCE § State Patterns › Clock drift; PRD FR-15)
The spine only covers future timestamps (client behind). With the laptop clock 90 minutes fast, every add shows "now"/green, then flips to "1h" and a yellow-green bar when the server's time replaces the client's. Fresh tasks look stale and the held task's label jumps mid-hold.
Fix: Estimate the server offset (Date header or a `serverTime` field) and compute ages against `Date.now() + offset`; keep the clamp as a backstop.
Raised by: adversarial

**[Adversarial]** — Wake from sleep and long-hidden tabs (§ EXPERIENCE § Age Nudge › Live ages)
Peter closes the lid with the tab visible and opens it two days later. `visibilitychange` often does not fire, the 30s interval may be deferred, labels show "20h" instead of "2d", and the list is two days stale with no refetch. bfcache has the same problem.
Fix: Recompute on `visibilitychange`, `focus`, `pageshow` (persisted) and whenever the interval detects a wall-clock gap much larger than 30s. Decide whether a long gap triggers a silent refetch and how it merges without moving focus.
Raised by: adversarial

**[Adversarial]** — Refresh or navigation while an add is in flight silently loses the task (§ EXPERIENCE § State Patterns; PRD SM-4, §4.6)
Peter presses Enter and immediately hits Cmd+R. The input is already cleared and the POST is aborted. On reload the task is gone, with no toast. "Nothing silently lost" has a hole.
Fix: Register `beforeunload` while any mutation is pending, or persist pending adds to `sessionStorage` and replay on load. State which.
Raised by: adversarial

### Low (28, 1 resolved in memlog)

**[Flow coverage]** — UJ-3 has no failure path (§ EXPERIENCE § Key Flows UJ-3)
A realistic failure is a backgrounded tab or sleeping laptop where timers are throttled. Age Nudge covers it (recompute on `visibilitychange`), but the flow does not show it. See also the adversarial wake-from-sleep finding, which argues `visibilitychange` alone is not enough.
Fix: Add one line: "Failure: the laptop slept through the crossing; on wake the tab becomes visible and the bar and label update at once."
Raised by: rubric

**[Flow coverage]** — No flow walks a keyboard-only run (§ EXPERIENCE § Key Flows UJ-2)
NFR-1 and NFR-7 make keyboard add/tick/untick/delete a tested path. The rules exist in Interaction Primitives, but no flow exercises Down, Space, focus back to the input.
Fix: Add a one-sentence keyboard variant to UJ-2.
Raised by: rubric

**[Token completeness]** — Component tokens reference only light names (§ DESIGN frontmatter components; § Colors intro)
Dark resolution depends on the prose convention "every dark token is the `-dark` twin", which a resolver will not apply by itself.
Fix: State the mapping rule once in a frontmatter comment, or say consumers build CSS variables with the light name as the variable and the `-dark` value under the dark scheme.
Raised by: rubric

**[Token completeness]** — Several raw values sit outside the scale (§ DESIGN frontmatter components.empty-state, theme-toggle, tick-ring, delete-button; § Layout & Spacing)
`14px` (twice), `22px x 18px`, `16px`, `20px`, 1.5px / 1.6px strokes and the 600px breakpoint.
Fix: Add named tokens (`gap-input-list-phone`, `breakpoint-compact`, `icon-sm`), or declare the values component-local.
Raised by: rubric

**[Token completeness]** — `accent` as toast action text is not in the contrast table (§ DESIGN § Colors › Contrast table)
`accent` is also the "Retry" text, which needs 4.5:1; the table states it only as a focus ring at 3.0. It passes (6.60 / 7.47), but the text use is not stated.
Fix: Add "accent as toast action text on surface, min 4.5".
Raised by: rubric

**[Component coverage]** — Header and Focus ring have no Component Patterns row (§ EXPERIENCE § Component Patterns)
Header is non-interactive and Focus ring is covered in Interaction Primitives and Accessibility Floor, so this is a completeness gap only.
Fix: Add one-line rows ("Header: not a landmark nav; wordmark is text, not a link"; "Focus ring: `:focus-visible` only").
Raised by: rubric

**[Component coverage]** — No hover appearance for the tick ring or theme toggle (§ DESIGN § Components)
Only the row tint and the delete hover are specified.
Fix: State "no own hover state; the row tint is the hover cue", or give one.
Raised by: rubric

**[State coverage]** — Enter during IME composition and multi-line paste undefined (§ EXPERIENCE § Component Patterns › Input)
Enter during IME composition must not add a task, and pasted multi-line text needs a defined result. The adversarial reviewer adds that "input is empty" is untested for whitespace-only input or an active composition.
Fix: Add both to the Input row, and define "empty" as trimmed-empty with no active composition.
Raised by: rubric, adversarial

**[Visual reference coverage]** — Render references are code spans, only in intro sections (§ DESIGN § Colors, § Layout & Spacing)
Colors and Layout lean on the renders ("Values come from the Ledger render") without linking them where the values are used.
Fix: Make them relative Markdown links and repeat the link inline in Colors and Layout.
Raised by: rubric

**[Visual reference coverage]** — Render files also contain rejected options (§ .working/directions-1.html; .working/color-themes-1.html)
Directions A and C and other palette variations sit in the same files. A consumer opening them without the spine's pointer could lift the wrong variant.
Fix: Name the exact panel or section ID in the link, or promote the chosen panels to `mockups/`.
Raised by: rubric

**[Bloat & overspecification]** — Components prose repeats frontmatter pixel values (§ DESIGN § Components › Theme toggle, Tick ring, Delete button)
22×18px, 16px ring, 20px box, 4px padding and 1.5px stroke appear twice and can drift apart.
Fix: Keep values in the frontmatter only; let the prose describe anatomy and state.
Raised by: rubric

**[Bloat & overspecification]** — State Patterns Hover and Focus rows repeat Interaction Primitives (§ EXPERIENCE § State Patterns)
They restate rules already in Interaction Primitives.
Fix: Drop them or reduce each to a pointer.
Raised by: rubric

**[Inheritance discipline]** — FR-3 length safeguard copy deviates quietly (Open Question 3) — resolved in memlog (§ EXPERIENCE § Voice and Tone; § State Patterns › Add rollback; § Open Questions 3)
The PRD says the toast "explains why", but the spine reuses "Couldn't save new task.". The adversarial reviewer adds that an identical toast invites an infinite retry loop.
Fix: Add the distinct over-length copy to Voice and Tone and remove OQ3.
Raised by: rubric, adversarial
Status: Resolved in memlog (2026-09-30): the too-long add failure toast reads "Couldn't save new task. It's too long." (explains why per FR-3, no echo of the text). Resolves OQ3. The spines still list OQ3 as open, so fold this into the next Update.

**[Inheritance discipline]** — Undeclared spine terms (§ EXPERIENCE § Foundation)
Foundation says glossary terms are "used exactly", but the spines add *age bar*, *tick ring*, *held (new) task*, *row*, *list container* without defining them.
Fix: Add a short "Spine terms" line defining these as UI names, not glossary terms.
Raised by: rubric

**[Shape fit]** — Inspiration & Anti-patterns section absent (§ EXPERIENCE (missing section))
The memlog records reference options and rejections (directions A and C, unused palette variations, strikethrough rejected, no celebration on completion).
Fix: Add a 4–5 bullet section: what was taken from Ledger and C, what was rejected, and why.
Raised by: rubric

**[Shape fit]** — Key Flows sits before Responsive & Platform (§ EXPERIENCE section order)
The reference examples end with Key Flows.
Fix: Optionally move Responsive & Platform above Key Flows.
Raised by: rubric

**[Accessibility]** — Theme toggle state is weak in forced-colors mode (§ DESIGN § Components › Theme toggle; EXPERIENCE › Theme toggle)
Label swap is correct (don't add `aria-pressed`). The active segment is only a surface fill (1.10:1), so state shows via icon colour alone (2.81 / 2.37).
Fix: Keep the label swap; under `forced-colors: active` outline the active segment with `CanvasText`.
Raised by: accessibility

**[Accessibility]** — Hidden delete must use opacity, not display/visibility (§ EXPERIENCE § Component Patterns › Delete button; DESIGN › Delete button)
`display:none`/`visibility:hidden` drops it from the Tab order, contradicting "always in the Tab order". Voice-control users can't target an unrevealed ×. See the adversarial hybrid-device finding for the opposite risk (an invisible × that can still be tapped).
Fix: Specify `opacity:0` → 1 on `:hover`/`:focus-within`; optionally show delete at low emphasis always.
Raised by: accessibility

**[Accessibility]** — Contrast table's delete-hover figure is not the worst case (§ DESIGN § Colors › Contrast)
"delete on hover 5.38" is the icon on the row tint. The button's own hover background is `{colors.divider}`: 4.51 light / 4.88 dark. Still passes 3:1. The rubric's mechanical notes list the same unstated pair.
Fix: Add "delete on divider (button hover): 4.51 / 4.88".
Raised by: accessibility, rubric

**[Accessibility]** — Tick ring button reads task text twice (§ EXPERIENCE › Tick ring; § Voice and Tone)
The label-swapping button is valid but SRs read the task text in the button name and again as row text.
Fix: Hide the duplicate visible text with `aria-hidden`, or use `<input type="checkbox">` labelled by the task text.
Raised by: accessibility

**[Accessibility]** — Age labels must stay out of live regions; "now" wording undefined (§ EXPERIENCE § Accessibility Floor; § Voice and Tone)
Otherwise labels are read aloud every 30s. The words form for "now" is not defined.
Fix: Note that age labels are not live; add "added just now" / "completed just now".
Raised by: accessibility

**[Accessibility]** — Failed load retry is not re-announced (§ EXPERIENCE § State Patterns › Load error)
The alert text doesn't change, so the user presses Retry and hears nothing.
Fix: Announce "Still couldn't load your tasks." politely on each failed retry.
Raised by: accessibility

**[Accessibility]** — Live regions must exist before messages are injected (§ EXPERIENCE § Accessibility Floor)
Otherwise the first toast is often missed.
Fix: Render empty `role="status"` and `role="alert"` containers on first paint.
Raised by: accessibility

**[Accessibility]** — Text resize and spacing (SC 1.4.4, 1.4.12) (§ DESIGN § Typography, § Components)
All type is px, toggle segments are fixed 22×18, line-height fixed at 1.35; user default font size is ignored and fixed heights could clip.
Fix: Use rem for type; no fixed heights on rows, toasts or empty state; test with the text-spacing bookmarklet.
Raised by: accessibility

**[Accessibility]** — Target size (advisory, WCAG 2.2) (§ EXPERIENCE › Pointer vs touch)
"Hit areas at least 24×24" meets 2.5.8. On touch the row is about 35px tall, so 44px can't be reached vertically (2.5.5 is AAA). See the adversarial hit-area overlap finding.
Fix: No change needed for AA. Make the delete hit area span full row height on coarse pointers.
Raised by: accessibility

**[Accessibility]** — Focus not obscured by toasts (advisory, SC 2.4.11) (§ EXPERIENCE › Toast; memlog toast decision)
Toasts overlay the top of the list and can cover the focused tick ring or delete of the first rows, where overdue and held tasks live.
Fix: Use `scroll-margin-top` equal to the toast stack height on row controls, or dim/shift the toast while a covered control has focus.
Raised by: accessibility

**[Accessibility]** — Reduced motion coverage is complete (§ EXPERIENCE § Motion)
Slides, held-task settle, gap closing and toast fades are all covered. The held task still jumps after 3s, which is acceptable.
Fix: None required. Optionally note forced-colors: the filled check must stay visible (SVG with `currentColor`).
Raised by: accessibility

**[Adversarial]** — Age column width, font swap and inconsistent time snapshots (§ DESIGN § Typography; § Components › Age label; age-column-min: 62px)
"done 100d" is about 65px at 12px mono, exceeding the 62px min, so the column misaligns after about 3 months (completed tasks are never archived). The webfont swap changes metrics so rows jump after first paint. If label and colour call `Date.now()` separately, a row can read "1d" with a non-overdue colour.
Fix: Size the column for the longest realistic label (`ch`-based) or cap at "99d+". Use metric-matched fallbacks and preload both fonts. Compute label and colour from one `now` snapshot per render.
Raised by: adversarial

## Reviewer files

- `review-rubric.md`
- `review-accessibility.md`
- `review-adversarial.md`
