import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, Link } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { privateKey } from '../../lib/query-client'
import { useSession } from '../auth/session'
import { FormField } from '../../components/FormField'
export type Address = {
  recipient: string
  phone: string
  zoneId: string
  line1: string
  line2?: string
  postalCode?: string
}
export type SavedAddress = Address & { id: string; version: number }
export type Page<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
}
export const blankAddress: Address = {
  recipient: '',
  phone: '',
  zoneId: '',
  line1: '',
  line2: '',
  postalCode: ''
}
export function usePrivate<T>(path: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: privateKey(user!.id, path),
    queryFn: ({ signal }) => api<T>(path, { signal }),
    refetchOnWindowFocus: true
  })
}
export function CustomerBoundary() {
  const { user, loading } = useSession()
  if (loading) return <p>Loading account…</p>
  if (!user) return <Navigate to="/login?next=/account" replace />
  return (
    <div key={user.id}>
      <Outlet />
    </div>
  )
}
export function AccountNav() {
  return (
    <nav className="account-tabs" aria-label="Account">
      <Link to="/account">Profile</Link>
      <Link to="/account/addresses">Addresses</Link>
      <Link to="/account/orders">Orders</Link>
      <Link to="/cart">Cart</Link>
    </nav>
  )
}
export function errorText(error: unknown) {
  if (error instanceof ApiError && error.status === 409)
    return 'Details changed. Please review the latest information and try again.'
  return error instanceof Error ? error.message : 'Please try again.'
}
export function Pager({
  page,
  total,
  change
}: {
  page: number
  total: number
  change: (n: number) => void
}) {
  return (
    <div className="account-tabs">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        type="button"
        disabled={page * 20 >= total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </div>
  )
}
export function AddressFields({
  value,
  change,
  disabled = false
}: {
  value: Address
  change: (a: Address) => void
  disabled?: boolean
}) {
  const zones = useQuery({
    queryKey: ['public', 'all-zones'],
    queryFn: async ({ signal }) => {
      const items: { id: string; displayName: string }[] = []
      for (let page = 1; ; page++) {
        const result = await api<Page<{ id: string; displayName: string }>>(
          `/shipping-zones?page=${page}&pageSize=100`,
          { signal }
        )
        items.push(...result.items)
        if (items.length >= result.total || !result.items.length) return items
      }
    }
  })
  return (
    <fieldset disabled={disabled}>
      <legend>Delivery address</legend>
      {(['recipient', 'phone', 'line1', 'line2', 'postalCode'] as const).map(
        (field, i) => (
          <FormField
            key={field}
            name={field}
            label={
              [
                'Recipient',
                'Phone',
                'Address line 1',
                'Address line 2',
                'Postal code'
              ][i]
            }
            required={i < 3}
            minLength={field === 'line1' ? 5 : undefined}
            maxLength={
              field === 'recipient'
                ? 120
                : field === 'phone'
                  ? 20
                  : field === 'postalCode'
                    ? 30
                    : 300
            }
            value={value[field] ?? ''}
            onChange={(e) => change({ ...value, [field]: e.target.value })}
          />
        )
      )}
      <label className="form-field">
        Delivery zone
        <select
          aria-label="Delivery zone"
          required
          value={value.zoneId}
          onChange={(e) => change({ ...value, zoneId: e.target.value })}
        >
          <option value="">Select a delivery zone</option>
          {zones.data?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.displayName}
            </option>
          ))}
        </select>
      </label>
      {zones.data?.length === 0 && (
        <p>No delivery zones are currently available.</p>
      )}
      {zones.isError && (
        <button type="button" onClick={() => void zones.refetch()}>
          Retry delivery zones
        </button>
      )}
    </fieldset>
  )
}
