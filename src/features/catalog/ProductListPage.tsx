import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../../lib/api'
import { publicKey } from '../../lib/query-client'
import { formatVnd } from '../../lib/money'
import { PageState } from '../../components/PageState'
import { imageUrl, previewImage, type Category, type Page, type ProductSummary } from './types'

const descriptions: Record<string, string> = {
  mulberries: 'Browse fresh, dried, jam, and proposed wine listings. Product details are still being confirmed.',
  coffee: 'Explore planned Robusta and Arabica formats. Roast, grind, pack size, and pricing details are pending.',
  tea: 'Explore proposed tea concepts. Varieties and sourcing have not been confirmed.',
  honey: 'Explore proposed honey concepts. Floral source, origin, and pack details have not been confirmed.',
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const demoPhoto = previewImage(product.slug, product.confirmed)
  const photo = imageUrl(product.images[0]) ?? demoPhoto
  const illustrative = Boolean(product.images[0]?.illustrative || (!product.images.length && demoPhoto))
  return <article className="product-card">
    <Link className="product-image" to={`/products/${encodeURIComponent(product.slug)}`}>
      {photo ? <img src={photo} alt={`${product.name}${illustrative ? ' — illustrative image' : ''}`} loading="lazy" /> : <div className="image-placeholder" aria-label="No product image available" />}
      {illustrative && <span className="product-badge">{!product.confirmed && demoPhoto ? 'Preview listing' : demoPhoto ? 'Local demo · illustrative image' : 'Illustrative image'}</span>}
    </Link>
    <div className="product-body">
      <span className="product-category">{product.category.name}</span>
      <Link className="product-name" to={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link>
      <div className="product-bottom">
        <span className="product-price">{product.startingPriceVnd === null ? 'Price pending' : `From ${formatVnd(product.startingPriceVnd)}`}</span>
        <span className="availability">{product.purchasable ? 'Available to order' : !product.confirmed ? 'Details being confirmed' : 'Unavailable to order'}</span>
      </div>
    </div>
  </article>
}

export function ProductListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'newest'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const validSort = ['newest', 'name', 'price_asc', 'price_desc'].includes(sort) ? sort : 'newest'
  const query = useQuery({ queryKey: publicKey('products', q, category, validSort, page), queryFn: ({ signal }) => api<Page<ProductSummary>>(`/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}), sort: validSort, page: String(page) })}`, { signal }) })
  const categories = useQuery({ queryKey: publicKey('categories'), queryFn: ({ signal }) => api<Page<Category>>('/categories?pageSize=100', { signal }) })
  const categoryName = categories.data?.items.find(item => item.slug === category)?.name
  const heading = categoryName ?? 'Products'
  function change(key: string, value: string) {
    setParams(current => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })
  }
  return <section className="section products-section container">
    <div className="section-heading products-heading">
      <div>
        <span className="section-kicker">{categoryName ? 'EXPLORE THE RANGE' : 'PRODUCT CATALOG'}</span>
        <h1>{heading}</h1>
        <p>{categoryName ? descriptions[category] ?? `Browse ${categoryName} listings.` : 'Explore product listings by range. Preview details and availability are clearly marked.'}</p>
        {categoryName && <Link className="catalog-back-link" to="/products">← All products</Link>}
      </div>
      {query.data && <span className="result-count">{query.data.total} products</span>}
    </div>
    <div className="catalog-toolbar">
      <div className="filter-list" aria-label="Product categories">
        <button type="button" className={`filter-chip ${!category ? 'active' : ''}`} aria-pressed={!category} onClick={() => change('category', '')}>All</button>
        {categories.data?.items.map(item => <button type="button" key={item.id} className={`filter-chip ${category === item.slug ? 'active' : ''}`} aria-pressed={category === item.slug} onClick={() => change('category', item.slug)}>{item.name}</button>)}
      </div>
      <label className="search-box"><Search size={18} /><input type="search" value={q} onChange={event => change('q', event.target.value)} placeholder="Search products..." aria-label="Search products" /></label>
      <label className="sort-box">Sort <select value={validSort} onChange={event => change('sort', event.target.value)}><option value="newest">Newest</option><option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label>
    </div>
    {query.isPending ? <PageState title="Loading products" /> : query.isError ? <PageState title="Products are unavailable">Please try again later.</PageState> : query.data.items.length ? <>
      <div className="product-grid">{query.data.items.map(product => <ProductCard product={product} key={product.id} />)}</div>
      <div className="pagination"><button disabled={page <= 1} onClick={() => change('page', String(page - 1))}>Previous</button><span>Page {page}</span><button disabled={page * query.data.pageSize >= query.data.total} onClick={() => change('page', String(page + 1))}>Next</button></div>
    </> : <PageState title={q || category ? 'No matching products' : 'No products published yet'}>{q || category ? <Link to="/products">Browse all products</Link> : 'Listings will appear here when product details are ready.'}</PageState>}
    <p className="catalog-note">Images labeled illustrative are visual references. Local demo listings use fictional prices and stock. Check each listing for current ordering status.</p>
  </section>
}
