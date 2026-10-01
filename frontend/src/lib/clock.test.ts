import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const T = Date.parse('2026-10-01T09:00:00.000Z')

let clock: (typeof import('./clock.svelte'))['clock']

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(T)
  vi.resetModules()
  ;({ clock } = await import('./clock.svelte'))
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('clock', () => {
  it('starts at the wall clock', () => {
    expect(clock.now).toBe(T)
  })

  it('refreshes every 30 s and not before', () => {
    vi.advanceTimersByTime(29_999)
    expect(clock.now).toBe(T)

    vi.advanceTimersByTime(1)
    expect(clock.now).toBe(T + 30_000)

    vi.advanceTimersByTime(30_000)
    expect(clock.now).toBe(T + 60_000)
  })

  it('refreshes when the page becomes visible, not when it is hidden', () => {
    vi.setSystemTime(T + 5_000)
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.now).toBe(T)

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(clock.now).toBe(T + 5_000)
  })

  it.each(['focus', 'pageshow'])('refreshes on window %s', (type) => {
    vi.setSystemTime(T + 7_000)
    expect(clock.now).toBe(T)

    window.dispatchEvent(new Event(type))
    expect(clock.now).toBe(T + 7_000)
  })

  it('sample() returns the wall clock and sets now to it', () => {
    vi.setSystemTime(T + 1_234)

    expect(clock.sample()).toBe(T + 1_234)
    expect(clock.now).toBe(T + 1_234)
  })
})
