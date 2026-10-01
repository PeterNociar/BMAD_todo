import { afterEach, describe, expect, it, vi } from 'vitest'
import { addTask, ApiError, deleteTask, listTasks, tickTask, untickTask, type Task } from './api'

const task: Task = {
  id: '6f1c2a9b-7d10-4c1e-9a3b-000000000001',
  text: 'check SSO timeout setting',
  added_at: '2026-09-30T08:00:00.000Z',
  completed_at: null,
}

function stubFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn().mockReturnValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Resolves with the ApiError a call rejects with, failing if it rejects with anything else. */
async function apiError(call: Promise<unknown>): Promise<ApiError> {
  const error = await call.then(
    () => {
      throw new Error('expected the call to reject')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('calls', () => {
  it('listTasks GETs /api/tasks and resolves the tasks', async () => {
    const fetchMock = stubFetch(json([task], 200))

    await expect(listTasks()).resolves.toEqual([task])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/tasks')
    expect(init.method).toBe('GET')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('addTask POSTs the text as given, as JSON, and resolves the Task', async () => {
    const fetchMock = stubFetch(json(task, 201))

    await expect(addTask('  untrimmed  ')).resolves.toEqual(task)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/tasks')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(init.body).toBe('{"text":"  untrimmed  "}')
  })

  it('tickTask PUTs /tick on the encoded id and resolves the Task', async () => {
    const ticked = { ...task, completed_at: '2026-09-30T09:00:00.000Z' }
    const fetchMock = stubFetch(json(ticked, 200))

    await expect(tickTask('a/b c')).resolves.toEqual(ticked)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/tasks/a%2Fb%20c/tick')
    expect(init.method).toBe('PUT')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('untickTask PUTs /untick on the id and resolves the Task', async () => {
    const fetchMock = stubFetch(json(task, 200))

    await expect(untickTask(task.id)).resolves.toEqual(task)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/tasks/${task.id}/untick`)
    expect(init.method).toBe('PUT')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('deleteTask DELETEs the encoded id and resolves void on 204', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await expect(deleteTask('x?y')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/tasks/x%3Fy')
    expect(init.method).toBe('DELETE')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })
})

describe('error mapping', () => {
  it('maps a fetch rejection to network_error with no status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await apiError(listTasks())
    expect(error.code).toBe('network_error')
    expect(error.status).toBeNull()
  })

  it('aborts and maps to network_error when fetch never settles for 10 s', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return new Promise<Response>(() => {})
      }),
    )

    const call = apiError(listTasks())
    await vi.advanceTimersByTimeAsync(9_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = await call
    expect(signal?.aborted).toBe(true)
    expect(error.code).toBe('network_error')
    expect(error.status).toBeNull()
  })

  it('maps to network_error when the body is still unread after 10 s', async () => {
    vi.useFakeTimers()
    const stalled = new ReadableStream<Uint8Array>({ start() {} })
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return Promise.resolve(new Response(stalled, { status: 200 }))
      }),
    )

    let settled = false
    const call = apiError(listTasks()).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    const error = await call
    expect(signal?.aborted).toBe(true)
    expect(error.code).toBe('network_error')
    expect(error.status).toBeNull()
  })

  it('clears the timeout once the call settles', async () => {
    vi.useFakeTimers()
    stubFetch(Promise.resolve(json([task], 200)))

    await expect(listTasks()).resolves.toEqual([task])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('maps 413 with an HTML body to text_too_long', async () => {
    stubFetch(new Response('<html>413 Request Entity Too Large</html>', { status: 413 }))

    const error = await apiError(addTask('x'))
    expect(error.code).toBe('text_too_long')
    expect(error.status).toBe(413)
  })

  it('maps 503 to unavailable even when the body has a code (status wins)', async () => {
    stubFetch(json({ detail: 'Service unavailable', code: 'service_unavailable' }, 503))

    const error = await apiError(listTasks())
    expect(error.code).toBe('unavailable')
    expect(error.status).toBe(503)
  })

  it.each([502, 504])('maps %i to unavailable whatever the body', async (status) => {
    stubFetch(json({ code: 'something_else' }, status))

    const error = await apiError(tickTask(task.id))
    expect(error.code).toBe('unavailable')
    expect(error.status).toBe(status)
  })

  it.each([
    [404, 'task_not_found'],
    [422, 'text_too_long'],
  ])('maps %i to the JSON code %s', async (status, code) => {
    stubFetch(json({ detail: 'nope', code }, status))

    const error = await apiError(deleteTask(task.id))
    expect(error.code).toBe(code)
    expect(error.status).toBe(status)
  })

  it.each([
    ['a non-JSON body', () => new Response('Internal Server Error', { status: 500 })],
    ['an empty body', () => new Response('', { status: 500 })],
    ['JSON without a code', () => json({ detail: 'boom' }, 500)],
    ['JSON with a non-string code', () => json({ code: 42 }, 500)],
    ['a JSON null body', () => json(null, 500)],
  ])('maps a 500 with %s to unavailable', async (_name, response) => {
    stubFetch(response())

    const error = await apiError(untickTask(task.id))
    expect(error.code).toBe('unavailable')
    expect(error.status).toBe(500)
  })

  it('maps a 2xx whose JSON cannot be read to unavailable', async () => {
    stubFetch(new Response('not json', { status: 200 }))

    const error = await apiError(listTasks())
    expect(error.code).toBe('unavailable')
    expect(error.status).toBe(200)
  })
})
