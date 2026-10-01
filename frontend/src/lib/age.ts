/**
 * Pure age rules (AD-8, FR-9, FR-10, FR-15): no clock reads, no DOM. Callers pass `now` from
 * `clock.now`. The age is `now − Date.parse(timestamp)`, clamped to 0 (a future timestamp
 * reads "now"). `ageLabel` rounds it down to the largest whole unit; `ageColour` maps it onto
 * DESIGN.md's OKLCH age gradient, using the colour maths in `oklch.ts`. Story 2.3 renders it.
 */
import { contrastRatio, fitGamut, toHex, type Oklch } from './oklch'

export type AgeLabel = {
  /** The visible short form: `now`, `12m`, `5h`, `3d`, or `done …` on a completed task. */
  label: string
  /** The spoken form for assistive tech, e.g. `added 5 hours ago`. */
  words: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const UNITS = [
  { ms: DAY, short: 'd', word: 'day' },
  { ms: HOUR, short: 'h', word: 'hour' },
  { ms: MINUTE, short: 'm', word: 'minute' },
] as const

export function ageLabel(timestamp: string, now: number, done: boolean): AgeLabel {
  const age = Math.max(0, now - Date.parse(timestamp))
  const verb = done ? 'completed' : 'added'
  const prefix = done ? 'done ' : ''

  for (const unit of UNITS) {
    const n = Math.floor(age / unit.ms)
    if (n >= 1) {
      const plural = n === 1 ? '' : 's'
      return {
        label: `${prefix}${n}${unit.short}`,
        words: `${verb} ${n} ${unit.word}${plural} ago`,
      }
    }
  }
  return { label: `${prefix}now`, words: `${verb} just now` }
}

// --- Age colour ---------------------------------------------------------------------------------

export type Theme = 'light' | 'dark'

/**
 * Copied from DESIGN.md's `surface`/`hover` and `surface-dark`/`hover-dark` tokens: the
 * backgrounds the age colour must keep 3:1 against. `tests/theme-surfaces.test.ts` checks the
 * light pair against `app.css`; epic 3's dark CSS tokens must match the dark pair.
 */
export const THEME_SURFACES: Record<Theme, { surface: string; hover: string }> = {
  light: { surface: '#FFFFFF', hover: '#F4F6F9' },
  dark: { surface: '#151B24', hover: '#1B222D' },
}

/** DESIGN.md's gradient endpoints. Hue runs 155 → 25 (green → amber → red). */
const ENDPOINTS: Record<Theme, { fresh: Oklch; overdue: Oklch }> = {
  light: { fresh: { l: 0.58, c: 0.13, h: 155 }, overdue: { l: 0.56, c: 0.17, h: 25 } },
  dark: { fresh: { l: 0.74, c: 0.14, h: 155 }, overdue: { l: 0.68, c: 0.16, h: 25 } },
}

const MIN_CONTRAST = 3
const NUDGE_STEP = 0.005

/**
 * Moves L away from the backgrounds (darker for light, lighter for dark) in small steps, fitting
 * the gamut at each step, until the colour reaches 3:1 on every background, or L leaves [0, 1]
 * or stops being finite. Returns `#RRGGBB`. Exported for tests: DESIGN's endpoints never need it.
 */
export function nudgeContrast(colour: Oklch, backgrounds: readonly string[], theme: Theme): string {
  const direction = theme === 'light' ? -1 : 1
  let current = fitGamut(colour)
  let hex = toHex(current)
  while (backgrounds.some((bg) => contrastRatio(hex, bg) < MIN_CONTRAST)) {
    const l = current.l + direction * NUDGE_STEP
    if (!Number.isFinite(l) || l < 0 || l > 1) break
    current = fitGamut({ ...colour, l })
    hex = toHex(current)
  }
  return hex
}

/**
 * The age colour of a task as `#RRGGBB`, or `null` for a completed task (FR-9). Under 1 h the
 * fresh endpoint, from 24 h the overdue one, and in between `t = (hours − 1) / 23`, with L, C
 * and H linear in `t`. `fitGamut` then lowers C where that colour is outside sRGB. An
 * unparseable timestamp counts as age 0 (fresh), as `ageLabel` reads it as "now". DESIGN.md's
 * formula is normative; its stops are reference samples.
 */
export function ageColour(
  timestamp: string,
  now: number,
  done: boolean,
  theme: Theme,
): string | null {
  if (done) return null
  const age = now - Date.parse(timestamp)
  const hours = Number.isFinite(age) ? Math.max(0, age) / HOUR : 0
  const t = Math.min(1, Math.max(0, (hours - 1) / 23))
  const { fresh, overdue } = ENDPOINTS[theme]
  const colour: Oklch = {
    l: fresh.l + (overdue.l - fresh.l) * t,
    c: fresh.c + (overdue.c - fresh.c) * t,
    h: fresh.h + (overdue.h - fresh.h) * t,
  }
  const { surface, hover } = THEME_SURFACES[theme]
  return nudgeContrast(colour, [surface, hover], theme)
}
