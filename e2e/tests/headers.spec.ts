import { expect, test } from '@playwright/test'

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
