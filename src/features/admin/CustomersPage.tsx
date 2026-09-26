import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorMessage, Pager, type AdminCustomer, type Page, useAdminData } from './operations'
export function CustomersPage() {
  const [page, setPage] = useState(1), [q, setQ] = useState('')
  const query = new URLSearchParams({ page: String(page), pageSize: '20' }); if (q.trim()) query.set('q', q.trim())
  const { data, error } = useAdminData<Page<AdminCustomer>>(`/admin/customers?${query}`)
  return <div><h2>Customers</h2><label>Search customers <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Name or email" /></label>
    <ErrorMessage message={error} />{!data && !error && <p role="status">Loading customers…</p>}
    {data && (data.items.length ? <><ul className="admin-list">{data.items.map(customer => <li key={customer.id}>
      <Link to={`/admin/customers/${customer.id}`}>{customer.name}</Link><span>{customer.status}</span></li>)}</ul>
      <Pager page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></> : <p>No customers found.</p>)}</div>
}
