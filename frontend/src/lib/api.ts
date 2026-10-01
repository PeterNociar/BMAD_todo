export type Task = {
  id: string
  text: string
  added_at: string
  completed_at: string | null
}

/**
 * Every rejection from this module is an ApiError. `code` is a client code (AD-5):
 * `network_error`, `unavailable`, `text_too_long`, or the JSON `code` of an error body.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number | null,
  ) {
    super(code)
    this.name = 'ApiError'
  }
}

const TIMEOUT_MS = 10_000

type RequestOptions = { method: string; body?: unknown }

/**
 * Sends one request and resolves with the parsed JSON body, or `undefined` for 204.
 * The 10 s timeout covers both the fetch and reading the body, and is cleared when the call settles.
 */
async function request(path: string, { method, body }: RequestOptions): Promise<unknown> {
  const controller = new AbortController()
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new ApiError('network_error', null)))
  })
  // A rejection that nobody awaits must not surface as an unhandled rejection.
  aborted.catch(() => {})
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const init: RequestInit = { method, signal: controller.signal }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  try {
    let response: Response
    try {
      response = await Promise.race([fetch(path, init), aborted])
    } catch {
      throw new ApiError('network_error', null)
    }

    const { status } = response
    if (status === 413) throw new ApiError('text_too_long', status)
    if (status === 502 || status === 503 || status === 504)
      throw new ApiError('unavailable', status)
    if (status === 204) return undefined

    let text: string
    try {
      text = await Promise.race([response.text(), aborted])
    } catch {
      throw new ApiError('network_error', null)
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError('unavailable', status)
    }

    if (response.ok) return data
    const code = (data as { code?: unknown } | null)?.code
    throw new ApiError(typeof code === 'string' ? code : 'unavailable', status)
  } finally {
    clearTimeout(timer)
  }
}

const taskPath = (id: string, action?: 'tick' | 'untick') =>
  `/api/tasks/${encodeURIComponent(id)}${action ? `/${action}` : ''}`

export async function listTasks(): Promise<Task[]> {
  return (await request('/api/tasks', { method: 'GET' })) as Task[]
}

export async function addTask(text: string): Promise<Task> {
  return (await request('/api/tasks', { method: 'POST', body: { text } })) as Task
}

export async function tickTask(id: string): Promise<Task> {
  return (await request(taskPath(id, 'tick'), { method: 'PUT' })) as Task
}

export async function untickTask(id: string): Promise<Task> {
  return (await request(taskPath(id, 'untick'), { method: 'PUT' })) as Task
}

export async function deleteTask(id: string): Promise<void> {
  await request(taskPath(id), { method: 'DELETE' })
}
