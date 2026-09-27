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
    [message, setMessage] = useState(''),
    [quantity, setQuantity] = useState(1),
    [choiceId, setChoiceId] = useState<string | null>(null),
    [variantId, setVariantId] = useState<string | null>(null)
  async function add(id: string, optionId: string | null) {
    setBusy(true)
    setMessage('')
    try {
      if (user) {
        const cart = await getCart()
        const old = cart.items.find((item) => item.variantId === id && item.optionId === optionId)
        await setCartItem(id, (old?.quantity ?? 0) + quantity, cart.version, optionId)
      } else {
        const items = loadGuestCart().items
        const old = items.find((item) => item.variantId === id && item.optionId === optionId)
        saveGuestCart(
          old
            ? items.map((i) =>
                i.variantId === id && i.optionId === optionId ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i
              )
            : [...items, { variantId: id, optionId, quantity }]
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
  const selectedVariant = product.variants.find((variant) => variant.id === variantId) ?? product.variants[0]
  const quantityValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= 99
  const choiceRequired = Boolean(product.choiceGroup)
  const choiceValid = !choiceRequired || product.choiceGroup!.choices.some((choice) => choice.id === choiceId)
  const demoPhoto = previewImage(product.slug, product.confirmed)
  const image = imageUrl(product.images[0]) ?? demoPhoto
  const illustrative = Boolean(product.images[0]?.illustrative || (!product.images.length && demoPhoto))
  const relatedItems = related.data?.items.filter(item => item.id !== product.id).slice(0, 4) ?? []
  return (
    <section className="container section detail-section">
      <Link className="back-link" to="/products">
        All products
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
          {illustrative && <span>{!product.confirmed && demoPhoto ? 'Preview listing · illustrative image' : 'Illustrative image'}</span>}
        </div>
        <div className="detail-copy">
          <span className="section-kicker">{product.category.name}</span>
          <h1>{product.name}</h1>
          {!product.confirmed && demoPhoto && <p className="preview-notice">Preview listing. {product.images.length ? '' : 'The image is illustrative. '}Product details and pricing have not been confirmed. Ordering is unavailable.</p>}
          {product.confirmed && demoPhoto && product.description.startsWith('Development demo listing.') && <p className="preview-notice">Development demo listing. The image, price, stock, and delivery details are fictional for local testing.</p>}
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
          {product.choiceGroup && (
            <fieldset className="product-choice-group" aria-required="true">
              <legend>{product.choiceGroup.label}</legend>
              <p>Choose one option for this product.</p>
              {product.choiceGroup.choices.map((choice) => (
                <label key={choice.id}>
                  <input type="radio" name="product-choice" value={choice.id} checked={choiceId === choice.id} onChange={() => setChoiceId(choice.id)} />
                  {choice.label}
                </label>
              ))}
            </fieldset>
          )}
          <h2>Formats and availability</h2>
          {product.variants.length ? (
            <ul className="variant-list">
              {product.variants.map((variant) => (
                <li key={variant.id}>
                  <label className="variant-select">
                    <input type="radio" name="product-variant" value={variant.id} checked={(selectedVariant?.id ?? '') === variant.id} onChange={() => setVariantId(variant.id)} />
                    <span>
                    {variant.label}
                    {variant.packDetails && ` · ${variant.packDetails}`}
                    </span>
                  </label>
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
                </li>
              ))}
            </ul>
          ) : (
            <p>Formats, sizes, and pricing will be added when confirmed.</p>
          )}
          {selectedVariant && (
            <div className="detail-purchase">
              <div className="quantity-control" aria-label="Quantity selector">
                <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((current) => Math.max(1, current - 1))}>−</button>
                <label>
                  <span className="sr-only">Quantity</span>
                  <input aria-label="Quantity" type="number" min="1" max="99" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                </label>
                <button type="button" aria-label="Increase quantity" disabled={quantity >= 99} onClick={() => setQuantity((current) => Math.min(99, current + 1))}>+</button>
              </div>
              <button className="button button-primary detail-add-button" disabled={busy || !quantityValid || !choiceValid || !variantAvailable(product, selectedVariant)} onClick={() => void add(selectedVariant.id, choiceId)}>
                {busy ? 'Adding…' : `Add ${quantity} to cart`}
              </button>
              {choiceRequired && !choiceValid && <small>Select an option before adding this product.</small>}
            </div>
          )}
          {!product.purchasable && <Link className="detail-secondary-link" to="/products">Explore other products</Link>}
        </div>
      </div>
      {relatedItems.length > 0 && <div className="related-products"><div className="section-heading"><div><span className="section-kicker">CONTINUE EXPLORING</span><h2>More from {product.category.name}</h2></div><Link className="section-link" to={`/products?category=${encodeURIComponent(product.category.slug)}`}>View range</Link></div><div className="product-grid">{relatedItems.map(item => <ProductCard key={item.id} product={item} />)}</div></div>}
    </section>
  )
}
