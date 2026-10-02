/**
 * Preloads the three latin webfont faces the first paint uses (AD-19 self-hosted fonts,
 * deferred from story 1.9): Inter 400 and 600, and JetBrains Mono 400. Build only: after Vite
 * has emitted the bundle, a `<link rel="preload" as="font" type="font/woff2" crossorigin>` per
 * face goes into `index.html`. The build fails if any face is missing from the bundle, so a
 * fontsource rename can't silently drop a preload.
 */
import type { HtmlTagDescriptor, Plugin } from 'vite'

/** The fontsource file stems main.ts pulls in, latin subset only. */
export const PRELOAD_FACES = [
  'inter-latin-400-normal',
  'inter-latin-600-normal',
  'jetbrains-mono-latin-400-normal',
] as const

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The preload tags for `faces`, given the bundle's file names (e.g.
 * `assets/inter-latin-400-normal-C38fXH4l.woff2`) and the public base path. Throws unless each
 * face matches exactly one emitted woff2 file.
 */
export function preloadTags(
  fileNames: readonly string[],
  base = '/',
  faces: readonly string[] = PRELOAD_FACES,
): HtmlTagDescriptor[] {
  return faces.map((face) => {
    const pattern = new RegExp(`(?:^|/)${escapeRegExp(face)}-[\\w-]+\\.woff2$`)
    const matches = fileNames.filter((name) => pattern.test(name))
    if (matches.length !== 1) {
      const found = matches.length === 0 ? 'none' : matches.join(', ')
      throw new Error(`preload-fonts: expected one ${face} woff2 in the bundle, found ${found}`)
    }
    return {
      tag: 'link',
      attrs: {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        crossorigin: true,
        href: `${base}${matches[0]}`,
      },
      injectTo: 'head',
    }
  })
}

export function preloadFonts(): Plugin {
  let base = '/'
  return {
    name: 'todo:preload-fonts',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return
        return preloadTags(Object.keys(ctx.bundle), base)
      },
    },
  }
}
