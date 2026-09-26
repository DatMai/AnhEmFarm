import { afterEach, expect, test, vi } from 'vitest'
import { api, ApiError, clearCsrf } from './api'
afterEach(() => { clearCsrf(); vi.unstubAllGlobals() })
test('mutation sends same-origin cookies and a fresh CSRF token', async () => {
  const fetcher = vi.fn(async (path: RequestInfo | URL, _options?: RequestInit) => String(path).endsWith('/auth/csrf')
    ? new Response(JSON.stringify({ token: 'csrf-1' }))
    : new Response(JSON.stringify({ status: 'accepted' }), { status: 202 }))
  vi.stubGlobal('fetch', fetcher)
  await api('/auth/forgot-password', { method: 'POST', body: { email: 'x@example.test' } })
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': 'csrf-1' } })
})
test('server errors use safe English messages', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'INTERNAL_DETAILS', message: 'secret' }), { status: 500 })))
  await expect(api('/products')).rejects.toMatchObject({ status: 500, code: 'INTERNAL_DETAILS', message: 'We could not complete your request.' })
  expect(ApiError.name).toBe('ApiError')
})
test('backend-shaped validation issues become safe field errors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'VALIDATION_FAILED', fields: [
    { field: 'email', code: 'invalid_format' }, { field: 'password', code: 'too_small' }, { field: '', code: 'unrecognized_keys' },
  ] }), { status: 422 })))
  await expect(api('/auth/register')).rejects.toMatchObject({ status: 422, fields: {
    email: ['Please enter a valid email address.'], password: ['Please use at least 12 characters.'],
  } })
})
