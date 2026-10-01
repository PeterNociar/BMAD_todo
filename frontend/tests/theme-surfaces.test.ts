// @vitest-environment node
// Guards THEME_SURFACES in lib/age.ts against drift: its light pair is copied from DESIGN.md's
// `surface` and `hover` tokens, which app.css renders as --color-surface and --color-hover.
// Epic 3's dark CSS tokens must match the dark pair the same way.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME_SURFACES } from '../src/lib/age.ts'

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')

/** `#rgb` or `#rrggbb` → `#RRGGBB`. */
function normaliseHex(hex: string): string {
  const digits = hex.length === 4 ? [...hex.slice(1)].map((d) => d + d).join('') : hex.slice(1)
  return `#${digits.toUpperCase()}`
}

/** The value of `--name` across every `:root` block (the last declaration wins), normalised. */
function rootToken(name: string): string {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1])
  expect(blocks.length, 'no :root block in app.css').toBeGreaterThan(0)
  const pattern = new RegExp(`--${name}:\\s*(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\\s*;`, 'g')
  const values = blocks.flatMap((block) => [...block.matchAll(pattern)].map((m) => m[1]))
  expect(values.length, `no --${name} on :root`).toBeGreaterThan(0)
  return normaliseHex(values.at(-1)!)
}

describe('THEME_SURFACES', () => {
  it('matches app.css --color-surface and --color-hover for the light theme', () => {
    expect(THEME_SURFACES.light).toEqual({
      surface: rootToken('color-surface'),
      hover: rootToken('color-hover'),
    })
  })
})
