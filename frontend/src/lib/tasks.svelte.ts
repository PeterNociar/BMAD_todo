/**
 * The one task store (AD-9): the only code that changes task state and
 * the only caller of `lib/api.ts`.
 *
 * Each entry keeps the last server-confirmed Task and a FIFO queue of pending ops. The view
 * folds the ops over the confirmed state (or, for an unconfirmed add, its provisional base).
 * Each task sends one request at a time, always with its server id; a failure drops the
 * failed op and every op behind it, so the view falls back to the confirmed state.
 *
 * GETs merge by confirmation sequence (AD-10): every confirmed mutation bumps `seq` and stamps
 * its entry (or tombstone), and a GET sent at `S` only overrides entries stamped ≤ S. A 404 on
 * an op means the task was deleted elsewhere (AD-11). A `network_error` or `unavailable`
 * failure also requests one immediate GET, so a change that did land shows up.
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

/** `n` identifies the op, so its response finds its entry even after a POST-meets-GET merge. */
type Op = { kind: 'tick' | 'untick' | 'delete'; at: number; n: number }

type Entry = {
  key: string
  /** The last server-confirmed Task; `null` while the add's POST is in flight. */
  confirmed: Task | null
  /** What the pending ops fold over: the confirmed Task, or the provisional add. */
  base: Task
  pending: Op[]
  /** A request for this entry (its POST or its head op) is in flight. */
  inFlight: boolean
  /** The `seq` value that confirmed `confirmed` (a GET-created entry: that GET's S). */
  stamp: number
}

/** Failures after which the server may hold a change we did not see: re-read it. */
const isRecoverable = (err: unknown) =>
  err instanceof ApiError && (err.code === 'network_error' || err.code === 'unavailable')

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404

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

  /** Increments on every confirmed mutation (AD-10). */
  let seq = 0
  /** Source of op ids (`Op.n`). */
  let opCount = 0
  /** Confirmed deletes and 404 removals: id → the seq that confirmed them. Not rendered. */
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- never rendered, so not reactive
  const tombstones = new Map<string, number>()
  /** The GET in flight, and the one queued behind it (at most one). */
  let getInFlight: Promise<void> | null = null
  let getQueued: Promise<void> | null = null

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
      (task) => settle(op.n, task),
      (err: unknown) => fail(op.n, err),
    )
  }

  /** The entry whose queue holds op `n`, or `undefined` if it has gone meanwhile. */
  const owner = (n: number) => entries.find((e) => e.pending.some((op) => op.n === n))

  /** Drops a confirmed entry and tombstones its id at a new seq. */
  function bury(key: string): void {
    const entry = find(key)
    if (!entry?.confirmed) return
    tombstones.set(entry.confirmed.id, ++seq)
    drop(key)
    if (heldKey === key) heldKey = null
  }

  function settle(n: number, task: Task | null): void {
    const entry = owner(n)
    if (!entry) return
    const { key } = entry
    entry.inFlight = false
    entry.pending.splice(
      entry.pending.findIndex((op) => op.n === n),
      1,
    )
    if (task === null) {
      bury(key)
      return
    }
    entry.confirmed = task
    entry.base = task
    entry.stamp = ++seq
    pump(key)
  }

  function fail(n: number, err: unknown): void {
    const entry = owner(n)
    if (!entry) return
    entry.inFlight = false
    if (isNotFound(err)) {
      // AD-11: deleted elsewhere. A DELETE counts as confirmed; a tick/untick removes it quietly.
      bury(entry.key)
      return
    }
    // Cut at the failed op: ops ahead of it (an add's own, after a twin fold) are kept.
    entry.pending = entry.pending.slice(
      0,
      entry.pending.findIndex((op) => op.n === n),
    )
    toasts.error('action_failed')
    if (isRecoverable(err)) void refresh()
    pump(entry.key)
  }

  /** Applies an op to the view at once and queues it, unless it would change nothing. */
  function enqueue(key: string, kind: Op['kind']): void {
    const entry = find(key)
    const row = entry && view(entry)
    if (!entry || !row) return
    if (kind === 'tick' && row.completed_at !== null) return
    if (kind === 'untick' && row.completed_at === null) return

    entry.pending.push({ kind, at: clock.sample(), n: ++opCount })
    if (kind !== 'untick' && heldKey === key) heldKey = null

    if (kind === 'tick') toasts.announce('done', row.text)
    else if (kind === 'untick') toasts.announce('undone', row.text)
    else
      toasts.announce('deleted', row.text, {
        listEmpty: loadState === 'ready' && rows.length === 0,
      })

    pump(key)
  }

  /**
   * Merges a GET sent at `S` (AD-10), matching entries by `confirmed.id` only: entries stamped
   * ≤ S take the server version (or go, if absent), newer ones and unconfirmed adds stay, and
   * unseen ids become entries keyed by id unless tombstoned after S.
   */
  function merge(server: Task[], S: number): void {
    /* eslint-disable svelte/prefer-svelte-reactivity -- local lookups for this merge only */
    const byId = new Map(server.map((t) => [t.id, t]))
    const known = new Set<string>()
    /* eslint-enable svelte/prefer-svelte-reactivity */
    const next: Entry[] = []
    for (const entry of entries) {
      if (entry.confirmed === null) {
        next.push(entry)
        continue
      }
      const id = entry.confirmed.id
      known.add(id)
      if (entry.stamp > S) {
        next.push(entry)
        continue
      }
      const task = byId.get(id)
      if (!task) {
        if (heldKey === entry.key) heldKey = null
        continue
      }
      entry.confirmed = task
      entry.base = task
      next.push(entry)
    }
    for (const task of server) {
      if (known.has(task.id)) continue
      if ((tombstones.get(task.id) ?? -1) > S) continue
      next.push({
        key: task.id,
        confirmed: task,
        base: task,
        pending: [],
        inFlight: false,
        stamp: S,
      })
    }
    entries = next
    for (const [id, at] of tombstones) if (at <= S) tombstones.delete(id)
  }

  async function runGet(): Promise<void> {
    const S = seq
    let server: Task[]
    try {
      server = await listTasks()
    } catch {
      // Epic 3 adds load_failed and Retry; until then a failed GET changes nothing.
      return
    }
    merge(server, S)
    loadState = 'ready'
  }

  /**
   * Requests a GET: one in flight at a time, and at most one more queued behind it. The promise
   * settles when the GET that serves this request has been merged (or has failed).
   */
  function refresh(): Promise<void> {
    if (getInFlight === null) {
      getInFlight = runGet().finally(() => {
        getInFlight = null
      })
      return getInFlight
    }
    // Runs whether the GET in flight resolved or threw, so the queue can never get stuck.
    const next = () => {
      getQueued = null
      return refresh()
    }
    getQueued ??= getInFlight.then(next, next)
    return getQueued
  }

  function load(): Promise<void> {
    loadState = 'loading'
    return refresh()
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
    entries.push({ key, confirmed: null, base, pending: [], inFlight: true, stamp: 0 })
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
      if (isRecoverable(err)) void refresh()
      const failure: AddFailure = { text: queued ? null : trimmed }
      throw failure
    }

    const entry = find(key)
    if (!entry) return
    if (tombstones.has(task.id)) {
      // Its GET twin was deleted before the POST returned: the task is gone, so is this row.
      drop(key)
      if (heldKey === key) heldKey = null
      return
    }
    // A GET may already have brought this task in under key = id: fold that entry into this one.
    // Its in-flight op (if any) still settles here, found by op id; nothing else is sent until then.
    // The twin's confirmed state (GET-seen or op-confirmed) is never older than the POST's.
    const twin = entries.find((e) => e.key !== key && e.confirmed?.id === task.id)
    const twinInFlight = twin?.inFlight ?? false
    const confirmed = twin?.confirmed ?? task
    if (twin) {
      entry.pending = [...entry.pending, ...twin.pending]
      drop(twin.key)
    }
    entry.confirmed = confirmed
    entry.base = confirmed
    entry.stamp = ++seq
    entry.inFlight = twinInFlight
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
