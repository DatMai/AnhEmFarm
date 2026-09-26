import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import type { AdminPage, Category } from './types'
import { PageState } from '../../components/PageState'
const PAGE_SIZE = 20
export function CategoriesPage() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminPage<Category> | null>(null)
  const [name, setName] = useState(''); const [slug, setSlug] = useState('')
  const [editing, setEditing] = useState<Category | null>(null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { setData(await api<AdminPage<Category>>(`/admin/categories?page=${page}&pageSize=${PAGE_SIZE}`)) }, [page])
  useEffect(() => { void load().catch(() => setError('Could not load categories.')) }, [load])
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try {
    if (editing) await api(`/admin/categories/${editing.id}`, { method: 'PATCH', body: { expectedVersion: editing.version, name, slug } })
    else await api('/admin/categories', { method: 'POST', body: { name, slug } })
    setEditing(null); setName(''); setSlug(''); await load()
  } catch (failure) { setError(failure instanceof ApiError && failure.code === 'VERSION_CONFLICT' ? 'Category changed elsewhere. Reload and review before saving.' : 'Could not save category.') } finally { setBusy(false) } }
  return <div><h2>Categories</h2><form className="admin-form" onSubmit={save}><h3>{editing ? 'Edit category' : 'New category'}</h3><label>Name<input required maxLength={160} value={name} onChange={event => setName(event.target.value)} /></label><label>Slug<input required pattern="[a-z0-9-]+" value={slug} onChange={event => setSlug(event.target.value)} /></label><button className="button button-primary" disabled={busy}>{editing ? 'Save category' : 'Create category'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setName(''); setSlug('') }}>Cancel</button>}</form>{error && <p role="alert" className="error-message">{error} {error.includes('Reload') && <button onClick={() => void load().then(() => { setEditing(null); setName(''); setSlug(''); setError('') })}>Reload categories</button>}</p>}{!data ? <PageState title="Loading categories" /> : data.items.length === 0 ? <PageState title="No categories on this page" /> : <ul className="admin-list">{data.items.map(category => <li key={category.id}><strong>{category.name}</strong><span>{category.slug}</span><button onClick={() => { setEditing(category); setName(category.name); setSlug(category.slug); setError('') }}>Edit</button></li>)}</ul>}{data && <div className="pagination"><button disabled={page === 1} onClick={() => { setEditing(null); setPage(page - 1) }}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}</span><button disabled={page * PAGE_SIZE >= data.total} onClick={() => { setEditing(null); setPage(page + 1) }}>Next</button></div>}</div>
}
