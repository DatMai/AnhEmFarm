import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { queryClient, publicKey } from './lib/query-client'
import type { PublicPageData } from './entry-server'
import './styles.css'

const initial = document.getElementById('public-data')
if (initial?.textContent) {
  const data = JSON.parse(initial.textContent) as PublicPageData
  const path = new URL(location.href)
  if (data.products) {
    if (path.pathname === '/') queryClient.setQueryData(publicKey('home-products'), data.products)
    else {
      const q = path.searchParams.get('q') ?? '', category = path.searchParams.get('category') ?? ''
      const sort = path.searchParams.get('sort') ?? 'newest'
      const validSort = ['newest', 'name', 'price_asc', 'price_desc'].includes(sort) ? sort : 'newest'
      const page = Math.max(1, Number(path.searchParams.get('page')) || 1)
      queryClient.setQueryData(publicKey('products', q, category, validSort, page), data.products)
    }
  }
  if (data.categories) queryClient.setQueryData(publicKey('categories'), data.categories)
  if (data.product) queryClient.setQueryData(publicKey('product', data.product.slug), data.product)
  if (data.content) queryClient.setQueryData(publicKey('content', data.content.slug), data.content)
}
const root = document.getElementById('root')!
const app = <React.StrictMode><App /></React.StrictMode>
if (root.hasChildNodes()) ReactDOM.hydrateRoot(root, app)
else ReactDOM.createRoot(root).render(app)
