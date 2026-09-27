import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { publicKey } from '../../lib/query-client'
import { useSession } from '../auth/session'
import { usePrivate, errorText } from '../account/shared'
import {
  mergeGuestCart,
  removeCartItem,
  setCartItem,
  type CartView
} from './cart-api'
import { loadGuestCart, saveGuestCart } from './guest-cart'
import { formatVnd } from '../../lib/money'
export function CartPage() {
  const { user } = useSession()
  return user ? <AccountCart key={user.id} /> : <GuestCart />
}
function GuestCart() {
  const [items, setItems] = useState(loadGuestCart().items)
  const preview = useQuery({ queryKey: publicKey('guest-cart', JSON.stringify(items)),
    queryFn: () => api<CartView>('/guest/cart-preview', { method: 'POST', body: { items } }), enabled: items.length > 0 })
  useEffect(() => {
    const sync = () => setItems(loadGuestCart().items)
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  return (
    <section className="container section commerce guest-cart">
      <h1>Cart</h1>
      {!items.length && <p>Your cart is empty.</p>}
      {preview.isPending && items.length > 0 && <p>Loading cart details…</p>}
      {preview.isError && <p role="alert">Cart details are unavailable. <button onClick={() => void preview.refetch()}>Retry</button></p>}
      {items.map((item) => {
        const detail = preview.data?.items.find(line => line.variantId === item.variantId && line.optionId === item.optionId)
        return <article className="commerce-card guest-cart-card" key={`${item.variantId}:${item.optionId ?? 'none'}`}>
          <h2>{detail?.productName ?? 'Loading product…'}</h2>
          {detail && <p>{detail.variantLabel} · {detail.priceVnd === null ? 'Price pending' : formatVnd(detail.priceVnd)}{detail.optionLabel ? ` · ${detail.optionGroupLabel}: ${detail.optionLabel}` : ''}</p>}
          {detail && !detail.available && <p>Unavailable to order. Remove this item or try again later.</p>}
          <div className="guest-cart-controls"><label>
            Quantity for {detail?.productName ?? 'this item'}
            <input
              type="number"
              min="1"
              max="99"
              value={item.quantity}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1 && n <= 99) {
                  const next = items.map((i) =>
                    i.variantId === item.variantId && i.optionId === item.optionId ? { ...i, quantity: n } : i
                  )
                  saveGuestCart(next)
                  setItems(next)
                }
              }}
            />
          </label>
          <button
            onClick={() => {
              const next = items.filter((i) => i.variantId !== item.variantId || i.optionId !== item.optionId)
              saveGuestCart(next)
              setItems(next)
            }}
          >
            Remove
          </button></div>
        </article>
      })}
      {items.length > 0 && <div className="guest-cart-actions">{preview.data?.items.every(item => item.available)
        ? <Link className="button button-primary" to="/checkout">Continue to guest checkout</Link>
        : <button className="button button-primary" disabled>Continue to guest checkout</button>}</div>}
      <p>Final item details and totals are confirmed in your server quote.</p>
      <Link to="/login?next=/cart">Sign in to use your account</Link>
    </section>
  )
}
function AccountCart() {
  const navigate = useNavigate()
  const query = usePrivate<CartView>('/cart'),
    client = useQueryClient()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function edit(fn: () => Promise<CartView>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await fn()
      await client.invalidateQueries({ queryKey: ['private'] })
    } catch (e) {
      setError(errorText(e))
      await query.refetch()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="container section commerce">
      <h1>Cart</h1>
      {error && <p role="alert">{error}</p>}
      {loadGuestCart().items.length > 0 && (
        <button disabled={busy} onClick={() => void edit(mergeGuestCart)}>
          Merge saved guest cart
        </button>
      )}
      {query.isPending && <p>Loading cart…</p>}
      {query.isError && (
        <button onClick={() => void query.refetch()}>Retry cart</button>
      )}
      {query.data?.items.map((item) => (
        <article className="commerce-card" key={`${item.variantId}:${item.optionId ?? 'none'}`}>
          <h2>{item.productName}</h2>
          <p>
            {item.variantLabel} ·{' '}
            {item.priceVnd === null
              ? 'Price pending'
              : formatVnd(item.priceVnd)}
          </p>
          {item.optionLabel && <p>{item.optionGroupLabel}: {item.optionLabel}</p>}
          {!item.available && (
            <p>Unavailable to order. Remove this item or try again later.</p>
          )}
          <label>
            Quantity for {item.productName}
            <input
              aria-label={`Quantity for ${item.productName}`}
              type="number"
              min="1"
              max="99"
              defaultValue={item.quantity}
              key={`${item.variantId}:${item.optionId ?? 'none'}:${query.data.version}`}
              disabled={busy}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (!Number.isInteger(n) || n < 1 || n > 99) {
                  e.currentTarget.value = String(item.quantity)
                  setError('Quantity must be a whole number from 1 to 99.')
                  return
                }
                if (n !== item.quantity)
                  void edit(() =>
                    setCartItem(item.variantId, n, query.data!.version, item.optionId)
                  )
              }}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void edit(() =>
                removeCartItem(item.variantId, query.data!.version, item.optionId)
              )
            }
          >
            Remove {item.productName}
          </button>
        </article>
      ))}
      {query.data && !query.data.items.length ? (
        <p>Your cart is empty.</p>
      ) : (
        query.data?.items.every((i) => i.available) && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => navigate('/checkout')}
          >
            Continue to checkout
          </button>
        )
      )}
      <p>
        Final item totals and delivery fee are confirmed in your server quote.
      </p>
      <Link to="/products">Browse products</Link>
    </section>
  )
}
