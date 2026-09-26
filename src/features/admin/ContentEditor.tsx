import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { ErrorMessage, type Page, useAdminData } from './operations'
type Content = { slug: string; title: string; source: string; status: 'DRAFT' | 'PUBLISHED'; version: number }
const slugs = ['about', 'contact', 'shipping', 'returns', 'privacy', 'terms']
export function ContentEditor() {
  const [refresh, setRefresh] = useState(0), [slug, setSlug] = useState('about')
  const { data, error: loadError } = useAdminData<Page<Content>>('/admin/content?pageSize=100', refresh)
  const current = data?.items.find(item => item.slug === slug)
  const [title, setTitle] = useState(''), [source, setSource] = useState(''), [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  useEffect(() => { setTitle(current?.title ?? ''); setSource(current?.source ?? ''); setStatus(current?.status ?? 'DRAFT') }, [current, slug])
  async function save() { setBusy(true); setMessage('')
    try { await api(`/admin/content/${slug}`, { method: 'PUT', body: { title, source, status, version: current?.version ?? 1 } }); setRefresh(x => x + 1); setMessage('Content saved.') }
    catch { setMessage('Could not save content. Review links and reload the latest version.') }
    finally { setBusy(false) }
  }
  return <div><h2>Site content</h2><p>Draft pages stay private. Publishing confirms that the text is approved for visitors.</p>
    <ErrorMessage message={loadError} /><div className="admin-form"><label>Page <select value={slug} onChange={e => setSlug(e.target.value)}>{slugs.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Title <input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} /></label>
      <label>Content (Markdown, raw HTML is displayed as text) <textarea rows={12} value={source} onChange={e => setSource(e.target.value)} /></label>
      <label>Status <select value={status} onChange={e => setStatus(e.target.value as 'DRAFT' | 'PUBLISHED')}><option value="DRAFT">Draft</option><option value="PUBLISHED">Publish approved content</option></select></label>
      <button disabled={busy || !title.trim() || !source.trim()} onClick={() => void save()}>Save content</button></div>
    {message && <p role="status">{message}</p>}
  </div>
}
