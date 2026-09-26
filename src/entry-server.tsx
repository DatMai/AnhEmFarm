import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Routes, StaticRouter } from 'react-router-dom'
import { Layout } from './components/Layout'
import { SessionProvider } from './features/auth/session'
import { HomePage } from './features/catalog/HomePage'
import { ProductListPage } from './features/catalog/ProductListPage'
import { ProductPage } from './features/catalog/ProductPage'
import { ContentPage, type PublicContent } from './features/content/ContentPage'
import { NotFoundPage } from './features/content/NotFoundPage'
import { publicKey } from './lib/query-client'
import type { Category, Page, ProductDetail, ProductSummary } from './features/catalog/types'

export type PublicPageData = {
  products?: Page<ProductSummary>
  categories?: Page<Category>
  product?: ProductDetail
  content?: PublicContent
  missingContentSlug?: string
}
export type RenderedPage = { html: string; status: number; title: string; description: string; canonical: string; structuredData?: object }

export async function renderPublicPage(url: string, data: PublicPageData): Promise<RenderedPage> {
  const location = new URL(url, 'https://anhemfarm.invalid')
  const path = location.pathname
  const productSlug = path.startsWith('/products/') ? decodeURIComponent(path.slice('/products/'.length)) : ''
  const contentSlug = path === '/about' ? 'about' : path === '/contact' ? 'contact' : path.startsWith('/policies/') ? path.slice('/policies/'.length) : ''
  let status = 200, title = 'AnhEmFarm', description = 'Explore farm products at AnhEmFarm.'
  if (productSlug) {
    if (!data.product || data.product.slug !== productSlug) status = 404
    else { title = `${data.product.name} | AnhEmFarm`; description = data.product.description.slice(0, 160) }
  } else if (contentSlug) {
    if (!data.content || data.content.slug !== contentSlug) status = 404
    else { title = `${data.content.title} | AnhEmFarm`; description = `${data.content.title} at AnhEmFarm.` }
  } else if (path === '/products') title = 'Products | AnhEmFarm'
  else if (path !== '/') status = 404
  if (status === 404) title = 'Page not found | AnhEmFarm'

  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })
  if (data.products) {
    if (path === '/') client.setQueryData(publicKey('home-products'), data.products)
    else {
      const q = location.searchParams.get('q') ?? '', category = location.searchParams.get('category') ?? ''
      const sort = location.searchParams.get('sort') ?? 'newest'
      const validSort = ['newest', 'name', 'price_asc', 'price_desc'].includes(sort) ? sort : 'newest'
      const page = Math.max(1, Number(location.searchParams.get('page')) || 1)
      client.setQueryData(publicKey('products', q, category, validSort, page), data.products)
    }
  }
  if (data.categories) client.setQueryData(publicKey('categories'), data.categories)
  if (data.product) client.setQueryData(publicKey('product', data.product.slug), data.product)
  if (data.content) client.setQueryData(publicKey('content', data.content.slug), data.content)
  if (status === 404 && contentSlug) client.setQueryData(publicKey('content', contentSlug), null)
  const body = status === 404 && !contentSlug ? <NotFoundPage /> : path === '/' ? <HomePage /> : path === '/products' ? <ProductListPage /> : productSlug ? <ProductPage /> : <ContentPage slug={contentSlug} />
  const route = productSlug ? '/products/:slug' : path.startsWith('/policies/') ? '/policies/:slug' : path
  const html = renderToString(<QueryClientProvider client={client}><SessionProvider><StaticRouter location={url}><Routes><Route element={<Layout />}><Route path={route} element={body} /></Route></Routes></StaticRouter></SessionProvider></QueryClientProvider>)
  const structuredData = status === 200 && data.product && data.product.slug === productSlug ? {
    '@context': 'https://schema.org', '@type': 'Product', name: data.product.name,
    description: data.product.description,
    ...(data.product.startingPriceVnd !== null && data.product.purchasable ? { offers: { '@type': 'Offer', priceCurrency: 'VND', price: data.product.startingPriceVnd, availability: 'https://schema.org/InStock' } } : {})
  } : undefined
  return { html, status, title, description, canonical: path, structuredData }
}
