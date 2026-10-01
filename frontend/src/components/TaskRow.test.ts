import { fireEvent, render, screen } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../lib/tasks.svelte'
import TaskRow from './TaskRow.svelte'

const store = vi.hoisted(() => ({ tick: vi.fn(), untick: vi.fn(), remove: vi.fn() }))
const focus = vi.hoisted(() => ({ returnToInput: vi.fn() }))

vi.mock('../lib/tasks.svelte', () => ({ tasks: store }))
vi.mock('../lib/focus', () => focus)

function row(overrides: Partial<Row> = {}): Row {
  return {
    key: 'k1',
    id: '6f1c2a9b-7d10-4c1e-9a3b-000000000001',
    text: 'milk',
    added_at: '2026-09-30T08:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

const done = (r: Partial<Row> = {}) => row({ completed_at: '2026-09-30T09:00:00.000Z', ...r })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TaskRow', () => {
  it('names the controls after the task text and marks them for lib/focus', () => {
    render(TaskRow, { row: row() })

    const tick = screen.getByRole('button', { name: 'Mark "milk" done' })
    const del = screen.getByRole('button', { name: 'Delete "milk"' })
    expect(tick).toHaveAttribute('data-row-control', 'tick')
    expect(del).toHaveAttribute('data-row-control', 'delete')
    expect(tick).toHaveAttribute('type', 'button')
    expect(del).toHaveAttribute('type', 'button')
  })

  it('hides every icon from assistive tech', () => {
    const { container } = render(TaskRow, { row: row() })

    const icons = container.querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    for (const icon of icons) expect(icon).toHaveAttribute('aria-hidden', 'true')
  })

  it('an open row shows the empty ring and primary text', () => {
    const { container } = render(TaskRow, { row: row() })

    expect(container.querySelector('.ring')).not.toBeNull()
    expect(container.querySelector('.fill')).toBeNull()
    expect(container.querySelector('.task-row')).not.toHaveClass('done')
  })

  it('a completed row shows the filled check and muted text, and the "not done" name', () => {
    const { container } = render(TaskRow, { row: done() })

    expect(screen.getByRole('button', { name: 'Mark "milk" not done' })).toBeInTheDocument()
    expect(container.querySelector('.fill')).not.toBeNull()
    expect(container.querySelector('.check')).not.toBeNull()
    expect(container.querySelector('.ring')).toBeNull()
    expect(container.querySelector('.task-row')).toHaveClass('done')
  })

  it('renders the text as plain text, never HTML', () => {
    const { container } = render(TaskRow, { row: row({ text: '<img src=x onerror=alert(1)>' }) })

    expect(container.querySelector('.text')).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img')).toBeNull()
  })

  it('the tick on an open row ticks it by key, then returns to the input', async () => {
    render(TaskRow, { row: row({ key: 'opt-1' }) })

    await fireEvent.click(screen.getByRole('button', { name: 'Mark "milk" done' }))

    expect(store.tick).toHaveBeenCalledWith('opt-1')
    expect(store.untick).not.toHaveBeenCalled()
    expect(focus.returnToInput).toHaveBeenCalledTimes(1)
    expect(store.tick.mock.invocationCallOrder[0]).toBeLessThan(
      focus.returnToInput.mock.invocationCallOrder[0],
    )
  })

  it('the tick on a completed row unticks it by key, then returns to the input', async () => {
    render(TaskRow, { row: done({ key: 'opt-2' }) })

    await fireEvent.click(screen.getByRole('button', { name: 'Mark "milk" not done' }))

    expect(store.untick).toHaveBeenCalledWith('opt-2')
    expect(store.tick).not.toHaveBeenCalled()
    expect(focus.returnToInput).toHaveBeenCalledTimes(1)
  })

  it('delete removes the task by key, then returns to the input', async () => {
    render(TaskRow, { row: row({ key: 'opt-3' }) })

    await fireEvent.click(screen.getByRole('button', { name: 'Delete "milk"' }))

    expect(store.remove).toHaveBeenCalledWith('opt-3')
    expect(focus.returnToInput).toHaveBeenCalledTimes(1)
    expect(store.remove.mock.invocationCallOrder[0]).toBeLessThan(
      focus.returnToInput.mock.invocationCallOrder[0],
    )
  })

  it('follows a row that changes state', async () => {
    const view = render(TaskRow, { row: row() })

    await view.rerender({ row: done() })

    expect(screen.getByRole('button', { name: 'Mark "milk" not done' })).toBeInTheDocument()
  })
})
