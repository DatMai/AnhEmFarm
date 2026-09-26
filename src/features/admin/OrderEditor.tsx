import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatVnd } from '../../lib/money'
import { ErrorMessage, type AdminOrder, useAdminData } from './operations'
type Pending = { path: string; body: object; label: string }
export function OrderEditor() {
  const { id = '' } = useParams()
  const { data: order, setData, error: loadError } = useAdminData<AdminOrder>(`/admin/orders/${id}`)
  const [reason, setReason] = useState(''), [mode, setMode] = useState<'STORE' | 'CARRIER'>('STORE')
  const [carrier, setCarrier] = useState(''), [tracking, setTracking] = useState('')
  const [received, setReceived] = useState(false), [restock, setRestock] = useState<Record<string, number>>({})
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function send(action: Pending) {
    setBusy(true); setMessage('')
    try { const updated = await api<AdminOrder>(action.path, { method: 'POST', body: action.body }); setData(updated); setPending(null); setReason(''); setMessage(`${action.label} saved.`) }
    catch { setPending(action); setMessage('The result is uncertain. Retry this same action, or reload the order to review its current state.') }
    finally { setBusy(false) }
  }
  function transition(to: AdminOrder['status']) {
    if (!order || busy || pending) return
    const body = { to, version: order.version, operationKey: crypto.randomUUID(),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
      ...(to === 'SHIPPING' ? { delivery: mode === 'STORE' ? { mode: 'STORE' } : { mode: 'CARRIER', carrier, tracking } } : {}),
      ...(to === 'RETURNED' ? { received, restock: order.items.map(item => ({ variantId: item.variantId, quantity: restock[item.variantId] ?? 0 })) } : {}) }
    void send({ path: `/admin/orders/${id}/transitions`, body, label: to.toLowerCase() })
  }
  function collection(state: 'DUE' | 'COLLECTED') {
    if (!order || busy || pending) return
    void send({ path: `/admin/orders/${id}/collection`, body: { state, version: order.version, operationKey: crypto.randomUUID(),
      ...(reason.trim() ? { reason: reason.trim() } : {}) }, label: `COD ${state.toLowerCase()}` })
  }
  return <div><Link to="/admin/orders">← Orders</Link><h2>Order details</h2><ErrorMessage message={loadError} />
    {!order && !loadError && <p role="status">Loading order…</p>}
    {order && <><p><strong>Status:</strong> {order.status} · <strong>COD:</strong> {order.collectionState}</p>
      <p><strong>Customer:</strong> {order.recipient.recipient} · {order.recipient.phone}</p><p>{order.recipient.line1}</p>
      <ul className="admin-list">{order.items.map(item => <li key={item.variantId}>{item.name} · {item.label} · {item.sku} · {item.quantity} × {formatVnd(item.priceVnd)}</li>)}</ul>
      <p><strong>Subtotal:</strong> {formatVnd(order.subtotalVnd)} · <strong>Shipping:</strong> {formatVnd(order.shippingVnd)} · <strong>Total:</strong> {formatVnd(order.totalVnd)}</p>
      <label className="admin-label">Reason (required for cancellation, return and COD correction)
        <textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
      {order.status === 'CONFIRMED' && <div className="admin-actions"><label>Delivery method <select value={mode} onChange={e => setMode(e.target.value as 'STORE' | 'CARRIER')}><option value="STORE">Store delivery</option><option value="CARRIER">Carrier</option></select></label>
        {mode === 'CARRIER' && <><label>Carrier <input value={carrier} onChange={e => setCarrier(e.target.value)} /></label><label>Tracking number <input value={tracking} onChange={e => setTracking(e.target.value)} /></label></>}</div>}
      {order.status === 'SHIPPING' && <div><label><input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} /> Returned items physically received</label>
        {order.items.map(item => <label className="admin-label" key={item.variantId}>Sellable returned quantity for {item.sku}
          <input type="number" min="0" max={item.quantity} value={restock[item.variantId] ?? 0} onChange={e => setRestock({ ...restock, [item.variantId]: Number(e.target.value) })} /></label>)}</div>}
      <div className="admin-actions">
        {order.status === 'PENDING' && <><button disabled={busy || !!pending} onClick={() => transition('CONFIRMED')}>Confirm order</button><button disabled={busy || !!pending || !reason.trim()} onClick={() => transition('CANCELLED')}>Cancel order</button></>}
        {order.status === 'CONFIRMED' && <><button disabled={busy || !!pending || mode === 'CARRIER' && (!carrier.trim() || !tracking.trim())} onClick={() => transition('SHIPPING')}>Start shipping</button><button disabled={busy || !!pending || !reason.trim()} onClick={() => transition('CANCELLED')}>Cancel order</button></>}
        {order.status === 'SHIPPING' && <><button disabled={busy || !!pending} onClick={() => transition('DELIVERED')}>Mark delivered</button><button disabled={busy || !!pending || !received || !reason.trim()} onClick={() => transition('RETURNED')}>Record return</button></>}
        {order.status === 'DELIVERED' && order.collectionState === 'DUE' && <button disabled={busy || !!pending} onClick={() => collection('COLLECTED')}>Mark COD collected</button>}
        {order.status === 'DELIVERED' && order.collectionState === 'COLLECTED' && <button disabled={busy || !!pending || !reason.trim()} onClick={() => collection('DUE')}>Correct COD to due</button>}
      </div>
      {pending && <button disabled={busy} onClick={() => void send(pending)}>Retry {pending.label}</button>}
      {message && <p role="status">{message}</p>}
      <h3>History</h3><ol>{order.events.map(event => <li key={event.id}>{event.toStatus} · {new Date(event.createdAt).toLocaleString('en-US')} {event.reason && `· ${event.reason}`}</li>)}</ol>
    </>}
  </div>
}
