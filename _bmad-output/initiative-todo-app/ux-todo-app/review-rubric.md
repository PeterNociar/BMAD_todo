# Spine Pair Review — BMAD_todo

## Overall verdict

The pair is a clean contract that a downstream consumer can extract from. Every one of the 34 distinct token references resolves, all 19 light colour tokens have `-dark` twins with hex values, the contrast table checks out when recomputed, UJ-1..3 are reused verbatim with Peter, numbered steps and a climax each, and component names match across both files. What still blocks a consumer is a few load-bearing behaviours that are left open or contradicted: focus return on touch (the soft keyboard), scroll and focus return on long lists, several adds during the ~3s hold, and two decisions that DESIGN.md commits to while EXPERIENCE.md still lists them as open questions. Settle those before story slicing. The rest is polish.

## 1. Flow coverage — adequate

Checked: every UJ in the sources (PRD §2.2 UJ-1, UJ-2, UJ-3; the brief and docs/PRD.md add none). All three have a Key Flow titled verbatim, with protagonist Peter, numbered steps and a bold **Climax** beat. UJ-1 and UJ-2 have failure paths that match the PRD edge cases (UJ-1 applies the memlog override to FR-16). Also checked the requirement-level paths the flows touch: FR-2, FR-4, FR-7, FR-11..13, FR-16.

### Findings

- **high** The flows only show laptop use, but the memlog says phone use mirrors laptop use on the same journeys. On touch, "focus returns to the input after every task action" (FR-2, Tick ring / Delete button rows) means every tick or delete tap on a phone focuses the input, which pops the soft keyboard up over the list. Autofocus on load also does not open the keyboard on iOS or Android. None of this is decided (EXPERIENCE.md Component Patterns; Responsive & Platform; Key Flows UJ-2). *Fix:* add a Responsive & Platform row "Focus return on touch": for example, return focus to the input only for hover-capable / fine pointers or keyboard activation, and on touch leave focus on nothing (or blur). State that phone autofocus is best-effort, and walk UJ-2 on a phone in one line.
- **medium** The UJ-1 climax depends on the cursor already being in the input when Peter switches back to the tab (step 2). Nothing says what happens if focus was elsewhere when he left: on the theme toggle after a keyboard toggle (Theme toggle row keeps focus there), on a row after arrow-key navigation, or on the page body after a click in empty space. No behaviour is specified for a click on blank page area, nor for `visibilitychange` (EXPERIENCE.md Key Flows UJ-1 step 2; Interaction Primitives). *Fix:* commit a rule, e.g. "a click on non-interactive page area, or the tab becoming visible with focus on `body`, focuses the input", or explicitly accept `/` as the recovery path.
- **low** UJ-3 has no failure path. A realistic one is a backgrounded tab or a sleeping laptop where timers are throttled. The Age Nudge section covers it (recompute on `visibilitychange`), but the flow does not show it (EXPERIENCE.md Key Flows UJ-3). *Fix:* add one line: "Failure: the laptop slept through the crossing; on wake the tab becomes visible and the bar and label update at once."
- **low** No flow walks a keyboard-only run, although NFR-1 and NFR-7 make keyboard add/tick/untick/delete a tested path. The rules exist in Interaction Primitives, but no flow exercises Down → Space → focus back to the input (EXPERIENCE.md Key Flows UJ-2). *Fix:* add a one-sentence keyboard variant to UJ-2.

## 2. Token completeness — adequate

Checked: all frontmatter tokens (19 light and 19 dark colours, 4 typography roles, 3 radii, 14 spacing tokens, 13 component blocks) and every `{path.to.token}` in both files (34 distinct references). All resolve. Every colour has a hex value and a `-dark` twin. I recomputed every contrast figure in the DESIGN.md table and all of them match.

### Findings

- **medium** The toast shadow is a hard-coded colour outside the token set: `rgba(24,32,44,.12)` / `rgba(0,0,0,.45)` inside an [ASSUMPTION]. This breaks DESIGN.md's own Don't, "Hard-code a colour outside the token set", and it has no frontmatter home, so the resolver cannot emit it (DESIGN.md Elevation & Depth; frontmatter `components.toast`). *Fix:* add `shadow-toast` / `shadow-toast-dark` tokens (or an `elevation` key) and reference them from `components.toast`.
- **medium** The age gradient's normative method is ambiguous. The spine says an implementation "may compute the formula continuously or interpolate between stops; both must reproduce these hexes". But the gamut-reduction method and the "L nudge" are unspecified, and the per-stop OKLCH values are not stored (they exist only in `.working/color-themes-1.html`), so a continuous implementation cannot reproduce the hexes deterministically (DESIGN.md Colors › Age gradient). *Fix:* make one method normative, e.g. "interpolate linearly in OKLCH between the stored stops", and add each stop's OKLCH triplet next to its hex.
- **medium** The unfocused input boundary is below 3:1 and missing from the contrast table. `border` on `bg` is 1.41 light / 1.55 dark, and `surface` on `bg` is 1.10 / 1.08. The spine leans on the surface step to identify the input ([ASSUMPTION], Colors › Border), but that step is too weak to meet WCAG 1.4.11 when the input is unfocused and holds typed text (no placeholder cue) (DESIGN.md Colors; Contrast table). *Fix:* either state the 1.4.11 reasoning explicitly (the input is almost always focused, and the placeholder identifies it when empty) and accept the risk, or darken `border` to reach 3:1 on `bg`.
- **low** Component tokens reference only the light names (e.g. `{colors.surface}`). Dark resolution depends on the prose convention "every dark token is the `-dark` twin", which a resolver will not apply by itself (DESIGN.md frontmatter `components`; Colors intro). *Fix:* state the mapping rule once in a frontmatter comment, or say that consumers build CSS variables with the light name as the variable and the `-dark` value under the dark scheme.
- **low** Several raw values sit outside the scale: `14px` (empty-state padding; phone input-to-list gap), `22px x 18px`, `16px`, `20px`, 1.5px / 1.6px strokes, and the 600px breakpoint (DESIGN.md frontmatter `components.empty-state`, `theme-toggle`, `tick-ring`, `delete-button`; Layout & Spacing). *Fix:* add named spacing / size tokens (`gap-input-list-phone`, `breakpoint-compact`, `icon-sm`), or accept the values as component-local and say so.
- **low** `accent` is also toast action text ("Retry"), which needs 4.5:1, but the table states it only as a focus ring at a 3.0 target. It passes (6.60 / 7.47), but the text use is not stated (DESIGN.md Contrast table). *Fix:* add "accent as toast action text on surface, min 4.5".

## 3. Component coverage — adequate

Checked the names used anywhere in either file: Header, Theme toggle, Input, List, Task row, Age bar, Age label, Tick ring, Delete button, Toast, Empty state, Skeleton row, Focus ring. All 13 have a DESIGN.md Components entry and a frontmatter block. EXPERIENCE.md Component Patterns covers 10 of them with real rules. Header, List and Focus ring have no row there.

### Findings

- **medium** List has no behavioural row. Ordering is in IA, but the list's semantics (e.g. `ul` / `li`, whether it has an accessible name), its behaviour with hundreds of rows (page scroll or its own scroll region) and its role as a container for the empty state and skeleton are not committed. Story-dev will guess the markup that axe and screen readers depend on (EXPERIENCE.md Component Patterns). *Fix:* add a List row covering semantics, scroll owner and FR-6 ordering by reference.
- **medium** The toast variants are underspecified. The Toast row gives *every* toast a close × [ASSUMPTION], including the persistent load-failure toast, and it does not say whether closing that toast is allowed or how the user retries afterwards. It also says focus returns to the input only "after closing by pointer", so keyboard close is undefined. Nothing covers what happens when a 5s auto-dismiss removes a toast whose action currently has keyboard focus: focus drops to `body` (EXPERIENCE.md Component Patterns › Toast; State Patterns › Load error). *Fix:* state that the load-failure toast has no close × (Retry only), that closing any toast by any means returns focus to the input, and that a toast holding focus (or hovered) pauses its timer.
- **low** Header and Focus ring have no Component Patterns row. Header is non-interactive and Focus ring is covered in Interaction Primitives and Accessibility Floor, so this is only a completeness gap (EXPERIENCE.md Component Patterns). *Fix:* add one-line rows ("Header: not a landmark nav; wordmark is text, not a link"; "Focus ring: `:focus-visible` only").
- **low** DESIGN.md defines no hover appearance for the tick ring or the theme toggle, and EXPERIENCE.md defines none either. Only the row tint and the delete hover are specified (DESIGN.md Components). *Fix:* state "no own hover state; the row tint is the hover cue", or give one.

## 4. State coverage — adequate

Checked each IA region. **List:** cold load (skeleton with a 300ms delay), empty, load error, retry, loaded, held new task, overdue transition, clock drift, add rollback, action error. **Input:** focused at rest, add while loading, length safeguard. **Toast layer:** stacking and persistence. **Header / theme toggle:** system default, stored override. Offline and permission-denied correctly do not apply (PRD §7: no offline mode, no accounts); network loss falls through to action error. The core states are well covered. The gaps are the in-between states that concurrency and long lists create.

### Findings

- **high** Scroll and long-list behaviour is uncommitted. With many tasks (NFR-2 plans for 500), the user scrolls down to tick a row, and focus then returns to the input (FR-2). A plain `focus()` scrolls the page back to the top, which loses the user's place. Nothing says whether the header and input are sticky, or whether focus return uses `preventScroll`. The held new task "directly under the input" has the same question when the page is scrolled (EXPERIENCE.md State Patterns; Age Nudge › New-task hold "page does not scroll"; Interaction Primitives). *Fix:* commit one model, e.g. "header and input are sticky at the top; focus return never scrolls (`preventScroll`); the held task appears under the sticky input".
- **high** Several adds within the ~3s hold are left as Open Question 2, but FR-1 explicitly supports entering several tasks in a row, so the case is certain to occur and changes both the list model and the animation (EXPERIENCE.md Open Questions 2; Age Nudge › New-task hold). *Fix:* decide before stories. The simplest rule is "a new add settles any currently held task at once; only the newest is held".
- **medium** Optimistic rows still in flight have no defined state. It is unspecified whether an unconfirmed new task's tick and delete controls are active (it has only a temporary client ID, per the addendum), and what rollback does when a second action lands on a row whose first action is still pending, e.g. tick then quick untick (EXPERIENCE.md State Patterns › Add rollback / Action error; Age Nudge last bullet). *Fix:* state the user-visible rule, e.g. "controls are live at once; actions on an unconfirmed task queue until its save resolves; a rollback restores the last server-confirmed state".
- **low** Theme storage unavailable (private mode or blocked storage): the toggle should still work for the session and fall back to the system setting. Not stated (EXPERIENCE.md Component Patterns › Theme toggle). *Fix:* one clause.
- **low** Enter during IME composition must not add a task, and pasted multi-line text needs a defined result (newlines become spaces, or are stripped). Neither is stated (EXPERIENCE.md Component Patterns › Input). *Fix:* add both to the Input row.

## 5. Visual reference coverage — adequate

Checked: there are no `mockups/`, `wireframes/` or `imports/` directories. `.working/` holds `directions-1.html` and `color-themes-1.html`. Both are referenced in DESIGN.md Brand & Style and EXPERIENCE.md Foundation, each with what it illustrates (Ledger direction B plus C's check; Slate variation 1, light and dark). "Spines win on conflict" is stated in each file. The two known conflicts are called out where they apply: the render truncates task text while the PRD wraps it, and the render shows delete at 60% opacity. No orphans.

### Findings

- **low** The references are code spans rather than links, and they appear only in the intro sections. Colors, Layout & Spacing ("Values come from the Ledger render") and Colors › Border ("comes from the Slate render") lean on the renders without linking them where the values are used (DESIGN.md Colors, Layout & Spacing). *Fix:* make them relative Markdown links and repeat the link inline in Colors and Layout.
- **low** Both files also contain rejected options (directions A and C; other palette variations). A consumer who opens them without the spine's pointer could lift the wrong variant (`.working/directions-1.html`, `.working/color-themes-1.html`). *Fix:* name the exact panel or section ID in the link, or promote the chosen panels to `mockups/`.

## 6. Bloat & overspecification — strong

Both files are lean. DESIGN.md prose carries editorial voice that is tied to decisions, and EXPERIENCE.md uses tables throughout. Where EXPERIENCE.md restates requirements, it cites FR numbers and does not copy them.

### Findings

- **low** DESIGN.md Components prose repeats pixel values already in the frontmatter component blocks (22×18px, 16px ring, 20px box, 4px padding, 1.5px stroke). Two copies can drift apart (DESIGN.md Components › Theme toggle, Tick ring, Delete button). *Fix:* keep the values in the frontmatter only and let the prose describe anatomy and state.
- **low** The State Patterns rows *Hover* and *Focus* only repeat rules already in Interaction Primitives (EXPERIENCE.md State Patterns). *Fix:* drop them or reduce each to a pointer.

## 7. Inheritance discipline — adequate

Checked: all 6 `sources` paths in both files resolve. UJ titles are verbatim from PRD §2.2. The PRD §3 glossary terms are used consistently. Component names are identical across frontmatter, DESIGN.md Components and EXPERIENCE.md. EXPERIENCE.md token references (`{colors.age-1h}`, `{colors.age-24h}`, `{spacing.content-max}`, `{spacing.5}`, `{colors.hover}`) resolve in DESIGN.md. The FR-16 override is recorded, attributed to the memlog and applied the same way in Voice and Tone, State Patterns and UJ-1.

### Findings

- **medium** Strikethrough is committed in one spine and open in the other. DESIGN.md Components › Task row says "no strikethrough (Ledger render)", and the Do's/Don'ts forbid it, while EXPERIENCE.md Open Question 5 asks to confirm. A consumer cannot tell which is binding, and FR-11's example suggests strikethrough (EXPERIENCE.md Open Questions 5 vs DESIGN.md Components, Do's and Don'ts). *Fix:* close OQ5 as decided (it is a legitimate reading of FR-11's "e.g."), or mark the DESIGN.md rule provisional.
- **medium** Returning to "follow system" after a manual theme choice is Open Question 1, but it decides the toggle's state model and what goes into local storage. The memlog's "three-way effective behaviour" wording suggests it was meant to be settled (EXPERIENCE.md Open Questions 1; Component Patterns › Theme toggle). *Fix:* decide it, e.g. "clear the stored value when the chosen mode equals the system mode".
- **low** The FR-3 length safeguard deviates quietly: the PRD says the toast "explains why", but the spine reuses "Couldn't save new task." and leaves the difference as Open Question 3 rather than as a recorded override (EXPERIENCE.md Voice and Tone; State Patterns › Add rollback; Open Questions 3). *Fix:* record it as an override next to the FR-16 one, or add over-length copy.
- **low** Foundation says the glossary terms are "used exactly", but the spines add undeclared terms: *age bar*, *tick ring*, *held (new) task*, *row*, *list container*. They are consistent, but they are not defined anywhere (EXPERIENCE.md Foundation). *Fix:* add a short "Spine terms" line that defines these as UI names, not glossary terms.

## 8. Shape fit — strong

Checked: the DESIGN.md sections follow the canonical order exactly (Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts). EXPERIENCE.md has all 8 required defaults, plus Responsive & Platform (triggered by laptop and phone). The invented sections earn their place: *Age Nudge and New-Task Hold* is the product's core idea, and *Open Questions* is appropriate for a draft.

### Findings

- **low** Inspiration & Anti-patterns is absent, although the memlog records reference options and rejections: directions A and C (only C's check kept), unused palette variations, strikethrough rejected, and no row tint or celebration on completion (EXPERIENCE.md, missing section). *Fix:* add a 4–5 bullet section with what was taken from Ledger and from C, what was rejected, and why.
- **low** Key Flows sits before Responsive & Platform. The reference examples end with Key Flows (EXPERIENCE.md section order). *Fix:* move Responsive & Platform above Key Flows. This is optional.

## Mechanical notes

- **Token references:** 34 distinct `{path.to.token}` references across both files, 0 unresolved. Frontmatter token blocks that are never referenced: none of significance. All spacing levels 1–10 and all named spacing tokens are used.
- **Light/dark pairs:** 19/19 complete (12 UI tokens and 7 age stops per mode).
- **Contrast, recomputed:** every figure in the DESIGN.md table matches to 2 decimals. Unstated pairs worth adding: `border`/`bg` 1.41 light / 1.55 dark (see finding 2.3), `surface`/`bg` 1.10 / 1.08, `delete` on `divider` (delete-button hover background) 4.51 / 4.88, `text-muted` on `hover` (hovered completed row) 5.38 / 5.54, age stops on `bg` (phone full-bleed edge case) with a minimum of 3.66 light / 5.99 dark.
- **Typography frontmatter:** `age-label` uses `note` to carry CSS (`tabular-nums; right-aligned`), but the spec reserves `note` for platform conventions. `age-label` and `wordmark` have no `lineHeight`.
- **Values outside tokens:** 14px (twice), 22×18px, 16px, 20px, 1.5px and 1.6px strokes, the 600px breakpoint, the toast shadow rgba, and motion durations (200ms / 150ms / ~3s / ~5s / 300ms). The motion durations are acceptable because EXPERIENCE.md owns behaviour.
- **Frontmatter:** DESIGN.md has name, description, status, dates and sources. EXPERIENCE.md has name, status, dates, a `design:` link and sources. Both are `status: draft`. The index file `ux-todo-app.md` links both.
- **Sources:** all 6 paths resolve from the workspace (`../prd-todo-app/*`, `../brief-todo-app/*`, `../../../docs/*`).
- **Naming:** component names are identical across the frontmatter keys (kebab-case), the DESIGN.md prose and EXPERIENCE.md tables. The wordmark copy "Todo" matches in DESIGN.md, EXPERIENCE.md and the memlog.
- **Mermaid:** none present.
- **Memlog alignment:** every memlog (decision) and (override) entry is reflected in the spines. Memlog assumptions (arrow-key details, Esc) appear as [ASSUMPTION] tags, correctly.
