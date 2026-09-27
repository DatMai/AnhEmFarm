import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { publicKey } from '../../lib/query-client'
import { formatVnd } from '../../lib/money'
import { AddressFields, blankAddress, errorText, type Address } from '../account/shared'
import { loadGuestCart, saveGuestCart } from '../cart/guest-cart'
import { Totals } from './CheckoutPage'

type GuestQuote = {
  id: string
  address: Address
  items: Array<{ variantId: string; optionId: string | null; productName: string; variantLabel: string; optionGroupLabel: string | null; optionLabel: string | null; quantity: number; restricted18: boolean }>
  subtotalVnd: number
  shippingVnd: number
  totalVnd: number
}
type GuestOrder = {
  id: string
  status: string
  collectionState: string
  recipient: Address
  items: Array<{ variantId: string; name: string; label: string; optionGroupLabel: string | null; optionLabel: string | null; quantity: number; priceVnd: number }>
  subtotalVnd: number
  shippingVnd: number
  totalVnd: number
}

export function GuestCheckoutPage() {
  const navigate = useNavigate()
  const [address, setAddress] = useState<Address>({ ...blankAddress })
  const [email, setEmail] = useState('')
  const [age, setAge] = useState(false)
  const [quote, setQuote] = useState<GuestQuote | null>(null)
  const [quotedCart, setQuotedCart] = useState(() => loadGuestCart().items)
  const [recovery, setRecovery] = useState<string | null>(() => Object.keys(sessionStorage).find(key => key.startsWith('guest-quote:'))?.slice(12) ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const items = loadGuestCart().items

  async function review(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const current = loadGuestCart().items
      const result = await api<GuestQuote>('/guest/quotes', { method: 'POST', body: { email, address, ageConfirmed: age, items: current } })
      setQuotedCart(current)
      setQuote(result)
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setBusy(false)
    }
  }

  async function place() {
    const quoteId = quote?.id ?? recovery
    if (!quoteId || busy) return
    setBusy(true)
    setError('')
    const key = sessionStorage.getItem(`guest-quote:${quoteId}`) ?? crypto.randomUUID()
    sessionStorage.setItem(`guest-quote:${quoteId}`, key)
    try {
      const result = await api<{ order: { id: string } }>('/guest/orders', {
        method: 'POST', body: { quoteId }, headers: { 'Idempotency-Key': key }
      })
      sessionStorage.removeItem(`guest-quote:${quoteId}`)
      if (JSON.stringify(loadGuestCart().items) === JSON.stringify(quotedCart)) saveGuestCart([])
      navigate(`/guest/orders/${result.order.id}?placed=1`, { replace: true })
    } catch (cause) {
      setError(errorText(cause))
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 409)) {
        sessionStorage.removeItem(`guest-quote:${quoteId}`)
        setQuote(null)
        setRecovery(null)
        setUncertain(false)
      } else setUncertain(true)
    } finally {
      setBusy(false)
    }
  }

  if (recovery && !quote) {
    return (
      <section className="container section commerce">
        <h1>Recover your guest order</h1>
        <p>A previous COD submission has an unresolved result. Recover it before starting another order.</p>
        {error && <p role="alert">{error}</p>}
        <button className="button button-primary" disabled={busy} onClick={() => void place()}>
          Recover COD order
        </button>
      </section>
    )
  }

  return (
    <section className="container section commerce">
      <h1>Guest checkout</h1>
      <p>No account is needed. Pay cash on delivery when your order arrives; no online payment is taken.</p>
      {error && <p role="alert">{error}</p>}
      {!items.length && !quote ? (
        <p>Your cart is empty. <Link to="/products">Browse products</Link></p>
      ) : !quote ? (
        <form className="guest-checkout-form" onSubmit={review}>
          <label className="form-field">
            Email for your order receipt
            <input
              type="email"
              required
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          <AddressFields value={address} change={setAddress} disabled={busy} />
          <label className="guest-age">
            <input type="checkbox" checked={age} onChange={event => setAge(event.target.checked)} />
            I am at least 18 years old (required for age-restricted products)
          </label>
          <div className="guest-checkout-actions">
            <button className="button button-primary" disabled={busy || !items.length}>Review quote</button>
          </div>
        </form>
      ) : (
        <div className="commerce-card">
          <h2>Review your COD order</h2>
          <p>Receipt: {email.trim()}</p>
          <p>{quote.address.recipient} · {quote.address.line1}</p>
          {quote.items.map(item => (
            <p key={`${item.variantId}:${item.optionId ?? 'none'}`}>
              {item.productName} · {item.variantLabel}
              {item.optionLabel ? ` · ${item.optionGroupLabel}: ${item.optionLabel}` : ''} × {item.quantity}
            </p>
          ))}
          <Totals value={quote} />
          <p>Register and verify this email later to see this order in your account.</p>
          {uncertain && <p>The result is uncertain. Retry this same order to recover it.</p>}
          <div className="guest-checkout-actions">
            <button className="button button-primary" disabled={busy} onClick={() => void place()}>
              {busy ? 'Placing…' : 'Place COD order'}
            </button>
            {!uncertain && (
              <button className="button button-outline" type="button" disabled={busy} onClick={() => setQuote(null)}>
                Edit details
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export function GuestOrderPage() {
  const { id = '' } = useParams()
  const query = useQuery({
    queryKey: publicKey('guest-order', id),
    queryFn: ({ signal }) => api<GuestOrder>(`/guest/orders/${encodeURIComponent(id)}`, { signal }),
    retry: false,
    gcTime: 0
  })
  const order = query.data
  return (
    <section className="container section commerce">
      {query.isPending && <p>Loading order…</p>}
      {query.isError && (
        <>
          <h1>Order unavailable</h1>
          <p>This browser no longer has access to this guest order.</p>
          <Link to="/products">Browse products</Link>
        </>
      )}
      {order && (
        <>
          <h1>COD order placed</h1>
          <p>Your order reference is <strong>{order.id}</strong>. A receipt was queued for your checkout email.</p>
          <p>Status: {order.status}. Payment: {order.collectionState === 'COLLECTED' ? 'Collected' : 'Due on delivery'}.</p>
          <h2>Delivery</h2>
          <p>{order.recipient.recipient} · {order.recipient.line1}</p>
          <h2>Items</h2>
          {order.items.map(item => (
            <p key={`${item.variantId}:${item.optionLabel ?? 'none'}`}>
              {item.name} · {item.label}
              {item.optionLabel ? ` · ${item.optionGroupLabel}: ${item.optionLabel}` : ''} × {item.quantity} · {formatVnd(item.priceVnd)} each
            </p>
          ))}
          <Totals value={order} />
          <p>Save this reference. You can also register with your checkout email and verify it to see the order in your account.</p>
          <Link to="/register">Create an account</Link>
          <button onClick={() => void query.refetch()}>Refresh status</button>
        </>
      )}
    </section>
  )
}
