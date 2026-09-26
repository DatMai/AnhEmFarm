import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSession } from '../auth/session'
import { api, ApiError } from '../../lib/api'
import { PageState } from '../../components/PageState'
export function AdminLayout() {
  const { user, loading } = useSession()
  const [access, setAccess] = useState<'checking' | 'allowed' | 'forbidden' | 'error'>('checking')
  useEffect(() => {
    if (loading) return
    if (user?.role !== 'ADMIN') { setAccess('forbidden'); return }
    const controller = new AbortController()
    setAccess('checking')
    void api('/admin/products?pageSize=1', { signal: controller.signal }).then(() => setAccess('allowed')).catch(error => {
      if (controller.signal.aborted) return
      setAccess(error instanceof ApiError && [401, 403].includes(error.status) ? 'forbidden' : 'error')
    })
    return () => controller.abort()
  }, [loading, user])
  if (loading || access === 'checking') return <section className="container section"><PageState title="Checking access" /></section>
  if (access === 'forbidden') return <section className="container section"><PageState title="Access forbidden">An administrator account is required.</PageState></section>
  if (access === 'error') return <section className="container section"><PageState title="Admin unavailable">Please reload this page.</PageState></section>
  return <section className="container section admin-shell"><h1>Catalog administration</h1><nav className="admin-nav" aria-label="Catalog administration"><NavLink to="/admin/products">Products</NavLink><NavLink to="/admin/categories">Categories</NavLink><NavLink to="/admin/inventory">Inventory</NavLink></nav><Outlet /></section>
}
