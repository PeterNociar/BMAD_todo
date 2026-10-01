import { describe, expect, it } from 'vitest'
import { fitGamut, hexToRgb } from './oklch'

describe('colour helpers', () => {
  it.each(['#FFF', 'FFFFFF', '#GGGGGG', '#NANNANNAN', ''])('hexToRgb rejects %j', (hex) => {
    expect(() => hexToRgb(hex)).toThrow(/#RRGGBB/)
  })

  it('fitGamut clamps a negative chroma to 0 rather than flipping the hue', () => {
    expect(fitGamut({ l: 0.6, c: -0.1, h: 155 })).toEqual({ l: 0.6, c: 0, h: 155 })
  })
})
