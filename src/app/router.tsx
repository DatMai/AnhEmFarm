import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { HomePage } from '../features/catalog/HomePage'
import { ProductListPage } from '../features/catalog/ProductListPage'
import { ProductPage } from '../features/catalog/ProductPage'
import { AuthPage } from '../features/auth/AuthPage'
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage'
import { CartPage } from '../features/cart/CartPage'
import { CheckoutPage } from '../features/checkout/CheckoutPage'
import { GuestCheckoutPage, GuestOrderPage } from '../features/checkout/GuestCheckoutPage'
import { useSession } from '../features/auth/session'
import { AccountPage } from '../features/account/AccountPage'
import { AddressesPage } from '../features/account/AddressesPage'
import { OrdersPage } from '../features/account/OrdersPage'
import { OrderDetailPage } from '../features/account/OrderDetailPage'
import { CustomerBoundary } from '../features/account/shared'
import { ContentPage } from '../features/content/ContentPage'
import { NotFoundPage } from '../features/content/NotFoundPage'
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/products', element: <ProductListPage /> },
      { path: '/products/:slug', element: <ProductPage /> },
      { path: '/about', element: <ContentPage slug="about" /> },
      { path: '/contact', element: <ContentPage slug="contact" /> },
      { path: '/policies/:slug', element: <ContentPage /> },
      { path: '/login', element: <AuthPage mode="login" /> },
      { path: '/register', element: <AuthPage mode="register" /> },
      { path: '/forgot-password', element: <AuthPage mode="forgot" /> },
      { path: '/reset-password', element: <AuthPage mode="reset" /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/cart', element: <CartPage /> },
      { path: '/checkout', element: <CheckoutEntry /> },
      { path: '/guest/orders/:id', element: <GuestOrderPage /> },
      {
        element: <CustomerBoundary />,
        children: [
          { path: '/account', element: <AccountPage /> },
          { path: '/account/addresses', element: <AddressesPage /> },
          { path: '/account/orders', element: <OrdersPage /> },
          { path: '/account/orders/:id', element: <OrderDetailPage /> }
        ]
      },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])

function CheckoutEntry() {
  const { user, loading } = useSession()
  if (loading) return <section className="container section commerce"><p>Loading checkout…</p></section>
  return user ? <CheckoutPage /> : <GuestCheckoutPage />
}
