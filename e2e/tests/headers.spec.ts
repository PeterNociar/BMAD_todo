import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '../fixtures.ts'

test('static pages carry the CSP and the shared security headers', async ({ request }) => {
  const response = await request.get('/')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['content-security-policy']).toBe("default-src 'self'; frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
})

test('the API is proxied with the shared headers and no CSP', async ({ request }) => {
  const response = await request.get('/api/health')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBeTruthy()
  expect(headers['x-frame-options']).toBe('DENY')
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
  expect(headers['content-security-policy']).toBe("default-src 'self'; frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
  expect(headers['x-frame-options']).toBe('DENY')
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

/** Serves `body` as HTML on a random loopback port; returns its origin and a close function. */
async function serve(body: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/**
 * Clickjacking (story 3.8 security review): a page on another origin must not be able to frame
 * the app or the API docs. The framing page is a real loopback server (a page fulfilled by
 * `page.route` counts as a public origin, and Chrome then refuses every loopback frame, headers
 * or not), opened in a fresh page rather than the fixture's. A third frame, from a second
 * loopback server that sends no framing headers, is the control: cross-origin framing works, so
 * the two blocked frames are blocked by the app's own headers.
 */
test('another site cannot frame the app or /api/docs', async ({ browser, baseURL }) => {
  const control = await serve('<p id="control">framed</p>')
  const attacker = await serve(
    [
      `<iframe name="app" src="${baseURL}/"></iframe>`,
      `<iframe name="docs" src="${baseURL}/api/docs"></iframe>`,
      `<iframe name="control" src="${control.origin}/"></iframe>`,
    ].join(''),
  )
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(`${attacker.origin}/`)

    const frame = (name: string) => page.frame({ name })!
    await expect.poll(() => frame('control').locator('#control').count()).toBe(1)
    for (const name of ['app', 'docs']) {
      // Chrome swaps a frame it refuses to display for its own error page; the app never runs.
      await expect
        .poll(() => frame(name).url(), `frame ${name}`)
        .toBe('chrome-error://chromewebdata/')
      expect(await frame(name).locator('#app, #swagger-ui').count()).toBe(0)
    }
  } finally {
    await context.close()
    await attacker.close()
    await control.close()
  }
})
