// @vitest-environment node
// Guards THEME_SURFACES in lib/age.ts against drift: its light pair is copied from DESIGN.md's
// `surface` and `hover` tokens, which app.css renders as --color-surface and --color-hover.
// The dark pair is checked against both dark blocks, which must also declare the same
// --color-* names as :root and agree with each other value for value.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME_SURFACES } from '../src/lib/age.ts'

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8')
const design = readFileSync(
  new URL('../../_bmad-output/initiative-todo-app/ux-todo-app/DESIGN.md', import.meta.url),
  'utf8',
)

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

/**
 * Every `--color-*` declaration in a block body, as name (without `--`) → trimmed, lower-cased
 * value. Any value counts (hex, rgb(), var(), color-mix()), so no token drops out of the checks.
 */
function colourTokens(body: string): Map<string, string> {
  const pattern = /--(color-[a-z0-9-]+):\s*([^;]+);/g
  return new Map([...body.matchAll(pattern)].map((m) => [m[1], m[2].trim().toLowerCase()]))
}

/** DESIGN.md front matter's `<name>-dark` colours, as `<name>` → lower-cased hex. */
function designDarkTwins(): Map<string, string> {
  const front = /^---\n([\s\S]*?)\n---/.exec(design)?.[1]
  expect(front, 'DESIGN.md front matter').toBeTruthy()
  const pattern = /^\s+([a-z0-9-]+)-dark:\s*'(#[0-9a-fA-F]+)'/gm
  return new Map([...front!.matchAll(pattern)].map((m) => [m[1], m[2].toLowerCase()]))
}

/** The body of the one `:root[data-theme='dark'] { … }` block. */
function explicitDarkBlock(): string {
  const blocks = [...css.matchAll(/:root\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/g)]
  expect(blocks.length, "one :root[data-theme='dark'] block").toBe(1)
  return blocks[0][1]
}

/** The body of `:root:not([data-theme]) { … }` inside `@media (prefers-color-scheme: dark)`. */
function mediaDarkBlock(): string {
  const media = [
    ...css.matchAll(
      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{([^}]*)\}\s*\}/g,
    ),
  ]
  expect(media.length, 'one prefers-color-scheme: dark block holding :root:not([data-theme])').toBe(
    1,
  )
  return media[0][1]
}

/** The light `--color-*` names on `:root`. */
function lightNames(): string[] {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1])
  return [...new Set(blocks.flatMap((block) => [...colourTokens(block).keys()]))].sort()
}

describe('dark theme blocks', () => {
  it.each([
    ["the :root[data-theme='dark'] block", explicitDarkBlock],
    ['the prefers-color-scheme: dark block', mediaDarkBlock],
  ])('%s declares exactly the light --color-* names, and color-scheme: dark', (_, block) => {
    const body = block()
    const names = [...colourTokens(body).keys()]
    expect(names.length, 'each name once').toBe(new Set(names).size)
    expect(names.sort()).toEqual(lightNames())
    expect(body).toMatch(/color-scheme:\s*dark\s*;/)
  })

  it('the two blocks agree value for value', () => {
    expect(Object.fromEntries(colourTokens(mediaDarkBlock()))).toEqual(
      Object.fromEntries(colourTokens(explicitDarkBlock())),
    )
  })

  it('every light --color-<name> has a DESIGN <name>-dark twin', () => {
    const twins = designDarkTwins()
    const missing = lightNames().filter((name) => !twins.has(name.replace(/^color-/, '')))
    expect(missing).toEqual([])
  })

  it.each([
    ["the :root[data-theme='dark'] block", explicitDarkBlock],
    ['the prefers-color-scheme: dark block', mediaDarkBlock],
  ])('every --color-<name> in %s equals DESIGN <name>-dark', (_, block) => {
    const twins = designDarkTwins()
    for (const [name, value] of colourTokens(block())) {
      expect(value, `--${name}`).toBe(twins.get(name.replace(/^color-/, '')))
    }
  })

  it('declares at least the 16 DESIGN colour tokens', () => {
    expect(lightNames().length).toBeGreaterThanOrEqual(16)
  })
})

describe('THEME_SURFACES', () => {
  it('matches app.css --color-surface and --color-hover for the light theme', () => {
    expect(THEME_SURFACES.light).toEqual({
      surface: rootToken('color-surface'),
      hover: rootToken('color-hover'),
    })
  })

  it.each([
    ["the :root[data-theme='dark'] block", explicitDarkBlock],
    ['the prefers-color-scheme: dark block', mediaDarkBlock],
  ])('matches --color-surface and --color-hover in %s for the dark theme', (_, block) => {
    const tokens = colourTokens(block())
    expect(THEME_SURFACES.dark).toEqual({
      surface: normaliseHex(tokens.get('color-surface')!),
      hover: normaliseHex(tokens.get('color-hover')!),
    })
  })
})
