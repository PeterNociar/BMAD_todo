/**
 * The one module that moves focus programmatically (AD-18). The store never moves focus;
 * components call `returnToInput()` after a store action.
 *
 * Row markup contract: each row carries `data-task-row`, and its controls carry
 * `data-row-control="tick"` or `data-row-control="delete"`.
 */
let input: HTMLInputElement | null = null

export function registerInput(el: HTMLInputElement | null): void {
  input = el
}

/** The single laptop-vs-phone test (EXPERIENCE "laptop" = the primary pointer can hover). */
function isLaptop(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover)').matches
}

function focusInput(): boolean {
  if (!input || !input.isConnected) return false
  input.focus({ preventScroll: true })
  return true
}

/** Focuses the input without scrolling, on laptop only (phone: no soft keyboard pop-up). */
export function returnToInput(): void {
  if (isLaptop()) focusInput()
}

function nothingFocused(): boolean {
  const active = document.activeElement
  return active === null || active === document.body
}

/**
 * When the focused element leaves the DOM and focus falls to the body, focus goes to the
 * input (laptop only). Clicking blank space leaves the element connected, so it is ignored.
 * A MutationObserver backs up `focusout`, which not every engine fires on removal.
 */
export function installSafetyNet(): () => void {
  let lastFocused: Element | null = null

  const check = () => {
    if (!lastFocused || lastFocused.isConnected || !nothingFocused()) return
    lastFocused = null
    returnToInput()
  }
  const onFocusIn = (e: FocusEvent) => {
    lastFocused = e.target instanceof Element ? e.target : null
  }
  const onFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget) return
    queueMicrotask(() => {
      check()
      // Focus left to the body with the element still there (a blank-space click): forget it,
      // so a later, unrelated removal of that element doesn't pull focus to the input.
      if (lastFocused?.isConnected && nothingFocused()) lastFocused = null
    })
  }
  const observer = new MutationObserver(check)

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  observer.observe(document.body, { childList: true, subtree: true })
  return () => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    observer.disconnect()
  }
}

/** One printable character, not a space (Space keeps scrolling the page). */
function isPrintable(key: string): boolean {
  return [...key].length === 1 && key.trim() !== ''
}

/**
 * With nothing focused, a printable key without Ctrl, Meta or Alt focuses the input and
 * inserts the character at the caret, exactly once (laptop only).
 */
export function installTypeToFocus(): () => void {
  const onKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return
    // AltGr characters (@, € on European layouts) arrive as Ctrl+Alt.
    const altGraph = e.getModifierState('AltGraph')
    if (!altGraph && (e.ctrlKey || e.metaKey || e.altKey)) return
    if (!isPrintable(e.key) || !nothingFocused() || !input || !isLaptop()) return
    const el = input
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    if (!focusInput()) return
    e.preventDefault()
    el.setRangeText(e.key, start, end, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  document.addEventListener('keydown', onKeydown)
  return () => document.removeEventListener('keydown', onKeydown)
}

function hasModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || e.shiftKey
}

function rows(): Element[] {
  return Array.from(document.querySelectorAll('[data-task-row]'))
}

function control(row: Element | undefined, type: string): HTMLElement | null {
  return row?.querySelector<HTMLElement>(`[data-row-control="${type}"]`) ?? null
}

/** Down Arrow in the input moves to the first row's tick ring. */
export function onInputKeydown(e: KeyboardEvent): void {
  if (e.key !== 'ArrowDown' || e.isComposing || hasModifier(e)) return
  const tick = control(rows()[0], 'tick')
  if (!tick) return
  e.preventDefault()
  tick.focus()
}

/**
 * Up/Down move to the same control type in the previous/next row, in DOM order at keypress.
 * Up from the first row, or Esc from any row, returns to the input.
 */
export function onRowKeydown(e: KeyboardEvent): void {
  if (hasModifier(e) || !(e.target instanceof Element)) return
  const row = e.target.closest('[data-task-row]')
  if (!row) return

  if (e.key === 'Escape') {
    if (focusInput()) e.preventDefault()
    return
  }
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

  const type = e.target.closest<HTMLElement>('[data-row-control]')?.dataset.rowControl
  if (!type) return
  const all = rows()
  const index = all.indexOf(row)
  e.preventDefault()
  if (e.key === 'ArrowUp' && index === 0) {
    focusInput()
    return
  }
  control(all[e.key === 'ArrowUp' ? index - 1 : index + 1], type)?.focus()
}
