import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'
import svelteConfig from './svelte.config.js'

const AD8 = 'Read time through clock.now or clock.sample() from lib/clock.svelte.ts (AD-8).'

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
    files: ['src/**'],
    rules: {
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: AD8 }],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: AD8 },
        { selector: "CallExpression[callee.name='Date']", message: AD8 },
      ],
    },
  },
  {
    files: ['src/lib/clock.svelte.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
    },
  },
)
