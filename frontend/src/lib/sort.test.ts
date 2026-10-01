import { describe, expect, it } from 'vitest'
import fixtures from '../../../contracts/ordering-cases.json'
import { sortTasks, type Sortable } from './sort'

describe('sortTasks against contracts/ordering-cases.json', () => {
  it('includes the ties AD-6 requires', () => {
    const names = fixtures.cases.map((c) => c.name)
    expect(names).toContain('same_ms_open_tie')
    expect(names).toContain('cross_group_tie')
  })

  it.each(fixtures.cases.map((c) => [c.name, c] as const))('%s', (_name, fixture) => {
    const tasks = fixture.tasks.map((t) => ({ ...t, key: t.id }))

    expect(sortTasks(tasks).map((t) => t.id)).toEqual(fixture.expected)
  })
})

describe('sortTasks', () => {
  const open = (id: string | null, key: string, added_at: string): Sortable => ({
    id,
    key,
    added_at,
    completed_at: null,
  })
  const T = '2026-09-30T12:00:00.123Z'

  it('returns a new array and never mutates its input', () => {
    const input = [open('b', 'b', T), open('a', 'a', T)]
    const snapshot = [...input]

    const sorted = sortTasks(input)

    expect(sorted).not.toBe(input)
    expect(input).toEqual(snapshot)
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('puts id-less tasks after confirmed ones on a tie, ordered by key', () => {
    const tasks = [
      open(null, 'k-zz', T),
      open('c', 'c', T),
      open(null, 'k-aa', T),
      open('a', 'a', T),
    ]

    expect(sortTasks(tasks).map((t) => t.key)).toEqual(['a', 'c', 'k-aa', 'k-zz'])
  })

  it('ignores the key between two confirmed tasks', () => {
    const tasks = [open('b', 'aaa', T), open('a', 'zzz', T)]

    expect(sortTasks(tasks).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('still sorts a pending task by its provisional timestamp before the tie rules', () => {
    const tasks = [open('a', 'a', '2026-09-30T12:00:00.124Z'), open(null, 'k', T)]

    expect(sortTasks(tasks).map((t) => t.key)).toEqual(['k', 'a'])
  })

  it('compares timestamps as numbers, not strings', () => {
    // Without the .sssZ form, string order would put "…:00Z" after "…:00.500Z".
    const tasks = [
      open('a', 'a', '2026-09-30T12:00:00.500Z'),
      open('b', 'b', '2026-09-30T12:00:00Z'),
    ]

    expect(sortTasks(tasks).map((t) => t.id)).toEqual(['b', 'a'])
  })
})
