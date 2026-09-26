import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import type { AdminPage, Category } from './types'
import { PageState } from '../../components/PageState'
export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState(''); const [slug, setSlug] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const result = await api<AdminPage<Category>>('/admin/categories?pageSize=100'); setCategories(result.items) }, [])
  useEffect(() => { void load().catch(() => setError('Could not load categories.')) }, [load])
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
    if (editing) await api(`/admin/categories/${editing.id}`, { method: 'PATCH', body: { expectedVersion: editing.version, name, slug } })
    else await api('/admin/categories', { method: 'POST', body: { name, slug } })
    setEditing(null); setName(''); setSlug(''); await load()
  } catch (failure) { setError(failure instanceof ApiError && failure.code === 'VERSION_CONFLICT' ? 'Category changed elsewhere. Reload and review before saving.' : 'Could not save category.') } finally { setBusy(false) } }
  return <div><h2>Categories</h2><form className="admin-form" onSubmit={save}><h3>{editing ? 'Edit category' : 'New category'}</h3><label>Name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><label>Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={event => setSlug(event.target.value)} /></label><button className="button button-primary" disabled={busy}>{editing ? 'Save category' : 'Create category'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(''); setSlug('') }}>Cancel</button>}</form>{error && <p role="alert" className="error-message">{error} {error.includes('Reload') && <button onClick={() => void load().then(() => { setEditing(null); setName(''); setSlug(''); setError('') })}>Reload categories</button>}</p>}{categories.length === 0 ? <PageState title="No categories" /> : <ul className="admin-list">{categories.map(category => <li key={category.id}><strong>{category.name}</strong><span>{category.slug}</span><button onClick={() => { setEditing(category); setName(category.name); setSlug(category.slug); setError('') }}>Edit</button></li>)}</ul>}</div>
}
