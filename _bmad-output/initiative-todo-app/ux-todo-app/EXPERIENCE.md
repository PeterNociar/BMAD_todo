---
name: Todo App
status: final
created: 2026-09-30
updated: 2026-09-30
design: ./DESIGN.md
sources:
  - ../prd-todo-app/prd-todo-app.md
  - ../prd-todo-app/addendum.md
  - ../brief-todo-app/brief-todo-app.md
  - ../brief-todo-app/addendum.md
  - ../../../docs/PRD.md
  - ../../../docs/bmad_exercise.md
---

# Todo App — Experience Spine

## Foundation

- **Form factor:** responsive web app. Laptop browser first; fully usable from 320 CSS px wide with no horizontal scroll or loss of function (NFR-3, WCAG 1.4.10). Phone use mirrors laptop use: same journeys, same single screen.
- **UI system:** none. The frontend framework is not chosen yet (architecture decides). No component library is assumed; every component below is custom and small.
- **Visual identity:** `DESIGN.md` (Ledger layout, Slate palette). This file owns behaviour. Two renders illustrate the look: [directions-1.html](.working/directions-1.html) (direction B: layout, laptop and phone) and [color-themes-1.html](.working/color-themes-1.html) (variation 1: palette, light and dark). Other panels in those files are rejected options. The finished key screens are in [mockups/](mockups/), linked per section below. If a mockup conflicts with DESIGN.md or EXPERIENCE.md, these documents win.
- **Terms** are the PRD §3 glossary, used exactly: task, task text, list, open task, completed task, overdue task, added time, completed time, age, age colour, age label, input, and toast.
- **Spine terms** (UI names, not glossary terms): *row* (a task on screen), *tick ring*, *age bar*, *held task* (a just-added task shown under the input for its hold of about 3 s), *unconfirmed task* (added in the UI, not yet confirmed by the server), *laptop* (the primary pointer supports hover, `hover: hover`), and *phone* (touch or another coarse pointer without hover).

## Information Architecture

One screen. No routes, menus, settings page, dialogs, or onboarding. The regions and ordering are rendered in [key-main-laptop.html](mockups/key-main-laptop.html) (header, input, list, open then completed), and the toast layer below a held task in [key-states.html](mockups/key-states.html), panel (d).

| Region | Contents | Notes |
|---|---|---|
| Header | Wordmark "Todo" (left), theme toggle (right) | Sticky with the input; quiet; not a navigation bar |
| Input | The one input | Sticky. Focused on load and after every task action on laptop (FR-2); on phone, see Interaction Primitives › Touch focus |
| Toast layer | Toasts, directly under the input | Placement per Component Patterns › Toast |
| List | Open tasks, then completed tasks | Scrolls with the page. Shows the empty state, the skeleton, or nothing (after a load failure) instead, when those apply |

**Ordering (FR-6):** open tasks by added time, oldest first (so overdue tasks are always on top), then completed tasks by completed time, most recent first. No sections, headers, or dividers between the two groups. Positions never change as time passes; only add, tick, untick, and delete move rows. The one temporary exception is the held task (see Age Nudge and New-Task Hold).

## Voice and Tone

Short, calm, plain. No exclamation marks, jokes, jargon, error codes, or stack traces (PRD §6, FR-18). Brand posture lives in `DESIGN.md` Brand & Style.

| Where | Copy (verbatim) |
|---|---|
| Wordmark | Todo |
| Input placeholder | What needs doing? |
| Empty state | Nothing waiting. Type a task above and press Enter. |
| Add failed (FR-16) | Couldn't save new task. |
| Add failed, text too long (FR-3) | Couldn't save new task. It's too long. |
| Tick / untick / delete failed | Couldn't update that task. It's back as it was. |
| List load failed (FR-17) | Couldn't load your tasks. (button: **Retry**) |
| Retry failed again (announced only) | Still couldn't load your tasks. [ASSUMPTION] |
| Loading | No text; skeleton rows only |
| Age label, open | now · 12m · 5h · 3d (format per FR-10) |
| Age label, completed | done now · done 12m · done 2h · done 1d |

Screen-reader labels (verbatim patterns, `X` = task text):

| Control / content | Label |
|---|---|
| Input (visually hidden label; the placeholder is not the name) | New task |
| Tick ring, open task | Mark "X" done |
| Tick ring, completed task | Mark "X" not done |
| Delete button | Delete "X" |
| Age label, open | added 5 hours ago (words for the same value as the visible label); "now" → added just now [ASSUMPTION] |
| Age label, completed | completed 2 hours ago; "done now" → completed just now |
| Success (polite status region) | Added: X · Marked done: X · Marked not done: X · Deleted: X |
| Theme toggle | Switch to dark theme / Switch to light theme (names the action, that is, the other mode) |

## Component Patterns

Behavioural. Visual specs live in `DESIGN.md` Components; names match.

| Component | Behavioural rules |
|---|---|
| Header | Not interactive apart from the theme toggle. The wordmark is text, not a link; the header is not a nav. Sticky with the input. |
| Input | Single line. Enter with non-empty trimmed text adds a task (FR-1, FR-3); empty or whitespace-only Enter does nothing, silently. Enter during IME composition never adds; "empty" means trimmed-empty with no active composition. Pasted line breaks become spaces, one task [ASSUMPTION]. After adding, it clears and keeps focus. No button, no counter, no length hint; autocomplete off, `enterkeyhint="enter"`. Usable while the list is loading (FR-5). |
| List | A list named "Tasks", one item per row, DOM order = visual order (held task first). Marked busy (`aria-busy`) while loading. Scrolls with the page under the sticky header and input; no inner scroll region. Ordering per Information Architecture (FR-6). Replaced by the empty state or skeleton when those apply. |
| Task row | Not itself clickable or focusable; its controls are. Shows tick ring, full task text (wrapped, plain text, never HTML, NFR-5), age label, delete button, and the age bar when open. |
| Age bar | Colour from the age gradient (`DESIGN.md` Colors), recomputed with the age label (see Age Nudge). Decorative for assistive tech; the age label carries the meaning. |
| Age label | Visible short form per FR-10, rounded down. Exposed to assistive tech as the words form only. |
| Tick ring | A button. Open task: activating it fills the ring and completes the task (FR-11); the row takes completed styling at once and slides to the top of the completed tasks. Completed task: the same control unticks it (FR-12); the ring empties and the row slides back to its original place, with its original age and age colour restored. Focus then returns to the input (FR-2); on phone, see Interaction Primitives › Touch focus. |
| Delete button | A button. One activation deletes permanently, with no confirmation and no undo (FR-13). The row disappears at once; rows below close the gap. Focus returns to the input; on phone, see Touch focus. When the primary pointer supports hover (`hover: hover`), the button is hidden and not clickable until the row is hovered or any control in the row has keyboard focus, but it stays in the Tab order. Otherwise, it is always visible at low emphasis. |
| Toast | See **Toast** below the table. |
| Theme toggle | See **Theme toggle** below the table. |
| Empty state | Shown in place of the list when there are no tasks, including right after the last delete (FR-8). Not interactive. Input keeps focus. Never shown while loading or after a load error until a load succeeds. |
| Skeleton row | Shown in place of the list while it first loads (FR-5). Static, no text, hidden from assistive tech. [ASSUMPTION] Only shown if loading takes longer than about 300 ms, to avoid a flash. |
| Focus ring | Keyboard focus only (`:focus-visible`), on every interactive control except the input, which uses its focused border. |

**Toast**

- Appears under the input, over the top of the list. Every toast (transient or load-failure) sits below any held task, never over it.
- Never takes focus and never covers the input (FR-18).
- At most two are visible; a new one drops the oldest (the load-failure toast is never dropped [ASSUMPTION]). The newest sits nearest the input [ASSUMPTION].
- Transient toasts auto-dismiss after about 5 s, pause while hovered or focused, and have a close ×.
- The load-failure toast has Retry only, no ×, and stays until the list loads (FR-17).
- Every toast is an error toast and shows the error icon before its message (semantics in Accessibility Floor › Error icon).
- Placement [ASSUMPTION]: when nothing is held, the toast's top edge is where the list's top edge would be; otherwise it sits 8 px below the held row. Stacked toasts are 8 px apart.

**Theme toggle**

- One two-state button showing the sun/moon pill.
- With nothing stored, the app follows the system setting; activating switches to the other mode and stores it in this browser (local storage, no server).
- From then on it flips light/dark only; there is no in-app way back to following the system (clearing site data resets it).
- [ASSUMPTION] Live system changes are followed while nothing is stored; the stored theme is applied before first paint, with no flash; if storage is unavailable, the choice lasts for the session.
- Pointer activation returns focus to the input; keyboard activation keeps focus on the toggle [ASSUMPTION].

## State Patterns

Empty, loading, load failure, held task with an action-error toast, and add failure are rendered in [key-states.html](mockups/key-states.html) (a)–(e).

| State | Surface | Treatment |
|---|---|---|
| Cold load | List | Input usable immediately; focused on laptop (phone: see Interaction Primitives › Touch focus). Skeleton rows in the list area until data arrives. |
| Empty | List | Empty-state copy; input focused (FR-8). Never shown while loading or after a load failure. |
| Load error | List + toast | Persistent toast "Couldn't load your tasks." with Retry, no × (FR-17). List area stays hidden: no skeleton, no empty state. Retry shows the skeleton again. On success, the toast closes automatically and the list renders; on failure, the toast stays. No auto-retry [ASSUMPTION]. |
| Add while loading or after load error | Input + list | The add is sent normally and shows as the held task. During loading it merges into sorted order when the list arrives (no duplicates, nothing dropped); its hold does not end before the list renders [ASSUMPTION]. After a load error, the list, including these tasks, stays hidden until Retry succeeds; the held task still shows for its hold [ASSUMPTION]. If the save fails, add rollback applies. |
| Add rollback | Input + list + toast | The unconfirmed task's row is removed; toast "Couldn't save new task." (or "…It's too long." for the FR-3 safeguard). Override of FR-16: the toast never echoes the task text. The failed text returns to the input only when the input is empty. Accepted consequences of not echoing the text: if the user has already typed new text, it is kept and the failed text is gone; if several adds fail, only the first failed text returns and later ones show only the toast; a failed task the user already ticked or deleted returns no text. |
| Unconfirmed task acted on | Row | Tick or delete on an unconfirmed task applies at once in the UI and is sent once the add is confirmed. If the add fails, the task disappears with "Couldn't save new task." and no text returns to the input. |
| Action error | Row + toast | Tick, untick, or delete that the server rejects: the row returns to its last server-confirmed state, positioned per FR-6 (addendum); toast "Couldn't update that task. It's back as it was." A deleted row reappears where it was. Rapid tick/untick: last user intent wins; requests are applied in order. |
| Held task | List top | See Age Nudge and New-Task Hold. |
| Overdue transition (live) | Row | When an open task crosses 24 hours with the page open, within 60 s its bar becomes the overdue colour and its label becomes "1d" (FR-7, FR-9). No motion, no position change, no announcement, no focus change. |
| Clock drift | Row | A timestamp that appears to be in the future shows "now" and the fresh colour, never a negative age (FR-15). |

## Interaction Primitives

**Keyboard** (NFR-1: add, tick, untick, and delete all keyboard-operable)

- Tab order follows the DOM: theme toggle (before the input; reached with Shift+Tab), input, toast actions when present [ASSUMPTION], then per row: tick ring, delete button.
- Space or Enter activates the focused control. After any task action, focus returns to the input (FR-2) without scrolling the page (the input is sticky).
- **Shortcuts:** Tab is the primary, documented path; arrow keys are an accelerator. Up Arrow / Down Arrow move focus between rows, computed from the current DOM order at keypress. Down Arrow from the input moves focus to the first row [ASSUMPTION]. Up Arrow from the first row, or Esc from any row, returns focus to the input. No single-character shortcuts (WCAG 2.1.4). Arrow keys keep the control type: from a tick ring to the next row's tick ring, from a delete button to the next row's delete button [ASSUMPTION].
- **Focus safety net (laptop):** whenever the focused element disappears (a toast closes by any means, including auto-dismiss; a row re-renders or is removed; Retry succeeds), focus goes to the input.
- Focus is never stolen while typing: not by toasts, live age updates, the held-task slide, or list load (FR-2).
- **Type-to-focus (laptop):** when no control has focus (focus on the page body, for example after clicking blank space or returning to the tab), typing a printable character without Ctrl/Cmd/Alt moves focus to the input and inserts that character. Clicking blank space never moves focus, so selecting text and Ctrl/Cmd+C keep working. Inactive whenever any control (row control, toast action, theme toggle) has focus. Flag for the build-time accessibility check: auditors may read this against WCAG 2.1.4; it is scoped to the no-focus state only.

**Laptop vs phone**

- **Touch focus:** on phone, no autofocus on load and no focus return to the input after tick or delete, so the soft keyboard does not pop up. This deviates from FR-2's literal wording on phone only; laptop keeps FR-2 exactly.
- Hit areas: at least 24×24 CSS px everywhere: the delete × and toast close × are 24×24 boxes around a 12 px glyph; the tick ring is 16 px visually. On phone, the tick ring and delete hit areas span the full row height without changing visual size, clamped to the row box so they never reach a neighbouring row. They are also widened to at least 24 px, using negative margins into the row gap and padding, so the layout does not move [ASSUMPTION]. Annotated in [key-main-phone.html](mockups/key-main-phone.html) (360 light frame).

**Motion**

- Rows slide to their new position in about 200 ms on tick, on untick, and when a held task settles, including when a new add ends its hold early [ASSUMPTION: ease-out].
- Delete: the row goes at once; rows below slide up with the same timing [ASSUMPTION].
- Toasts fade in and out, about 150 ms [ASSUMPTION].
- `prefers-reduced-motion: reduce`: every move and fade is instant.
- Feedback for every action within 100 ms (NFR-2); motion never delays the state change itself.

## Responsive & Platform

Laptop column: [key-main-laptop.html](mockups/key-main-laptop.html). Phone at 360 px and 320 px (touch, no autofocus, delete always visible, hit areas annotated): [key-main-phone.html](mockups/key-main-phone.html).

| Aspect | Laptop | Phone (320 px+) |
|---|---|---|
| Layout | Centred column, max `{spacing.content-max}` | Full width; header and input inset `{spacing.5}`; list full-bleed |
| Focus (FR-2) | Input focused on load and after every action | See Interaction Primitives › Touch focus |
| Delete button | Revealed on row hover or focus within the row; not clickable while hidden | Always visible, low emphasis |
| Hover states | Row tint `{colors.hover}` | None |
| Shortcuts | Arrow keys and Esc, as above | Not relied on; soft keyboard Enter adds a task |

Width breakpoint and pointer capability are independent: delete visibility follows primary-pointer capability (`hover: hover`); layout follows width [ASSUMPTION: 600 px, see `DESIGN.md` Layout & Spacing]. No native app, no offline mode (PRD §7).

## Age Nudge and New-Task Hold

- **Live ages (FR-7):** age labels and age colours recompute on a timer (the addendum suggests 30 s) and immediately when the tab becomes visible, the window regains focus, the page is restored from the back/forward cache, or the timer sees a wall-clock gap much longer than its interval (wake from sleep), so nothing is more than 60 s stale. Label and colour come from one `now` snapshot per recompute. Order never changes on the timer.
- **Colour:** per the gradient in `DESIGN.md` Colors, from `{colors.age-1h}` to `{colors.age-24h}` (and their `-dark` twins). Completed tasks have no bar.
- **New-task hold (FR-4):** after Enter, the new task appears as the first row (first in DOM order too) directly under the sticky input, with the fresh bar and "now", visible regardless of scroll. About 3 s later it slides down to its sorted place (the bottom of the open tasks). The page does not scroll to follow it [ASSUMPTION]. No extra highlight during the hold [ASSUMPTION]. Only the newest add is held: each new add ends the previous task's hold at once, and that task slides to its sorted place. If a control in the held row has keyboard focus when the hold ends, the row slides with focus on it and is scrolled into view below the sticky header and input.
- If the held task is ticked or deleted during the hold, the action applies immediately and the hold ends [ASSUMPTION]. If it is still unconfirmed, see State Patterns › Unconfirmed task acted on. If its save fails, add rollback removes it.

## Accessibility Floor

Behavioural. Visual contrast lives in `DESIGN.md` Colors.

- **WCAG 2.1 AA**, zero critical axe-core / Lighthouse violations (NFR-1, exercise).
- Page semantics [ASSUMPTION]: `lang="en"`, title "Todo", a header and a main landmark, and the wordmark as a visually unchanged level-1 heading, so axe best-practice rules pass.
- Every control has an accessible name (labels in Voice and Tone); the input's is the visually hidden label "New task". The tick ring's label changes with state.
- **Error icon:** the toast's circle-exclamation icon is decorative (`aria-hidden="true"`, no accessible name); the message text carries the meaning and is what the live region announces. The icon is the non-colour cue for sighted users, so the red tint is never the only signal (1.4.1).
- **Live regions:** one polite status region announces the success messages (verbatim in Voice and Tone; after the last delete, the delete message is followed by the empty-state text, the same text a screen reader meets on an initially empty list) and the action-error and add-failure toasts; the load-failure toast is announced in an alert region [ASSUMPTION on politeness levels]. Both regions (status and alert) exist, empty, from first paint. Age labels are never inside a live region; live age changes and row moves (including the held task settling) are not announced.
- No information by colour alone: age colour is always paired with the age label; completion is shown by the filled check and the "done" label, not just muted colour.
- Keyboard focus visible on every control (`DESIGN.md` focus ring); focus order matches visual order. A focused row control is never hidden under the sticky header, input, or toasts (SC 2.4.11) [ASSUMPTION: `scroll-margin-top` equal to the combined height of the sticky header, input, and toasts].
- Reflow: no horizontal scroll or loss of function from 320 CSS px (SC 1.4.10).
- Task text rendered as text only (NFR-5); it reads normally to screen readers.
- Theme follows the system until the user picks a theme; both modes meet the same contrast floor.
- Reduced motion honoured everywhere (see Motion).

## Key Flows

### UJ-1. Peter jots down a task mid-meeting.

1. A colleague asks Peter to check a setting later. Peter switches to the already-open tab.
2. The cursor is already in the input (FR-2). Peter types "check SSO timeout setting".
3. He presses Enter. The input clears and keeps focus.
4. The task appears directly under the input with a green bar and "now", even though older tasks fill the screen (FR-4).
5. **Climax:** the task is on screen and the input is empty and ready; Peter is back in the meeting in under 5 seconds (SM-1).
6. About 3 s later the task slides down to the bottom of the open tasks.

Failure: the save fails. The task disappears, a toast under the input says "Couldn't save new task.", and the text is back in the empty input, so Peter just presses Enter again. If Peter had already started typing another task, that text stays and the failed text is not restored.

### UJ-2. Peter clears the backlog over coffee.

1. Peter opens the app in the morning. Skeleton rows flash briefly, then the list.
2. At the top are two tasks with red bars, "2d" and "1d", above a handful of green-to-amber ones.
3. He clicks the empty ring on the first red task. It fills, the text mutes, and the row slides down to the top of the completed tasks, showing "done now". Focus is back in the input.
4. The second task is no longer relevant. He hovers it and clicks the ×; it is gone at once, with no confirmation.
5. **Climax:** the top of the list is no longer red; nothing overdue is waiting.

Keyboard variant: Down Arrow from the input reaches the first row's ring, Space ticks it, and focus is back in the input; Tab reaches a row's × and Enter deletes it. On a phone the same taps work with the × always visible, and the keyboard stays down because focus does not return to the input.

Failure: Peter ticks the wrong task. He clicks the filled check; it empties and the row slides straight back to its place near the top, still red, still showing its original age. If the server rejects any of these actions, the row returns to how it was and a toast says "Couldn't update that task. It's back as it was."

### UJ-3. A task goes overdue while the tab is open.

1. Peter leaves the tab open all day. A task added yesterday afternoon shows "23h" with a red-orange bar near the top.
2. The page recomputes ages every 30 s and when Peter returns to the tab.
3. The task crosses 24 hours.
4. **Climax:** without a refresh, within a minute, its bar turns overdue red and its label changes to "1d". It does not move: it is already near the top, because open tasks are listed oldest first.
5. Nothing is announced and focus stays where it was.

Failure: the laptop sleeps through the crossing. On wake the page detects the gap and the bar and label update at once.

## Inspiration & Anti-patterns

- **Lifted from Ledger (direction B):** compact rows, hairline dividers, a right-aligned monospace age column, and age colour as a thin left bar only.
- **Lifted from direction C:** the round filled check for completed tasks, nothing else.
- **Rejected — strikethrough on completed tasks** (FR-11's example): muted text plus the filled check shows completion calmly and keeps text readable.
- **Rejected — direction A and the other palette variations,** and age colour on text, labels, or row tints.
- **Rejected — a `/` jump-to-input shortcut:** a single-character shortcut fails WCAG 2.1.4; Esc and Up Arrow already return to the input.

## Open Questions

Owner: `bmad-architecture` (data sync; UX has no preference beyond FR-2, FR-7, FR-15, and SM-4).

1. **Client clock ahead of the server** (validation Medium). Compute ages against a server time offset, or accept that fresh tasks can briefly look older? The FR-15 clamp covers only the client-behind case.
2. **Refresh while an add is in flight** (validation Medium, SM-4). Warn before unload, persist pending adds and replay them, or accept the loss?
3. **Refetch after a long gap** (validation Medium, wake from sleep). After sleep or a long-hidden tab, should the app silently refetch the list (and if so, how does it merge without moving focus), or only recompute ages?
