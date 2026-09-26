import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { HomePage } from '../features/catalog/HomePage'
import { ProductListPage } from '../features/catalog/ProductListPage'
import { ProductPage } from '../features/catalog/ProductPage'
import { AuthPage } from '../features/auth/AuthPage'
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage'
export const router = createBrowserRouter([{ element: <Layout />, children: [
  { path: '/', element: <HomePage /> }, { path: '/products', element: <ProductListPage /> }, { path: '/products/:slug', element: <ProductPage /> },
  { path: '/login', element: <AuthPage mode="login" /> }, { path: '/register', element: <AuthPage mode="register" /> },
  { path: '/forgot-password', element: <AuthPage mode="forgot" /> }, { path: '/reset-password', element: <AuthPage mode="reset" /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '*', element: <section className="container section"><h1>Page not found</h1><a href="/products">Browse products</a></section> },
] }])
