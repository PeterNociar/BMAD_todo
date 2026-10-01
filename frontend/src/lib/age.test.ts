import { describe, expect, it } from 'vitest'
import { ageLabel } from './age'

const NOW = Date.parse('2026-10-01T12:00:00.000Z')
const S = 1_000
const M = 60 * S
const H = 60 * M
const D = 24 * H

/** The wire timestamp `ms` before NOW. */
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('ageLabel', () => {
  it.each([
    ['0 s', 0, 'now'],
    ['59 s', 59 * S, 'now'],
    ['60 s', 60 * S, '1m'],
    ['59 m 59 s', 59 * M + 59 * S, '59m'],
    ['1 h', H, '1h'],
    ['23 h 59 m', 23 * H + 59 * M, '23h'],
    ['24 h', 24 * H, '1d'],
    ['47 h', 47 * H, '1d'],
    ['3 d', 3 * D, '3d'],
    ['100 d', 100 * D, '100d'],
  ])('an open task aged %s reads %s', (_, ms, label) => {
    expect(ageLabel(ago(ms), NOW, false).label).toBe(label)
  })

  it.each([
    ['0 s', 0, 'done now'],
    ['59 s', 59 * S, 'done now'],
    ['60 s', 60 * S, 'done 1m'],
    ['59 m 59 s', 59 * M + 59 * S, 'done 59m'],
    ['1 h', H, 'done 1h'],
    ['2 h', 2 * H, 'done 2h'],
    ['23 h 59 m', 23 * H + 59 * M, 'done 23h'],
    ['24 h', 24 * H, 'done 1d'],
    ['47 h', 47 * H, 'done 1d'],
    ['100 d', 100 * D, 'done 100d'],
  ])('a task completed %s ago reads %s', (_, ms, label) => {
    expect(ageLabel(ago(ms), NOW, true).label).toBe(label)
  })

  it.each([
    ['5 h open', 5 * H, false, 'added 5 hours ago'],
    ['2 h done', 2 * H, true, 'completed 2 hours ago'],
    ['30 s open', 30 * S, false, 'added just now'],
    ['30 s done', 30 * S, true, 'completed just now'],
    ['1 h open', H, false, 'added 1 hour ago'],
    ['1 m open', M, false, 'added 1 minute ago'],
    ['12 m open', 12 * M, false, 'added 12 minutes ago'],
    ['1 d open', D, false, 'added 1 day ago'],
    ['3 d done', 3 * D, true, 'completed 3 days ago'],
  ])('%s is spoken as "%s"', (_, ms, done, words) => {
    expect(ageLabel(ago(ms), NOW, done).words).toBe(words)
  })

  it('clamps a future timestamp to now, never a negative age', () => {
    expect(ageLabel(ago(-10 * S), NOW, false)).toEqual({ label: 'now', words: 'added just now' })
    expect(ageLabel(ago(-2 * H), NOW, true)).toEqual({
      label: 'done now',
      words: 'completed just now',
    })
  })

  it('returns the label and the words for the same value', () => {
    expect(ageLabel(ago(5 * H + 59 * M), NOW, false)).toEqual({
      label: '5h',
      words: 'added 5 hours ago',
    })
  })
})
