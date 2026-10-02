import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from './theme.svelte'

type Theme = 'light' | 'dark'
type ThemeModule = typeof import('./theme.svelte')

/** A controllable `prefers-color-scheme: dark` media query. */
function fakeMedia(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  const query = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: 'change', fn: (e: { matches: boolean }) => void) => {
      listeners.add(fn)
    },
    removeEventListener: (_type: 'change', fn: (e: { matches: boolean }) => void) => {
      listeners.delete(fn)
    },
  }
  return {
    matchMedia: vi.fn(() => query),
    flip(next: boolean) {
      query.matches = next
      for (const fn of listeners) fn({ matches: next })
    },
  }
}

/** Loads a fresh module, as on page load, after theme-init.js left `painted` on `<html>`. */
async function load(painted?: string): Promise<ThemeModule['theme']> {
  if (painted === undefined) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = painted
  vi.resetModules()
  return (await import('./theme.svelte')).theme
}

let os: ReturnType<typeof fakeMedia>

function osScheme(dark: boolean): void {
  os = fakeMedia(dark)
  vi.stubGlobal('matchMedia', os.matchMedia)
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

describe('theme.current', () => {
  it.each<[boolean, Theme]>([
    [true, 'dark'],
    [false, 'light'],
  ])('with nothing stored, follows the OS (dark: %s → %s)', async (dark, expected) => {
    osScheme(dark)
    const theme = await load()

    expect(theme.current).toBe(expected)
    expect(os.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('is light when there is no matchMedia', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const theme = await load()

    expect(theme.current).toBe('light')
  })

  it.each<[boolean, Theme]>([
    [false, 'dark'],
    [true, 'light'],
  ])(
    'takes the stored choice painted by theme-init.js (OS dark: %s, stored %s)',
    async (dark, stored) => {
      osScheme(dark)
      const theme = await load(stored)

      expect(theme.current).toBe(stored)
    },
  )

  it('ignores an invalid data-theme and follows the OS', async () => {
    osScheme(true)
    const theme = await load('blue')

    expect(theme.current).toBe('dark')
  })

  it('reads the painted attribute, not storage, at startup', async () => {
    osScheme(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark') // theme-init.js would have painted it; it did not
    const theme = await load()

    expect(theme.current).toBe('light')
  })

  it('follows live OS changes while nothing is stored', async () => {
    osScheme(false)
    const theme = await load()

    os.flip(true)
    expect(theme.current).toBe('dark')
    os.flip(false)
    expect(theme.current).toBe('light')
  })

  it('follows OS changes through addListener where addEventListener is missing', async () => {
    let listener: ((e: { matches: boolean }) => void) | undefined
    const legacy = {
      matches: false,
      addListener: (fn: (e: { matches: boolean }) => void) => {
        listener = fn
      },
    }
    vi.stubGlobal('matchMedia', () => legacy)
    const theme = await load()

    listener!({ matches: true })
    expect(theme.current).toBe('dark')
  })

  it('ignores OS changes while a stored choice is painted', async () => {
    osScheme(false)
    const theme = await load('light')

    os.flip(true)
    expect(theme.current).toBe('light')
  })
})

describe('theme.set', () => {
  it('sets data-theme and current, and stores the choice', async () => {
    osScheme(false)
    const theme = await load()

    theme.set('dark')

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(theme.current).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('stops following the OS once a theme is set', async () => {
    osScheme(false)
    const theme = await load()

    theme.set('light')
    os.flip(true)

    expect(theme.current).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies the choice for the session when storage throws', async () => {
    osScheme(false)
    const theme = await load()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => theme.set('dark')).not.toThrow()

    expect(theme.current).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })
})
