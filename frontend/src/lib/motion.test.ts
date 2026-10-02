import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion, slideRow, SLIDE_MS } from './motion'

const VIEWPORT = 800

/** A full-width row box with the given top and a 48 px height. */
function box(top: number, height = 48): DOMRect {
  return {
    x: 0,
    y: top,
    left: 0,
    right: 1280,
    top,
    bottom: top + height,
    width: 1280,
    height,
    toJSON: () => ({}),
  }
}

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
  }))
}

describe('slideRow', () => {
  let node: HTMLElement
  let computedStyle: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.stubGlobal('innerHeight', VIEWPORT)
    stubReducedMotion(false)
    node = document.createElement('li')
    document.body.append(node)
    computedStyle = vi.spyOn(window, 'getComputedStyle')
  })

  afterEach(() => {
    node.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('slides a visible row for SLIDE_MS with cubicOut', () => {
    const config = slideRow(node, { from: box(100), to: box(148) })

    expect(SLIDE_MS).toBe(200)
    expect(config.duration).toBe(SLIDE_MS)
    expect(config.easing).toBe(cubicOut)
    expect(config.css).toBeTypeOf('function')
    expect(computedStyle).toHaveBeenCalled()
  })

  it('animates a row that slides into view from below the fold', () => {
    const config = slideRow(node, { from: box(VIEWPORT + 200), to: box(300) })

    expect(config.duration).toBe(SLIDE_MS)
    expect(config.css).toBeTypeOf('function')
  })

  it('animates a row that slides out of view', () => {
    const config = slideRow(node, { from: box(300), to: box(VIEWPORT + 200) })

    expect(config.duration).toBe(SLIDE_MS)
  })

  it('animates a row whose box only partly intersects the viewport', () => {
    // bottom 10 > 0 on the way in from above; top 799 < 800 on the way in from below.
    expect(slideRow(node, { from: box(-38), to: box(-200) }).duration).toBe(SLIDE_MS)
    expect(slideRow(node, { from: box(VIEWPORT - 1), to: box(VIEWPORT + 300) }).duration).toBe(
      SLIDE_MS,
    )
  })

  it('does not animate a row that stays below the viewport, and never reaches flip', () => {
    const config = slideRow(node, { from: box(VIEWPORT + 200), to: box(VIEWPORT + 248) })

    expect(config).toEqual({ duration: 0 })
    expect(computedStyle).not.toHaveBeenCalled()
  })

  it('does not animate a row that stays above the viewport, and never reaches flip', () => {
    const config = slideRow(node, { from: box(-500), to: box(-452) })

    expect(config).toEqual({ duration: 0 })
    expect(computedStyle).not.toHaveBeenCalled()
  })

  it('treats the viewport edges as outside (bottom 0, top innerHeight)', () => {
    expect(slideRow(node, { from: box(-48), to: box(-96) })).toEqual({ duration: 0 })
    expect(slideRow(node, { from: box(VIEWPORT), to: box(VIEWPORT + 48) })).toEqual({
      duration: 0,
    })
    expect(computedStyle).not.toHaveBeenCalled()
  })

  it('does not animate any row under reduced motion, and never reaches flip', () => {
    stubReducedMotion(true)

    const config = slideRow(node, { from: box(100), to: box(148) })

    expect(config).toEqual({ duration: 0 })
    expect(computedStyle).not.toHaveBeenCalled()
  })

  it('reads the setting at animation time, so a live change applies', () => {
    expect(slideRow(node, { from: box(100), to: box(148) }).duration).toBe(SLIDE_MS)

    stubReducedMotion(true)
    expect(slideRow(node, { from: box(100), to: box(148) })).toEqual({ duration: 0 })

    stubReducedMotion(false)
    expect(slideRow(node, { from: box(100), to: box(148) }).duration).toBe(SLIDE_MS)
  })
})

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is true when the media query matches', () => {
    stubReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('is false when the media query does not match', () => {
    stubReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('treats a missing matchMedia (jsdom) as no preference', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
  })
})
