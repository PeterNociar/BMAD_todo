import { expect, test } from '../fixtures.ts'

test('static pages carry the CSP and the shared security headers', async ({ request }) => {
  const response = await request.get('/')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['content-security-policy']).toBe("default-src 'self'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
})

test('the API is proxied with the shared headers and no CSP', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBeTruthy()
  expect(headers['content-security-policy']).toBeUndefined()
})

test('the built stylesheet inlines no data: URLs, which the CSP would block', async ({
  request,
}) => {
  const html = await (await request.get('/')).text()
  const href = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1]
  expect(href, 'stylesheet <link> in index.html').toBeTruthy()

  const css = await request.get(href!)
  expect(css.status()).toBe(200)
  expect(await css.text()).not.toContain('url(data:')
})

/** The shared headers and the CSP every static response carries (AD-16, AD-19). */
function expectStaticHeaders(headers: Record<string, string>): void {
  expect(headers['content-security-policy']).toBe("default-src 'self'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
}

for (const path of ['/', '/some/path']) {
  test(`${path} serves index.html with Cache-Control: no-cache`, async ({ request }) => {
    const response = await request.get(path)

    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('<div id="app">')
    const headers = response.headers()
    expect(headers['cache-control']).toBe('no-cache')
    expectStaticHeaders(headers)
  })
}

test('/theme-init.js is served with Cache-Control: no-cache', async ({ request }) => {
  const response = await request.get('/theme-init.js')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['cache-control']).toBe('no-cache')
  expectStaticHeaders(headers)
})

test('a hashed /assets/*.js is cached for a year as immutable', async ({ request }) => {
  const html = await (await request.get('/')).text()
  const src = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1]
  expect(src, 'an /assets/*.js <script> in index.html').toBeTruthy()

  const response = await request.get(src!)
  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['cache-control']).toBe('public, max-age=31536000, immutable')
  expectStaticHeaders(headers)
})

test('a missing /assets/ file is a 404 that is not cached as immutable', async ({ request }) => {
  const response = await request.get('/assets/nope-Zz9Yy8Xx.js')

  expect(response.status()).toBe(404)
  expect(response.headers()['cache-control'] ?? '').not.toContain('immutable')
})
