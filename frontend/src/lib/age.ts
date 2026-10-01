/**
 * Pure age rules (AD-8, FR-9, FR-10, FR-15): no clock reads, no DOM. Callers pass `now` from
 * `clock.now`. The age is `now − Date.parse(timestamp)`, clamped to 0 (a future timestamp
 * reads "now"). `ageLabel` rounds it down to the largest whole unit; `ageColour` maps it onto
 * DESIGN.md's OKLCH age gradient. Story 2.3 renders the colour.
 */
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

// --- OKLCH colour maths (DESIGN.md "Age gradient" and "Contrast") -----------------------------
// OKLCH → sRGB through OKLab (Björn Ottosson's matrices), chroma reduction into the sRGB gamut,
// and WCAG 2.1 relative luminance and contrast.

export type Oklch = { l: number; c: number; h: number }
type Rgb = [number, number, number]

/** OKLCH → linear sRGB, unclamped: a channel outside [0, 1] means out of gamut. */
function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const GAMUT_EPSILON = 1e-6

function inGamut(colour: Oklch): boolean {
  return oklchToLinearSrgb(colour).every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON)
}

/** The chroma step DESIGN.md's rendered stops were produced with. */
const CHROMA_STEP = 0.002

/**
 * Brings `colour` inside sRGB by reducing its chroma, keeping L and H, in `CHROMA_STEP` steps.
 * A negative chroma is clamped to 0 first. The tests hold DESIGN.md's 14 stored stops within
 * ±2/255 per channel, and they currently match exactly. Exported for tests and story 2.3. Bisection to the exact gamut edge
 * puts light 12h at `#8F7500`, 6/255 off the stored `#8F7506` on blue, and no bisection margin
 * lands every stop within ±2/255 in both themes.
 */
export function fitGamut(colour: Oklch): Oklch {
  let c = Math.max(0, colour.c)
  while (c > 0 && !inGamut({ ...colour, c })) c = Math.max(0, c - CHROMA_STEP)
  return { ...colour, c }
}

/** The sRGB transfer function (linear → gamma-encoded), clamped to [0, 1]. */
function encode(v: number): number {
  const x = Math.min(1, Math.max(0, v))
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

/** The inverse sRGB transfer function (gamma-encoded → linear). */
function decode(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** An in-gamut OKLCH colour as `#RRGGBB`, upper case. Exported for tests and story 2.3. */
export function toHex(colour: Oklch): string {
  const hex = oklchToLinearSrgb(colour)
    .map((v) =>
      Math.round(encode(v) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return `#${hex.toUpperCase()}`
}

/** `#RRGGBB` → 0–255 channels. Throws on anything else. */
export function hexToRgb(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Expected #RRGGBB, got ${hex}`)
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** WCAG 2.1 relative luminance of a `#RRGGBB` colour. Exported for tests and story 2.3. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => decode(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio between two `#RRGGBB` colours (1–21). Exported for tests and story 2.3. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `#RRGGBB` → OKLCH, hue in degrees [0, 360). For tests and review. */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map((v) => decode(v / 255))
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const h = (Math.atan2(bb, a) * 180) / Math.PI
  return { l, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h }
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
 * or stops being finite. Returns `#RRGGBB`. Exported for tests and story 2.3: DESIGN's endpoints
 * never need it.
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
