// @vitest-environment node
// Story 3.8 security review: no `.env` file may reach an image build context. The frontend
// image's build stage copies the whole directory (`COPY . .`) before `npm run build`, and Vite
// reads `.env*` files, so a local frontend `.env` would otherwise be sent to the build.
// This checks the wording of the two `.dockerignore` files, not a real build context.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function patterns(path: string): string[] {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

describe('.dockerignore', () => {
  it('the frontend build context excludes every .env file', () => {
    expect(patterns('../.dockerignore')).toEqual(expect.arrayContaining(['**/.env', '**/.env.*']))
  })

  it('the backend build context excludes every .env file (AD-21)', () => {
    expect(patterns('../../backend/.dockerignore')).toEqual(
      expect.arrayContaining(['**/.env', '**/.env.*']),
    )
  })
})
