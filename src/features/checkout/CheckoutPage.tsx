import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../../lib/api'
import { formatVnd } from '../../lib/money'
import { useSession } from '../auth/session'
import {
  AddressFields,
  addressInput,
  blankAddress,
  errorText,
  Pager,
  usePrivate,
  type Address,
  type Page,
  type SavedAddress
} from '../account/shared'
import type { CartView } from '../cart/cart-api'
export type Quote = {
  id: string
  cartVersion: number
  address: Address
  items: CartView['items']
  subtotalVnd: number
  shippingVnd: number
  totalVnd: number
}
export function Totals({
  value
}: {
  value: { subtotalVnd: number; shippingVnd: number; totalVnd: number }
}) {
  return (
    <dl>
      <dt>Subtotal</dt>
      <dd>{formatVnd(value.subtotalVnd)}</dd>
      <dt>Shipping</dt>
      <dd>{formatVnd(value.shippingVnd)}</dd>
      <dt>Total</dt>
      <dd>
        <strong>{formatVnd(value.totalVnd)}</strong>
      </dd>
    </dl>
  )
}
export function CheckoutPage() {
  const [savedPage, setSavedPage] = useState(1)
  const cart = usePrivate<CartView>('/cart'),
    saved = usePrivate<Page<SavedAddress>>(
      `/account/addresses?page=${savedPage}`
    ),
    { user } = useSession(),
    navigate = useNavigate(),
    client = useQueryClient()
  const [recovery, setRecovery] = useState<string | null>(
    () =>
      Object.keys(sessionStorage)
        .find((k) => k.startsWith('quote:'))
        ?.slice(6) ?? null
  )
  const [address, setAddress] = useState<Address>({ ...blankAddress }),
    [age, setAge] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState('')
  async function review(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setQuote(
        await api<Quote>('/quotes', {
          method: 'POST',
          body: { address, ageConfirmed: age }
        })
      )
    } catch (e) {
      setError(errorText(e))
      await cart.refetch()
    } finally {
      setBusy(false)
    }
  }
  async function place() {
    const quoteId = quote?.id ?? recovery
    if (!quoteId || busy) return
    setBusy(true)
    setError('')
    const key =
      sessionStorage.getItem(`quote:${quoteId}`) ?? crypto.randomUUID()
    sessionStorage.setItem(`quote:${quoteId}`, key)
    try {
      const result = await api<{
        order: { id: string }
        cartPreserved: boolean
      }>('/orders', {
        method: 'POST',
        body: { quoteId },
        headers: { 'Idempotency-Key': key }
      })
      sessionStorage.removeItem(`quote:${quoteId}`)
      await client.invalidateQueries({ queryKey: ['private'] })
      navigate(`/account/orders/${result.order.id}?placed=1`, {
        replace: true,
        state: { cartPreserved: result.cartPreserved }
      })
    } catch (e) {
      setError(errorText(e))
      if (e instanceof ApiError && e.status === 409) {
        sessionStorage.removeItem(`quote:${quoteId}`)
        setQuote(null)
        setRecovery(null)
        setUncertain(false)
        await cart.refetch()
      } else setUncertain(true)
    } finally {
      setBusy(false)
    }
  }
  if (recovery && !quote)
    return (
      <section className="container section commerce">
        <h1>Recover your order</h1>
        <p>
          A previous submission has an unresolved result. Recover it before
          starting a new checkout.
        </p>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy} onClick={() => void place()}>
          Recover COD order
        </button>
      </section>
    )
  if (!user?.verified)
    return (
      <section className="container section">
        <h1>Checkout</h1>
        <p>Verify your email before checkout.</p>
        <a href="/account">Go to account</a>
      </section>
    )
  return (
    <section className="container section commerce">
      <h1>Checkout</h1>
      <p>
        Cash on delivery (COD): pay the amount shown when your order arrives. No
        online payment is taken.
      </p>
      {error && <p role="alert">{error}</p>}
      {cart.data?.items.some((i) => !i.available) && (
        <p>
          Some items are unavailable to order. Review your cart before checkout.
        </p>
      )}
      {cart.isError && (
        <button onClick={() => void cart.refetch()}>Retry cart</button>
      )}
      {cart.data?.items.length === 0 && !quote ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          {!quote ? (
            <form onSubmit={review}>
              {saved.data?.items.length ? (
                <label className="form-field">
                  Saved address
                  <select
                    aria-label="Saved address"
                    defaultValue=""
                    onChange={(e) => {
                      const a = saved.data.items.find(
                        (a) => a.id === e.target.value
                      )
                      if (a) {
                        setAddress(addressInput(a))
                      }
                    }}
                  >
                    <option value="">Enter a new address</option>
                    {saved.data.items.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.recipient} · {a.line1}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {(saved.data?.total ?? 0) > 20 && (
                <Pager
                  page={savedPage}
                  total={saved.data!.total}
                  change={setSavedPage}
                />
              )}
              <AddressFields
                value={address}
                change={setAddress}
                disabled={busy}
              />
              {cart.data?.items.some((i) => i.restricted18) && (
                <label>
                  <input
                    type="checkbox"
                    required
                    checked={age}
                    onChange={(e) => setAge(e.target.checked)}
                  />
                  I am at least 18 years old
                </label>
              )}
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  !cart.data?.items.length ||
                  cart.data.items.some((i) => !i.available)
                }
              >
                Review quote
              </button>
            </form>
          ) : (
            <div className="commerce-card">
              <h2>Review your order</h2>
              <p>
                {quote.address.recipient} · {quote.address.line1}
              </p>
              {quote.items.map((i) => (
                <p key={`${i.variantId}:${i.optionId ?? 'none'}`}>
                  {i.productName} · {i.variantLabel}{i.optionLabel ? ` · ${i.optionGroupLabel}: ${i.optionLabel}` : ''} × {i.quantity}
                </p>
              ))}
              <Totals value={quote} />
              {uncertain && (
                <p>
                  The result is uncertain. Retry this same order to recover its
                  result before starting another checkout.
                </p>
              )}
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => void place()}
              >
                Place COD order
              </button>
              <button
                disabled={busy || uncertain}
                onClick={() => setQuote(null)}
              >
                Edit address / refresh quote
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
