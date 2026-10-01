import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COPY, toasts } from './toasts.svelte'

function messages(): string[] {
  return toasts.items.map((t) => t.message)
}

/** Puts both regions in a known state, whatever earlier tests left there. */
function primeRegions(): void {
  toasts.announce('added', 'prime')
  toasts.alert('prime')
  vi.advanceTimersByTime(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.parse('2026-10-01T09:00:00.000Z'))
})

afterEach(() => {
  // The module is a singleton: empty it between tests through its own API.
  for (const t of [...toasts.items]) toasts.dismiss(t.id)
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('toasts.error', () => {
  it('pushes a transient toast with the verbatim copy and announces it politely once', () => {
    const seen: string[] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(toasts.politeText)
      })
    })
    flushSync()

    toasts.error('action_failed')
    expect(toasts.items).toEqual([
      expect.objectContaining({
        kind: 'action_failed',
        message: "Couldn't update that task. It's back as it was.",
        transient: true,
      }),
    ])
    flushSync()
    vi.advanceTimersByTime(0)
    flushSync()
    expect(seen.filter((t) => t === COPY.actionFailed)).toHaveLength(1)
    expect(toasts.politeText).toBe(COPY.actionFailed)
    expect(toasts.alertText).toBe('')
    cleanup()
  })

  it('uses the too-long copy and the add-failed copy', () => {
    toasts.error('add_too_long')
    toasts.error('add_failed')
    expect(messages()).toEqual([
      "Couldn't save new task.",
      "Couldn't save new task. It's too long.",
    ])
  })

  it('auto-dismisses after 5 s', () => {
    toasts.error('add_failed')
    vi.advanceTimersByTime(4_999)
    expect(toasts.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.items).toHaveLength(0)
  })

  it('shows at most two, newest first, dropping the oldest', () => {
    toasts.error('add_failed')
    toasts.error('add_too_long')
    toasts.error('action_failed')
    expect(messages()).toEqual([COPY.actionFailed, COPY.addTooLong])
  })

  it('cancels the timer of a dropped toast', () => {
    toasts.error('add_failed')
    toasts.error('add_too_long')
    toasts.error('action_failed')
    vi.advanceTimersByTime(0)
    // The two shown toasts' timers only; the dropped toast's timer is gone.
    expect(vi.getTimerCount()).toBe(2)
    vi.advanceTimersByTime(5_000)
    expect(toasts.items).toHaveLength(0)
  })
})

describe('hold and release', () => {
  it('pauses while held and resumes from the time that remained', () => {
    toasts.error('action_failed')
    const { id } = toasts.items[0]
    vi.advanceTimersByTime(3_000)
    toasts.hold(id)
    vi.advanceTimersByTime(10_000)
    expect(toasts.items).toHaveLength(1)

    toasts.release(id)
    vi.advanceTimersByTime(1_999)
    expect(toasts.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.items).toHaveLength(0)
  })

  it('nests holds: the timer resumes only when every hold is released', () => {
    toasts.error('action_failed')
    const { id } = toasts.items[0]
    toasts.hold(id)
    toasts.hold(id)
    toasts.release(id)
    vi.advanceTimersByTime(10_000)
    expect(toasts.items).toHaveLength(1)
    toasts.release(id)
    vi.advanceTimersByTime(5_000)
    expect(toasts.items).toHaveLength(0)
  })

  it('ignores unknown ids and unbalanced releases', () => {
    toasts.error('action_failed')
    const { id } = toasts.items[0]
    toasts.hold(999)
    toasts.release(999)
    toasts.release(id)
    vi.advanceTimersByTime(5_000)
    expect(toasts.items).toHaveLength(0)
  })

  it('never resumes with more than the time that remained, even if the clock steps back', () => {
    toasts.error('action_failed')
    const { id } = toasts.items[0]
    vi.advanceTimersByTime(1_000)
    vi.setSystemTime(Date.now() - 10_000)
    toasts.hold(id)
    toasts.release(id)
    vi.advanceTimersByTime(4_999)
    expect(toasts.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.items).toHaveLength(0)
  })

  it('dismiss removes a held toast', () => {
    toasts.error('action_failed')
    const { id } = toasts.items[0]
    toasts.hold(id)
    toasts.dismiss(id)
    expect(toasts.items).toHaveLength(0)
    toasts.release(id)
    expect(toasts.items).toHaveLength(0)
  })
})

describe('the load-failure toast', () => {
  it('is idempotent and alerts once', () => {
    const seen: string[] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(toasts.alertText)
      })
    })
    flushSync()
    const politeBefore = toasts.politeText

    toasts.showLoadFailure()
    toasts.showLoadFailure()
    vi.advanceTimersByTime(0)
    flushSync()
    expect(toasts.items).toEqual([
      expect.objectContaining({
        kind: 'load_failed',
        message: "Couldn't load your tasks.",
        transient: false,
      }),
    ])
    expect(seen.filter((t) => t === COPY.loadFailed)).toHaveLength(1)
    expect(toasts.politeText).toBe(politeBefore)

    toasts.hideLoadFailure()
    toasts.hideLoadFailure()
    expect(toasts.items).toHaveLength(0)
    cleanup()
  })

  it('clears the alert region on recovery', () => {
    toasts.showLoadFailure()
    vi.advanceTimersByTime(0)
    expect(toasts.alertText).toBe(COPY.loadFailed)
    toasts.hideLoadFailure()
    expect(toasts.alertText).toBe('')
  })

  it('cancels a same-tick pending alert when hidden', () => {
    toasts.showLoadFailure()
    toasts.hideLoadFailure()
    vi.advanceTimersByTime(0)
    expect(toasts.alertText).toBe('')
  })

  it('never auto-dismisses', () => {
    toasts.showLoadFailure()
    vi.advanceTimersByTime(60_000)
    expect(toasts.items).toHaveLength(1)
    toasts.hideLoadFailure()
  })

  it('is pinned: two errors leave it plus the newest transient one, newest first', () => {
    toasts.showLoadFailure()
    toasts.error('add_failed')
    toasts.error('action_failed')
    expect(messages()).toEqual([COPY.actionFailed, COPY.loadFailed])
    toasts.hideLoadFailure()
  })

  it('drops the oldest transient toast when it arrives with two shown', () => {
    toasts.error('add_failed')
    toasts.error('action_failed')
    toasts.showLoadFailure()
    expect(messages()).toEqual([COPY.loadFailed, COPY.actionFailed])
    toasts.hideLoadFailure()
  })
})

describe('announce and alert', () => {
  it.each([
    ['added', 'Added: milk'],
    ['done', 'Marked done: milk'],
    ['undone', 'Marked not done: milk'],
    ['deleted', 'Deleted: milk'],
  ] as const)('%s → %s', (kind, text) => {
    toasts.announce(kind, 'milk')
    vi.advanceTimersByTime(0)
    expect(toasts.politeText).toBe(text)
    expect(toasts.items).toHaveLength(0)
  })

  it('follows the last delete with the empty-state text', () => {
    toasts.announce('deleted', 'milk', { listEmpty: true })
    vi.advanceTimersByTime(0)
    expect(toasts.politeText).toBe(
      'Deleted: milk. Nothing waiting. Type a task above and press Enter.',
    )
  })

  it('clears the region between two identical messages, so each is announced', () => {
    primeRegions()
    const seen: string[] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(toasts.politeText)
      })
    })
    flushSync()

    toasts.announce('added', 'milk')
    flushSync()
    vi.advanceTimersByTime(0)
    flushSync()
    toasts.announce('added', 'milk')
    flushSync()
    vi.advanceTimersByTime(0)
    flushSync()

    expect(seen).toEqual(['Added: prime', '', 'Added: milk', '', 'Added: milk'])
    cleanup()
  })

  it('joins two same-tick messages into one announcement', () => {
    primeRegions()
    const seen: string[] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(toasts.politeText)
      })
    })
    flushSync()

    toasts.error('action_failed')
    toasts.announce('added', 'milk')
    flushSync()
    vi.advanceTimersByTime(0)
    flushSync()

    expect(seen).toEqual(['Added: prime', '', `${COPY.actionFailed} Added: milk`])
    cleanup()
  })

  it('alert sets the alert region, cleared first', () => {
    primeRegions()
    expect(toasts.alertText).toBe('prime')
    toasts.alert(COPY.retryFailed)
    expect(toasts.alertText).toBe('')
    vi.advanceTimersByTime(0)
    expect(toasts.alertText).toBe("Still couldn't load your tasks.")
  })
})
