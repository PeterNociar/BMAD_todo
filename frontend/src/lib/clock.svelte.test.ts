import { flushSync } from 'svelte'
import { afterAll, expect, it, vi } from 'vitest'

// The clock is imported statically (no vi.resetModules), so it shares this file's Svelte
// runtime and an effect here can track it. Fake time must be installed before that import.
const T = vi.hoisted(() => {
  const t = Date.parse('2026-10-01T09:00:00.000Z')
  vi.useFakeTimers()
  vi.setSystemTime(t)
  return t
})

import { clock } from './clock.svelte'

afterAll(() => {
  vi.useRealTimers()
})

it('is reactive: an effect reading clock.now re-runs after the 30 s tick', () => {
  const seen: number[] = []
  const cleanup = $effect.root(() => {
    $effect(() => {
      seen.push(clock.now)
    })
  })
  flushSync()
  expect(seen).toEqual([T])

  vi.advanceTimersByTime(30_000)
  flushSync()
  expect(seen).toEqual([T, T + 30_000])
  cleanup()
})
