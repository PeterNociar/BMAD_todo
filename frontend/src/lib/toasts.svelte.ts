/**
 * The one owner of toasts and screen-reader announcements (AD-17).
 * It owns the verbatim EXPERIENCE copy. Only the store calls `error`, `announce`,
 * `showLoadFailure`, `hideLoadFailure` and `alert`. The toast layer calls `dismiss`,
 * `hold` and `release`. `LiveRegions.svelte` renders `politeText` and `alertText`.
 */
import { clock } from './clock.svelte'

export const COPY = {
  addFailed: "Couldn't save new task.",
  addTooLong: "Couldn't save new task. It's too long.",
  actionFailed: "Couldn't update that task. It's back as it was.",
  loadFailed: "Couldn't load your tasks.",
  retryFailed: "Still couldn't load your tasks.",
  retry: 'Retry',
  dismiss: 'Dismiss',
  emptyState: 'Nothing waiting. Type a task above and press Enter.',
  added: 'Added',
  done: 'Marked done',
  undone: 'Marked not done',
  deleted: 'Deleted',
} as const

export type ErrorKind = 'add_failed' | 'add_too_long' | 'action_failed'
export type ToastKind = ErrorKind | 'load_failed'
export type AnnounceKind = 'added' | 'done' | 'undone' | 'deleted'

export type Toast = {
  id: number
  kind: ToastKind
  message: string
  transient: boolean
}

const MAX_VISIBLE = 2
export const TOAST_MS = 5_000

const ERROR_COPY: Record<ErrorKind, string> = {
  add_failed: COPY.addFailed,
  add_too_long: COPY.addTooLong,
  action_failed: COPY.actionFailed,
}

const ANNOUNCE_COPY: Record<AnnounceKind, string> = {
  added: COPY.added,
  done: COPY.done,
  undone: COPY.undone,
  deleted: COPY.deleted,
}

/** Newest first. */
let items = $state<Toast[]>([])
let politeText = $state('')
let alertText = $state('')

let nextId = 1

type Timer = {
  handle: ReturnType<typeof setTimeout> | null
  deadline: number
  remaining: number
  holds: number
}
/** One entry per transient toast; the load-failure toast has none. Not rendered, so not reactive. */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const timers = new Map<number, Timer>()

function start(id: number, timer: Timer, ms: number): void {
  timer.deadline = clock.sample() + ms
  timer.handle = setTimeout(() => dismiss(id), ms)
}

type Pending = { handle: ReturnType<typeof setTimeout>; text: string }
let pendingPolite: Pending | null = null
let pendingAlert: Pending | null = null

/**
 * Clears the region now and sets the text on the next macrotask, so a repeat is re-read.
 * A second call in the same tick joins its text to the pending one, so neither is lost.
 */
function setPolite(text: string): void {
  if (pendingPolite) {
    pendingPolite.text += ` ${text}`
    return
  }
  politeText = ''
  const pending: Pending = {
    text,
    handle: setTimeout(() => {
      pendingPolite = null
      politeText = pending.text
    }, 0),
  }
  pendingPolite = pending
}

function setAlert(text: string): void {
  if (pendingAlert) {
    pendingAlert.text += ` ${text}`
    return
  }
  alertText = ''
  const pending: Pending = {
    text,
    handle: setTimeout(() => {
      pendingAlert = null
      alertText = pending.text
    }, 0),
  }
  pendingAlert = pending
}

/** Drops the oldest transient toasts until at most two remain; the load-failure toast stays. */
function trim(): void {
  while (items.length > MAX_VISIBLE) {
    const oldest = items.findLastIndex((t) => t.transient)
    if (oldest === -1) return
    dismiss(items[oldest].id)
  }
}

function push(toast: Toast): void {
  items = [toast, ...items]
  trim()
}

function error(kind: ErrorKind): void {
  const id = nextId++
  const message = ERROR_COPY[kind]
  const timer: Timer = { handle: null, deadline: 0, remaining: TOAST_MS, holds: 0 }
  timers.set(id, timer)
  push({ id, kind, message, transient: true })
  start(id, timer, TOAST_MS)
  setPolite(message)
}

function showLoadFailure(): void {
  if (items.some((t) => t.kind === 'load_failed')) return
  push({ id: nextId++, kind: 'load_failed', message: COPY.loadFailed, transient: false })
  setAlert(COPY.loadFailed)
}

function hideLoadFailure(): void {
  if (!items.some((t) => t.kind === 'load_failed')) return
  items = items.filter((t) => t.kind !== 'load_failed')
  if (pendingAlert) clearTimeout(pendingAlert.handle)
  pendingAlert = null
  alertText = ''
}

function announce(kind: AnnounceKind, taskText: string, opts: { listEmpty?: boolean } = {}): void {
  const text = `${ANNOUNCE_COPY[kind]}: ${taskText}`
  setPolite(opts.listEmpty ? `${text}. ${COPY.emptyState}` : text)
}

function alert(text: string): void {
  setAlert(text)
}

function dismiss(id: number): void {
  const timer = timers.get(id)
  if (timer?.handle != null) clearTimeout(timer.handle)
  timers.delete(id)
  items = items.filter((t) => t.id !== id)
}

/**
 * Pauses a transient toast's timer. Holds nest (hover and focus are separate holders),
 * so the timer resumes only when every hold has been released.
 */
function hold(id: number): void {
  const timer = timers.get(id)
  if (!timer) return
  timer.holds += 1
  if (timer.holds > 1 || timer.handle == null) return
  clearTimeout(timer.handle)
  timer.handle = null
  timer.remaining = Math.min(timer.remaining, Math.max(0, timer.deadline - clock.sample()))
}

/** Resumes the timer from the time that remained when it was held. */
function release(id: number): void {
  const timer = timers.get(id)
  if (!timer || timer.holds === 0) return
  timer.holds -= 1
  if (timer.holds > 0) return
  start(id, timer, timer.remaining)
}

export const toasts = {
  get items(): readonly Toast[] {
    return items
  },
  get politeText(): string {
    return politeText
  },
  get alertText(): string {
    return alertText
  },
  error,
  showLoadFailure,
  hideLoadFailure,
  announce,
  alert,
  dismiss,
  hold,
  release,
}
