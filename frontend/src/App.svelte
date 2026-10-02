<script lang="ts">
  // The composition root: the sticky header and input, the toast layer, the list area and the
  // live regions. Task state and all I/O live in the store (AD-9); focus moves only through
  // lib/focus.ts (AD-18).
  import { onMount, untrack } from 'svelte'
  import LiveRegions from './components/LiveRegions.svelte'
  import TaskRow from './components/TaskRow.svelte'
  import ThemeToggle from './components/ThemeToggle.svelte'
  import ToastLayer from './components/ToastLayer.svelte'
  import {
    installSafetyNet,
    installTypeToFocus,
    keepFocus,
    onInputKeydown,
    onRowKeydown,
    registerInput,
    returnToInput,
  } from './lib/focus'
  import { slideRow } from './lib/motion'
  import { tasks } from './lib/tasks.svelte'
  import { COPY } from './lib/toasts.svelte'

  /** EXPERIENCE: the skeleton shows only once loading lasts longer than this, to avoid a flash. */
  const SKELETON_DELAY_MS = 300

  let input: HTMLInputElement | undefined = $state()
  let page: HTMLDivElement | undefined = $state()
  let top: HTMLElement | undefined = $state()
  let toastAnchor: HTMLDivElement | undefined = $state()
  let list: HTMLUListElement | undefined = $state()
  let value = $state('')
  let skeletonDue = $state(false)

  const loading = $derived(tasks.loadState === 'loading')
  const showSkeleton = $derived(loading && skeletonDue)
  const showEmpty = $derived(tasks.loadState === 'ready' && tasks.rows.length === 0)
  const showList = $derived(tasks.rows.length > 0 || showSkeleton)

  onMount(() => {
    registerInput(input ?? null)
    const uninstallSafetyNet = installSafetyNet()
    const uninstallTypeToFocus = installTypeToFocus()
    returnToInput()
    void tasks.load()
    if (top) sticky.watch(top)
    if (toastAnchor) toastStack.watch(toastAnchor)

    return () => {
      sticky.stop()
      toastStack.stop()
      held.stop()
      uninstallSafetyNet()
      uninstallTypeToFocus()
      registerInput(null)
    }
  })

  /**
   * Watches one element's border-box height at a time (`watch(null)` stops watching) and
   * reports it, 0 with no element. Border box: the header's padding changes at the 600 px
   * breakpoint, and a row's padding is part of what it covers. Without ResizeObserver each
   * height is measured once per `watch` (a static fallback; every supported browser has it).
   */
  function watchHeight(report: (height: number, el: Element | null) => void) {
    let current: Element | null = null
    const measure = (entries: readonly ResizeObserverEntry[] = []) => {
      if (!current) return report(0, null)
      const entry = entries.find((e) => e.target === current)
      report(
        entry?.borderBoxSize?.[0]?.blockSize ?? current.getBoundingClientRect().height,
        current,
      )
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    return {
      get current() {
        return current
      },
      watch(el: Element | null) {
        if (el === current) return
        if (current) observer?.unobserve(current)
        current = el
        if (el) observer?.observe(el, { box: 'border-box' })
        measure()
      },
      stop: () => observer?.disconnect(),
    }
  }

  /** Writes a measured height to `.page` through the CSSOM: the CSP has no 'unsafe-inline' (AD-19). */
  const setHeight = (name: string, value: string) => page?.style.setProperty(name, value)

  /** `--sticky-height`: the sticky header and input, for the held row's `top` and clearance. */
  const sticky = watchHeight((h) => setHeight('--sticky-height', `${h}px`))
  /**
   * `--held-height`: the held row plus the 8 px gap below it, 0 with nothing held. The toast
   * stack sits that far below the list's top edge, and row controls clear it.
   */
  const held = watchHeight((h, el) =>
    setHeight('--held-height', el ? `calc(${h}px + var(--space-3))` : '0px'),
  )
  /** `--toast-height`: the visible toast stack (0 with none), for the row controls' clearance. */
  const toastStack = watchHeight((h) => setHeight('--toast-height', `${h}px`))

  // Before the DOM update: the control inside the held row with keyboard focus
  // (`:focus-visible`), if any. Settling moves the row in the DOM, which blurs it. A tapped or
  // clicked control is left alone (EXPERIENCE scopes this to keyboard focus).
  let focusedInHeld: HTMLElement | null = null
  $effect.pre(() => {
    void tasks.heldKey
    const active = document.activeElement
    const el = held.current
    focusedInHeld =
      el && active instanceof HTMLElement && el.contains(active) && active.matches(':focus-visible')
        ? active
        : null
  })

  // After the DOM update: watch the new held row. When a hold ends with keyboard focus inside
  // the row, focus goes back to that control and the control is scrolled into view below the
  // sticky header. Otherwise the page never scrolls (EXPERIENCE › New-task hold).
  $effect(() => {
    const key = tasks.heldKey
    void tasks.rows
    const el = key === null ? null : (list?.querySelector(':scope > li.held') ?? null)
    untrack(() => {
      const prev = held.current
      held.watch(el)
      const focused = focusedInHeld
      focusedInHeld = null
      if (!focused || prev === el || !focused.isConnected) return
      keepFocus(focused)
      focused.scrollIntoView({ block: 'nearest' })
    })
  })

  // Each transition into loading restarts the delay, so a later load (Retry) never flashes.
  $effect(() => {
    if (!loading) return
    skeletonDue = false
    const timer = setTimeout(() => {
      skeletonDue = true
    }, SKELETON_DELAY_MS)
    return () => {
      clearTimeout(timer)
      // Leaving loading: a later load (Retry) starts with no skeleton until its own delay.
      skeletonDue = false
    }
  })

  function submit(e: KeyboardEvent): void {
    // An Enter that confirms an IME composition never adds a task.
    if (e.isComposing || e.keyCode === 229) return
    const text = value.trim()
    if (text === '') return
    e.preventDefault()
    value = ''
    tasks.add(text).catch((failure: unknown) => {
      // The failed text comes back only into an empty input (EXPERIENCE › Add rollback).
      const restored = (failure as { text?: unknown } | null)?.text
      if (typeof restored === 'string' && value === '') value = restored
    })
    returnToInput()
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') submit(e)
    else onInputKeydown(e)
  }

  /** A single-line input: each run of pasted line breaks becomes one space, one task. */
  const LINE_BREAKS = /[\r\n\u2028\u2029]+/g
  function onpaste(e: ClipboardEvent): void {
    const pasted = e.clipboardData?.getData('text/plain') ?? ''
    if (!pasted.match(LINE_BREAKS)) return
    e.preventDefault()
    const el = e.currentTarget as HTMLInputElement
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    el.setRangeText(pasted.replace(LINE_BREAKS, ' '), start, end, 'end')
    value = el.value
  }
</script>

<div class="page" bind:this={page}>
  <header class="top" bind:this={top}>
    <div class="header">
      <h1 class="wordmark">Todo</h1>
      <ThemeToggle />
    </div>

    <label for="new-task" class="visually-hidden">New task</label>
    <input
      id="new-task"
      class="input"
      type="text"
      placeholder="What needs doing?"
      autocomplete="off"
      enterkeyhint="enter"
      bind:this={input}
      bind:value
      {onkeydown}
      {onpaste}
    />

    <div class="toasts" bind:this={toastAnchor}>
      <ToastLayer onretry={() => void tasks.retry()} />
    </div>
  </header>

  <main class="list-area" aria-busy={loading}>
    {#if showList}
      <div class="list">
        {#if tasks.rows.length > 0}
          <!-- Arrow keys and Esc, delegated for every row control (lib/focus.ts). -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <ul aria-label="Tasks" onkeydown={onRowKeydown} bind:this={list}>
            {#each tasks.rows as row (row.key)}
              <li
                class="task"
                class:held={row.key === tasks.heldKey}
                data-task-row
                animate:slideRow
              >
                <TaskRow {row} />
              </li>
            {/each}
          </ul>
        {/if}
        {#if showSkeleton}
          <div class="skeleton" aria-hidden="true" data-testid="skeleton">
            <div class="row"><div class="bar bar-1"></div></div>
            <div class="row"><div class="bar bar-2"></div></div>
            <div class="row"><div class="bar bar-3"></div></div>
          </div>
        {/if}
      </div>
    {:else if showEmpty}
      <p class="empty">{COPY.emptyState}</p>
    {/if}
  </main>
</div>

<LiveRegions />

<style>
  .page {
    --inset: 0;
    box-sizing: border-box;
    max-width: calc(var(--content-max) + 2 * var(--space-8));
    margin-inline: auto;
    padding: 0 var(--space-8) var(--space-10);
  }

  /* Header, input and the toast anchor stay pinned together; rows scroll beneath on bg. */
  .top {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: var(--space-9) var(--inset) var(--space-6);
    background: var(--color-bg);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .wordmark {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: -0.01em;
  }

  .input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: var(--space-4) var(--space-5);
    background: var(--color-surface);
    color: var(--color-text-primary);
    caret-color: var(--color-accent);
    border: 1px solid var(--color-check-ring);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: 0.9375rem;
    font-weight: 400;
    line-height: 1.35;
  }

  .input::placeholder {
    color: var(--color-text-muted);
    opacity: 1;
  }

  .input:focus {
    /* Transparent, so forced-colors mode (which drops box-shadow) still paints a ring. */
    outline: 2px solid transparent;
    outline-offset: -1px;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 1px var(--color-accent);
  }

  /* Overlays the top of the list at input width; never covers the input. With a held row it
     sits 8 px below that row (DESIGN toast.offsetTop): --held-height carries the gap. */
  .toasts {
    position: absolute;
    top: calc(100% + var(--held-height, 0px));
    left: var(--inset);
    right: var(--inset);
    z-index: 1;
  }

  .list-area {
    display: block;
  }

  /* clip, not hidden: it rounds the corners without making a scroll container, so the held
     row's position: sticky works against the page. No scroll anchoring: adding or settling a
     held row never moves the page (EXPERIENCE › New-task hold). */
  .list {
    /* hidden first: Safari < 16 drops clip and still needs the corners clipped. */
    overflow: hidden;
    overflow: clip;
    overflow-anchor: none;
    background: var(--color-surface);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The held new task stays directly below the sticky input regardless of scroll (FR-4), above
     the rows that scroll beneath it and below the toasts (the header's layer). No highlight. */
  .held {
    position: sticky;
    top: var(--sticky-height, 0px);
    z-index: 1;
    background: var(--color-surface);
    /* Its own controls clear only the header: the held row and the toasts are not above it. */
    --held-height: 0px;
    --toast-height: 0px;
  }

  /* Skeleton rows; task rows get the same padding from TaskRow. */
  .row {
    padding: var(--space-3) var(--space-5) var(--space-3) var(--space-row-inset-left);
  }

  .row + .row,
  .task + .task,
  ul + .skeleton {
    border-top: 1px solid var(--color-divider);
  }

  .bar {
    height: calc(0.875rem * 1.35);
    border-radius: var(--radius-sm);
    background: var(--color-hover);
  }

  /* Static widths in CSS, not inline styles: the CSP has no 'unsafe-inline' (AD-19). */
  .bar-1 {
    width: 62%;
  }

  .bar-2 {
    width: 44%;
  }

  .bar-3 {
    width: 53%;
  }

  .empty {
    margin: 0;
    padding: var(--space-empty-state-pad-y) var(--space-5);
    background: var(--color-surface);
    color: var(--color-text-muted);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
  }

  /* Phone: header and input inset 12px from the edge, the list full-bleed. */
  @media (max-width: 599.98px) {
    .page {
      --inset: var(--space-5);
      max-width: none;
      padding: 0 0 var(--space-7);
    }

    .top {
      padding-bottom: var(--space-gap-input-list-phone);
    }

    .list {
      border-inline: 0;
      border-radius: 0;
    }

    .empty {
      margin-inline: var(--inset);
    }
  }
</style>
