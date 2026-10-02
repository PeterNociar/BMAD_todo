// Row motion (EXPERIENCE › Motion): rows slide about 200 ms, ease-out, when they move. Only rows a
// person can see slide; a row whose old and new boxes are both off-screen gets a zero-duration
// config, so neither `flip`'s style reads nor an `element.animate()` call happens for it. At 500
// rows that is what keeps add (Enter), tick and delete inside NFR-2 (docs/qa-performance.md, Issue 1).
import { flip } from 'svelte/animate'
import type { AnimationConfig } from 'svelte/animate'
import { cubicOut } from 'svelte/easing'

/** EXPERIENCE › Motion: rows slide in about 200 ms, ease-out. */
export const SLIDE_MS = 200

/** Read when each animation runs, so a live change to the setting applies at once. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True when the box intersects the viewport vertically. */
function onScreen(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.top < innerHeight
}

/**
 * The `animate:` function for a task row. A row slides when its old or new box is on screen, so a
 * row sliding into or out of view still animates; reduced motion means nothing moves.
 */
export function slideRow(
  node: Element,
  { from, to }: { from: DOMRect; to: DOMRect },
): AnimationConfig {
  // The viewport test first: most moved rows are off-screen, and it is cheaper than matchMedia.
  if (!onScreen(from) && !onScreen(to)) return { duration: 0 }
  if (prefersReducedMotion()) return { duration: 0 }
  return flip(node, { from, to }, { duration: SLIDE_MS, easing: cubicOut })
}
