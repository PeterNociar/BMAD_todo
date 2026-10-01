<script lang="ts">
  // One Ledger row (DESIGN task-row): tick ring, task text, delete ×. The keyed `<li
  // data-task-row>` lives in App, because `animate:flip` must sit on the each block's direct
  // child; this component fills it. The store announces and toasts (AD-17); focus moves only
  // through lib/focus.ts (AD-18). No age label or bar until epic 2: their slot is padding.
  import { returnToInput } from '../lib/focus'
  import { tasks, type Row } from '../lib/tasks.svelte'

  let { row }: { row: Row } = $props()

  const done = $derived(row.completed_at !== null)
  const tickName = $derived(done ? `Mark "${row.text}" not done` : `Mark "${row.text}" done`)

  function toggle(): void {
    if (done) tasks.untick(row.key)
    else tasks.tick(row.key)
    returnToInput()
  }

  function remove(): void {
    tasks.remove(row.key)
    returnToInput()
  }
</script>

<div class="task-row" class:done>
  <button type="button" class="tick" data-row-control="tick" aria-label={tickName} onclick={toggle}>
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
      {#if done}
        <circle class="fill" cx="8" cy="8" r="8" />
        <path
          class="check"
          d="M4.75 8.25l2.25 2.25 4.25-4.5"
          fill="none"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {:else}
        <circle class="ring" cx="8" cy="8" r="7.25" fill="none" stroke-width="1.5" />
      {/if}
    </svg>
  </button>

  <span class="text">{row.text}</span>

  <button
    type="button"
    class="delete"
    data-row-control="delete"
    aria-label={`Delete "${row.text}"`}
    onclick={remove}
  >
    <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12">
      <path
        d="M1.5 1.5l9 9M10.5 1.5l-9 9"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
  </button>
</div>

<style>
  /* Padding 8 / 12 / 8 / 15 (the 3px age-bar slot plus 12px); contents 10px apart. */
  .task-row {
    --line: calc(0.875rem * var(--line-height-body));
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5) var(--space-3) var(--space-row-inset-left);
    color: var(--color-text-primary);
  }

  .done .text {
    color: var(--color-text-muted);
  }

  /* Plain text that wraps anywhere, long URLs included; never horizontal scroll. */
  .text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    /* A focused control is never hidden under the sticky header and input (SC 2.4.11). */
    scroll-margin-top: var(--sticky-height, 0px);
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: var(--space-1);
  }

  /* Both 24px boxes centre on the first text line; negative margins keep the row height set
     by the text, and the tick's inline margins keep its 16px ring's footprint. */
  .tick {
    margin: calc((var(--line) - 1.5rem) / 2) -0.25rem;
  }

  .tick svg {
    width: 1rem;
    height: 1rem;
  }

  .ring {
    stroke: var(--color-check-ring);
  }

  .fill {
    fill: var(--color-check-fill);
  }

  .check {
    stroke: var(--color-surface);
  }

  .delete {
    margin-block: calc((var(--line) - 1.5rem) / 2);
    border-radius: var(--radius-sm);
    color: var(--color-delete);
  }

  .delete svg {
    width: 0.75rem;
    height: 0.75rem;
  }

  /* Laptop: the hover tint, and the delete hidden (still in the Tab order) until the row is
     hovered or holds focus. */
  @media (hover: hover) {
    .task-row:hover {
      background: var(--color-hover);
    }

    .delete {
      opacity: 0;
      pointer-events: none;
    }

    .task-row:hover .delete,
    .task-row:focus-within .delete {
      opacity: 1;
      pointer-events: auto;
    }

    .delete:hover {
      background: var(--color-divider);
    }
  }

  /* Phone: the delete is always visible, and both hit areas span the full row height (into
     the row padding) while the ring and glyph stay on the first text line. */
  @media (hover: none) {
    .tick,
    .delete {
      align-self: stretch;
      align-items: flex-start;
      height: auto;
      margin-block: calc(-1 * var(--space-3));
    }

    .tick {
      padding-top: calc(var(--space-3) + (var(--line) - 1rem) / 2);
    }

    .delete {
      padding-top: calc(var(--space-3) + (var(--line) - 0.75rem) / 2);
    }
  }
</style>
