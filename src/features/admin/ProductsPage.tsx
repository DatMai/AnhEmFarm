import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { AdminPage, Product } from './types'
import { PageState } from '../../components/PageState'
export function ProductsPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState<AdminPage<Product> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); setData(null); setError('');
    void api<AdminPage<Product>>(`/admin/products?page=${page}&pageSize=20${status ? `&status=${status}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`, { signal: controller.signal })
      .then(setData).catch(() => { if (!controller.signal.aborted) setError('Could not load products.') }); return () => controller.abort()
  }, [page, status, search])
  return <div><div className="admin-heading"><h2>Products</h2><Link className="button button-primary" to="/admin/products/new">Create product</Link></div><div className="admin-actions"><label className="admin-label">Search product or SKU <input value={search} onChange={event => { setPage(1); setSearch(event.target.value) }} /></label><label className="admin-label">Status <select value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}><option value="">All</option><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label></div>{error && <p role="alert" className="error-message">{error}</p>}{!data ? <PageState title="Loading products" /> : data.items.length === 0 ? <PageState title="No products found" /> : <><ul className="admin-list">{data.items.map(product => <li key={product.id}><Link to={`/admin/products/${product.id}`}>{product.name}</Link><span>{product.status}</span><small>{product.variants.length} variants</small></li>)}</ul><div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></>}</div>
}
