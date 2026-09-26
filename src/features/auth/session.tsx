import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  api,
  clearCsrf,
  refreshCsrf,
  cancelPrivateRequests
} from '../../lib/api'
import { mergeGuestCart } from '../cart/cart-api'
export type User = {
  id: string
  email: string
  name: string
  role: 'CUSTOMER' | 'ADMIN'
  verified: boolean
}
type Session = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reload: () => Promise<void>
  invalidate: () => Promise<void>
}
const recoveryAccountKey = 'anhemfarm.recoveryAccount'
const sessionNoticeKey = 'anhemfarm.sessionChanged'
const Context = createContext<Session | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const removePrivateQueries = useCallback(
    async (clearQuoteKeys = false) => {
      cancelPrivateRequests()
      if (clearQuoteKeys) {
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith('quote:')) sessionStorage.removeItem(key)
        sessionStorage.removeItem(recoveryAccountKey)
      }
      await client.cancelQueries({ queryKey: ['private'] })
      client.removeQueries({ queryKey: ['private'] })
    },
    [client]
  )
  const clearPrivateState = useCallback(async () => {
    await removePrivateQueries()
    clearCsrf()
    await refreshCsrf()
  }, [removePrivateQueries])
  const adoptIdentity = useCallback(async (next: User, current: number) => {
    const previous = sessionStorage.getItem(recoveryAccountKey)
    if (previous && previous !== next.id) await removePrivateQueries(true)
    if (current !== generation.current) return
    // Only server-authenticated, opaque account IDs scope recovery across reloads.
    // The server still enforces quote ownership and placement idempotency.
    sessionStorage.setItem(recoveryAccountKey, next.id)
    setUser(next)
  }, [removePrivateQueries])
  const invalidate = useCallback(async (broadcast = true) => {
    ++generation.current
    setUser(null)
    setLoading(false)
    await removePrivateQueries(true)
    clearCsrf()
    if (broadcast) localStorage.setItem(sessionNoticeKey, `invalidated:${crypto.randomUUID()}`)
  }, [removePrivateQueries])
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++generation.current
      setLoading(true)
      try {
        const result = await api<{ user: User | null }>('/auth/me', { signal })
        if (current !== generation.current) return
        if (!result.user) {
          await removePrivateQueries()
          clearCsrf()
        }
        if (result.user) await adoptIdentity(result.user, current)
        else setUser(null)
      } catch (error) {
        if (
          current !== generation.current ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return
        await removePrivateQueries()
        clearCsrf()
        setUser(null)
      } finally {
        if (current === generation.current) setLoading(false)
      }
    },
    [removePrivateQueries, adoptIdentity]
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== sessionNoticeKey) return
      if (event.newValue?.startsWith('invalidated:')) { void invalidate(false); return }
      setUser(null)
      setLoading(true)
      void removePrivateQueries().then(() => load())
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [load, removePrivateQueries, invalidate])
  const login = useCallback(
    async (email: string, password: string) => {
      const current = ++generation.current
      setUser(null)
      setLoading(true)
      try {
        await clearPrivateState()
        const result = await api<{ user: User }>('/auth/login', {
          method: 'POST',
          body: { email, password }
        })
        clearCsrf()
        await adoptIdentity(result.user, current)
        if (current !== generation.current) return
        localStorage.setItem(sessionNoticeKey, `identity:${crypto.randomUUID()}`)
        await mergeGuestCart().catch(() => {
          /* Cart page offers an explicit retry; guest payload is retained. */
        })
        void refreshCsrf().catch(() => {
          /* The next mutation can fetch a fresh token. */
        })
      } finally {
        setLoading(false)
      }
    },
    [clearPrivateState, adoptIdentity]
  )
  const logout = useCallback(async () => {
    ++generation.current
    let revoked = false
    try {
      await api<void>('/auth/logout', { method: 'POST' })
      revoked = true
    } finally {
      await invalidate()
      if (revoked) void refreshCsrf().catch(() => {
        /* Sign-out has already completed on the server. */
      })
    }
  }, [invalidate])
  const reload = useCallback(async () => {
    await load()
  }, [load])
  const value = useMemo(
    () => ({ user, loading, login, logout, reload, invalidate }),
    [user, loading, login, logout, reload, invalidate]
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useSession() {
  const value = useContext(Context)
  if (!value) throw new Error('SessionProvider missing')
  return value
}
