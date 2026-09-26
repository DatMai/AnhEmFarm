import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import type { AdminPage, Product, Variant } from './types'
import { PageState } from '../../components/PageState'
const PAGE_SIZE = 20
interface PendingRequest { fingerprint: string; key: string }
export function InventoryPage() {
  const pending = useRef<PendingRequest | null>(null)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminPage<Product> | null>(null)
  const [selected, setSelected] = useState<Variant | null>(null)
  const [delta, setDelta] = useState(''); const [reason, setReason] = useState('')
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [uncertain, setUncertain] = useState(false)
  const load = useCallback(async () => {
    const result = await api<AdminPage<Product>>(`/admin/products?page=${page}&pageSize=${PAGE_SIZE}`)
    setData(result)
    setSelected(previous => previous ? result.items.flatMap(product => product.variants).find(variant => variant.id === previous.id) ?? null : null)
  }, [page])
  useEffect(() => { void load().catch(() => setError('Could not load inventory.')) }, [load])
  const fingerprint = selected ? JSON.stringify({ variantId: selected.id, delta: Number(delta), reason: reason.trim(), version: selected.version }) : ''
  const changedAfterUncertain = uncertain && pending.current?.fingerprint !== fingerprint
  async function reload() { try { await load(); pending.current = null; setUncertain(false); setError(''); setNotice('Stock reloaded. Review the current count before submitting.') } catch { setError('Could not reload stock.') } }
  async function adjust(event: FormEvent) {
    event.preventDefault(); if (!selected || changedAfterUncertain) return
    setBusy(true); setError(''); setNotice('')
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() }
    const operationKey = pending.current.key
    try {
      await api(`/admin/inventory/${selected.id}/adjustments`, { method: 'POST', body: { delta: Number(delta), reason: reason.trim(), version: selected.version, operationKey } })
      pending.current = null; setUncertain(false); setDelta(''); setReason(''); setNotice('Stock adjusted.'); await load()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 0) {
        setUncertain(true); setError('The outcome is unknown. Retry unchanged values with the same request ID, or reload stock before changing the adjustment.')
      } else {
        pending.current = null; setUncertain(false)
        setError(failure instanceof ApiError && failure.code === 'VERSION_CONFLICT' ? 'Stock changed elsewhere. Reload and review the current stock before adjusting.' : failure instanceof ApiError && failure.code === 'INVALID_STOCK' ? 'Adjustment would make stock negative.' : 'Could not adjust stock.')
      }
    } finally { setBusy(false) }
  }
  const variants = data?.items.flatMap(product => product.variants.map(variant => ({ product, variant }))) ?? []
  return <div><h2>Inventory</h2>{error && <p role="alert" className="error-message">{error} {(uncertain || error.includes('Reload')) && <button onClick={() => void reload()}>Reload stock</button>}</p>}{notice && <p role="status" className="success-message">{notice}</p>}{!data ? <PageState title="Loading inventory" /> : variants.length === 0 ? <PageState title="No variants on this page" /> : <ul className="admin-list">{variants.map(({ product, variant }) => <li key={variant.id}><strong>{product.name} — {variant.label}</strong><span>{variant.sku}</span><span>Stock: {variant.stock}</span><button onClick={() => { pending.current = null; setUncertain(false); setSelected(variant); setError(''); setNotice('') }}>Adjust</button></li>)}</ul>}{data && <div className="pagination"><button disabled={page === 1} onClick={() => { pending.current = null; setUncertain(false); setSelected(null); setPage(page - 1) }}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}</span><button disabled={page * PAGE_SIZE >= data.total} onClick={() => { pending.current = null; setUncertain(false); setSelected(null); setPage(page + 1) }}>Next</button></div>}{selected && <form className="admin-form" onSubmit={adjust}><h3>Adjust {selected.sku}</h3><p>Current stock: {selected.stock}</p><label>Change in units<input required type="number" step="1" value={delta} onChange={event => setDelta(event.target.value)} /></label><label>Reason<input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>{changedAfterUncertain && <p className="error-message" role="alert">Adjustment changed after an uncertain request. Reload stock before sending a new adjustment.</p>}<button className="button button-primary" disabled={busy || changedAfterUncertain || !Number.isInteger(Number(delta)) || Number(delta) === 0}>Apply adjustment</button></form>}</div>
}
