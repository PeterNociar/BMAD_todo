import { render, screen } from '@testing-library/svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY, toasts } from '../lib/toasts.svelte'
import LiveRegions from './LiveRegions.svelte'
import ToastLayer from './ToastLayer.svelte'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const t of [...toasts.items]) toasts.dismiss(t.id)
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('LiveRegions', () => {
  it('renders one polite status and one alert region, both empty, from first paint', () => {
    render(LiveRegions)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status').textContent).toBe('')
    expect(screen.getByRole('alert').textContent).toBe('')
  })

  it('announces an error toast in the polite region and the load failure in the alert region', () => {
    render(LiveRegions)
    toasts.error('action_failed')
    toasts.showLoadFailure()
    vi.advanceTimersByTime(0)
    flushSync()
    expect(screen.getByRole('status')).toHaveTextContent(COPY.actionFailed)
    expect(screen.getByRole('alert')).toHaveTextContent(COPY.loadFailed)
    toasts.hideLoadFailure()
  })

  it('is the only live region when rendered with the toast layer', () => {
    render(LiveRegions)
    render(ToastLayer, { onretry: vi.fn() })
    toasts.error('add_failed')
    toasts.showLoadFailure()
    flushSync()

    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1)
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
    const layer = document.querySelector('.toast-layer')!
    expect(layer.querySelectorAll('.toast')).toHaveLength(2)
    expect(layer.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0)
    toasts.hideLoadFailure()
  })
})
