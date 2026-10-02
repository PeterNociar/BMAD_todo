<script lang="ts">
  // The header's theme toggle (CAP-11, DESIGN theme-toggle): one two-state button showing a
  // sun/moon pill. The segment for the current theme is filled. The name says what activating
  // it does ("Switch to dark theme"), so there is no `aria-pressed`. Activating stores the other
  // mode through `theme.set`; there is no way back to following the system. Focus moves only
  // through lib/focus.ts (AD-18): a pointer activation returns to the input (laptop only), a
  // keyboard activation (`detail === 0`) leaves focus on the toggle.
  import { returnToInput } from '../lib/focus'
  import { theme } from '../lib/theme.svelte'

  const dark = $derived(theme.current === 'dark')
  const name = $derived(dark ? 'Switch to light theme' : 'Switch to dark theme')

  function onclick(e: MouseEvent): void {
    theme.set(dark ? 'light' : 'dark')
    if (e.detail > 0) returnToInput()
  }
</script>

<button type="button" class="toggle" aria-label={name} {onclick}>
  <span class="seg" class:on={!dark} aria-hidden="true" data-segment="light">
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </svg>
  </span>
  <span class="seg" class:on={dark} aria-hidden="true" data-segment="dark">
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      <path
        d="M13 9.6A5.3 5.3 0 0 1 6.4 3a5.3 5.3 0 1 0 6.6 6.6z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</button>

<style>
  /* DESIGN theme-toggle: a 1px divider pill, 2px padding, segments touching. No hover state. */
  .toggle {
    display: inline-flex;
    flex: none;
    gap: 0;
    margin: 0;
    padding: var(--space-1);
    border: 1px solid var(--color-divider);
    border-radius: 9999px;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .toggle:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: var(--space-1);
  }

  /* 22 x 18 px with a 1px 3px inset: the 16px icon fills the rest. */
  .seg {
    display: block;
    box-sizing: border-box;
    width: 22px;
    height: 18px;
    padding: 1px 3px;
    border-radius: 9999px;
    color: var(--color-text-muted);
  }

  /* px, like the segment box: a larger default font never pushes the icon out of the pill. */
  .seg svg {
    display: block;
    width: 16px;
    height: 16px;
  }

  .seg.on {
    background: var(--color-surface);
    box-shadow: inset 0 0 0 1px var(--color-divider);
    color: var(--color-text-primary);
  }

  /* The fill and the inset hairline do not survive forced colours; an outline does. */
  @media (forced-colors: active) {
    .seg.on {
      outline: 1px solid CanvasText;
    }
  }
</style>
