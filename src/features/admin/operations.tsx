import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type AdminOrder = { id: string; version: number; status: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'; collectionState: 'DUE' | 'COLLECTED'; totalVnd: number; subtotalVnd: number; shippingVnd: number; attention?: boolean; tracking?: string | null;
  recipient: { recipient: string; phone: string; line1: string; line2?: string | null }; items: Array<{ variantId: string; name: string; sku: string; label: string; quantity: number; priceVnd: number }>;
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }> }
export type AdminCustomer = { id: string; name: string; status: 'ACTIVE' | 'SUSPENDED'; version: number; email?: string }
export function useAdminData<T>(path: string, refresh = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); setData(null); setError('')
    void api<T>(path, { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof ApiError ? error.message : 'Could not load this page.')
    }); return () => controller.abort()
  }, [path, refresh])
  return { data, setData, error }
}
export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  return <nav className="pagination" aria-label="Pages"><button disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page}</span><button disabled={page * pageSize >= total} onClick={() => onChange(page + 1)}>Next</button></nav>
}
export function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="error-message">{message}</p> : null }
