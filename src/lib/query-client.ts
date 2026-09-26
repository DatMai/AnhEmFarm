import { QueryClient } from '@tanstack/react-query'
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (failureCount, error) => {
  if (error instanceof Error && error.name === 'AbortError') return false
  return failureCount < 1
}, staleTime: 30_000, refetchOnWindowFocus: false } } })
export const publicKey = (...parts: unknown[]) => ['public', ...parts] as const
export const privateKey = (userId: string, ...parts: unknown[]) => ['private', userId, ...parts] as const
