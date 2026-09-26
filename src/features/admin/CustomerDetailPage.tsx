import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatVnd } from '../../lib/money'
import { ErrorMessage, Pager, type AdminCustomer, type Page, useAdminData } from './operations'
type Detail = { customer: AdminCustomer; orders: Page<{ id: string; status: string; totalVnd: number; createdAt: string }> }
export function CustomerDetailPage() {
  const { id = '' } = useParams(); const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0)
  const { data, error: loadError } = useAdminData<Detail>(`/admin/customers/${id}?page=${page}&pageSize=20`, refresh)
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  async function change() { if (!data || !reason.trim()) return; setBusy(true); setMessage('')
    try { await api(`/admin/customers/${id}/status`, { method: 'PATCH', body: { status: data.customer.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
      reason: reason.trim(), version: data.customer.version } }); setReason(''); setRefresh(x => x + 1); setMessage('Customer status saved.') }
    catch { setMessage('Could not change status. Reload and review the customer.'); setRefresh(x => x + 1) }
    finally { setBusy(false) }
  }
  return <div><Link to="/admin/customers">← Customers</Link><h2>Customer details</h2><ErrorMessage message={loadError} />
    {!data && !loadError && <p role="status">Loading customer…</p>}
    {data && <><h3>{data.customer.name}</h3><p>{data.customer.email} · {data.customer.status}</p>
      <label className="admin-label">Reason for status change <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
      <button disabled={busy || !reason.trim()} onClick={() => void change()}>{data.customer.status === 'ACTIVE' ? 'Suspend customer' : 'Reactivate customer'}</button>
      {message && <p role="status">{message}</p>}
      <h3>Purchase history</h3>{data.orders.items.length ? <ul className="admin-list">{data.orders.items.map(order => <li key={order.id}>
        <Link to={`/admin/orders/${order.id}`}>View order</Link><span>{order.status}</span><strong>{formatVnd(order.totalVnd)}</strong></li>)}</ul> : <p>No orders yet.</p>}
      <Pager page={page} pageSize={data.orders.pageSize} total={data.orders.total} onChange={setPage} />
    </>}
  </div>
}
