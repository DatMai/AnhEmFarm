import { useState } from 'react'
import { useSession } from '../auth/session'
import { getCart, setCartItem } from '../cart/cart-api'
import { loadGuestCart, saveGuestCart } from '../cart/guest-cart'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { publicKey } from '../../lib/query-client'
import { formatVnd } from '../../lib/money'
import { PageState } from '../../components/PageState'
import { imageUrl, previewImage, variantAvailable, type Page, type ProductDetail, type ProductSummary } from './types'
import { ProductCard } from './ProductListPage'
export function ProductPage() {
  const client = useQueryClient()
  const { user } = useSession()
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  async function add(id: string) {
    setBusy(true)
    setMessage('')
    try {
      if (user) {
        const cart = await getCart()
        await setCartItem(
          id,
          (cart.items.find((i) => i.variantId === id)?.quantity ?? 0) + 1,
          cart.version
        )
      } else {
        const items = loadGuestCart().items
        const old = items.find((i) => i.variantId === id)
        saveGuestCart(
          old
            ? items.map((i) =>
                i.variantId === id ? { ...i, quantity: i.quantity + 1 } : i
              )
            : [...items, { variantId: id, quantity: 1 }]
        )
      }
      await client.invalidateQueries({ queryKey: ['private'] })
      setMessage('Added to cart.')
    } catch {
      setMessage(
        'Could not add this item. Please review your cart and try again.'
      )
    } finally {
      setBusy(false)
    }
  }
  const { slug = '' } = useParams()
  const query = useQuery({
    queryKey: publicKey('product', slug),
    queryFn: ({ signal }) =>
      api<ProductDetail>(`/products/${encodeURIComponent(slug)}`, { signal }),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 404) && count < 1
  })
  const related = useQuery({
    queryKey: publicKey('related-products', query.data?.category.slug ?? ''),
    queryFn: ({ signal }) => api<Page<ProductSummary>>(`/products?${new URLSearchParams({ category: query.data!.category.slug, pageSize: '8' })}`, { signal }),
    enabled: Boolean(query.data?.category.slug)
  })
  if (query.isPending)
    return (
      <div className="container section">
        <PageState title="Loading product" />
      </div>
    )
  if (query.isError)
    return (
      <div className="container section">
        <PageState
          title={
            query.error instanceof ApiError && query.error.status === 404
              ? 'Product not found'
              : 'Product unavailable'
          }
        >
          <Link to="/products">Browse products</Link>
        </PageState>
      </div>
    )
  const product = query.data
  const demoPhoto = previewImage(product.slug)
  const image = imageUrl(product.images[0]) ?? demoPhoto
  const illustrative = Boolean(product.images[0]?.illustrative || demoPhoto)
  const relatedItems = related.data?.items.filter(item => item.id !== product.id).slice(0, 4) ?? []
  return (
    <section className="container section detail-section">
      <Link className="back-link" to="/products">
        ← All products
      </Link>
      <div className="detail-grid">
        <div className="detail-image">
          {image ? (
            <img
              src={image}
              alt={`${product.name}${illustrative ? ' — illustrative image' : ''}`}
            />
          ) : (
            <div className="image-placeholder" />
          )}{' '}
          {illustrative && <span>{demoPhoto ? 'Preview listing · illustrative image' : 'Illustrative image'}</span>}
        </div>
        <div className="detail-copy">
          <span className="section-kicker">{product.category.name}</span>
          <h1>{product.name}</h1>
          {demoPhoto && <p className="preview-notice">Preview listing. Images are illustrative; product details and pricing have not been confirmed. Ordering is unavailable.</p>}
          <p>{product.description}</p>
          {product.restricted18 && (
            <p className="notice">
              Age restricted product. You must confirm you are at least 18 at
              checkout.
            </p>
          )}
          <p className="detail-price">
            {product.startingPriceVnd === null
              ? 'Price pending'
              : `From ${formatVnd(product.startingPriceVnd)}`}
          </p>
          <strong>
            {product.purchasable
              ? 'Available to order'
              : 'Unavailable to order'}
          </strong>
          <p role="status">{message}</p>
          <h2>Formats and availability</h2>
          {product.variants.length ? (
            <ul className="variant-list">
              {product.variants.map((variant) => (
                <li key={variant.id}>
                  <span>
                    {variant.label}
                    {variant.packDetails && ` · ${variant.packDetails}`}
                  </span>
                  <span>
                    {!product.confirmed || variant.priceVnd === null
                      ? 'Price pending'
                      : formatVnd(variant.priceVnd)}
                  </span>
                  <small>
                    {variantAvailable(product, variant)
                      ? 'Available'
                      : 'Unavailable'}
                  </small>
                  <button
                    disabled={busy || !variantAvailable(product, variant)}
                    onClick={() => void add(variant.id)}
                  >
                    Add {variant.label} to cart
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Formats, sizes, and pricing will be added when confirmed.</p>
          )}
          {!product.purchasable && <Link className="detail-secondary-link" to="/products">Explore other products →</Link>}
        </div>
      </div>
      {relatedItems.length > 0 && <div className="related-products"><div className="section-heading"><div><span className="section-kicker">CONTINUE EXPLORING</span><h2>More from {product.category.name}</h2></div><Link className="section-link" to={`/products?category=${encodeURIComponent(product.category.slug)}`}>View range →</Link></div><div className="product-grid">{relatedItems.map(item => <ProductCard key={item.id} product={item} />)}</div></div>}
    </section>
  )
}
