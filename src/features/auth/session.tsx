import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, clearCsrf, refreshCsrf } from '../../lib/api'
import { publicKey } from '../../lib/query-client'
export type User = { id: string; email: string; name: string; role: 'CUSTOMER' | 'ADMIN'; verified: boolean }
type Session = { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; reload: () => Promise<void> }
const Context = createContext<Session | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const me = useQuery({ queryKey: publicKey('session'), queryFn: ({ signal }) => api<{ user: User | null }>('/auth/me', { signal }), retry: false, staleTime: 0 })
  const clearPrivateState = useCallback(async () => {
    await client.cancelQueries({ queryKey: ['private'] })
    client.removeQueries({ queryKey: ['private'] })
    clearCsrf()
    await refreshCsrf()
  }, [client])
  const login = useCallback(async (email: string, password: string) => {
    await clearPrivateState()
    const result = await api<{ user: User }>('/auth/login', { method: 'POST', body: { email, password } })
    clearCsrf()
    client.setQueryData(publicKey('session'), result)
    await refreshCsrf()
  }, [client, clearPrivateState])
  const logout = useCallback(async () => {
    await api<void>('/auth/logout', { method: 'POST' })
    client.setQueryData(publicKey('session'), { user: null })
    await clearPrivateState()
  }, [client, clearPrivateState])
  const reload = useCallback(async () => { await me.refetch() }, [me])
  const value = useMemo(() => ({ user: me.data?.user ?? null, loading: me.isPending, login, logout, reload }), [me.data, me.isPending, login, logout, reload])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useSession() { const value = useContext(Context); if (!value) throw new Error('SessionProvider missing'); return value }
