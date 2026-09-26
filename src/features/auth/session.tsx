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
  ApiError,
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
}
const Context = createContext<Session | null>(null)
export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const generation = useRef(0)
  const removePrivateQueries = useCallback(
    async (clearQuoteKeys = true) => {
      cancelPrivateRequests()
      if (clearQuoteKeys)
        for (const key of Object.keys(sessionStorage))
          if (key.startsWith('quote:')) sessionStorage.removeItem(key)
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
        setUser(result.user)
      } catch (error) {
        if (
          current !== generation.current ||
          (error instanceof DOMException && error.name === 'AbortError')
        )
          return
        await removePrivateQueries(
          error instanceof ApiError && error.status === 401
        )
        clearCsrf()
        setUser(null)
      } finally {
        if (current === generation.current) setLoading(false)
      }
    },
    [removePrivateQueries]
  )
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === 'anhemfarm.sessionChanged') {
        setUser(null)
        void removePrivateQueries().then(() => load())
      }
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [load, removePrivateQueries])
  const login = useCallback(
    async (email: string, password: string) => {
      ++generation.current
      try {
        await clearPrivateState()
        const result = await api<{ user: User }>('/auth/login', {
          method: 'POST',
          body: { email, password }
        })
        clearCsrf()
        setUser(result.user)
        localStorage.setItem('anhemfarm.sessionChanged', crypto.randomUUID())
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
    [clearPrivateState]
  )
  const logout = useCallback(async () => {
    ++generation.current
    try {
      await api<void>('/auth/logout', { method: 'POST' })
      setUser(null)
      localStorage.setItem('anhemfarm.sessionChanged', crypto.randomUUID())
      await removePrivateQueries()
      clearCsrf()
      void refreshCsrf().catch(() => {
        /* Sign-out has already completed on the server. */
      })
    } finally {
      setLoading(false)
    }
  }, [removePrivateQueries])
  const reload = useCallback(async () => {
    await load()
  }, [load])
  const value = useMemo(
    () => ({ user, loading, login, logout, reload }),
    [user, loading, login, logout, reload]
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useSession() {
  const value = useContext(Context)
  if (!value) throw new Error('SessionProvider missing')
  return value
}
