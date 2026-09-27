import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatVnd } from '../../lib/money'
import { ErrorMessage, Pager, type AdminOrder, type Page, useAdminData } from './operations'
export function OrdersPage() {
  const [page, setPage] = useState(1), [status, setStatus] = useState('')
  const [search, setSearch] = useState(''), [appliedSearch, setAppliedSearch] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const query = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (status) query.set('status', status)
  if (appliedSearch) query.set('q', appliedSearch)
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  const { data, error } = useAdminData<Page<AdminOrder>>(`/admin/orders?${query}`)
  function clearFilters() { setSearch(''); setAppliedSearch(''); setStatus(''); setFrom(''); setTo(''); setPage(1) }
  return <div><h2>Orders</h2>
    <form className="admin-actions" onSubmit={e => { e.preventDefault(); setAppliedSearch(search.trim()); setPage(1) }}>
      <label className="admin-label">Search by order reference, customer name/email, or tracking number
        <input value={search} onChange={e => setSearch(e.target.value)} maxLength={120} />
      </label>
      <button type="submit">Search orders</button>
      <button type="button" onClick={clearFilters}>Clear filters</button>
    </form>
    <div className="admin-actions">
      <label className="admin-label">Status <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
        <option value="">All</option>{['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'].map(x => <option key={x}>{x}</option>)}
      </select></label>
      <label className="admin-label">From <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} /></label>
      <label className="admin-label">To <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} /></label>
      <p>Order dates use Vietnam time.</p>
    </div>
    <ErrorMessage message={error} />{!data && !error && <p role="status">Loading orders…</p>}
    {data && (data.items.length ? <><ul className="admin-list">{data.items.map(order => <li key={order.id}><Link to={`/admin/orders/${order.id}`} aria-label={`View order ${order.id.slice(0, 8).toUpperCase()}`}>View order <small>#{order.id.slice(0, 8).toUpperCase()}</small></Link>
      <span>{order.status}{order.attention ? ' · Needs attention' : ''}</span><span>COD {order.collectionState.toLowerCase()}</span><strong>{formatVnd(order.totalVnd)}</strong></li>)}</ul>
      <Pager page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></> : <p>No orders found.</p>)}</div>
}
