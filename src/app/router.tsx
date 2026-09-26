import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { HomePage } from '../features/catalog/HomePage'
import { ProductListPage } from '../features/catalog/ProductListPage'
import { ProductPage } from '../features/catalog/ProductPage'
import { AuthPage } from '../features/auth/AuthPage'
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage'
import { AdminLayout } from '../features/admin/AdminLayout'
import { ProductsPage } from '../features/admin/ProductsPage'
import { ProductEditor } from '../features/admin/ProductEditor'
import { CategoriesPage } from '../features/admin/CategoriesPage'
import { InventoryPage } from '../features/admin/InventoryPage'
export const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/products', element: <ProductListPage /> }, { path: '/products/:slug', element: <ProductPage /> },
  { path: '/login', element: <AuthPage mode="login" /> }, { path: '/register', element: <AuthPage mode="register" /> },
  { path: '/forgot-password', element: <AuthPage mode="forgot" /> }, { path: '/reset-password', element: <AuthPage mode="reset" /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/admin', element: <AdminLayout />, children: [
    { path: 'products', element: <ProductsPage /> }, { path: 'products/:id', element: <ProductEditor /> },
    { path: 'categories', element: <CategoriesPage /> }, { path: 'inventory', element: <InventoryPage /> },
  ] },
  { path: '*', element: <section className="container section"><h1>Page not found</h1><a href="/products">Browse products</a></section> },
] }])
