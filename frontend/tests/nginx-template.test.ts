// @vitest-environment node
// Guards the stale-IP fix in nginx/default.conf.template: the `/api/` location re-resolves the
// backend through Docker's DNS and proxies through a variable. A literal
// `proxy_pass http://${API_UPSTREAM};` would pin the startup IP (502 after a backend recreate).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const template = readFileSync(new URL('../nginx/default.conf.template', import.meta.url), 'utf8')

/** The body of `location /api/ { ... }`, comments stripped. */
function apiLocation(): string {
  // Ends at the first line holding only `}`: `${API_UPSTREAM}` has a brace of its own.
  const match = /location \/api\/ \{([\s\S]*?)^\s*\}\s*$/m.exec(template)
  expect(match, 'no `location /api/` block').not.toBeNull()
  return match![1].replace(/#.*$/gm, '')
}

describe('nginx /api/ location', () => {
  it('re-resolves the backend through Docker DNS', () => {
    expect(apiLocation()).toMatch(/^\s*resolver 127\.0\.0\.11\b[^;]*;/m)
  })

  it('proxies through the $api variable, set from API_UPSTREAM with no URI part', () => {
    const body = apiLocation()
    expect(body).toMatch(/^\s*set \$api http:\/\/\$\{API_UPSTREAM\};/m)
    const proxyPasses = body.match(/^\s*proxy_pass\s+[^;]*;/gm) ?? []
    expect(proxyPasses.map((line) => line.trim())).toEqual(['proxy_pass $api;'])
  })
})

// Cache headers (story 3.6). An `add_header` inside a location drops every inherited one, so
// each static location must repeat the shared headers and the CSP itself.

/** The body of the location block opened by `opener` (e.g. `location = /index.html`). */
function locationBody(opener: string): string {
  const start = template.indexOf(`${opener} {`)
  expect(start, `no \`${opener}\` block`).toBeGreaterThanOrEqual(0)
  const match = /\{([\s\S]*?)^\s*\}\s*$/m.exec(template.slice(start))
  expect(match, `unterminated \`${opener}\` block`).not.toBeNull()
  return match![1].replace(/#.*$/gm, '')
}

/** The values of every `add_header <name> "<value>" [always];` in `body`, keyed by name. */
function headers(body: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(
    /^\s*add_header\s+(\S+)\s+"([^"]*)"(\s+always)?;/gm,
  )) {
    expect(found[name], `${name} set twice`).toBeUndefined()
    found[name] = value
  }
  return found
}

const SHARED = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'",
}

describe('nginx static locations', () => {
  it.each([
    ['location = /index.html', 'no-cache'],
    ['location = /theme-init.js', 'no-cache'],
    ['location /assets/', 'public, max-age=31536000, immutable'],
  ])('%s sends Cache-Control "%s" and repeats the shared headers and the CSP', (opener, cache) => {
    expect(headers(locationBody(opener))).toEqual({ ...SHARED, 'Cache-Control': cache })
  })

  it('location /assets/ 404s a missing file, and sends its Cache-Control without `always`', () => {
    const body = locationBody('location /assets/')
    expect(body).toMatch(/^\s*try_files \$uri =404;/m)
    // `always` would stamp a missing asset's 404 as immutable for a year.
    expect(body).toMatch(/^\s*add_header Cache-Control "[^"]*immutable";/m)
    for (const name of Object.keys(SHARED)) {
      expect(body).toMatch(new RegExp(`^\\s*add_header ${name} "[^"]*" always;`, 'm'))
    }
  })

  it('location / keeps the SPA fallback to /index.html, with the shared headers and the CSP', () => {
    const body = locationBody('location /')
    expect(body).toMatch(/^\s*try_files \$uri \$uri\/ \/index\.html;/m)
    expect(headers(body)).toEqual(SHARED)
  })

  it('serves / through index.html, so the root gets the no-cache location too', () => {
    expect(template).toMatch(/^\s*index index\.html;/m)
  })
})
