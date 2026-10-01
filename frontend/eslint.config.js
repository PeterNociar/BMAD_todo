import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'
import svelteConfig from './svelte.config.js'

const AD8 = 'Read time through clock.now or clock.sample() from lib/clock.svelte.ts (AD-8).'
const AD8_SYNTAX = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: AD8 },
  { selector: "CallExpression[callee.name='Date']", message: AD8 },
]
const AD18_SYNTAX = [
  {
    selector: "CallExpression[callee.property.name='focus']",
    message: 'Move focus through lib/focus.ts (AD-18).',
  },
]

export default ts.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    rules: {
      'svelte/no-at-html-tags': 'error',
    },
  },
  {
    // AD-8: lib/clock.svelte.ts is the only Date.now() call site in src/.
    // AD-18: lib/focus.ts is the only code that calls .focus().
    files: ['src/**'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: AD8 }],
      'no-restricted-syntax': ['error', ...AD8_SYNTAX, ...AD18_SYNTAX],
    },
  },
  {
    files: ['src/lib/clock.svelte.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': ['error', ...AD18_SYNTAX],
    },
  },
  {
    files: ['src/lib/focus.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...AD8_SYNTAX],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
)
