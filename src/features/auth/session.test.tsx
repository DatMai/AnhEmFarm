import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider, useSession } from './session'

function Controls() {
  const { user, logout } = useSession()
  return <><span>{user?.name ?? 'Guest'}</span><button onClick={logout}>Log out</button></>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
test('logout removes cached private account queries', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    if (path.endsWith('/auth/me')) return new Response(JSON.stringify({ user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'CUSTOMER', verified: true } }), { status: 200 })
    if (path.endsWith('/auth/csrf')) return new Response(JSON.stringify({ token: 'csrf' }), { status: 200 })
    if (path.endsWith('/auth/logout') && init?.method === 'POST') return new Response(null, { status: 204 })
    throw new Error(path)
  }))
  sessionStorage.setItem('quote:test', 'test-request-key')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['private', 'user-1', 'orders'], [{ id: 'order-1' }])
  render(<QueryClientProvider client={client}><SessionProvider><Controls /></SessionProvider></QueryClientProvider>)
  await screen.findByText('Ada')
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Guest')
  expect(sessionStorage.getItem('quote:test')).toBeNull()
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0))
})
test('failed session refresh removes stale identity and private queries', async () => {
  let fail = false
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/auth/me')) return fail
      ? new Response(JSON.stringify({ code: 'REQUEST_FAILED' }), { status: 401 })
      : new Response(JSON.stringify({ user: { id: 'user-1', name: 'Ada', email: 'ada@example.test', role: 'CUSTOMER', verified: true } }))
    if (path.endsWith('/auth/csrf')) return new Response(JSON.stringify({ token: 'csrf' }))
    throw new Error(path)
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function RefreshControls() { const { user, reload } = useSession(); return <><span>{user?.name ?? 'Guest'}</span><button onClick={() => void reload()}>Refresh session</button></> }
  render(<QueryClientProvider client={client}><SessionProvider><RefreshControls /></SessionProvider></QueryClientProvider>)
  await screen.findByText('Ada')
  client.setQueryData(['private', 'user-1', 'orders'], [{ id: 'order-1' }])
  fail = true
  await userEvent.click(screen.getByRole('button', { name: 'Refresh session' }))
  await screen.findByText('Guest')
  expect(client.getQueryCache().findAll({ queryKey: ['private'] })).toHaveLength(0)
})

for (const replacement of [false, true]) test(`reauthentication after reload ${replacement ? 'clears keys for a confirmed replacement' : 'preserves same-account quote recovery'}`, async () => {
  sessionStorage.clear()
  let offline = false
  const first = { id: 'user-1', name: 'First', verified: true, role: 'CUSTOMER', email: 'first@example.test' }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path.endsWith('/auth/me')) return offline ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ user: first }))
    if (path.endsWith('/auth/csrf')) return new Response(JSON.stringify({ token: 'csrf' }))
    if (path.endsWith('/auth/login')) return new Response(JSON.stringify({ user: replacement ? { ...first, id: 'user-2', name: 'Second' } : first }))
    if (path.endsWith('/cart')) return new Response(JSON.stringify({ version: 1, items: [] }))
    throw new Error(path)
  }))
  function Reauth() { const { user, login } = useSession(); return <><p>{user?.name ?? 'Guest'}</p><button onClick={() => void login('test@example.test', 'test-password')}>Reauthenticate</button></> }
  const mount = () => render(<QueryClientProvider client={new QueryClient()}><SessionProvider><Reauth /></SessionProvider></QueryClientProvider>)
  mount(); await screen.findByText('First')
  sessionStorage.setItem('quote:pending', 'original-key')
  cleanup(); offline = true; mount(); await screen.findByText('Guest')
  await userEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }))
  await screen.findByText(replacement ? 'Second' : 'First')
  expect(sessionStorage.getItem('quote:pending')).toBe(replacement ? null : 'original-key')
})
