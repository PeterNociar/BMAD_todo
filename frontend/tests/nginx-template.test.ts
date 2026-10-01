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
