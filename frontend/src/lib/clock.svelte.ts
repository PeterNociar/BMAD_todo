/**
 * The one frontend clock (AD-8) and the only `Date.now()` call site in `src/`.
 * `now` is reactive epoch ms; it refreshes every 30 s, when the page becomes visible,
 * on window focus and on pageshow. `sample()` reads the wall clock, updates `now` and returns it.
 */
const REFRESH_MS = 30_000

let now = $state(Date.now())

function sample(): number {
  now = Date.now()
  return now
}

export const clock = {
  get now(): number {
    return now
  },
  sample,
}

setInterval(sample, REFRESH_MS)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sample()
})
window.addEventListener('focus', sample)
window.addEventListener('pageshow', sample)
