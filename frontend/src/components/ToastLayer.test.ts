import { fireEvent, render, within } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY, toasts } from '../lib/toasts.svelte'
import ToastLayer from './ToastLayer.svelte'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const t of [...toasts.items]) toasts.dismiss(t.id)
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

function toastEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.toast'))
}

describe('ToastLayer', () => {
  it('shows an error toast with a decorative icon and a Dismiss button', () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('action_failed')
    flushSync()

    const [toast] = toastEls()
    expect(toast).toHaveTextContent("Couldn't update that task. It's back as it was.")
    const icon = toast.querySelector('svg.icon')!
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    const close = within(toast).getByRole('button', { name: 'Dismiss' })
    expect(within(toast).queryByRole('button', { name: COPY.retry })).not.toBeInTheDocument()

    close.click()
    flushSync()
    expect(toastEls()).toHaveLength(0)
  })

  it('shows two, newest first', () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    toasts.error('add_too_long')
    toasts.error('action_failed')
    flushSync()
    expect(toastEls().map((t) => t.textContent?.trim())).toEqual([
      COPY.actionFailed,
      COPY.addTooLong,
    ])
  })

  it('gives the load-failure toast Retry (calls onretry) and no Dismiss', () => {
    const onretry = vi.fn()
    render(ToastLayer, { onretry })
    toasts.showLoadFailure()
    toasts.error('add_failed')
    toasts.error('action_failed')
    flushSync()

    const els = toastEls()
    expect(els.map((t) => t.dataset.toastKind)).toEqual(['action_failed', 'load_failed'])
    const load = els[1]
    expect(within(load).queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    within(load).getByRole('button', { name: 'Retry' }).click()
    expect(onretry).toHaveBeenCalledTimes(1)
    toasts.hideLoadFailure()
  })

  it('auto-dismisses after 5 s', () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    flushSync()
    vi.advanceTimersByTime(4_999)
    flushSync()
    expect(toastEls()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    flushSync()
    expect(toastEls()).toHaveLength(0)
  })

  it('pauses while hovered with a mouse', async () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    flushSync()
    vi.advanceTimersByTime(3_000)
    await fireEvent.pointerEnter(toastEls()[0], { pointerType: 'mouse' })
    vi.advanceTimersByTime(10_000)
    flushSync()
    expect(toastEls()).toHaveLength(1)

    await fireEvent.pointerLeave(toastEls()[0], { pointerType: 'mouse' })
    vi.advanceTimersByTime(1_999)
    flushSync()
    expect(toastEls()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    flushSync()
    expect(toastEls()).toHaveLength(0)
  })

  it('pauses while focus is inside, also when hover ends first', async () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    flushSync()
    const toast = toastEls()[0]
    await fireEvent.pointerEnter(toast, { pointerType: 'mouse' })
    await fireEvent.focusIn(within(toast).getByRole('button'))
    await fireEvent.pointerLeave(toast, { pointerType: 'mouse' })
    vi.advanceTimersByTime(10_000)
    flushSync()
    expect(toastEls()).toHaveLength(1)

    await fireEvent.focusOut(within(toast).getByRole('button'))
    vi.advanceTimersByTime(5_000)
    flushSync()
    expect(toastEls()).toHaveLength(0)
  })

  it('ignores a touch tap, which never sends a leave', async () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    flushSync()
    await fireEvent.pointerEnter(toastEls()[0], { pointerType: 'touch' })
    vi.advanceTimersByTime(5_000)
    flushSync()
    expect(toastEls()).toHaveLength(0)
  })

  it('never takes focus', () => {
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    toasts.showLoadFailure()
    flushSync()
    expect(document.activeElement).toBe(document.body)
    toasts.hideLoadFailure()
  })
})
