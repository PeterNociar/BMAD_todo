// @vitest-environment node
// Pins the AD-8 (one clock) and AD-18 (one focus mover) lint bans in eslint.config.js: each
// ban errors outside its one allowed module, the two exemptions do not lift each other's
// ban, and test files are exempt from both. Each snippet is linted as if it lived at the
// given path; the file's contents on disk, if it has any, are never read.
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it, vi } from 'vitest'

// The first lintText call cold-starts the typed parser, which can pass 5 s under coverage.
vi.setConfig({ testTimeout: 30_000 })

// The real config, plus one parser tweak: `src/X.svelte` and `src/lib/store.svelte.ts` are not
// on disk, so the typed project service cannot find them. The bans are syntax rules and need
// no type information.
const eslint = new ESLint({
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  overrideConfig: {
    files: ['src/X.svelte', 'src/lib/store.svelte.ts'],
    languageOptions: { parserOptions: { projectService: false } },
  },
})

/** Each banned Date call and the rule that must report it. */
const DATE_CALLS: [string, string][] = [
  ['Date.now()', 'no-restricted-properties'],
  ['new Date()', 'no-restricted-syntax'],
  ['Date()', 'no-restricted-syntax'],
]
const FOCUS_CALL = 'document.body.focus()'
const BAN_RULES = new Set(['no-restricted-properties', 'no-restricted-syntax'])

function tsModule(expression: string): string {
  return `export const value = ${expression}\n`
}

function svelteComponent(expression: string): string {
  return `<script lang="ts">\n  export const value = ${expression}\n</script>\n\n<p>{value}</p>\n`
}

function snippet(expression: string, filePath: string): string {
  return filePath.endsWith('.svelte') ? svelteComponent(expression) : tsModule(expression)
}

/**
 * The ban-rule ids that fire as errors on `expression` at `filePath`. A parse error or an
 * ignored file fails the test, so an "allowed" case can never pass just because nothing was
 * linted. Other rules are not counted.
 */
async function bans(expression: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(snippet(expression, filePath), { filePath })
  const unlinted = result.messages.filter(
    (message) => message.fatal || message.message.startsWith('File ignored'),
  )
  expect(unlinted, `${filePath} was not linted`).toEqual([])
  return result.messages
    .filter((message) => message.severity === 2)
    .map((message) => message.ruleId ?? '')
    .filter((ruleId) => BAN_RULES.has(ruleId))
}

describe('AD-8: Date calls', () => {
  const banned = ['src/x.ts', 'src/X.svelte', 'src/lib/store.svelte.ts', 'src/lib/focus.ts']
  const allowed = ['src/lib/clock.svelte.ts', 'src/lib/x.test.ts']

  describe.each(banned)('in %s', (filePath) => {
    it.each(DATE_CALLS)('%s is an error', async (call, rule) => {
      expect(await bans(call, filePath)).toEqual([rule])
    })
  })

  describe.each(allowed)('in %s', (filePath) => {
    it.each(DATE_CALLS)('%s is allowed', async (call) => {
      expect(await bans(call, filePath)).toEqual([])
    })
  })
})

describe('AD-18: .focus()', () => {
  it.each(['src/x.ts', 'src/X.svelte', 'src/lib/clock.svelte.ts'])(
    'is an error in %s',
    async (filePath) => {
      expect(await bans(FOCUS_CALL, filePath)).toEqual(['no-restricted-syntax'])
    },
  )

  it.each(['src/lib/focus.ts', 'src/lib/x.test.ts'])('is allowed in %s', async (filePath) => {
    expect(await bans(FOCUS_CALL, filePath)).toEqual([])
  })
})
