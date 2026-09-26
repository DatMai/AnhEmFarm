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
import { DashboardPage } from '../features/admin/DashboardPage'
import { OrdersPage as AdminOrdersPage } from '../features/admin/OrdersPage'
import { OrderEditor } from '../features/admin/OrderEditor'
import { CustomersPage } from '../features/admin/CustomersPage'
import { CustomerDetailPage } from '../features/admin/CustomerDetailPage'
import { SettingsPage } from '../features/admin/SettingsPage'
import { ContentEditor } from '../features/admin/ContentEditor'
import { AuditPage } from '../features/admin/AuditPage'
import { EmailJobsPage } from '../features/admin/EmailJobsPage'
import { CartPage } from '../features/cart/CartPage'
import { CheckoutPage } from '../features/checkout/CheckoutPage'
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
      {
        element: <CustomerBoundary />,
        children: [
          { path: '/checkout', element: <CheckoutPage /> },
          { path: '/account', element: <AccountPage /> },
          { path: '/account/addresses', element: <AddressesPage /> },
          { path: '/account/orders', element: <OrdersPage /> },
          { path: '/account/orders/:id', element: <OrderDetailPage /> }
        ]
      },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'orders', element: <AdminOrdersPage /> },
          { path: 'orders/:id', element: <OrderEditor /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/:id', element: <ProductEditor /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'inventory', element: <InventoryPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'content', element: <ContentEditor /> },
          { path: 'audit', element: <AuditPage /> },
          { path: 'email-jobs', element: <EmailJobsPage /> }
        ]
      },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])
