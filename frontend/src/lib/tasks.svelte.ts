/**
 * The one task store (AD-9): the only code that changes task state and
 * the only caller of `lib/api.ts`.
 *
 * Each entry keeps the last server-confirmed Task and a FIFO queue of pending ops. The view
 * folds the ops over the confirmed state (or, for an unconfirmed add, its provisional base).
 * Each task sends one request at a time, always with its server id; a failure drops the
 * failed op and every op behind it, so the view falls back to the confirmed state.
 *
 * It never moves focus (AD-18), never retries, and never persists pending ops.
 */
import { addTask, ApiError, deleteTask, listTasks, tickTask, untickTask, type Task } from './api'
import { clock } from './clock.svelte'
import { sortTasks } from './sort'
import { toasts } from './toasts.svelte'

export type Row = {
  key: string
  id: string | null
  text: string
  added_at: string
  completed_at: string | null
}

export type LoadState = 'loading' | 'ready'

/** What a failed `add()` rejects with: the trimmed text, or `null` if ops were queued on it. */
export type AddFailure = { text: string | null }

type Op = { kind: 'tick' | 'untick' | 'delete'; at: number }

type Entry = {
  key: string
  /** The last server-confirmed Task; `null` while the add's POST is in flight. */
  confirmed: Task | null
  /** What the pending ops fold over: the confirmed Task, or the provisional add. */
  base: Task
  pending: Op[]
  /** A request for this entry (its POST or its head op) is in flight. */
  inFlight: boolean
}

const iso = (ms: number) => new Date(ms).toISOString()

let localKeys = 0
/** `crypto.randomUUID` exists only in a secure context; plain-http phone access has none. */
const newKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `local-${++localKeys}`

/** The entry's current view, or `null` if a pending delete hides it. */
function view(entry: Entry): Row | null {
  let completed_at = entry.base.completed_at
  for (const op of entry.pending) {
    if (op.kind === 'delete') return null
    completed_at = op.kind === 'tick' ? iso(op.at) : null
  }
  return {
    key: entry.key,
    id: entry.confirmed?.id ?? null,
    text: entry.base.text,
    added_at: entry.base.added_at,
    completed_at,
  }
}

function send(op: Op, id: string): Promise<Task | null> {
  if (op.kind === 'tick') return tickTask(id)
  if (op.kind === 'untick') return untickTask(id)
  return deleteTask(id).then(() => null)
}

export function createTasks() {
  let entries = $state<Entry[]>([])
  let loadState = $state<LoadState>('loading')
  let heldKey = $state<string | null>(null)

  const rows = $derived.by(() => {
    const visible = entries.map(view).filter((r): r is Row => r !== null)
    const held = visible.find((r) => r.key === heldKey)
    const rest = sortTasks(visible.filter((r) => r !== held))
    return held ? [held, ...rest] : rest
  })

  /** Always look entries up by key: the state proxy, not a raw object, must be mutated. */
  const find = (key: string) => entries.find((e) => e.key === key)

  const drop = (key: string) => {
    entries = entries.filter((e) => e.key !== key)
  }

  function pump(key: string): void {
    const entry = find(key)
    if (!entry || entry.inFlight || !entry.confirmed || entry.pending.length === 0) return
    const op = entry.pending[0]
    entry.inFlight = true
    send(op, entry.confirmed.id).then(
      (task) => settle(key, task),
      () => fail(key),
    )
  }

  function settle(key: string, task: Task | null): void {
    const entry = find(key)
    if (!entry) return
    entry.inFlight = false
    entry.pending.shift()
    if (task === null) {
      drop(key)
      return
    }
    entry.confirmed = task
    entry.base = task
    pump(key)
  }

  function fail(key: string): void {
    const entry = find(key)
    if (!entry) return
    entry.inFlight = false
    entry.pending = []
    toasts.error('action_failed')
  }

  /** Applies an op to the view at once and queues it, unless it would change nothing. */
  function enqueue(key: string, kind: Op['kind']): void {
    const entry = find(key)
    const row = entry && view(entry)
    if (!entry || !row) return
    if (kind === 'tick' && row.completed_at !== null) return
    if (kind === 'untick' && row.completed_at === null) return

    entry.pending.push({ kind, at: clock.sample() })
    if (kind !== 'untick' && heldKey === key) heldKey = null

    if (kind === 'tick') toasts.announce('done', row.text)
    else if (kind === 'untick') toasts.announce('undone', row.text)
    else
      toasts.announce('deleted', row.text, {
        listEmpty: loadState === 'ready' && rows.length === 0,
      })

    pump(key)
  }

  async function load(): Promise<void> {
    loadState = 'loading'
    let loaded: Task[]
    try {
      loaded = await listTasks()
    } catch {
      // Epic 3 adds load_failed and Retry; until then the state stays loading.
      return
    }
    const unconfirmed = entries.filter((e) => e.confirmed === null)
    entries = [
      ...loaded.map((task) => ({
        key: task.id,
        confirmed: task,
        base: task,
        pending: [],
        inFlight: false,
      })),
      ...unconfirmed,
    ]
    loadState = 'ready'
  }

  async function add(text: string): Promise<void> {
    const trimmed = text.trim()
    if (trimmed === '') return

    const key = newKey()
    const base: Task = {
      id: '',
      text: trimmed,
      added_at: iso(clock.sample()),
      completed_at: null,
    }
    entries.push({ key, confirmed: null, base, pending: [], inFlight: true })
    heldKey = key
    toasts.announce('added', trimmed)

    let task: Task
    try {
      task = await addTask(trimmed)
    } catch (err) {
      const queued = (find(key)?.pending.length ?? 0) > 0
      drop(key)
      if (heldKey === key) heldKey = null
      const tooLong = err instanceof ApiError && err.code === 'text_too_long'
      toasts.error(tooLong ? 'add_too_long' : 'add_failed')
      const failure: AddFailure = { text: queued ? null : trimmed }
      throw failure
    }

    const entry = find(key)
    if (!entry) return
    entry.confirmed = task
    entry.base = task
    entry.inFlight = false
    pump(key)
  }

  return {
    get rows(): readonly Row[] {
      return rows
    },
    get loadState(): LoadState {
      return loadState
    },
    get heldKey(): string | null {
      return heldKey
    },
    load,
    add,
    tick: (key: string) => enqueue(key, 'tick'),
    untick: (key: string) => enqueue(key, 'untick'),
    remove: (key: string) => enqueue(key, 'delete'),
  }
}

export type Tasks = ReturnType<typeof createTasks>

export const tasks = createTasks()
