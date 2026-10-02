import { fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '../lib/theme.svelte'
import ThemeToggle from './ThemeToggle.svelte'

const focus = vi.hoisted(() => ({ returnToInput: vi.fn() }))
vi.mock('../lib/focus', () => focus)

const toggle = () => screen.getByRole('button')
const active = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.seg.on')).map((el) => el.getAttribute('data-segment'))

beforeEach(() => {
  vi.clearAllMocks()
  theme.set('light')
})

afterEach(() => {
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
  localStorage.clear()
})

describe('ThemeToggle', () => {
  it('is one button with two aria-hidden segments, sun then moon, and no aria-pressed', () => {
    const { container } = render(ThemeToggle)

    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(toggle()).toHaveAttribute('type', 'button')
    expect(toggle()).not.toHaveAttribute('aria-pressed')
    const segments = container.querySelectorAll('.seg')
    expect(Array.from(segments).map((s) => s.getAttribute('data-segment'))).toEqual([
      'light',
      'dark',
    ])
    for (const segment of segments) expect(segment).toHaveAttribute('aria-hidden', 'true')
    for (const icon of container.querySelectorAll('svg')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
      expect(icon).toHaveAttribute('width', '16')
    }
  })

  it('under the light theme: names the switch to dark and marks the sun active', () => {
    const { container } = render(ThemeToggle)

    expect(toggle()).toHaveAccessibleName('Switch to dark theme')
    expect(active(container)).toEqual(['light'])
  })

  it('under the dark theme: names the switch to light and marks the moon active', () => {
    theme.set('dark')
    const { container } = render(ThemeToggle)

    expect(toggle()).toHaveAccessibleName('Switch to light theme')
    expect(active(container)).toEqual(['dark'])
  })

  it('sets the other mode, and the name and active segment follow', async () => {
    const set = vi.spyOn(theme, 'set')
    const { container } = render(ThemeToggle)

    await fireEvent.click(toggle(), { detail: 1 })
    expect(set).toHaveBeenLastCalledWith('dark')
    expect(theme.current).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(toggle()).toHaveAccessibleName('Switch to light theme')
    expect(active(container)).toEqual(['dark'])

    await fireEvent.click(toggle(), { detail: 1 })
    expect(set).toHaveBeenLastCalledWith('light')
    expect(toggle()).toHaveAccessibleName('Switch to dark theme')
    expect(active(container)).toEqual(['light'])
  })

  it('a pointer activation (detail > 0) returns to the input, after setting the theme', async () => {
    const set = vi.spyOn(theme, 'set')
    render(ThemeToggle)

    await fireEvent.click(toggle(), { detail: 1 })

    expect(focus.returnToInput).toHaveBeenCalledTimes(1)
    expect(set.mock.invocationCallOrder[0]).toBeLessThan(
      focus.returnToInput.mock.invocationCallOrder[0],
    )
  })

  it('a keyboard activation (detail 0) flips the theme and never returns to the input', async () => {
    render(ThemeToggle)

    await fireEvent.click(toggle(), { detail: 0 })

    expect(theme.current).toBe('dark')
    expect(focus.returnToInput).not.toHaveBeenCalled()
  })

  it('still flips for the session when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError')
    })
    render(ThemeToggle)

    await fireEvent.click(toggle(), { detail: 1 })

    expect(theme.current).toBe('dark')
    expect(toggle()).toHaveAccessibleName('Switch to light theme')
  })
})
