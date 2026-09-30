import { afterEach, describe, expect, it, vi } from 'vitest'
import { listTasks, type Task } from './api'

const task: Task = {
  id: '6f1c2a9b-7d10-4c1e-9a3b-000000000001',
  text: 'check SSO timeout setting',
  added_at: '2026-09-30T08:00:00.000Z',
  completed_at: null,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listTasks', () => {
  it('GETs the relative /api/tasks URL and returns the tasks', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([task]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(listTasks()).resolves.toEqual([task])
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks')
  })

  it('rejects when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))

    await expect(listTasks()).rejects.toThrow('503')
  })
})
