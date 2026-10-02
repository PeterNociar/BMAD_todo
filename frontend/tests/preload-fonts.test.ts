// @vitest-environment node
// The font preload plugin's pure part: bundle file names → <link rel="preload"> tags.
import { describe, expect, it } from 'vitest'
import { PRELOAD_FACES, preloadFonts, preloadTags } from '../vite-plugins/preload-fonts.ts'

const BUNDLE = [
  'assets/index-C0U_eLO6.js',
  'assets/index-CDumUo1O.css',
  'assets/inter-latin-400-normal-C38fXH4l.woff2',
  'assets/inter-latin-400-normal-CyCys3Eg.woff',
  'assets/inter-latin-600-normal-LgqL8muc.woff2',
  'assets/inter-cyrillic-400-normal-Abc_123.woff2',
  'assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2',
  'assets/jetbrains-mono-latin-ext-400-normal-Xyz-9.woff2',
]

describe('preloadTags', () => {
  it('preloads the three latin woff2 faces as crossorigin font links in <head>', () => {
    expect(preloadTags(BUNDLE)).toEqual(
      [
        '/assets/inter-latin-400-normal-C38fXH4l.woff2',
        '/assets/inter-latin-600-normal-LgqL8muc.woff2',
        '/assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2',
      ].map((href) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href },
        injectTo: 'head',
      })),
    )
  })

  it('targets Inter 400 and 600 and JetBrains Mono 400, latin only', () => {
    expect(PRELOAD_FACES).toEqual([
      'inter-latin-400-normal',
      'inter-latin-600-normal',
      'jetbrains-mono-latin-400-normal',
    ])
  })

  it('prefixes the public base path', () => {
    const hrefs = preloadTags(BUNDLE, '/app/').map((t) => t.attrs?.href)
    expect(hrefs[0]).toBe('/app/assets/inter-latin-400-normal-C38fXH4l.woff2')
  })

  it.each(PRELOAD_FACES)('fails when %s has no woff2 in the bundle', (face) => {
    const without = BUNDLE.filter(
      (name) => !(name.includes(`/${face}-`) && name.endsWith('.woff2')),
    )
    expect(() => preloadTags(without)).toThrow(
      `expected one ${face} woff2 in the bundle, found none`,
    )
  })

  it('fails when a face matches more than one woff2', () => {
    const doubled = [...BUNDLE, 'assets/inter-latin-600-normal-Other111.woff2']
    expect(() => preloadTags(doubled)).toThrow(/inter-latin-600-normal woff2 .* found .*, /)
  })
})

describe('preloadFonts', () => {
  it('runs at build only, as a post transformIndexHtml hook', () => {
    const plugin = preloadFonts()
    expect(plugin.apply).toBe('build')
    expect(plugin.transformIndexHtml).toMatchObject({ order: 'post' })
  })
})
