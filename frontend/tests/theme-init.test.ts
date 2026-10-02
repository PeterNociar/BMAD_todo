/// <reference lib="dom" />
/// <reference types="svelte" />
// Runs public/theme-init.js, the pre-paint theme script (AD-19), as the browser would: a
// classic script against the current document and localStorage. tsconfig.tests.json has neither
// the DOM lib nor Svelte's rune types, which the imported key's runes module needs; hence the
// two references above.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from '../src/lib/theme.svelte.ts'

// Under jsdom, import.meta.url is not a file: URL, so the path is built from the directory.
const source = readFileSync(resolve(import.meta.dirname, '../public/theme-init.js'), 'utf8')

function run(): void {
  new Function(source)()
}

afterEach(() => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

describe('theme-init.js', () => {
  it('reads the storage key lib/theme.svelte.ts writes', () => {
    expect(source).toContain(`getItem('${THEME_STORAGE_KEY}')`)
  })

  it.each(['light', 'dark'])('sets data-theme to a stored %s', (stored) => {
    localStorage.setItem(THEME_STORAGE_KEY, stored)
    run()

    expect(document.documentElement.dataset.theme).toBe(stored)
  })

  it('leaves data-theme unset when nothing is stored', () => {
    run()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('treats an invalid stored value as nothing stored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'blue')
    run()

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('swallows a storage read that throws and leaves data-theme unset', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(run).not.toThrow()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})
