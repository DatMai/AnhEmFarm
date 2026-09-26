import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatVnd } from '../../lib/money'
import { ErrorMessage, useAdminData } from './operations'
type Summary = { deliveredOrderValueVnd: number; codCollectedVnd: number; codDueVnd: number; orderCount: number }
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export function DashboardPage() {
  const [from, setFrom] = useState(today), [to, setTo] = useState(today)
  const { data, error } = useAdminData<Summary>(`/admin/reports?from=${from}&to=${to}`)
  return <div><h2>Seller dashboard</h2><div className="admin-actions"><label>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
    <label>To <input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    <ErrorMessage message={error} />{!data && !error && <p role="status">Loading report…</p>}
    {data && <div className="admin-metrics"><article><h3>Delivered order value</h3><strong>{formatVnd(data.deliveredOrderValueVnd)}</strong></article>
      <article><h3>COD collected</h3><strong>{formatVnd(data.codCollectedVnd)}</strong></article>
      <article><h3>COD due</h3><strong>{formatVnd(data.codDueVnd)}</strong></article>
      <article><h3>Delivered orders</h3><strong>{data.orderCount}</strong></article></div>}
    <p className="notice">Figures reflect delivered orders and the current COD collection state for the selected Vietnam dates.</p>
    <div className="admin-actions"><Link className="button button-primary" to="/admin/orders">Manage orders</Link><Link className="button" to="/admin/products">Manage products</Link><Link className="button" to="/admin/customers">View customers</Link></div>
  </div>
}
