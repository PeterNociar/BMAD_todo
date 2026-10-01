import { describe, expect, it } from 'vitest'
import { contrastRatio, fitGamut, hexToOklch, hexToRgb, toHex } from './oklch'

describe('colour helpers', () => {
  it.each(['#FFF', 'FFFFFF', '#GGGGGG', '#NANNANNAN', ''])('hexToRgb rejects %j', (hex) => {
    expect(() => hexToRgb(hex)).toThrow(/#RRGGBB/)
  })

  it('fitGamut clamps a negative chroma to 0 rather than flipping the hue', () => {
    expect(fitGamut({ l: 0.6, c: -0.1, h: 155 })).toEqual({ l: 0.6, c: 0, h: 155 })
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white, either way round', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 10)
  })

  it.each(['#000000', '#FFFFFF', '#249057', '#C43F3E'])('is 1 for %s on itself', (hex) => {
    expect(contrastRatio(hex, hex)).toBe(1)
  })
})

describe('hexToOklch', () => {
  // DESIGN.md "Age gradient": the 14 stored stops, light then dark.
  it.each([
    '#249057',
    '#428D42',
    '#638718',
    '#8F7506',
    '#AE5F01',
    '#C44231',
    '#C43F3E',
    '#55C483',
    '#6EC06D',
    '#8FB74A',
    '#C19E00',
    '#E28120',
    '#EB6D5A',
    '#EA6A64',
  ])('round-trips %s through toHex', (hex) => {
    expect(toHex(hexToOklch(hex))).toBe(hex)
  })

  it('gives a hue in [0, 360) where atan2 is negative (blue)', () => {
    const { h } = hexToOklch('#0000FF')
    expect(h).toBeGreaterThan(180)
    expect(h).toBeLessThan(360)
  })
})

describe('non-finite input', () => {
  const BAD = [
    { l: Number.NaN, c: 0.1, h: 155 },
    { l: 0.6, c: Number.POSITIVE_INFINITY, h: 155 },
    { l: 0.6, c: 0.1, h: Number.NEGATIVE_INFINITY },
  ]

  it.each(BAD)('fitGamut throws on %o', (colour) => {
    expect(() => fitGamut(colour)).toThrow(RangeError)
  })

  it.each(BAD)('toHex throws on %o', (colour) => {
    expect(() => toHex(colour)).toThrow(RangeError)
  })

  it('fitGamut throws on a chroma too large to step down', () => {
    expect(() => fitGamut({ l: 0.6, c: 1e20, h: 155 })).toThrow(RangeError)
  })
})
