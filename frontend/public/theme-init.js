/*
 * Pre-paint theme (AD-19): loaded with a blocking <script src> in <head>, so the stored theme
 * is on <html> before the first paint. A stored 'light' or 'dark' sets data-theme; anything
 * else, or storage that throws, leaves it unset and the prefers-color-scheme block decides.
 * Plain ES5, no module. lib/theme.svelte.ts reads the attribute back at startup.
 */
;(function () {
  try {
    var stored = window.localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored
    }
  } catch (e) {
    // Storage blocked: the system theme applies.
  }
})()
