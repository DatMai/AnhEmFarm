import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import type { AdminPage, Product, Variant } from './types'
import { PageState } from '../../components/PageState'
export function InventoryPage() {
  const pendingKey = useRef<string | null>(null)
  const [products, setProducts] = useState<Product[]>([]); const [selected, setSelected] = useState<Variant | null>(null)
  const [delta, setDelta] = useState(''); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const result = await api<AdminPage<Product>>('/admin/products?pageSize=100'); setProducts(result.items); if (selected) setSelected(result.items.flatMap(product => product.variants).find(variant => variant.id === selected.id) ?? null) }, [selected])
  useEffect(() => { void api<AdminPage<Product>>('/admin/products?pageSize=100').then(result => setProducts(result.items)).catch(() => setError('Could not load inventory.')) }, [])
  async function adjust(event: FormEvent) { event.preventDefault(); if (!selected) return; setBusy(true); setError(''); setNotice(''); try {
    await api(`/admin/variants/${selected.id}/inventory`, { method: 'POST', body: { delta: Number(delta), reason, version: selected.version, operationKey: pendingKey.current ??= crypto.randomUUID() } })
    pendingKey.current = null; setDelta(''); setReason(''); setNotice('Stock adjusted.'); await load()
  } catch (failure) { setError(failure instanceof ApiError && failure.code === 'VERSION_CONFLICT' ? 'Stock changed elsewhere. Reload and review the current stock before adjusting.' : failure instanceof ApiError && failure.code === 'INVALID_STOCK' ? 'Adjustment would make stock negative.' : 'Could not adjust stock.') } finally { setBusy(false) } }
  return <div><h2>Inventory</h2>{error && <p role="alert" className="error-message">{error} {error.includes('Reload') && <button onClick={() => void load().then(() => { pendingKey.current = null; setError('') })}>Reload stock</button>}</p>}{notice && <p role="status" className="success-message">{notice}</p>}{products.length === 0 ? <PageState title="No products found" /> : <ul className="admin-list">{products.flatMap(product => product.variants.map(variant => <li key={variant.id}><strong>{product.name} — {variant.label}</strong><span>{variant.sku}</span><span>Stock: {variant.stock}</span><button onClick={() => { pendingKey.current = null; setSelected(variant); setError(''); setNotice('') }}>Adjust</button></li>))}</ul>}{selected && <form className="admin-form" onSubmit={adjust}><h3>Adjust {selected.sku}</h3><p>Current stock: {selected.stock}</p><label>Change in units<input required type="number" step="1" value={delta} onChange={event => setDelta(event.target.value)} /></label><label>Reason<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="button button-primary" disabled={busy || !Number.isInteger(Number(delta)) || Number(delta) === 0}>Apply adjustment</button></form>}</div>
}
