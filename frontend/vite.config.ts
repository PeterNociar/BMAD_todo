/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  build: {
    // The CSP is `default-src 'self'` (AD-19): small font subsets inlined as `data:` URIs
    // would be blocked, so every asset ships as its own file.
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    proxy: {
      '/api': `http://${process.env.API_UPSTREAM ?? 'localhost:8000'}`,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./vitest-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/components/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
