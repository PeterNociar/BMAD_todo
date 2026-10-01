import '@testing-library/jest-dom/vitest'

// jsdom has no Web Animations API; Svelte's `animate:flip` calls it when a keyed row leaves.
// Nothing ever runs in jsdom (every rect is zero, so rows never "move"); this only stops a crash.
// (This file is typechecked without the DOM lib, hence the structural type.)
const proto = (globalThis as { Element?: { prototype: { getAnimations?: () => unknown[] } } })
  .Element?.prototype
if (proto && typeof proto.getAnimations !== 'function') proto.getAnimations = () => []
