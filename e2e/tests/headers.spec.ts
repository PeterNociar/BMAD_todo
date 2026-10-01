import { expect, test } from '../fixtures.ts'

test('static pages carry the CSP and the shared security headers', async ({ request }) => {
  const response = await request.get('/')

  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['content-security-policy']).toBe("default-src 'self'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBeTruthy()
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
