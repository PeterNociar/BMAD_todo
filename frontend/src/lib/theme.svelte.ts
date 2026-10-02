/**
 * The resolved colour theme (CAP-11, AD-19). `current` is the stored choice when there is one,
 * otherwise the system setting from `prefers-color-scheme`, followed live while nothing is
 * chosen; with no `matchMedia` it is light. The stored choice is read from `data-theme` on
 * `<html>`, which public/theme-init.js set from `localStorage` before first paint, so this
 * module agrees with what was painted. `set(t)` applies a choice at once (`data-theme` and
 * `current`) and stores it under the `'theme'` key; when storage throws, the choice still
 * applies for the session. Once a theme is set, system changes are ignored.
 */
import type { Theme } from './age'

/** The `localStorage` key public/theme-init.js reads; its values are `'light'` or `'dark'`. */
export const THEME_STORAGE_KEY = 'theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

const root = document.documentElement
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

const painted = root.dataset.theme
let chosen: Theme | null = $state(isTheme(painted) ? painted : null)
let system: Theme = $state(media?.matches ? 'dark' : 'light')

function onSystemChange(e: { matches: boolean }): void {
  system = e.matches ? 'dark' : 'light'
}
// Safari < 14's MediaQueryList has only the deprecated addListener.
if (media && typeof media.addEventListener === 'function') {
  media.addEventListener('change', onSystemChange)
} else {
  media?.addListener(onSystemChange)
}

function set(t: Theme): void {
  root.dataset.theme = t
  chosen = t
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t)
  } catch {
    // Storage blocked: the choice lasts for this session only.
  }
}

export const theme = {
  get current(): Theme {
    return chosen ?? system
  },
  set,
}
