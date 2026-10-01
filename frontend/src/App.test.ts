import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'
import * as apiModule from './lib/api'
import type { Task } from './lib/api'
import * as store from './lib/tasks.svelte'
import { toasts } from './lib/toasts.svelte'

// The real store runs on top of a mocked api.
vi.mock('./lib/api', async (importActual) => {
  const actual = await importActual<typeof import('./lib/api')>()
  return {
    ApiError: actual.ApiError,
    listTasks: vi.fn(),
    addTask: vi.fn(),
    tickTask: vi.fn(),
    untickTask: vi.fn(),
    deleteTask: vi.fn(),
  }
})

// The `tasks` singleton is swapped for a fresh real store before each test.
vi.mock('./lib/tasks.svelte', async (importActual) => {
  const actual = await importActual<typeof import('./lib/tasks.svelte')>()
  let current = actual.createTasks()
  return {
    ...actual,
    get tasks() {
      return current
    },
    resetTasks() {
      current.dispose()
      current = actual.createTasks()
    },
  }
})

const api = vi.mocked(apiModule)
const resetTasks = (store as unknown as { resetTasks: () => void }).resetTasks

const EMPTY_STATE = 'Nothing waiting. Type a task above and press Enter.'
const ADD_FAILED = "Couldn't save new task."

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

function task(text: string, n = 1): Task {
  return {
    id: `6f1c2a9b-7d10-4c1e-9a3b-00000000000${n}`,
    text,
    added_at: '2026-09-30T08:00:00.000Z',
    completed_at: null,
  }
}

function stubHover(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === '(hover: hover)' && matches, media: query })),
  )
}

/** Renders App with the GET already answered with `loaded`, and waits for the list. */
async function renderLoaded(loaded: Task[] = []) {
  api.listTasks.mockResolvedValue(loaded)
  const view = render(App)
  await vi.waitFor(() => expect(store.tasks.loadState).toBe('ready'))
  return {
    api,
    tasks: store.tasks,
    view,
    input: screen.getByLabelText<HTMLInputElement>('New task'),
  }
}

async function typeAndEnter(input: HTMLInputElement, text: string, init: KeyboardEventInit = {}) {
  await fireEvent.input(input, { target: { value: text } })
  await fireEvent.keyDown(input, { key: 'Enter', ...init })
}

beforeEach(() => {
  resetTasks()
  for (const fn of Object.values(api)) if (vi.isMockFunction(fn)) fn.mockReset()
  stubHover(false)
})

afterEach(() => {
  for (const t of [...toasts.items]) toasts.dismiss(t.id)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('App: page', () => {
  it('renders the wordmark and the labelled input with its 1.1 attributes', async () => {
    api.listTasks.mockReturnValue(new Promise(() => {}))
    render(App)

    expect(screen.getByRole('heading', { level: 1, name: 'Todo' })).toBeInTheDocument()
    const input = screen.getByLabelText('New task')
    expect(input).toHaveAttribute('placeholder', 'What needs doing?')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('enterkeyhint', 'enter')
  })

  it('renders both live regions, empty, at first paint', async () => {
    api.listTasks.mockReturnValue(new Promise(() => {}))
    render(App)

    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(screen.getByRole('alert')).toHaveTextContent('')
  })

  it('loads the list through the store on mount', async () => {
    const { api } = await renderLoaded([])
    expect(api.listTasks).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state when the list is empty', async () => {
    await renderLoaded([])
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument()
  })

  it('renders task text as text, never HTML', async () => {
    await renderLoaded([task('<b>not html</b>')])

    const list = screen.getByRole('list', { name: 'Tasks' })
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(screen.getByText('<b>not html</b>')).toBeInTheDocument()
    expect(list.querySelector('b')).toBeNull()
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
  })

  it('renders the rows in the store order', async () => {
    const older = { ...task('older', 1), added_at: '2026-09-30T07:00:00.000Z' }
    await renderLoaded([task('newer', 2), older])

    const items = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.text')?.textContent?.trim())
    expect(items).toEqual(['older', 'newer'])
  })

  it('shows no empty state while loading or when the load fails', async () => {
    api.listTasks.mockRejectedValue(new Error('network'))
    render(App)

    await vi.waitFor(() => expect(api.listTasks).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
    expect(screen.getByLabelText('New task')).toBeInTheDocument()
  })

  it('Retry after a failed load renders the list and closes the load-failure toast', async () => {
    stubHover(true)
    api.listTasks.mockRejectedValueOnce(new apiModule.ApiError('unavailable', 503))
    render(App)

    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(store.tasks.loadState).toBe('load_failed')
    expect(screen.getByText("Couldn't load your tasks.")).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()

    api.listTasks.mockResolvedValueOnce([task('back')])
    retry.focus()
    await fireEvent.click(retry)

    await vi.waitFor(() => expect(store.tasks.loadState).toBe('ready'))
    expect(api.listTasks).toHaveBeenCalledTimes(2)
    const list = await screen.findByRole('list', { name: 'Tasks' })
    expect(list).toHaveTextContent('back')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByLabelText('New task')).toHaveFocus())
  })

  /** Renders App with the first GET failed and waits for the Retry button. */
  async function renderFailed() {
    api.listTasks.mockRejectedValueOnce(new apiModule.ApiError('unavailable', 503))
    render(App)
    return screen.findByRole('button', { name: 'Retry' })
  }

  it('sends one GET for a double click on Retry', async () => {
    const retry = await renderFailed()
    const get = deferred<Task[]>()
    api.listTasks.mockReturnValueOnce(get.promise)

    await fireEvent.click(retry)
    await fireEvent.click(retry)
    get.resolve([task('back')])

    await vi.waitFor(() => expect(store.tasks.loadState).toBe('ready'))
    expect(api.listTasks).toHaveBeenCalledTimes(2)
  })

  it('a failed Retry keeps the toast and Retry and alerts that it still could not load', async () => {
    const retry = await renderFailed()
    api.listTasks.mockRejectedValueOnce(new apiModule.ApiError('unavailable', 503))

    await fireEvent.click(retry)

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent("Still couldn't load your tasks."),
    )
    expect(store.tasks.loadState).toBe('load_failed')
    expect(screen.getByText("Couldn't load your tasks.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
  })

  it('shows a task added under load_failed as the only row', async () => {
    await renderFailed()
    api.addTask.mockResolvedValue(task('new'))

    await typeAndEnter(screen.getByLabelText<HTMLInputElement>('New task'), 'new')

    const list = screen.getByRole('list', { name: 'Tasks' })
    const items = list.querySelectorAll('li')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('new')
    expect(items[0]).toHaveClass('held')
  })
})

describe('App: adding', () => {
  it('Enter adds the trimmed text, clears the input and shows the row', async () => {
    const { api, input } = await renderLoaded([])
    api.addTask.mockResolvedValue(task('buy milk'))

    await typeAndEnter(input, '  buy milk  ')

    expect(api.addTask).toHaveBeenCalledWith('buy milk')
    expect(input.value).toBe('')
    expect(screen.getByRole('listitem').querySelector('.text')).toHaveTextContent('buy milk')
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()
  })

  it('whitespace-only Enter adds nothing and keeps the spaces', async () => {
    const { api, input } = await renderLoaded([])

    await typeAndEnter(input, '   ')

    expect(api.addTask).not.toHaveBeenCalled()
    expect(input.value).toBe('   ')
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument()
  })

  it('Enter during an IME composition adds nothing', async () => {
    const { api, input } = await renderLoaded([])

    await typeAndEnter(input, 'かな', { isComposing: true })
    await fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })

    expect(api.addTask).not.toHaveBeenCalled()
    expect(input.value).toBe('かな')
  })

  it('pasted line breaks become spaces', async () => {
    const { input } = await renderLoaded([])

    await fireEvent.paste(input, { clipboardData: { getData: () => 'a\nb\r\nc' } })

    expect(input.value).toBe('a b c')
  })

  it('each run of line breaks, including Unicode separators, becomes one space', async () => {
    const { input } = await renderLoaded([])

    await fireEvent.paste(input, { clipboardData: { getData: () => 'a\n\nb\u2028c\u2029\r\nd' } })

    expect(input.value).toBe('a b c d')
  })

  it('a paste over a selection keeps the rest of the text, and Enter adds the result', async () => {
    const { api, input } = await renderLoaded([])
    api.addTask.mockResolvedValue(task('pre a b'))
    await fireEvent.input(input, { target: { value: 'pre xyz' } })
    input.setSelectionRange(4, 7)

    await fireEvent.paste(input, { clipboardData: { getData: () => 'a\nb' } })
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(api.addTask).toHaveBeenCalledWith('pre a b')
  })

  it('a paste without line breaks is left to the browser', async () => {
    const { input } = await renderLoaded([])

    const notPrevented = await fireEvent.paste(input, { clipboardData: { getData: () => 'ab' } })

    expect(notPrevented).toBe(true)
  })

  it('a failed add removes the row, shows the toast and puts the text back', async () => {
    const { api, input } = await renderLoaded([])
    const post = deferred<Task>()
    api.addTask.mockReturnValue(post.promise)

    await typeAndEnter(input, 'x')
    expect(screen.getByRole('listitem').querySelector('.text')).toHaveTextContent('x')
    expect(input.value).toBe('')

    post.reject(new Error('unavailable'))
    await vi.waitFor(() => expect(input.value).toBe('x'))
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText(ADD_FAILED)).toBeInTheDocument()
  })

  it('a rejection that is not an AddFailure leaves the input alone', async () => {
    const { tasks, input } = await renderLoaded([])
    const add = vi.spyOn(tasks, 'add').mockRejectedValue(new Error('boom'))
    const errors: unknown[] = []
    const onError = (e: ErrorEvent) => errors.push(e.error)
    window.addEventListener('error', onError)

    await typeAndEnter(input, 'x')
    await vi.waitFor(() => expect(add).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(input.value).toBe('')
    // The bound value is still a string: a bare Enter is the empty-input no-op, not a crash.
    await fireEvent.keyDown(input, { key: 'Enter' })
    window.removeEventListener('error', onError)
    expect(errors).toEqual([])
    expect(add).toHaveBeenCalledTimes(1)
  })

  it('a failed add keeps text typed since', async () => {
    const { api, input } = await renderLoaded([])
    const post = deferred<Task>()
    api.addTask.mockReturnValue(post.promise)

    await typeAndEnter(input, 'x')
    await fireEvent.input(input, { target: { value: 'next' } })

    post.reject(new Error('unavailable'))
    await vi.waitFor(() => expect(screen.getByText(ADD_FAILED)).toBeInTheDocument())
    expect(input.value).toBe('next')
  })

  it('a failed add with ops queued on it returns no text', async () => {
    const { api, tasks, input } = await renderLoaded([])
    const post = deferred<Task>()
    api.addTask.mockReturnValue(post.promise)

    await typeAndEnter(input, 'x')
    tasks.tick(tasks.rows[0].key)

    post.reject(new Error('unavailable'))
    await vi.waitFor(() => expect(screen.getByText(ADD_FAILED)).toBeInTheDocument())
    expect(input.value).toBe('')
  })
})

describe('App: focus', () => {
  it('focuses the input on load on laptop', async () => {
    stubHover(true)
    const { input } = await renderLoaded([])
    expect(input).toHaveFocus()
  })

  it('does not focus the input on load on phone', async () => {
    const { input } = await renderLoaded([])
    expect(input).not.toHaveFocus()
  })

  it('returns focus to the input after an add', async () => {
    stubHover(true)
    const { api, input } = await renderLoaded([])
    api.addTask.mockResolvedValue(task('a'))
    input.blur()

    await typeAndEnter(input, 'a')

    expect(input).toHaveFocus()
  })

  it('type-to-focus is installed while mounted and removed on destroy', async () => {
    stubHover(true)
    const removed = vi.spyOn(document, 'removeEventListener')
    const { input, view } = await renderLoaded([])
    input.blur()

    await fireEvent.keyDown(document.body, { key: 'q' })
    expect(input).toHaveFocus()
    expect(input.value).toBe('q')

    view.unmount()
    expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('the safety net returns focus to the input when a focused toast closes', async () => {
    stubHover(true)
    const { api, input } = await renderLoaded([])
    api.addTask.mockRejectedValue(new Error('unavailable'))

    await typeAndEnter(input, 'x')
    const dismiss = await screen.findByRole('button', { name: 'Dismiss' })
    dismiss.focus()
    expect(dismiss).toHaveFocus()

    await fireEvent.click(dismiss)

    await vi.waitFor(() => expect(input).toHaveFocus())
  })

  it('the safety net is uninstalled on destroy', async () => {
    stubHover(true)
    const removed = vi.spyOn(document, 'removeEventListener')
    const { view } = await renderLoaded([])

    view.unmount()

    expect(removed).toHaveBeenCalledWith('focusin', expect.any(Function))
    expect(removed).toHaveBeenCalledWith('focusout', expect.any(Function))
  })

  it("Down from the input moves to the first row's tick ring", async () => {
    stubHover(true)
    const { input } = await renderLoaded([task('a')])

    const notPrevented = await fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(notPrevented).toBe(false)
    expect(screen.getByRole('button', { name: 'Mark "a" done' })).toHaveFocus()
  })
})

describe('App: loading', () => {
  it('shows the skeleton only once loading has lasted 300 ms', async () => {
    vi.useFakeTimers()
    const get = deferred<Task[]>()
    api.listTasks.mockReturnValue(get.promise)
    render(App)

    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('aria-busy', 'true')

    await vi.advanceTimersByTimeAsync(299)
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    expect(screen.queryByText(EMPTY_STATE)).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)
    const skeleton = screen.getByTestId('skeleton')
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton.querySelectorAll('.bar')).toHaveLength(3)

    get.resolve([task('loaded')])
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    expect(screen.getByRole('listitem').querySelector('.text')).toHaveTextContent('loaded')
    expect(main).toHaveAttribute('aria-busy', 'false')
  })

  it('never shows the skeleton for a fast load', async () => {
    vi.useFakeTimers()
    const get = deferred<Task[]>()
    api.listTasks.mockReturnValue(get.promise)
    render(App)

    await vi.advanceTimersByTimeAsync(100)
    get.resolve([])
    await vi.advanceTimersByTimeAsync(1_000)
    await tick()

    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument()
  })

  it('shows an add made while loading above the skeleton', async () => {
    vi.useFakeTimers()
    api.listTasks.mockReturnValue(new Promise(() => {}))
    api.addTask.mockReturnValue(new Promise(() => {}))
    render(App)
    const input = screen.getByLabelText<HTMLInputElement>('New task')

    await vi.advanceTimersByTimeAsync(300)
    await typeAndEnter(input, 'early')

    const list = screen.getByRole('list', { name: 'Tasks' })
    const skeleton = screen.getByTestId('skeleton')
    expect(list).toHaveTextContent('early')
    expect(list.compareDocumentPosition(skeleton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a later load restarts the 300 ms delay', async () => {
    vi.useFakeTimers()
    const first = deferred<Task[]>()
    api.listTasks.mockReturnValueOnce(first.promise)
    render(App)
    // A slow first load: its skeleton shows, then the list arrives.
    await vi.advanceTimersByTimeAsync(300)
    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
    first.resolve([])
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(screen.getByText(EMPTY_STATE)).toBeInTheDocument()

    api.listTasks.mockReturnValueOnce(new Promise(() => {}))
    void store.tasks.load()
    await tick()
    await vi.advanceTimersByTimeAsync(299)
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(1)
    expect(screen.getByTestId('skeleton').querySelectorAll('.bar')).toHaveLength(3)
  })
})

function ordered(
  n: number,
  text: string,
  addedAt: string,
  completedAt: string | null = null,
): Task {
  return { ...task(text, n), added_at: addedAt, completed_at: completedAt }
}

const three = () => [
  ordered(1, 'one', '2026-09-30T07:00:00.000Z'),
  ordered(2, 'two', '2026-09-30T08:00:00.000Z'),
  ordered(3, 'three', '2026-09-30T09:00:00.000Z'),
]

const texts = () =>
  screen.getAllByRole('listitem').map((li) => li.querySelector('.text')?.textContent)

describe('App: rows', () => {
  it('renders each row as a data-task-row item with its tick and delete controls', async () => {
    await renderLoaded([task('milk')])

    const [li] = screen.getAllByRole('listitem')
    expect(li).toHaveAttribute('data-task-row')
    expect(li.querySelector('[data-row-control="tick"]')).toHaveAccessibleName('Mark "milk" done')
    expect(li.querySelector('[data-row-control="delete"]')).toHaveAccessibleName('Delete "milk"')
  })

  it('tick moves the row to the top of the completed tasks; untick puts it back', async () => {
    const { api } = await renderLoaded([
      ...three(),
      ordered(4, 'old done', '2026-09-30T06:00:00.000Z', '2026-09-30T06:30:00.000Z'),
    ])
    const two = three()[1]
    api.tickTask.mockResolvedValue({ ...two, completed_at: '2026-09-30T10:00:00.000Z' })

    await fireEvent.click(screen.getByRole('button', { name: 'Mark "two" done' }))
    expect(texts()).toEqual(['one', 'three', 'two', 'old done'])
    expect(api.tickTask).toHaveBeenCalledWith(two.id)

    api.untickTask.mockResolvedValue(two)
    await fireEvent.click(await screen.findByRole('button', { name: 'Mark "two" not done' }))
    expect(texts()).toEqual(['one', 'two', 'three', 'old done'])
  })

  it('delete removes the row at once', async () => {
    const { api } = await renderLoaded(three())
    api.deleteTask.mockResolvedValue(undefined)

    await fireEvent.click(screen.getByRole('button', { name: 'Delete "two"' }))

    expect(texts()).toEqual(['one', 'three'])
    expect(api.deleteTask).toHaveBeenCalledWith(three()[1].id)
  })

  it('a failed tick rolls the row back and shows the action toast', async () => {
    const { api } = await renderLoaded(three())
    api.tickTask.mockRejectedValue(new apiModule.ApiError('unavailable', 503))

    await fireEvent.click(screen.getByRole('button', { name: 'Mark "two" done' }))

    await vi.waitFor(() =>
      expect(screen.getByText("Couldn't update that task. It's back as it was.")).toBeVisible(),
    )
    expect(texts()).toEqual(['one', 'two', 'three'])
    expect(screen.getByRole('button', { name: 'Mark "two" done' })).toBeInTheDocument()
  })

  it('returns focus to the input after a tick and after a delete on laptop', async () => {
    stubHover(true)
    const { api, input } = await renderLoaded(three())
    api.tickTask.mockReturnValue(new Promise(() => {}))
    api.deleteTask.mockReturnValue(new Promise(() => {}))

    const tickOne = screen.getByRole('button', { name: 'Mark "one" done' })
    tickOne.focus()
    await fireEvent.click(tickOne)
    expect(input).toHaveFocus()

    const del = screen.getByRole('button', { name: 'Delete "three"' })
    del.focus()
    await fireEvent.click(del)
    expect(input).toHaveFocus()
  })

  it('arrow keys move between rows keeping the control type; Up from row 1 and Esc return', async () => {
    stubHover(true)
    const { input } = await renderLoaded(three())
    const tick = (t: string) => screen.getByRole('button', { name: `Mark "${t}" done` })
    const del = (t: string) => screen.getByRole('button', { name: `Delete "${t}"` })

    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(tick('one')).toHaveFocus()
    await fireEvent.keyDown(tick('one'), { key: 'ArrowDown' })
    expect(tick('two')).toHaveFocus()
    await fireEvent.keyDown(tick('two'), { key: 'ArrowUp' })
    expect(tick('one')).toHaveFocus()
    await fireEvent.keyDown(tick('one'), { key: 'ArrowUp' })
    expect(input).toHaveFocus()

    del('two').focus()
    await fireEvent.keyDown(del('two'), { key: 'ArrowDown' })
    expect(del('three')).toHaveFocus()
    await fireEvent.keyDown(del('three'), { key: 'Escape' })
    expect(input).toHaveFocus()
  })

  it("keeps 1.9's list name and the busy flag", async () => {
    await renderLoaded([task('a')])
    expect(screen.getByRole('list', { name: 'Tasks' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  })
})

/** A ResizeObserver stub that records each observer and the elements it watches. */
type StubObserver = {
  callback: ResizeObserverCallback
  targets: Set<Element>
  observe: ReturnType<typeof vi.fn>
  unobserve: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function stubResizeObserver(): StubObserver[] {
  const observers: StubObserver[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        const targets = new Set<Element>()
        observers.push({
          callback,
          targets,
          observe: (this.observe = vi.fn((el: Element) => targets.add(el))),
          unobserve: (this.unobserve = vi.fn((el: Element) => targets.delete(el))),
          disconnect: (this.disconnect = vi.fn(() => targets.clear())),
        })
      }
      observe: ReturnType<typeof vi.fn>
      unobserve: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    },
  )
  return observers
}

/** The stub observer currently watching `el`. */
function observerOf(observers: StubObserver[], el: Element): StubObserver {
  const found = observers.find((o) => o.targets.has(el))
  if (!found) throw new Error('element is not observed')
  return found
}

/** Fires `observer` with one border-box entry for `target`. */
function resize(observer: StubObserver, target: Element, blockSize: number): void {
  const entry = { target, borderBoxSize: [{ blockSize, inlineSize: 640 }] }
  observer.callback([entry as unknown as ResizeObserverEntry], {} as ResizeObserver)
}

describe('App: measured heights', () => {
  let height = 120

  beforeEach(() => {
    height = 120
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height }) as DOMRect,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('sets --sticky-height from a ResizeObserver on the header, and disconnects on destroy', async () => {
    const observers = stubResizeObserver()
    const { view } = await renderLoaded([])
    const header = screen.getByRole('banner')
    const page = header.parentElement!
    const observer = observerOf(observers, header)
    expect(observer.observe).toHaveBeenCalledWith(header, { box: 'border-box' })
    expect(page.style.getPropertyValue('--sticky-height')).toBe('120px')

    height = 150
    observer.callback([], {} as ResizeObserver)
    expect(page.style.getPropertyValue('--sticky-height')).toBe('150px')

    // An entry's border-box size wins over the rect.
    resize(observer, header, 170)
    expect(page.style.getPropertyValue('--sticky-height')).toBe('170px')

    view.unmount()
    for (const o of observers) expect(o.disconnect).toHaveBeenCalled()
  })

  it('sets --toast-height from the toast anchor', async () => {
    const observers = stubResizeObserver()
    height = 0
    await renderLoaded([])
    const page = screen.getByRole('banner').parentElement!
    const anchor = page.querySelector('.toasts')!
    expect(page.style.getPropertyValue('--toast-height')).toBe('0px')

    resize(observerOf(observers, anchor), anchor, 48)
    expect(page.style.getPropertyValue('--toast-height')).toBe('48px')
  })

  it('works without ResizeObserver: the heights come from one rect read', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    await renderLoaded([])
    const page = screen.getByRole('banner').parentElement!
    expect(page.style.getPropertyValue('--sticky-height')).toBe('120px')
    expect(page.style.getPropertyValue('--toast-height')).toBe('120px')
  })
})

describe('App: held row', () => {
  // jsdom has no scrollIntoView: a no-op stands in for the whole block, so each test can spy on
  // it, and is removed afterwards.
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => {},
    })
  })

  afterAll(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height: 36 }) as DOMRect,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** Loads `loaded`, then adds "new" (confirmed as task n = 9) and returns its row. */
  async function addHeld(loaded: Task[]) {
    const ctx = await renderLoaded(loaded)
    ctx.api.addTask.mockResolvedValue(task('new', 9))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await typeAndEnter(ctx.input, 'new')
    await tick()
    const page = screen.getByRole('banner').parentElement!
    const rowOf = (text: string) =>
      screen.getAllByRole('listitem').find((li) => li.querySelector('.text')?.textContent === text)!
    return { ...ctx, page, rowOf }
  }

  it('marks only the held row, follows heldKey, and clears when the hold ends', async () => {
    const { tasks, page, rowOf } = await addHeld([task('old', 1)])
    expect(tasks.heldKey).not.toBeNull()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toBe(rowOf('new'))
    expect(rowOf('new')).toHaveClass('held')
    expect(rowOf('old')).not.toHaveClass('held')
    expect(page.style.getPropertyValue('--held-height')).toBe('calc(36px + var(--space-3))')

    vi.advanceTimersByTime(store.HOLD_MS)
    await tick()
    expect(tasks.heldKey).toBeNull()
    expect(screen.getAllByRole('listitem').at(-1)).toBe(rowOf('new'))
    expect(rowOf('new')).not.toHaveClass('held')
    expect(page.style.getPropertyValue('--held-height')).toBe('0px')
  })

  it('a newer add moves the mark, and --held-height tracks the held row', async () => {
    const observers = stubResizeObserver()
    const { api, input, page, rowOf } = await addHeld([])
    const first = rowOf('new')
    const observer = observerOf(observers, first)
    resize(observer, first, 54)
    expect(page.style.getPropertyValue('--held-height')).toBe('calc(54px + var(--space-3))')

    api.addTask.mockResolvedValue(task('newer', 8))
    await typeAndEnter(input, 'newer')
    await tick()
    expect(rowOf('newer')).toHaveClass('held')
    expect(rowOf('new')).not.toHaveClass('held')
    expect(observer.targets.has(first)).toBe(false)
    expect(observer.targets.has(rowOf('newer'))).toBe(true)
    expect(page.style.getPropertyValue('--held-height')).toBe('calc(36px + var(--space-3))')
  })

  /** jsdom's `:focus-visible` heuristic is not the browser's: pin it for `el`. */
  function focusVisible(el: HTMLElement, visible: boolean): void {
    const matches = el.matches.bind(el)
    vi.spyOn(el, 'matches').mockImplementation((selector) =>
      selector === ':focus-visible' ? visible : matches(selector),
    )
  }

  /** The tick ring of the held row "new". */
  const tickOf = (row: HTMLElement) => row.querySelector<HTMLElement>('[data-row-control="tick"]')!

  it('keeps keyboard focus on a held-row control when the hold ends, and scrolls it into view', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { rowOf } = await addHeld([task('old', 1)])
    const tickRing = tickOf(rowOf('new'))
    focusVisible(tickRing, true)
    tickRing.focus()

    vi.advanceTimersByTime(store.HOLD_MS)
    await tick()
    expect(document.activeElement).toBe(tickRing)
    expect(scroll).toHaveBeenCalledOnce()
    expect(scroll.mock.contexts[0]).toBe(tickRing)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('neither restores nor scrolls a focused control without :focus-visible (a tap)', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { rowOf } = await addHeld([task('old', 1)])
    const tickRing = tickOf(rowOf('new'))
    focusVisible(tickRing, false)
    const keep = vi.spyOn(HTMLElement.prototype, 'focus')
    tickRing.focus()
    keep.mockClear()

    vi.advanceTimersByTime(store.HOLD_MS)
    await tick()
    expect(keep).not.toHaveBeenCalled()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('never scrolls when the hold ends with focus elsewhere', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { input } = await addHeld([task('old', 1)])
    input.focus()
    vi.advanceTimersByTime(store.HOLD_MS)
    await tick()
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
  })
})
