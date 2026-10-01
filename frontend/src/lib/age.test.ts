import { describe, expect, it } from 'vitest'
import { ageColour, ageLabel, nudgeContrast, THEME_SURFACES, type Theme } from './age'
import { contrastRatio, fitGamut, hexToOklch, hexToRgb, toHex } from './oklch'

const NOW = Date.parse('2026-10-01T12:00:00.000Z')
const S = 1_000
const M = 60 * S
const H = 60 * M
const D = 24 * H

/** The wire timestamp `ms` before NOW. */
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('ageLabel', () => {
  it.each([
    ['0 s', 0, 'now'],
    ['59 s', 59 * S, 'now'],
    ['60 s', 60 * S, '1m'],
    ['59 m 59 s', 59 * M + 59 * S, '59m'],
    ['1 h', H, '1h'],
    ['23 h 59 m', 23 * H + 59 * M, '23h'],
    ['24 h', 24 * H, '1d'],
    ['47 h', 47 * H, '1d'],
    ['3 d', 3 * D, '3d'],
    ['100 d', 100 * D, '100d'],
  ])('an open task aged %s reads %s', (_, ms, label) => {
    expect(ageLabel(ago(ms), NOW, false).label).toBe(label)
  })

  it.each([
    ['0 s', 0, 'done now'],
    ['59 s', 59 * S, 'done now'],
    ['60 s', 60 * S, 'done 1m'],
    ['59 m 59 s', 59 * M + 59 * S, 'done 59m'],
    ['1 h', H, 'done 1h'],
    ['2 h', 2 * H, 'done 2h'],
    ['23 h 59 m', 23 * H + 59 * M, 'done 23h'],
    ['24 h', 24 * H, 'done 1d'],
    ['47 h', 47 * H, 'done 1d'],
    ['100 d', 100 * D, 'done 100d'],
  ])('a task completed %s ago reads %s', (_, ms, label) => {
    expect(ageLabel(ago(ms), NOW, true).label).toBe(label)
  })

  it.each([
    ['5 h open', 5 * H, false, 'added 5 hours ago'],
    ['2 h done', 2 * H, true, 'completed 2 hours ago'],
    ['30 s open', 30 * S, false, 'added just now'],
    ['30 s done', 30 * S, true, 'completed just now'],
    ['1 h open', H, false, 'added 1 hour ago'],
    ['1 m open', M, false, 'added 1 minute ago'],
    ['12 m open', 12 * M, false, 'added 12 minutes ago'],
    ['1 d open', D, false, 'added 1 day ago'],
    ['3 d done', 3 * D, true, 'completed 3 days ago'],
  ])('%s is spoken as "%s"', (_, ms, done, words) => {
    expect(ageLabel(ago(ms), NOW, done).words).toBe(words)
  })

  it('clamps a future timestamp to now, never a negative age', () => {
    expect(ageLabel(ago(-10 * S), NOW, false)).toEqual({ label: 'now', words: 'added just now' })
    expect(ageLabel(ago(-2 * H), NOW, true)).toEqual({
      label: 'done now',
      words: 'completed just now',
    })
  })

  it('returns the label and the words for the same value', () => {
    expect(ageLabel(ago(5 * H + 59 * M), NOW, false)).toEqual({
      label: '5h',
      words: 'added 5 hours ago',
    })
  })
})

/** Each sRGB channel of `actual` within ±2/255 of `expected` (the 2026-10-01 decision). */
function expectNear(actual: string | null, expected: string) {
  if (actual === null) throw new Error(`expected a colour near ${expected}, got null`)
  expect(actual).toMatch(/^#[0-9A-F]{6}$/)
  const a = hexToRgb(actual)
  hexToRgb(expected).forEach((v, i) => {
    expect(Math.abs(a[i] - v), `${actual} vs ${expected}`).toBeLessThanOrEqual(2)
  })
}

const THEMES: Theme[] = ['light', 'dark']

describe('ageColour', () => {
  // DESIGN.md "Age gradient": the stored reference stops, light and dark.
  it.each([
    ['1 h', H, '#249057', '#55C483'],
    ['3 h', 3 * H, '#428D42', '#6EC06D'],
    ['6 h', 6 * H, '#638718', '#8FB74A'],
    ['12 h', 12 * H, '#8F7506', '#C19E00'],
    ['18 h', 18 * H, '#AE5F01', '#E28120'],
    ['23 h', 23 * H, '#C44231', '#EB6D5A'],
    ['24 h', 24 * H, '#C43F3E', '#EA6A64'],
    ['25 h', 25 * H, '#C43F3E', '#EA6A64'],
    ['10 d', 10 * D, '#C43F3E', '#EA6A64'],
  ])('at %s matches the DESIGN stop %s / %s', (_, ms, light, dark) => {
    expectNear(ageColour(ago(ms), NOW, false, 'light'), light)
    expectNear(ageColour(ago(ms), NOW, false, 'dark'), dark)
  })

  it.each(THEMES)('holds the fresh colour under 1 h (%s)', (theme) => {
    const fresh = ageColour(ago(H), NOW, false, theme)
    for (const ms of [0, 30 * M, 59 * M + 59 * S]) {
      expect(ageColour(ago(ms), NOW, false, theme)).toBe(fresh)
    }
    expectNear(ageColour(ago(30 * M), NOW, false, theme), theme === 'light' ? '#249057' : '#55C483')
  })

  it.each(THEMES)('gives a future timestamp the fresh colour (%s)', (theme) => {
    expect(ageColour(ago(-2 * H), NOW, false, theme)).toBe(ageColour(ago(0), NOW, false, theme))
  })

  it.each(THEMES)('gives an unparseable timestamp the fresh colour (%s)', (theme) => {
    expect(ageColour('garbage', NOW, false, theme)).toBe(ageColour(ago(0), NOW, false, theme))
  })

  it.each(THEMES)('returns null for a completed task (%s)', (theme) => {
    for (const ms of [0, 12 * H, 30 * H]) expect(ageColour(ago(ms), NOW, true, theme)).toBeNull()
  })

  // A 0–30 h sweep in 15-minute steps.
  const SWEEP = Array.from({ length: 30 * 4 + 1 }, (_, i) => i * 15 * M)

  it.each(THEMES)('keeps 3:1 on surface and hover across 0–30 h (%s)', (theme) => {
    const { surface, hover } = THEME_SURFACES[theme]
    for (const ms of SWEEP) {
      const colour = ageColour(ago(ms), NOW, false, theme)!
      expect(contrastRatio(colour, surface), `${colour} on surface`).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(colour, hover), `${colour} on hover`).toBeGreaterThanOrEqual(3)
    }
  })

  // The formula, written out independently of age.ts: DESIGN.md's endpoints, L/C/H linear in t.
  const ENDPOINTS = {
    light: [
      { l: 0.58, c: 0.13, h: 155 },
      { l: 0.56, c: 0.17, h: 25 },
    ],
    dark: [
      { l: 0.74, c: 0.14, h: 155 },
      { l: 0.68, c: 0.16, h: 25 },
    ],
  }

  it.each(THEMES)(
    'never nudges across 0–30 h: the colour is the gamut-fitted formula (%s)',
    (theme) => {
      const [fresh, overdue] = ENDPOINTS[theme]
      for (const ms of SWEEP) {
        const t = Math.min(1, Math.max(0, (ms / H - 1) / 23))
        const interpolated = {
          l: fresh.l + (overdue.l - fresh.l) * t,
          c: fresh.c + (overdue.c - fresh.c) * t,
          h: fresh.h + (overdue.h - fresh.h) * t,
        }
        expect(ageColour(ago(ms), NOW, false, theme), `${ms / M} min`).toBe(
          toHex(fitGamut(interpolated)),
        )
      }
    },
  )

  it.each(THEMES)('never increases the hue across 0–30 h (%s)', (theme) => {
    const hues = SWEEP.map((ms) => hexToOklch(ageColour(ago(ms), NOW, false, theme)!).h)
    // 8-bit rounding moves the measured hue by a fraction of a degree.
    hues.slice(1).forEach((h, i) => expect(h, `step ${i + 1}`).toBeLessThanOrEqual(hues[i] + 0.5))
    expect(hues[0]).toBeGreaterThan(150)
    expect(hues.at(-1)).toBeLessThan(30)
  })
})

describe('nudgeContrast', () => {
  const freshLight = { l: 0.58, c: 0.13, h: 155 }
  const freshDark = { l: 0.74, c: 0.14, h: 155 }

  it('leaves a colour alone when it already reaches 3:1', () => {
    const { surface, hover } = THEME_SURFACES.light
    expect(nudgeContrast(freshLight, [surface, hover], 'light')).toBe('#249057')
  })

  it('darkens a light-theme colour until it reaches 3:1 on a low-contrast background', () => {
    const bg = '#9AA3AE'
    expect(contrastRatio('#249057', bg)).toBeLessThan(3)
    const { surface } = THEME_SURFACES.light
    const nudged = nudgeContrast(freshLight, [bg, surface], 'light')
    expect(contrastRatio(nudged, bg)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(nudged, surface)).toBeGreaterThanOrEqual(3)
    const lab = hexToOklch(nudged)
    expect(lab.l).toBeLessThan(freshLight.l)
    expect(lab.h).toBeCloseTo(155, -1)
  })

  it('lightens a dark-theme colour until it reaches 3:1 on a low-contrast background', () => {
    const bg = '#5A6270'
    expect(contrastRatio('#55C483', bg)).toBeLessThan(3)
    const nudged = nudgeContrast(freshDark, [bg], 'dark')
    expect(contrastRatio(nudged, bg)).toBeGreaterThanOrEqual(3)
    expect(hexToOklch(nudged).l).toBeGreaterThan(freshDark.l)
  })

  it('stops at the end of the lightness range when 3:1 is unreachable (light)', () => {
    // Even black reaches only 2.8:1 on #555555, so L runs out first.
    expect(contrastRatio('#000000', '#555555')).toBeLessThan(3)
    const nudged = nudgeContrast(freshLight, ['#555555'], 'light')
    expect(nudged).toMatch(/^#[0-9A-F]{6}$/)
    expect(hexToOklch(nudged).l).toBeLessThan(0.01)
  })

  it('stops at the end of the lightness range when 3:1 is unreachable (dark)', () => {
    // Even white reaches only 2.3:1 on #AAAAAA, so L runs out first.
    expect(contrastRatio('#FFFFFF', '#AAAAAA')).toBeLessThan(3)
    const nudged = nudgeContrast(freshDark, ['#AAAAAA'], 'dark')
    expect(nudged).toMatch(/^#[0-9A-F]{6}$/)
    expect(hexToOklch(nudged).l).toBeGreaterThan(0.99)
  })
})
