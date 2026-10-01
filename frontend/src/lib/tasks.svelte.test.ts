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
