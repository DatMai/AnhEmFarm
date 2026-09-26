import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatVnd } from '../../lib/money'
import { ErrorMessage, Pager, type AdminOrder, type Page, useAdminData } from './operations'
export function OrdersPage() {
  const [page, setPage] = useState(1), [status, setStatus] = useState('')
  const query = new URLSearchParams({ page: String(page), pageSize: '20' }); if (status) query.set('status', status)
  const { data, error } = useAdminData<Page<AdminOrder>>(`/admin/orders?${query}`)
  return <div><h2>Orders</h2><label>Status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
    <option value="">All</option>{['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'].map(x => <option key={x}>{x}</option>)}
  </select></label><ErrorMessage message={error} />{!data && !error && <p role="status">Loading orders…</p>}
    {data && (data.items.length ? <><ul className="admin-list">{data.items.map(order => <li key={order.id}><Link to={`/admin/orders/${order.id}`}>View order</Link>
      <span>{order.status}{order.attention ? ' · Needs attention' : ''}</span><strong>{formatVnd(order.totalVnd)}</strong></li>)}</ul>
      <Pager page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></> : <p>No orders found.</p>)}</div>
}
