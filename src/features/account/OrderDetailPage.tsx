import { useRef, useState, type FormEvent } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { formatVnd } from '../../lib/money'
import { Totals } from '../checkout/CheckoutPage'
import { OrderConfirmationPage } from '../checkout/OrderConfirmationPage'
import { AccountNav, errorText, usePrivate } from './shared'
import { statusLabel, type Order } from './OrdersPage'
export function OrderDetailPage() {
  const { id = '' } = useParams(),
    [params] = useSearchParams(),
    location = useLocation(),
    query = usePrivate<Order>(`/orders/${encodeURIComponent(id)}`)
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false)
  const pending = useRef<{
    version: number
    operationKey: string
    reason: string
  } | null>(null)
  async function cancel(e: FormEvent) {
    e.preventDefault()
    if (busy || !query.data) return
    setBusy(true)
    setError('')
    pending.current ??= {
      version: query.data.version,
      operationKey: crypto.randomUUID(),
      reason
    }
    try {
      await api(`/orders/${id}/cancel`, {
        method: 'POST',
        body: pending.current
      })
      pending.current = null
      setUncertain(false)
      await query.refetch()
    } catch (e) {
      setError(errorText(e))
      if (e instanceof ApiError && e.status > 0 && e.status < 500) {
        pending.current = null
        setUncertain(false)
        await query.refetch()
      } else setUncertain(true)
    } finally {
      setBusy(false)
    }
  }
  const o = query.data
  return (
    <section className="container section commerce">
      <AccountNav />
      {query.isPending && <p>Loading order…</p>}
      {query.isError && (
        <>
          <h1>Order unavailable</h1>
          <p>This order could not be found or loaded.</p>
          <button onClick={() => void query.refetch()}>Retry order</button>
        </>
      )}
      {o && (
        <>
          {params.get('placed') === '1' ? (
            <OrderConfirmationPage
              cartPreserved={!!location.state?.cartPreserved}
            />
          ) : (
            <h1>Order details</h1>
          )}
          <p>{statusLabel(o.status)}</p>
          <p>
            COD payment:{' '}
            {o.collectionState === 'COLLECTED'
              ? 'Collected'
              : 'Due on delivery'}
          </p>
          <h2>Recipient</h2>
          <p>
            {o.recipient.recipient}
            <br />
            {o.recipient.phone}
            <br />
            {o.recipient.line1}
            <br />
            {o.recipient.line2} {o.recipient.postalCode}
          </p>
          <h2>Items</h2>
          {o.items.map((i) => (
            <p key={`${i.variantId}:${i.optionLabel ?? 'none'}`}>
              {i.name} · {i.label}{i.optionLabel ? ` · ${i.optionGroupLabel}: ${i.optionLabel}` : ''} · {i.sku} × {i.quantity} ·{' '}
              {formatVnd(i.priceVnd)}
            </p>
          ))}
          <Totals value={o} />
          {o.tracking && <p>Tracking: {o.tracking}</p>}
          <h2>Status timeline</h2>
          <ol>
            {o.events.map((e) => (
              <li key={e.id}>
                {statusLabel(e.toStatus)} ·{' '}
                <time>{new Date(e.createdAt).toLocaleString('en-GB')}</time>
                {e.reason && <p>{e.reason}</p>}
              </li>
            ))}
          </ol>
          <button onClick={() => void query.refetch()}>Refresh order</button>
          {error && <p role="alert">{error}</p>}
          {o.status === 'PENDING' && (
            <form onSubmit={cancel}>
              <label className="form-field">
                Cancellation reason
                <textarea
                  required
                  maxLength={500}
                  value={reason}
                  disabled={busy || uncertain}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button disabled={busy || !reason.trim()}>Cancel order</button>
              {uncertain && (
                <p>Retry cancellation to recover the same request.</p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  )
}
