import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  installSafetyNet,
  installTypeToFocus,
  onInputKeydown,
  onRowKeydown,
  registerInput,
  returnToInput,
} from './focus'

function stubHover(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(hover: hover)' && matches, media: query })),
  )
}

let input: HTMLInputElement
const uninstall: Array<() => void> = []

beforeEach(() => {
  document.body.innerHTML = '<input id="new-task" /><button id="other">other</button>'
  input = document.querySelector('input')!
  registerInput(input)
  stubHover(true)
})

afterEach(() => {
  while (uninstall.length) uninstall.pop()!()
  registerInput(null)
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function renderRows(count: number): void {
  const list = document.createElement('ul')
  for (let i = 1; i <= count; i++) {
    const row = document.createElement('li')
    row.dataset.taskRow = ''
    row.innerHTML = `<button data-row-control="tick" id="tick-${i}">tick</button><button data-row-control="delete" id="delete-${i}">delete</button>`
    list.append(row)
  }
  document.body.append(list)
}

function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('returnToInput', () => {
  it('focuses the input without scrolling on laptop', () => {
    const spy = vi.spyOn(input, 'focus')
    returnToInput()
    expect(document.activeElement).toBe(input)
    expect(spy).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('does nothing on phone', () => {
    stubHover(false)
    document.getElementById('other')!.focus()
    returnToInput()
    expect(document.activeElement).toBe(document.getElementById('other'))
  })

  it('does nothing without a registered input, or without matchMedia', () => {
    registerInput(null)
    returnToInput()
    expect(document.activeElement).toBe(document.body)

    registerInput(input)
    vi.stubGlobal('matchMedia', undefined)
    returnToInput()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('installSafetyNet', () => {
  it('moves focus to the input when the focused element is removed', async () => {
    uninstall.push(installSafetyNet())
    const button = document.getElementById('other')!
    button.focus()
    button.remove()
    await flushMicrotasks()
    expect(document.activeElement).toBe(input)
  })

  it('leaves focus on the body when the focused element stays connected', async () => {
    uninstall.push(installSafetyNet())
    const button = document.getElementById('other')!
    button.focus()
    button.blur()
    document.body.append(document.createElement('p'))
    await flushMicrotasks()
    expect(document.activeElement).toBe(document.body)
  })

  it('forgets an element focus left by a blank-space click, so its later removal is ignored', async () => {
    uninstall.push(installSafetyNet())
    const button = document.getElementById('other')!
    button.focus()
    button.blur()
    await flushMicrotasks()
    button.remove()
    await flushMicrotasks()
    expect(document.activeElement).toBe(document.body)
  })

  it('does nothing on phone', async () => {
    stubHover(false)
    uninstall.push(installSafetyNet())
    const button = document.getElementById('other')!
    button.focus()
    button.remove()
    await flushMicrotasks()
    expect(document.activeElement).not.toBe(input)
  })

  it('stops after uninstall', async () => {
    installSafetyNet()()
    const button = document.getElementById('other')!
    button.focus()
    button.remove()
    await flushMicrotasks()
    expect(document.activeElement).not.toBe(input)
  })

  it('also reacts to focusout without a relatedTarget', async () => {
    uninstall.push(installSafetyNet())
    // Outside <body>, so the MutationObserver cannot see the removal: only focusout can.
    const button = document.createElement('button')
    document.documentElement.append(button)
    button.focus()
    button.remove()
    document.dispatchEvent(new FocusEvent('focusout'))
    await flushMicrotasks()
    expect(document.activeElement).toBe(input)
  })
})

describe('installTypeToFocus', () => {
  it('focuses the input and inserts the character exactly once', () => {
    uninstall.push(installTypeToFocus())
    const onInput = vi.fn()
    input.addEventListener('input', onInput)
    const e = key(document.body, { key: 'k' })
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('k')
    expect(e.defaultPrevented).toBe(true)
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  it('inserts at the caret, replacing a selection', () => {
    uninstall.push(installTypeToFocus())
    input.value = 'mlk'
    input.setSelectionRange(1, 2)
    key(document.body, { key: 'i' })
    expect(input.value).toBe('mik')
    expect(input.selectionStart).toBe(2)
  })

  it('accepts AltGr characters, reported as Ctrl+Alt', () => {
    uninstall.push(installTypeToFocus())
    key(document.body, { key: '@', ctrlKey: true, altKey: true, modifierAltGraph: true })
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('@')
  })

  it.each([
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['Meta+K', { key: 'k', metaKey: true }],
    ['Alt+K', { key: 'k', altKey: true }],
    ['Tab', { key: 'Tab' }],
    ['Space', { key: ' ' }],
    ['Enter', { key: 'Enter' }],
  ])('ignores %s', (_name, init) => {
    uninstall.push(installTypeToFocus())
    key(document.body, init)
    expect(document.activeElement).toBe(document.body)
    expect(input.value).toBe('')
  })

  it('ignores keys while a control has focus', () => {
    uninstall.push(installTypeToFocus())
    const button = document.getElementById('other')!
    button.focus()
    key(button, { key: 'k' })
    expect(document.activeElement).toBe(button)
    expect(input.value).toBe('')
  })

  it('does nothing on phone or after uninstall', () => {
    stubHover(false)
    const off = installTypeToFocus()
    key(document.body, { key: 'k' })
    expect(input.value).toBe('')

    stubHover(true)
    off()
    key(document.body, { key: 'k' })
    expect(input.value).toBe('')
  })
})

describe('row navigation', () => {
  const el = (id: string) => document.getElementById(id)!

  it('works as a delegated keydown listener on the list', () => {
    renderRows(3)
    document.querySelector('ul')!.addEventListener('keydown', onRowKeydown)
    el('delete-2').focus()

    const down = key(el('delete-2'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(el('delete-3'))
    expect(down.defaultPrevented).toBe(true)

    key(el('delete-3'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(el('delete-2'))
  })

  function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    Object.defineProperty(e, 'target', { value: target })
    onRowKeydown(e)
    return e
  }

  it('Down / Up / Up on row 1 / Esc → row 3 delete / row 1 delete / input / input', () => {
    renderRows(3)
    el('delete-2').focus()
    press(el('delete-2'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(el('delete-3'))

    el('delete-2').focus()
    press(el('delete-2'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(el('delete-1'))

    press(el('delete-1'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input)

    el('tick-3').focus()
    const esc = press(el('tick-3'), { key: 'Escape' })
    expect(document.activeElement).toBe(input)
    expect(esc.defaultPrevented).toBe(true)
  })

  it('keeps the tick type and uses the DOM order at keypress', () => {
    renderRows(2)
    const list = document.querySelector('ul')!
    list.prepend(list.lastElementChild!)
    // DOM order is now row 2, row 1.
    el('tick-2').focus()
    press(el('tick-2'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(el('tick-1'))
  })

  it('stays put on Down from the last row, and ignores other keys, modifiers and non-rows', () => {
    renderRows(1)
    el('tick-1').focus()
    const down = press(el('tick-1'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(el('tick-1'))
    expect(down.defaultPrevented).toBe(true)

    const other = press(el('tick-1'), { key: 'a' })
    expect(other.defaultPrevented).toBe(false)
    press(el('tick-1'), { key: 'Escape', shiftKey: true })
    expect(document.activeElement).toBe(el('tick-1'))

    const outside = press(el('other'), { key: 'Escape' })
    expect(outside.defaultPrevented).toBe(false)
  })

  it('moves Up from row 1 to the input even on phone', () => {
    stubHover(false)
    renderRows(2)
    el('tick-1').focus()
    press(el('tick-1'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(input)
  })

  it('moves to the input on Esc even on phone (an explicit keyboard request)', () => {
    stubHover(false)
    renderRows(1)
    el('tick-1').focus()
    press(el('tick-1'), { key: 'Escape' })
    expect(document.activeElement).toBe(input)
  })
})

describe('onInputKeydown', () => {
  function press(init: KeyboardEventInit): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    onInputKeydown(e)
    return e
  }

  it("moves Down to the first row's tick ring", () => {
    renderRows(2)
    input.focus()
    const e = press({ key: 'ArrowDown' })
    expect(document.activeElement).toBe(document.getElementById('tick-1'))
    expect(e.defaultPrevented).toBe(true)
  })

  it('does nothing during IME composition', () => {
    renderRows(1)
    input.focus()
    const e = press({ key: 'ArrowDown', isComposing: true })
    expect(document.activeElement).toBe(input)
    expect(e.defaultPrevented).toBe(false)
  })

  it('does nothing with no rows, other keys or modifiers', () => {
    input.focus()
    expect(press({ key: 'ArrowDown' }).defaultPrevented).toBe(false)
    renderRows(1)
    press({ key: 'ArrowUp' })
    press({ key: 'ArrowDown', shiftKey: true })
    expect(document.activeElement).toBe(input)
  })
})
