---
name: Todo App
description: Calm, minimal single-screen todo list. Cool Slate neutrals on a compact Ledger layout; the age colour is the only strong colour on screen.
status: final
created: 2026-09-30
updated: 2026-09-30
sources:
  - ../prd-todo-app/prd-todo-app.md
  - ../prd-todo-app/addendum.md
  - ../brief-todo-app/brief-todo-app.md
  - ../brief-todo-app/addendum.md
  - ../../../docs/PRD.md
  - ../../../docs/bmad_exercise.md
colors:
  # Component tokens name the light token. Consumers emit one CSS variable per light name
  # and assign the `-dark` twin's value to it under the dark theme.
  # Light (Slate, as rendered)
  bg: '#F2F4F7'
  surface: '#FFFFFF'
  hover: '#F4F6F9'
  text-primary: '#18202C'
  text-secondary: '#475263'
  text-muted: '#5B6676'
  divider: '#DEE3EA'
  border: '#C9D0DA'           # dashed empty-state box (decorative)
  accent: '#4A5E7C'
  check-ring: '#7D8A9C'
  check-fill: '#4A5E7C'
  delete: '#5B6676'
  shadow-toast: '#18202C1F'   # text-primary at 12% alpha
  # Error toast (variant C in .working/toast-variants-1.html)
  error-bg: '#FCECEB'         # color-mix(in oklab, age-24h 10%, surface)
  error-border: '#F3C7C3'     # color-mix(in oklab, age-24h 30%, surface); decorative
  error-icon: '#BA2B2E'       # oklch(0.52 0.18 25)
  # Light age gradient stops (reference samples; the formula in Colors is normative)
  age-1h: '#249057'
  age-3h: '#428D42'
  age-6h: '#638718'
  age-12h: '#8F7506'
  age-18h: '#AE5F01'
  age-23h: '#C44231'
  age-24h: '#C43F3E'
  # Dark (Slate, as rendered)
  bg-dark: '#0E131A'
  surface-dark: '#151B24'
  hover-dark: '#1B222D'
  text-primary-dark: '#E4E9EF'
  text-secondary-dark: '#AAB4C2'
  text-muted-dark: '#8E99A8'
  divider-dark: '#242C37'
  border-dark: '#2E3744'
  accent-dark: '#98ACC8'
  check-ring-dark: '#667385'
  check-fill-dark: '#98ACC8'
  delete-dark: '#8E99A8'
  shadow-toast-dark: '#00000073'   # black at 45% alpha
  error-bg-dark: '#382A30'         # color-mix(in oklab, age-24h-dark 18%, surface-dark)
  error-border-dark: '#643B3E'     # color-mix(in oklab, age-24h-dark 40%, surface-dark); decorative
  error-icon-dark: '#F2716A'       # oklch(0.70 0.16 25)
  age-1h-dark: '#55C483'
  age-3h-dark: '#6EC06D'
  age-6h-dark: '#8FB74A'
  age-12h-dark: '#C19E00'
  age-18h-dark: '#E28120'
  age-23h-dark: '#EB6D5A'
  age-24h-dark: '#EA6A64'
typography:
  wordmark:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.35'
    letterSpacing: -0.01em
  input:
    fontFamily: 'Inter'
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.35'
  body:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.35'
  age-label:
    fontFamily: 'JetBrains Mono'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.35'
rounded:
  sm: 4px
  md: 6px
  full: 9999px
spacing:
  '1': 2px
  '2': 4px
  '3': 8px
  '4': 10px
  '5': 12px
  '6': 18px
  '7': 24px
  '8': 32px
  '9': 36px
  '10': 48px
  row-inset-left: 15px
  age-bar: 3px
  content-max: 640px
  age-column-min: 9ch          # fits the longest label, "done 100d"
  gap-input-list-phone: 14px
  empty-state-pad-y: 14px
  icon: 16px                   # tick ring, toggle icons, error icon
  delete-box: 24px             # delete x and toast close x hit box; 12px glyph unchanged
  toast-stack-gap: 8px         # [ASSUMPTION] between stacked toasts (= spacing.3)
  breakpoint-compact: 600px
components:
  header:
    wordmark: '{typography.wordmark}'
    color: '{colors.text-primary}'
    background: '{colors.bg}'
    position: sticky (with the input)
    gapBelow: '{spacing.5}'
  theme-toggle:
    border: '1px solid {colors.divider}'
    radius: '{rounded.full}'
    padding: '{spacing.1}'
    segmentSize: 22px x 18px
    segmentPadding: 1px 3px      # [ASSUMPTION] icon inset inside a segment
    segmentGap: 0                # [ASSUMPTION] segments touch
    segmentActiveBackground: '{colors.surface}'
    segmentActiveIcon: '{colors.text-primary}'
    segmentIcon: '{colors.text-muted}'
  input:
    background: '{colors.surface}'
    foreground: '{colors.text-primary}'
    placeholder: '{colors.text-muted}'
    border: '1px solid {colors.check-ring}'
    borderFocused: '1px solid {colors.accent} + 1px {colors.accent} ring'
    caret: '{colors.accent}'
    radius: '{rounded.md}'
    padding: '{spacing.4} {spacing.5}'
    type: '{typography.input}'
    gapBelow: '{spacing.6}'
  list:
    background: '{colors.surface}'
    border: '1px solid {colors.divider}'
    radius: '{rounded.md}'
  task-row:
    padding: '{spacing.3} {spacing.5} {spacing.3} {spacing.row-inset-left}'
    gap: '{spacing.4}'
    divider: '1px solid {colors.divider}'
    hoverBackground: '{colors.hover}'
    text: '{colors.text-primary}'
    textCompleted: '{colors.text-muted}'
    type: '{typography.body}'
  age-bar:
    width: '{spacing.age-bar}'
    color: 'age gradient ({colors.age-1h} to {colors.age-24h})'
  age-label:
    type: '{typography.age-label}'
    color: '{colors.text-secondary}'
    colorCompleted: '{colors.text-muted}'
    minWidth: '{spacing.age-column-min}'
  tick-ring:
    size: '{spacing.icon}'
    ringOpen: '1.5px solid {colors.check-ring}'
    fillDone: '{colors.check-fill}'
    glyphDone: '{colors.surface}'
    radius: '{rounded.full}'
  delete-button:
    size: '{spacing.delete-box}'
    padding: '6px'               # 24px box − 12px glyph, centred
    glyph: 12px, 1.6px stroke
    icon: '{colors.delete}'
    radius: '{rounded.sm}'
    hoverBackground: '{colors.divider}'
  toast:
    # Every toast is an error toast (action-error, add-failure, load-failure)
    background: '{colors.error-bg}'
    foreground: '{colors.text-primary}'
    icon: '{colors.error-icon}'        # 16px circle-exclamation before the message
    iconSize: '{spacing.icon}'
    action: '{colors.accent}'          # [ASSUMPTION] Retry: accent text, body weight
    close: '{components.delete-button.glyph} in {colors.accent}, box {spacing.delete-box}'   # [ASSUMPTION]
    border: '1px solid {colors.error-border}'
    shadow: '0 4px 16px {colors.shadow-toast}'
    radius: '{rounded.md}'
    padding: '{spacing.4} {spacing.5}'
    gap: '{spacing.4}'
    type: '{typography.body}'
    offsetTop: '{components.input.gapBelow}; {spacing.3} below a held row'   # [ASSUMPTION]
    stackGap: '{spacing.toast-stack-gap}'   # [ASSUMPTION]
  empty-state:
    background: '{colors.surface}'
    foreground: '{colors.text-muted}'
    border: '1px dashed {colors.border}'
    radius: '{rounded.md}'
    padding: '{spacing.empty-state-pad-y} {spacing.5}'
    type: '{typography.body}'
  skeleton-row:
    bar: '{colors.hover}'
    barHeight: one line of {typography.body}    # [ASSUMPTION] 14px × 1.35
    barWidths: 62% / 44% / 53%                   # [ASSUMPTION] rows 1–3
    barRadius: '{rounded.sm}'                    # [ASSUMPTION]
    padding: '{components.task-row.padding}'
    divider: '1px solid {colors.divider}'
  focus-ring:
    outline: '2px solid {colors.accent}'
    offset: '{spacing.1}'
---

## Brand & Style

A helpful tool, never a hindering one. The Todo App is a quiet ledger for small tasks: calm, minimal, fast, and clutter-free. It should feel finished, not like a demo (PRD §6), and it earns that through precision rather than decoration.

If a mockup conflicts with DESIGN.md or EXPERIENCE.md, these documents win. The visual direction is **Ledger** (direction B in [directions-1.html](.working/directions-1.html); directions A and C in the same file are rejected): cool neutrals, compact rows, hairline dividers, and a right-aligned monospace age column that scans like numbers in a table. From direction C it borrows one thing only, the round filled check for completed tasks. The palette is **Slate** (variation 1 in [color-themes-1.html](.working/color-themes-1.html); the other variations are rejected), taken as rendered in light and dark. The finished key screens are in [mockups/](mockups/) (linked per section below).

Everything on screen is grey-blue except one signal: the **age colour**, a 3px bar on the left edge of each open task. The eye sweeps that column of bars to see what is going stale. Nothing else competes with it.

The one permitted exception is the **error tint** on toasts (a soft red wash, a pale red border, and a small red icon; variant C in [toast-variants-1.html](.working/toast-variants-1.html), chosen over a plain toast and a red left edge). It is an accepted deviation from PRD §6 ("age colour the only strong colour"), kept deliberately soft: tinted, not saturated. Toasts never carry a red left edge, which would read as an overdue age bar.

## Colors

Two modes, light and dark. The app follows the system setting by default; an in-app toggle overrides it (behaviour in EXPERIENCE.md). Every light token has a dark twin with the same name plus `-dark` (for example, `bg` and `bg-dark`). Component tokens name only the light token; the consumer swaps in the twin under the dark theme (one CSS variable per light name).

- **Background (`bg`)** is the page. **Surface** is the list, the input, and the empty state (toasts use `{colors.error-bg}`). Surface on background is a tonal step, not a shadow. Background also backs the sticky header and input, so rows scroll beneath them.
- **Hover** tints a task row on laptop. Throughout this document, "laptop" means a hover-capable primary pointer (`hover: hover`) and "phone" means touch. Hover also fills skeleton bars.
- **Text primary** is task text and the wordmark. **Text secondary** is the age label on open tasks. **Text muted** is completed task text, completed age labels, the placeholder, and the empty-state message.
- **Divider** is the hairline between rows and around the list. It is decorative and carries no information.
- **Border** draws the dashed empty-state box, a decorative boundary; the empty state is not interactive. The border value comes from the Slate render.
- **Error bg / error border / error icon** are the toast's tint, outline, and icon (every toast reports an error). Error bg and error border are the overdue hue mixed into surface; error icon is a dedicated, deeper error red. The border is decorative: the toast is identified by its text, shadow, and icon. These tokens are never used outside toasts.
- **Accent** (muted slate-blue, close to the text hue) is the focus ring, the input caret, the focused input border, and toast actions (Retry, close ×). It is never used for decoration, never as a fill behind text, and never for age. **Check fill** uses the same value for the filled check of a completed task. **Check ring** is the empty ring of an open task and the unfocused input border (3:1 on `bg`, WCAG 1.4.11). **Delete** is the delete icon.
- **Shadow toast** is the only shadow colour, used by the toast (see Elevation & Depth).

### Age gradient

The age colour exists only on open tasks (FR-9). Completed tasks have none. The age bar is never the only cue: the age label always carries the same information (FR-10, NFR-1).

- Age under 1 hour: fresh endpoint, `{colors.age-1h}`. Age 24 hours or more (overdue): `{colors.age-24h}`.
- Between 1h and 24h: `t = (hours − 1) / 23`, linear in time. Interpolate in **OKLCH**: lightness (L) and chroma (C) linear, hue decreasing **155 → 25** (green → amber → orange → red, the shorter arc).
- Endpoints. Light: fresh `oklch(0.58 0.13 155)`, overdue `oklch(0.56 0.17 25)`. Dark: fresh `oklch(0.74 0.14 155)`, overdue `oklch(0.68 0.16 25)`.
- **The formula is normative:** the age colour is computed from it. Out-of-gamut chroma is reduced; L is nudged only where a colour would drop below 3:1 on `surface` or `hover`. The stored stops are reference samples at 1h, 3h, 6h, 12h, 18h, 23h, and 24h+ for review and tests, not an interpolation table.
- The light mid-stops (olive `#638718`, mustard `#8F7506`) and the coral-leaning dark reds (`age-23h-dark`, `age-24h-dark`) are kept as rendered in the Slate render, not adjusted toward pure hues.

| Age | Light | Dark |
|---|---|---|
| < 1h (now) | `#249057` | `#55C483` |
| 3h | `#428D42` | `#6EC06D` |
| 6h | `#638718` | `#8FB74A` |
| 12h | `#8F7506` | `#C19E00` |
| 18h | `#AE5F01` | `#E28120` |
| 23h | `#C44231` | `#EB6D5A` |
| ≥ 24h (overdue) | `#C43F3E` | `#EA6A64` |

### Contrast (WCAG 2.1 AA)

Every ratio below was verified in the render and recomputed in review.

| Pair | Light | Dark | Min |
|---|---|---|---|
| text-primary on surface | 16.38 | 14.17 | 4.5 |
| text-secondary on surface / hover | 7.91 / 7.31 | 8.25 / 7.63 | 4.5 |
| text-muted on bg / surface (also placeholder) | 5.28 / 5.82 | 6.45 / 5.99 | 4.5 |
| text-muted on hover (hovered completed row) | 5.38 | 5.54 | 4.5 |
| accent (focus ring) on bg / surface | 5.99 / 6.60 | 8.05 / 7.47 | 3.0 |
| text-primary on error-bg (toast message) | 14.31 | 11.15 | 4.5 |
| accent on error-bg (Retry, close ×) | 5.76 | 5.88 | 4.5 |
| error-icon on error-bg | 5.28 | 4.76 | 3.0 |
| check-ring on surface / hover | 3.51 / 3.24 | 3.59 / 3.32 | 3.0 |
| check-ring on bg (unfocused input border) | 3.18 | 3.87 | 3.0 |
| check-fill on surface; glyph on fill | 6.60 | 7.47 | 3.0 |
| delete on hover (row tint) | 5.38 | 5.54 | 3.0 |
| delete on divider (button hover) | 4.51 | 4.88 | 3.0 |
| age stops on surface (range) | 4.04–5.09 | 5.55–7.92 | 3.0 |
| age stops on hover (range) | 3.73–4.70 | 5.14–7.32 | 3.0 |
| age stops on bg (phone full-bleed edge, min) | 3.66 | 5.99 | 3.0 |

Decorative, no minimum: divider 1.29 / 1.23, border on bg 1.41 / 1.55, error-border (toast outline), surface on bg 1.10 / 1.08.

The age bar is non-text UI (3:1).

## Typography

Two webfonts, so the product looks identical across devices: **Inter** for all UI text and **JetBrains Mono** for age labels. The font download must never delay the input being usable [ASSUMPTION: `font-display: swap`, falling back to the system stacks `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` and `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`]. Both fonts are preloaded and fallbacks are metric-matched, so rows do not jump when the webfont swaps in.

Sizes are written in px at a 16px root; implement them in rem so the user's font size is honoured (WCAG 1.4.4). Rows, toasts, and the empty state have no fixed heights, so user text-spacing overrides never clip content (WCAG 1.4.12).

| Role | Token | Use |
|---|---|---|
| Wordmark | `{typography.wordmark}` | The word "Todo" in the header. Tiny and quiet. |
| Input | `{typography.input}` | Typed text and placeholder. One step larger than rows. |
| Body | `{typography.body}` | Task text, toast text, empty state. |
| Age label | `{typography.age-label}` | "now", "12m", "5h", "3d", "done 2h". Tabular figures (`font-variant-numeric: tabular-nums`), right-aligned, so the digits line up. |

No headings, no display sizes, no all-caps, no bold inside task text.

## Layout & Spacing

One column, one screen: header, input, list. Laptop layout at 1024px: [key-main-laptop.html](mockups/key-main-laptop.html); phone layout at 360px and 320px: [key-main-phone.html](mockups/key-main-phone.html).

- **Sticky top:** header and input stay pinned to the top on every width, on a `{colors.bg}` backing; toasts and the held new task stay visible directly below the input regardless of scroll (held task and behaviour in EXPERIENCE.md). The list scrolls with the page.
- **Laptop:** content column max `{spacing.content-max}`, centred. Page padding `{spacing.9}` top, `{spacing.8}` sides, `{spacing.10}` bottom. Header to input `{spacing.5}`; input to list `{spacing.6}`.
- **Phone (320px and up, WCAG 1.4.10):** page padding `{spacing.9}` top, 0 sides, `{spacing.7}` bottom. Header and input inset `{spacing.5}` from the screen edge; input to list `{spacing.gap-input-list-phone}`. The list goes full-bleed: no side borders, no radius, top and bottom hairlines only. [ASSUMPTION] The layout switches below `{spacing.breakpoint-compact}` viewport width; the Ledger render shows only 720px and 360px.
- **Task row:** padding `{spacing.3}` vertical, `{spacing.5}` right, `{spacing.row-inset-left}` left (the 3px age bar plus 12px). Row contents, left to right, `{spacing.4}` apart: tick ring, task text (flexible), age label (min `{spacing.age-column-min}`, enough for "done 100d", right-aligned), delete button.
- **Task text wraps** on every width, including long URLs (break anywhere), and never causes horizontal scroll (FR-3, NFR-3). The Ledger laptop render truncates with an ellipsis; the PRD wins.
- Density is deliberate: rows don't breathe, the input does.

## Elevation & Depth

Flat. Hierarchy comes from the background/surface tonal step and hairlines, never from shadows. The one exception is the toast, which overlays the top of the list and needs to read as floating: `0 4px 16px {colors.shadow-toast}` (`{colors.shadow-toast-dark}` in dark).

## Shapes

Small, consistent corners: `{rounded.md}` (6px) for the input, the list container, toasts, and the empty state; `{rounded.sm}` (4px) for the delete button's hover background. `{rounded.full}` is reserved for circles and pills that mean something: the tick ring, the filled check, and the theme toggle. Rows themselves are square; the list container clips them.

## Components

Header, input, list, rows, tick ring, age bar and label, and the delete button (hidden, hover-revealed, and phone states) are rendered in [key-main-laptop.html](mockups/key-main-laptop.html) and [key-main-phone.html](mockups/key-main-phone.html). [key-states.html](mockups/key-states.html) renders the empty state (a), the skeleton (b), and toasts (c)–(e). Dimensions, paddings, and exact values are in the frontmatter; each bullet gives the component's role, its states, and any rationale.

- **Header** — the wordmark "Todo" left in `{colors.text-primary}`, the theme toggle right. Nothing else. Sticky with the input, on `{colors.bg}`.
- **Theme toggle** — a small pill holding a sun and a moon segment (stroke icons). The segment for the active mode (system or chosen) is filled `{colors.surface}` with an inset divider hairline and a `{colors.text-primary}` icon; the other segment's icon is `{colors.text-muted}`. No hover state of its own [ASSUMPTION]. Under `forced-colors: active` the active segment gets a `CanvasText` outline, since the fill alone does not survive.
- **Input** — full content width, `{colors.surface}`. Focused (the default on laptop, where the input holds focus at rest): `{colors.accent}` border plus an accent ring, accent caret. Unfocused: `{colors.check-ring}` border. Placeholder in `{colors.text-muted}`.
- **List** — `{colors.surface}` container with a `{colors.divider}` border; rows separated by divider hairlines.
- **Task row** — padding and contents in Layout. Open: text in `{colors.text-primary}`, age bar visible. Completed: text and age label in `{colors.text-muted}`, no age bar, no row tint, **no strikethrough** (Ledger render). Hover (laptop): background `{colors.hover}`, delete button visible. [ASSUMPTION] Tick ring, age label, and delete button align to the first line of wrapped text: each is offset by (first line box − its own height) / 2, that is, about +1.45px for the 16px ring, +1.35px for the 12px age label, and −2.55px top and bottom for the 24px delete box (the negative bottom margin keeps the row height set by the text).
- **Age bar** — full-height strip on the row's left edge in the current age colour. Absent on completed rows.
- **Age label** — `{typography.age-label}`, right-aligned in a column with a fixed minimum width. Open: `{colors.text-secondary}`. Completed: `{colors.text-muted}`, prefixed "done ".
- **Tick ring** — circle. Open: empty `{colors.check-ring}` ring. Completed: the filled check, a solid `{colors.check-fill}` disc with a check glyph in `{colors.surface}`. No hover state of its own; the row tint is the hover cue. Drawn as SVG so the filled check stays visible in forced-colors mode.
- **Delete button** — a × glyph in `{colors.delete}`, centred in its hit box. Hover: `{colors.divider}` background. Hidden state (laptop; the row is neither hovered nor contains focus): opacity 0 and not clickable, but still in the Tab order; revealed at full opacity when the row is hovered or contains focus. On phone it is always visible, at full opacity in `{colors.delete}` [ASSUMPTION]. The Ledger render used 60% opacity, which falls below 3:1 on the surface; the already-muted token keeps the emphasis low instead.
- **Toast** — every toast reports an error (action error, add failure, load failure); all share one treatment. *Placement:* floats directly under the input, overlaying the top of the list, at input width [ASSUMPTION]. Its top edge sits where the list's top edge would be when no task is held, and just below the held row otherwise (see EXPERIENCE.md); stacked toasts sit a small gap apart [ASSUMPTION]. *Treatment:* `{colors.error-bg}` fill, `{colors.error-border}` outline, and the toast shadow; no red left edge. *Content,* left to right: a circle-exclamation icon in `{colors.error-icon}`, aligned to the first text line; the message in `{colors.text-primary}` body text; then the actions. Retry is `{colors.accent}` text at body weight; close × is the delete glyph in `{colors.accent}` in the delete button's hit box [ASSUMPTION].
- **Empty state** — one line of `{colors.text-muted}` body text in a `{colors.surface}` box with a dashed `{colors.border}` outline. Replaces the list container.
- **Skeleton row** — [ASSUMPTION] three static rows inside the list container. Each has task-row padding and holds a single `{colors.hover}` bar, one body line tall, at a different width per row. No tick ring, age label, or delete button. No shimmer.
- **Focus ring** — [ASSUMPTION] `{colors.accent}` outline on the tick ring, delete button, theme toggle, and toast actions, shown only for keyboard focus. The input uses its own focused border.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep the age colour the only strong colour on screen (sole exception: the soft error tint and icon on toasts) | Tint labels, text, rows, or icons with the age colour |
| Mark error toasts with the soft tint and the error icon | Give a toast a red left edge (reads as an overdue bar) or a saturated red fill |
| Pair every age colour with its age label | Rely on the bar alone, or add a second colour cue |
| Use hairlines and tonal steps for structure | Add card shadows, gradients, or borders heavier than 1px |
| Right-align age labels in tabular mono | Mix proportional figures into the age column |
| Mark completion with muted text and the filled check | Strike through completed text, or fade it below 4.5:1 |
| Wrap long task text and URLs | Truncate task text or allow horizontal scroll |
| Keep accent for the focus ring, the input caret, the focused input border, and toast actions (Retry, close ×) | Use accent as decoration or a background fill |
| Mirror every light token with its `-dark` twin | Hard-code a colour outside the token set |
