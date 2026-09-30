import { render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'
import { listTasks } from './lib/api'

vi.mock('./lib/api', () => ({ listTasks: vi.fn() }))

const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'

afterEach(() => {
  vi.mocked(listTasks).mockReset()
})

describe('App', () => {
  it('renders the wordmark and the labelled input', () => {
    vi.mocked(listTasks).mockReturnValue(new Promise(() => {}))
    render(App)

    expect(screen.getByRole('heading', { level: 1, name: 'Todo' })).toBeInTheDocument()
    const input = screen.getByLabelText('New task')
    expect(input).toHaveAttribute('placeholder', 'What needs doing?')
  })

  it('shows the empty state when the list is empty', async () => {
    vi.mocked(listTasks).mockResolvedValue([])
    render(App)

    expect(await screen.findByText(EMPTY_STATE)).toBeInTheDocument()
  })

  it('renders task text when tasks exist', async () => {
    vi.mocked(listTasks).mockResolvedValue([
      {
        id: '6f1c2a9b-7d10-4c1e-9a3b-000000000001',
        text: '<b>not html</b>',
        added_at: '2026-09-30T08:00:00.000Z',
        completed_at: null,
      },
    ])
    render(App)

    expect(await screen.findByText('<b>not html</b>')).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
  })

  it('shows no empty state when the load fails', async () => {
    vi.mocked(listTasks).mockRejectedValue(new Error('network'))
    render(App)

    await vi.waitFor(() => expect(listTasks).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
    expect(screen.getByLabelText('New task')).toBeInTheDocument()
  })
})
