/**
 * OKLCH colour maths (DESIGN.md "Age gradient" and "Contrast"), pure and DOM-free: OKLCH → sRGB
 * through OKLab (Björn Ottosson's matrices), chroma reduction into the sRGB gamut, and WCAG 2.1
 * relative luminance and contrast. `age.ts` builds the age colour on it.
 */

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

/** Throws a RangeError unless L, C and H are all finite numbers. */
function assertFinite({ l, c, h }: Oklch): void {
  if (![l, c, h].every(Number.isFinite)) throw new RangeError(`Non-finite OKLCH: ${l} ${c} ${h}`)
}

/**
 * Brings `colour` inside sRGB by reducing its chroma, keeping L and H, in `CHROMA_STEP` steps.
 * A negative chroma is clamped to 0 first. Throws a RangeError on a non-finite L, C or H, or a
 * chroma too large to step down. `age.test.ts` holds DESIGN.md's 14 stored stops within ±2/255
 * per channel, and they currently match exactly. Bisection to the exact gamut edge
 * puts light 12h at `#8F7500`, 6/255 off the stored `#8F7506` on blue, and no bisection margin
 * lands every stop within ±2/255 in both themes.
 */
export function fitGamut(colour: Oklch): Oklch {
  assertFinite(colour)
  let c = Math.max(0, colour.c)
  if (c - CHROMA_STEP === c) throw new RangeError(`Chroma too large to fit: ${c}`)
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

/**
 * An in-gamut OKLCH colour as `#RRGGBB`, upper case. Throws a RangeError on a non-finite L, C
 * or H.
 */
export function toHex(colour: Oklch): string {
  assertFinite(colour)
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

/** WCAG 2.1 relative luminance of a `#RRGGBB` colour. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => decode(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio between two `#RRGGBB` colours (1–21). */
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
