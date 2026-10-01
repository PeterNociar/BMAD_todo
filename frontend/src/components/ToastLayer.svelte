<script lang="ts">
  // Renders toasts.items (AD-17). Toasts are not live regions (LiveRegions.svelte announces)
  // and never take focus. Hover or focus inside a toast pauses its timer.
  import { COPY, toasts } from '../lib/toasts.svelte'

  let { onretry }: { onretry: () => void } = $props()
</script>

<div class="toast-layer">
  {#each toasts.items as toast (toast.id)}
    <!-- Mouse hover and focus only pause the timer; the toast itself is not interactive. A touch
         tap is ignored: it never sends a leave, so it would pin the toast. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="toast"
      data-toast-kind={toast.kind}
      onpointerenter={(e) => e.pointerType === 'mouse' && toasts.hold(toast.id)}
      onpointerleave={(e) => e.pointerType === 'mouse' && toasts.release(toast.id)}
      onfocusin={() => toasts.hold(toast.id)}
      onfocusout={() => toasts.release(toast.id)}
    >
      <svg class="icon" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path class="glyph" d="M8 4.25v4.5" stroke-width="1.6" stroke-linecap="round" />
        <circle class="dot" cx="8" cy="11.25" r="0.95" />
      </svg>
      <p class="message">{toast.message}</p>
      {#if toast.transient}
        <button
          type="button"
          class="close"
          aria-label={COPY.dismiss}
          onclick={() => toasts.dismiss(toast.id)}
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
      {:else}
        <button type="button" class="retry" onclick={() => onretry()}>{COPY.retry}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-layer {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    background: var(--color-error-bg);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-md);
    box-shadow: 0 0.25rem 1rem var(--color-shadow-toast);
    color: var(--color-text-primary);
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.35;
  }

  .icon {
    flex: none;
    width: 1rem;
    height: 1rem;
    /* Centre the 16px icon on the first 14px × 1.35 text line. */
    margin-top: calc((1.35em - 1rem) / 2);
    color: var(--color-error-icon);
  }

  .icon .glyph {
    stroke: var(--color-error-bg);
  }

  .icon .dot {
    fill: var(--color-error-bg);
  }

  .message {
    flex: 1;
    margin: 0;
    overflow-wrap: anywhere;
  }

  button {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.5rem;
    min-height: 1.5rem;
    /* Keep the 24px hit box from growing the row past one text line. */
    margin-block: calc((1.35em - 1.5rem) / 2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    cursor: pointer;
  }

  .close {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 4px;
  }

  .retry {
    padding-inline: 0.25rem;
    border-radius: 4px;
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
