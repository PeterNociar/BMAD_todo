import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import * as api from './api'
import { ApiError, type Task } from './api'
import { createTasks, type AddFailure, type Tasks } from './tasks.svelte'
import { toasts } from './toasts.svelte'

vi.mock('./api', async (importActual) => {
  const actual = await importActual<typeof import('./api')>()
  return {
    ApiError: actual.ApiError,
    listTasks: vi.fn(),
    addTask: vi.fn(),
    tickTask: vi.fn(),
    untickTask: vi.fn(),
    deleteTask: vi.fn(),
  }
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Each call to a mocked api function gets its own deferred, so a test settles them in order. */
function control<T>(fn: (...args: never[]) => Promise<T>): Deferred<T>[] {
  const calls: Deferred<T>[] = []
  vi.mocked(fn).mockImplementation(() => {
    const d = deferred<T>()
    calls.push(d)
    return d.promise
  })
  return calls
}

/** Lets settled api promises run their handlers. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

const T0 = Date.parse('2026-10-01T09:00:00.000Z')

function task(id: string, text: string, added: string, completed: string | null = null): Task {
  return {
    id,
    text,
    added_at: `2026-10-01T${added}.000Z`,
    completed_at: completed && `2026-10-01T${completed}.000Z`,
  }
}

const OPEN = task('id-open', 'buy milk', '08:00:00')
const OLDER = task('id-older', 'call bank', '07:00:00')
const DONE_OPEN = { ...OPEN, completed_at: '2026-10-01T09:00:00.000Z' }

let store: Tasks
let lists: Deferred<Task[]>[]
let adds: Deferred<Task>[]
let ticks: Deferred<Task>[]
let unticks: Deferred<Task>[]
let deletes: Deferred<void>[]
let error: MockInstance<typeof toasts.error>
let announce: MockInstance<typeof toasts.announce>

beforeEach(() => {
  vi.clearAllMocks()
  lists = control(api.listTasks)
  adds = control(api.addTask)
  ticks = control(api.tickTask)
  unticks = control(api.untickTask)
  deletes = control(api.deleteTask)
  error = vi.spyOn(toasts, 'error').mockImplementation(() => {})
  announce = vi.spyOn(toasts, 'announce').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  store = createTasks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A store loaded with the given confirmed tasks. */
async function loaded(...loadedTasks: Task[]): Promise<void> {
  const done = store.load()
  lists[0].resolve(loadedTasks)
  await done
}

const texts = () => store.rows.map((r) => r.text)

describe('load', () => {
  it('stays loading with no toast when the GET fails', async () => {
    const done = store.load()
    lists[0].reject(new ApiError('network_error', null))
    await done
    expect(store.loadState).toBe('loading')
    expect(error).not.toHaveBeenCalled()
    expect(api.listTasks).toHaveBeenCalledTimes(1)
  })

  it('goes loading then ready, with rows in sortTasks order keyed by id', async () => {
    const done = store.load()
    expect(store.loadState).toBe('loading')
    lists[0].resolve([OPEN, OLDER])
    await done
    expect(store.loadState).toBe('ready')
    expect(store.rows).toEqual([
      { key: OLDER.id, ...OLDER },
      { key: OPEN.id, ...OPEN },
    ])
  })

  it('keeps an add made before the GET resolves', async () => {
    const done = store.load()
    void store.add('a').catch(() => {})
    expect(texts()).toEqual(['a'])
    lists[0].resolve([OLDER])
    await done
    expect(texts()).toEqual(['a', 'call bank'])
    expect(store.rows[0].id).toBeNull()
  })
})

describe('add', () => {
  it('shows the row at once, holds it, announces once and keeps the key on confirm', async () => {
    const result = store.add('  milk  ')
    expect(store.rows).toHaveLength(1)
    const [row] = store.rows
    expect(row).toEqual({
      key: expect.any(String),
      id: null,
      text: 'milk',
      added_at: '2026-10-01T09:00:00.000Z',
      completed_at: null,
    })
    expect(store.heldKey).toBe(row.key)
    expect(api.addTask).toHaveBeenCalledWith('milk')

    const server = task('id-milk', 'milk', '09:00:00')
    adds[0].resolve(server)
    await expect(result).resolves.toBeUndefined()

    expect(store.rows).toEqual([{ key: row.key, ...server }])
    expect(store.heldKey).toBe(row.key)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('added', 'milk')
  })

  it('ignores empty text: no request, no row', async () => {
    await expect(store.add('   ')).resolves.toBeUndefined()
    expect(api.addTask).not.toHaveBeenCalled()
    expect(store.rows).toEqual([])
    expect(store.heldKey).toBeNull()
    expect(announce).not.toHaveBeenCalled()
  })

  it('holds the newest add first, ahead of the sorted rest', async () => {
    await loaded(OLDER)
    void store.add('first')
    void store.add('second')
    expect(texts()).toEqual(['second', 'call bank', 'first'])
  })

  it('removes the row, toasts add_failed and rejects with the text on failure', async () => {
    const result = store.add('milk')
    adds[0].reject(new ApiError('unavailable', 503))
    await expect(result).rejects.toEqual({ text: 'milk' } satisfies AddFailure)
    expect(store.rows).toEqual([])
    expect(store.heldKey).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('add_failed')
  })

  it('toasts add_too_long for text_too_long', async () => {
    const result = store.add('long')
    adds[0].reject(new ApiError('text_too_long', 422))
    await expect(result).rejects.toEqual({ text: 'long' })
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('add_too_long')
  })

  it('keeps a newer hold when an older add fails', async () => {
    const first = store.add('first')
    void store.add('second')
    const secondKey = store.heldKey
    adds[0].reject(new ApiError('unavailable', 503))
    await expect(first).rejects.toEqual({ text: 'first' })
    expect(store.heldKey).toBe(secondKey)
    expect(texts()).toEqual(['second'])
  })

  it('drops queued ops and rejects with null text when the add fails', async () => {
    const result = store.add('x')
    store.tick(store.rows[0].key)
    adds[0].reject(new ApiError('network_error', null))
    await expect(result).rejects.toEqual({ text: null })
    await settle()
    expect(store.rows).toEqual([])
    expect(api.tickTask).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('add_failed')
  })
})

describe('keys', () => {
  it('falls back to a local key when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {})
    try {
      void store.add('a')
      void store.add('b')
      const keys = store.rows.map((r) => r.key)
      expect(keys).toHaveLength(2)
      expect(keys.every((k) => k.startsWith('local-'))).toBe(true)
      expect(new Set(keys).size).toBe(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('queues', () => {
  it('sends a tick on an unconfirmed add after the POST, with the server id', async () => {
    const result = store.add('x')
    const { key } = store.rows[0]
    store.tick(key)
    expect(store.rows[0].completed_at).toBe('2026-10-01T09:00:00.000Z')
    expect(store.heldKey).toBeNull()
    expect(api.tickTask).not.toHaveBeenCalled()

    adds[0].resolve(task('id-x', 'x', '09:00:00'))
    await result
    expect(api.tickTask).toHaveBeenCalledWith('id-x')

    ticks[0].resolve(task('id-x', 'x', '09:00:00', '09:00:01'))
    await settle()
    expect(store.rows).toEqual([{ key, ...task('id-x', 'x', '09:00:00', '09:00:01') }])
    expect(error).not.toHaveBeenCalled()
  })

  it('removes an unconfirmed add after the POST confirms', async () => {
    const result = store.add('x')
    store.remove(store.rows[0].key)
    expect(store.rows).toEqual([])
    adds[0].resolve(task('id-x', 'x', '09:00:00'))
    await result
    expect(api.deleteTask).toHaveBeenCalledWith('id-x')
    deletes[0].resolve()
    await settle()
    expect(store.rows).toEqual([])
  })

  it('sends one request at a time per task, in FIFO order', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    store.untick(OPEN.id)
    expect(api.tickTask).toHaveBeenCalledTimes(1)
    expect(api.untickTask).not.toHaveBeenCalled()
    expect(store.rows[0].completed_at).toBeNull()

    ticks[0].resolve(DONE_OPEN)
    await settle()
    expect(api.untickTask).toHaveBeenCalledWith(OPEN.id)
    unticks[0].resolve(OPEN)
    await settle()
    expect(store.rows).toEqual([{ key: OPEN.id, ...OPEN }])
  })

  it('drops every op queued behind a failed head', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    store.untick(OPEN.id)
    store.tick(OPEN.id)
    ticks[0].reject(new ApiError('unavailable', 503))
    await settle()
    expect(store.rows).toEqual([{ key: OPEN.id, ...OPEN }])
    expect(api.tickTask).toHaveBeenCalledTimes(1)
    expect(api.untickTask).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)

    // The queue is empty again, so a new op is sent at once.
    store.tick(OPEN.id)
    expect(api.tickTask).toHaveBeenCalledTimes(2)
  })

  it("doesn't make one task wait for another", async () => {
    await loaded(OPEN, OLDER)
    store.tick(OPEN.id)
    store.tick(OLDER.id)
    expect(api.tickTask).toHaveBeenCalledTimes(2)
    expect(api.tickTask).toHaveBeenNthCalledWith(1, OPEN.id)
    expect(api.tickTask).toHaveBeenNthCalledWith(2, OLDER.id)
  })

  it('rapid toggle, late fail: drops the rest and shows the confirmed state', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    store.untick(OPEN.id)
    store.tick(OPEN.id)
    expect(announce.mock.calls.map((c) => c[0])).toEqual(['done', 'undone', 'done'])

    ticks[0].resolve(DONE_OPEN)
    await settle()
    unticks[0].reject(new ApiError('unavailable', 503))
    await settle()

    expect(api.tickTask).toHaveBeenCalledTimes(1)
    expect(store.rows).toEqual([{ key: OPEN.id, ...DONE_OPEN }])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
  })
})

describe('tick, untick, remove', () => {
  it('rolls a failed tick back to open, in its place, with one toast', async () => {
    await loaded(OPEN, OLDER)
    store.tick(OLDER.id)
    expect(texts()).toEqual(['buy milk', 'call bank'])
    ticks[0].reject(new ApiError('unavailable', 503))
    await settle()
    expect(texts()).toEqual(['call bank', 'buy milk'])
    expect(store.rows[0].completed_at).toBeNull()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('brings a failed delete back where it was, with one toast', async () => {
    await loaded(OPEN, OLDER)
    store.remove(OLDER.id)
    expect(texts()).toEqual(['buy milk'])
    expect(announce).toHaveBeenCalledWith('deleted', 'call bank', { listEmpty: false })
    deletes[0].reject(new ApiError('network_error', null))
    await settle()
    expect(texts()).toEqual(['call bank', 'buy milk'])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
  })

  it('passes listEmpty when the last task is deleted', async () => {
    await loaded(OPEN)
    store.remove(OPEN.id)
    expect(announce).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledWith('deleted', 'buy milk', { listEmpty: true })
    deletes[0].resolve()
    await settle()
    expect(store.rows).toEqual([])
  })

  it('announces each action once when it is applied, and nothing more after a rollback', async () => {
    await loaded(OPEN, OLDER)
    store.tick(OPEN.id)
    ticks[0].resolve(DONE_OPEN)
    await settle()
    store.untick(OPEN.id)
    unticks[0].resolve(OPEN)
    await settle()
    store.remove(OLDER.id)
    deletes[0].reject(new ApiError('unavailable', 503))
    await settle()

    expect(announce.mock.calls).toEqual([
      ['done', 'buy milk'],
      ['undone', 'buy milk'],
      ['deleted', 'call bank', { listEmpty: false }],
    ])
  })

  it('announces a failed add once, when applied, and nothing after its rollback', async () => {
    const result = store.add('milk')
    adds[0].reject(new ApiError('unavailable', 503))
    await expect(result).rejects.toEqual({ text: 'milk' })
    await settle()
    expect(announce.mock.calls).toEqual([['added', 'milk']])
  })

  it("doesn't pass listEmpty when the last row is deleted while loading", async () => {
    void store.load()
    void store.add('x')
    store.remove(store.rows[0].key)
    expect(store.rows).toEqual([])
    expect(announce).toHaveBeenLastCalledWith('deleted', 'x', { listEmpty: false })
  })

  it("doesn't pass listEmpty while an unconfirmed add is still visible", async () => {
    await loaded(OPEN)
    void store.add('x')
    store.remove(OPEN.id)
    expect(texts()).toEqual(['x'])
    expect(announce).toHaveBeenLastCalledWith('deleted', 'buy milk', { listEmpty: false })
  })

  it('rolls a failed untick back to done', async () => {
    await loaded(DONE_OPEN, OLDER)
    store.untick(OPEN.id)
    expect(store.rows.find((r) => r.key === OPEN.id)?.completed_at).toBeNull()
    unticks[0].reject(new ApiError('unavailable', 503))
    await settle()
    expect(store.rows).toEqual([
      { key: OLDER.id, ...OLDER },
      { key: OPEN.id, ...DONE_OPEN },
    ])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
  })

  it('rolls a failed tick on a confirmed add back to the server Task', async () => {
    const result = store.add('x')
    const { key } = store.rows[0]
    store.tick(key)
    const server = task('id-x', 'x', '08:59:59')
    adds[0].resolve(server)
    await result
    ticks[0].reject(new ApiError('unavailable', 503))
    await settle()
    expect(store.rows).toEqual([{ key, ...server }])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
  })

  it('keeps the held row first after its POST confirms with a later added_at', async () => {
    await loaded(OPEN, OLDER)
    const result = store.add('x')
    const { key } = store.rows[0]
    adds[0].resolve(task('id-x', 'x', '09:00:05'))
    await result
    expect(store.heldKey).toBe(key)
    expect(texts()).toEqual(['x', 'call bank', 'buy milk'])
    expect(store.rows[0].id).toBe('id-x')
  })

  it('ignores an op that matches the view, and an unknown key', async () => {
    await loaded({ ...DONE_OPEN })
    store.tick(OPEN.id)
    store.untick('unknown')
    store.remove('unknown')
    store.remove(OPEN.id)
    store.remove(OPEN.id)
    store.tick(OPEN.id)

    expect(api.tickTask).not.toHaveBeenCalled()
    expect(api.untickTask).not.toHaveBeenCalled()
    expect(api.deleteTask).toHaveBeenCalledTimes(1)
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('ignores untick on an open row', async () => {
    await loaded(OPEN)
    store.untick(OPEN.id)
    expect(api.untickTask).not.toHaveBeenCalled()
    expect(announce).not.toHaveBeenCalled()
  })

  it('clears the hold when the held task is removed', async () => {
    void store.add('x')
    store.remove(store.rows[0].key)
    expect(store.heldKey).toBeNull()
  })
})

const X = task('id-x', 'x', '09:00:00')
const NOT_FOUND = () => new ApiError('task_not_found', 404)

describe('sync merge (AD-10)', () => {
  it('keeps an add confirmed during the initial GET when the response lacks it', async () => {
    const done = store.load()
    const result = store.add('x')
    const { key } = store.rows[0]
    adds[0].resolve(X)
    await result
    lists[0].resolve([])
    await done
    expect(store.rows).toEqual([{ key, ...X }])
    expect(store.heldKey).toBe(key)
  })

  it('keeps one row, under the optimistic key, when the response has the confirmed add', async () => {
    const done = store.load()
    const result = store.add('x')
    const { key } = store.rows[0]
    adds[0].resolve(X)
    await result
    lists[0].resolve([X, OLDER])
    await done
    expect(store.rows).toEqual([
      { key, ...X },
      { key: OLDER.id, ...OLDER },
    ])
    expect(store.heldKey).toBe(key)
  })

  it('folds a GET-created entry into the add when its POST returns the same id', async () => {
    await loaded()
    const result = store.add('x')
    const { key } = store.rows[0]
    const done = store.load()
    lists[1].resolve([X])
    await done
    expect(store.rows.map((r) => r.key)).toEqual([key, X.id])

    // An op on the GET-created row is in flight when the POST returns.
    store.tick(X.id)
    expect(api.tickTask).toHaveBeenCalledTimes(1)
    adds[0].resolve(X)
    await result
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ key, id: X.id, completed_at: '2026-10-01T09:00:00.000Z' })
    expect(store.heldKey).toBe(key)

    const DONE_X = { ...X, completed_at: '2026-10-01T09:00:01.000Z' }
    ticks[0].resolve(DONE_X)
    await settle()
    expect(store.rows).toEqual([{ key, ...DONE_X }])
    expect(api.tickTask).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it("appends the GET-created entry's ops after the add's own ops", async () => {
    await loaded()
    const result = store.add('x')
    const { key } = store.rows[0]
    store.tick(key)
    const done = store.load()
    lists[1].resolve([X])
    await done
    store.remove(X.id)
    adds[0].resolve(X)
    await result

    // The GET entry's delete is in flight; the add's tick waits behind it.
    expect(store.rows).toEqual([])
    expect(api.tickTask).not.toHaveBeenCalled()
    deletes[0].resolve()
    await settle()
    expect(store.rows).toEqual([])
  })

  it('keeps a task deleted after S gone when a stale GET still lists it', async () => {
    await loaded(OPEN)
    const done = store.load()
    store.remove(OPEN.id)
    deletes[0].resolve()
    await settle()
    lists[1].resolve([OPEN])
    await done
    expect(store.rows).toEqual([])
  })

  it("brings a pruned tombstone's task back from a GET sent after the delete", async () => {
    await loaded(OPEN)
    store.remove(OPEN.id)
    deletes[0].resolve()
    await settle()
    const done = store.load()
    lists[1].resolve([OPEN])
    await done
    expect(store.rows).toEqual([{ key: OPEN.id, ...OPEN }])
  })

  it('removes a confirmed task stamped ≤ S that a fresh GET no longer lists', async () => {
    await loaded(OPEN, OLDER)
    const done = store.load()
    lists[1].resolve([OLDER])
    await done
    expect(store.rows).toEqual([{ key: OLDER.id, ...OLDER }])
  })

  it('keeps a tick confirmed after S when the GET shows the task open', async () => {
    await loaded(OPEN)
    const done = store.load()
    store.tick(OPEN.id)
    ticks[0].resolve(DONE_OPEN)
    await settle()
    lists[1].resolve([OPEN])
    await done
    expect(store.rows).toEqual([{ key: OPEN.id, ...DONE_OPEN }])
  })

  it('keeps pending ops applied and queued across a merge', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    store.untick(OPEN.id)
    store.tick(OPEN.id)
    const renamed = { ...OPEN, text: 'buy oat milk' }
    const done = store.load()
    lists[1].resolve([renamed])
    await done
    expect(store.rows[0]).toMatchObject({
      key: OPEN.id,
      text: 'buy oat milk',
      completed_at: '2026-10-01T09:00:00.000Z',
    })

    ticks[0].resolve({ ...renamed, completed_at: DONE_OPEN.completed_at })
    await settle()
    expect(api.untickTask).toHaveBeenCalledWith(OPEN.id)
    unticks[0].resolve(renamed)
    await settle()
    expect(api.tickTask).toHaveBeenCalledTimes(2)
    expect(store.rows[0].completed_at).not.toBeNull()
  })

  it('never announces on a merge', async () => {
    await loaded(OPEN)
    const done = store.load()
    lists[1].resolve([OLDER])
    await done
    expect(announce).not.toHaveBeenCalled()
  })
})

describe('sync review fixes', () => {
  const DONE_X = { ...X, completed_at: '2026-10-01T09:00:01.000Z' }

  /** An add whose POST is in flight, with its GET twin (key = id) already on screen. */
  async function addWithTwin(): Promise<{ key: string; result: Promise<void> }> {
    await loaded()
    const result = store.add('x')
    const { key } = store.rows[0]
    const done = store.load()
    lists[1].resolve([X])
    await done
    return { key, result }
  }

  it("keeps the twin's newer state when its tick settled before the POST returned", async () => {
    const { key, result } = await addWithTwin()
    store.tick(X.id)
    ticks[0].resolve(DONE_X)
    await settle()
    adds[0].resolve(X)
    await result
    expect(store.rows).toEqual([{ key, ...DONE_X }])
    expect(store.heldKey).toBe(key)
  })

  it('drops the add, with no toast, when its twin was deleted before the POST returned', async () => {
    const { result } = await addWithTwin()
    store.remove(X.id)
    deletes[0].resolve()
    await settle()
    adds[0].resolve(X)
    await expect(result).resolves.toBeUndefined()
    expect(store.rows).toEqual([])
    expect(store.heldKey).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })

  it('clears the hold when a merge drops the held entry', async () => {
    await loaded()
    const result = store.add('x')
    adds[0].resolve(X)
    await result
    expect(store.heldKey).not.toBeNull()
    const done = store.load()
    lists[1].resolve([])
    await done
    expect(store.rows).toEqual([])
    expect(store.heldKey).toBeNull()
  })

  it("keeps the add's earlier op when the twin's in-flight op fails after the fold", async () => {
    await loaded()
    const result = store.add('x')
    const { key } = store.rows[0]
    store.tick(key)
    const done = store.load()
    lists[1].resolve([X])
    await done
    // The twin shows open (no pending ops), so a tick on it is sent at once.
    store.tick(X.id)
    adds[0].resolve(X)
    await result
    expect(api.tickTask).toHaveBeenCalledTimes(1)

    ticks[0].reject(new ApiError('unavailable', 503))
    await settle()
    expect(error).toHaveBeenCalledTimes(1)
    expect(api.tickTask).toHaveBeenCalledTimes(2)
    expect(store.rows[0]).toMatchObject({ key, completed_at: '2026-10-01T09:00:00.000Z' })
  })

  it('ignores a late response for an entry a merge dropped', async () => {
    await loaded(OPEN, OLDER)
    store.tick(OPEN.id)
    store.tick(OLDER.id)
    let done = store.load()
    lists[1].resolve([])
    await done
    expect(store.rows).toEqual([])

    done = store.load()
    ticks[0].resolve(DONE_OPEN)
    ticks[1].reject(NOT_FOUND())
    await settle()
    expect(store.rows).toEqual([])
    expect(error).not.toHaveBeenCalled()

    // No tombstone from the late 404: a GET sent before it still brings the task back.
    lists[2].resolve([OLDER])
    await done
    expect(store.rows).toEqual([{ key: OLDER.id, ...OLDER }])
  })

  it('runs at most one more GET for two loads while one is in flight, resolving both', async () => {
    const first = store.load()
    const second = store.load()
    const third = store.load()
    expect(api.listTasks).toHaveBeenCalledTimes(1)
    lists[0].resolve([OPEN])
    await first
    expect(api.listTasks).toHaveBeenCalledTimes(2)
    lists[1].resolve([OPEN, OLDER])
    await Promise.all([second, third])
    expect(api.listTasks).toHaveBeenCalledTimes(2)
    expect(texts()).toEqual(['call bank', 'buy milk'])
  })
})

describe('404s (AD-11)', () => {
  it('treats a delete 404 as confirmed: gone, no toast, tombstoned', async () => {
    await loaded(OPEN)
    const done = store.load()
    store.remove(OPEN.id)
    deletes[0].reject(NOT_FOUND())
    await settle()
    expect(store.rows).toEqual([])
    expect(error).not.toHaveBeenCalled()

    lists[1].resolve([OPEN])
    await done
    expect(store.rows).toEqual([])
    expect(api.listTasks).toHaveBeenCalledTimes(2)
  })

  it('removes a task on a tick 404, drops its queue, with no toast', async () => {
    await loaded(OPEN, OLDER)
    const done = store.load()
    store.tick(OPEN.id)
    store.untick(OPEN.id)
    ticks[0].reject(NOT_FOUND())
    await settle()
    expect(store.rows).toEqual([{ key: OLDER.id, ...OLDER }])
    expect(api.untickTask).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()

    lists[1].resolve([OPEN, OLDER])
    await done
    expect(texts()).toEqual(['call bank'])
  })

  it('removes a task on an untick 404 and clears its hold', async () => {
    await loaded()
    const result = store.add('x')
    const { key } = store.rows[0]
    adds[0].resolve(X)
    await result
    store.tick(key)
    ticks[0].resolve({ ...X, completed_at: '2026-10-01T09:00:01.000Z' })
    await settle()
    store.untick(key)
    unticks[0].reject(NOT_FOUND())
    await settle()
    expect(store.rows).toEqual([])
    expect(store.heldKey).toBeNull()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('recovery GET', () => {
  it('rolls back with one toast and sends exactly one GET after a network error', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    ticks[0].reject(new ApiError('network_error', null))
    await settle()
    expect(store.rows).toEqual([{ key: OPEN.id, ...OPEN }])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('action_failed')
    expect(api.listTasks).toHaveBeenCalledTimes(2)
  })

  it('sends no GET for other failures', async () => {
    await loaded(OPEN)
    store.tick(OPEN.id)
    ticks[0].reject(new ApiError('internal_error', 500))
    await settle()
    const result = store.add('long')
    adds[0].reject(new ApiError('text_too_long', 422))
    await expect(result).rejects.toEqual({ text: 'long' })
    expect(api.listTasks).toHaveBeenCalledTimes(1)
  })

  it('caps a burst at one GET in flight plus one queued', async () => {
    const C = task('id-c', 'post card', '06:00:00')
    await loaded(OPEN, OLDER, C)
    void store.load()
    store.tick(OPEN.id)
    store.tick(OLDER.id)
    store.tick(C.id)
    ticks.forEach((t) => t.reject(new ApiError('unavailable', 503)))
    await settle()
    expect(error).toHaveBeenCalledTimes(3)
    expect(api.listTasks).toHaveBeenCalledTimes(2)

    lists[1].resolve([OPEN, OLDER, C])
    await settle()
    expect(api.listTasks).toHaveBeenCalledTimes(3)
    lists[2].resolve([OPEN, OLDER, C])
    await settle()
    expect(api.listTasks).toHaveBeenCalledTimes(3)
  })

  it('shows an add that landed despite a timed-out POST, keyed by id', async () => {
    const result = store.add('x')
    adds[0].reject(new ApiError('network_error', null))
    await expect(result).rejects.toEqual({ text: 'x' })
    expect(store.rows).toEqual([])
    expect(api.listTasks).toHaveBeenCalledTimes(1)
    lists[0].resolve([X])
    await settle()
    expect(store.rows).toEqual([{ key: X.id, ...X }])
  })

  it('sets ready on any successful GET, after a failed first load', async () => {
    const done = store.load()
    lists[0].reject(new ApiError('network_error', null))
    await done
    expect(store.loadState).toBe('loading')
    const result = store.add('x')
    adds[0].reject(new ApiError('unavailable', 503))
    await expect(result).rejects.toEqual({ text: 'x' })
    lists[1].resolve([OLDER])
    await settle()
    expect(store.loadState).toBe('ready')
    expect(texts()).toEqual(['call bank'])
  })
})

describe('reactivity', () => {
  it('re-runs an effect reading rows after an add', () => {
    const seen: string[][] = []
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(store.rows.map((r) => r.text))
      })
    })
    flushSync()
    expect(seen).toEqual([[]])

    void store.add('milk')
    flushSync()
    expect(seen).toEqual([[], ['milk']])
    cleanup()
  })
})
