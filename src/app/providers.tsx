import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from '../lib/query-client'
import { SessionProvider } from '../features/auth/session'
import { router } from './router'
import { ErrorBoundary } from './ErrorBoundary'
export function Providers() { return <ErrorBoundary><QueryClientProvider client={queryClient}><SessionProvider><RouterProvider router={router} /></SessionProvider></QueryClientProvider></ErrorBoundary> }
