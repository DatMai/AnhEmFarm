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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['private', 'user-1', 'orders'], [{ id: 'order-1' }])
  render(<QueryClientProvider client={client}><SessionProvider><Controls /></SessionProvider></QueryClientProvider>)
  await screen.findByText('Ada')
  await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
  await screen.findByText('Guest')
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
