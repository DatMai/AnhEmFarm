import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, refreshCsrf } from '../../lib/api'
import { imageUrl } from '../catalog/types'
import type { AdminPage, Category, Product } from './types'
import { PageState } from '../../components/PageState'

type Draft = { slug: string; name: string; description: string; categoryId: string; confirmed: boolean; restricted18: boolean }
const empty: Draft = { slug: '', name: '', description: '', categoryId: '', confirmed: false, restricted18: false }
function uploadFile(file: File, token: string, onProgress: (percent: number) => void): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/v1/admin/media')
    request.withCredentials = true
    request.setRequestHeader('X-CSRF-Token', token)
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    request.onload = () => { if (request.status >= 200 && request.status < 300) {
      try { resolve(JSON.parse(request.responseText) as { id: string; url: string }) } catch { reject(new Error('Invalid upload response.')) }
    } else reject(new Error('Upload failed.')) }
    request.onerror = () => reject(new Error('Upload failed.'))
    const body = new FormData(); body.append('file', file); request.send(body)
  })
}
function VariantFields({ variant, busy, onSave }: { variant: Product['variants'][number]; busy: boolean; onSave: (changes: Record<string, unknown>) => Promise<void> }) {
  const [label, setLabel] = useState(variant.label)
  const [packDetails, setPackDetails] = useState(variant.packDetails)
  const [price, setPrice] = useState(variant.priceVnd?.toString() ?? '')
  return <form className="admin-variant-form" onSubmit={event => { event.preventDefault(); void onSave({ label, packDetails, priceVnd: price ? Number(price) : null }) }}>
    <label>Label<input required value={label} onChange={event => setLabel(event.target.value)} /></label>
    <label>Pack details<input value={packDetails} onChange={event => setPackDetails(event.target.value)} /></label>
    <label>Price in VND<input type="number" min="1" step="1" value={price} onChange={event => setPrice(event.target.value)} /></label>
    <button disabled={busy}>Save variant</button>
  </form>
}
export function ProductEditor() {
  const { id } = useParams(); const navigate = useNavigate(); const isNew = id === 'new'
  const [product, setProduct] = useState<Product | null>(null); const [draft, setDraft] = useState<Draft>(empty)
  const [categories, setCategories] = useState<Category[]>([]); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false)
  const [sku, setSku] = useState(''); const [label, setLabel] = useState(''); const [packDetails, setPackDetails] = useState(''); const [price, setPrice] = useState(''); const [saleEnabled, setSaleEnabled] = useState(false)
  const [preview, setPreview] = useState<string | null>(null); const [progress, setProgress] = useState<number | null>(null)
  const load = useCallback(async () => { if (!id || isNew) return; const result = await api<Product>(`/admin/products/${id}`); setProduct(result); setDraft({ slug: result.slug, name: result.name, description: result.description, categoryId: result.categoryId, confirmed: result.confirmed, restricted18: result.restricted18 }) }, [id, isNew])
  useEffect(() => { void api<AdminPage<Category>>('/admin/categories?pageSize=100').then(result => setCategories(result.items)).catch(() => setError('Could not load categories.')) }, [])
  useEffect(() => { void load().catch(() => setError('Could not load product.')) }, [load])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  function conflict(error: unknown) { setError(error instanceof ApiError && error.code === 'VERSION_CONFLICT' ? 'This item changed elsewhere. Reload and review before saving.' : 'Could not save. Check the fields and try again.') }
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try {
    if (isNew) { const created = await api<Product>('/admin/products', { method: 'POST', body: draft }); navigate(`/admin/products/${created.id}`) }
    else if (product) { await api(`/admin/products/${product.id}`, { method: 'PATCH', body: { ...draft, expectedVersion: product.version } }); await load(); setNotice('Product saved.') }
  } catch (failure) { conflict(failure) } finally { setBusy(false) } }
  async function changeStatus(status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT') { if (!product) return; setBusy(true); setError(''); try {
    await api(`/admin/products/${product.id}`, { method: 'PATCH', body: { expectedVersion: product.version, status } }); await load(); setNotice(status === 'PUBLISHED' ? 'Product published.' : status === 'ARCHIVED' ? 'Product archived.' : 'Product returned to draft.')
  } catch (failure) { conflict(failure) } finally { setBusy(false) } }
  async function addVariant(event: FormEvent) { event.preventDefault(); if (!product) return; setBusy(true); setError(''); try {
    await api(`/admin/products/${product.id}/variants`, { method: 'POST', body: { sku, label, packDetails, priceVnd: price ? Number(price) : null, saleEnabled } });
    setSku(''); setLabel(''); setPackDetails(''); setPrice(''); setSaleEnabled(false); await load(); setNotice('Variant added.')
  } catch (failure) { conflict(failure) } finally { setBusy(false) } }
  async function updateVariant(variant: Product['variants'][number], changes: Record<string, unknown>) { setBusy(true); setError(''); try {
    await api(`/admin/variants/${variant.id}`, { method: 'PATCH', body: { expectedVersion: variant.version, ...changes } }); await load(); setNotice('Variant updated.')
  } catch (failure) { conflict(failure) } finally { setBusy(false) } }
  async function onImage(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file || !product) return
    if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(file)); setProgress(0); setError(''); try {
      const token = await refreshCsrf(); const uploaded = await uploadFile(file, token, setProgress)
      await api(`/admin/products/${product.id}/images`, { method: 'POST', body: { mediaId: uploaded.id } }); await load(); setNotice('Image added.')
    } catch { setError('Could not upload and attach image.') } finally { setProgress(null); event.target.value = '' } }
  if (!id) return <PageState title="Product not found" />
  return <div><Link className="back-link" to="/admin/products">← Products</Link><h2>{isNew ? 'Create product' : 'Edit product'}</h2>{error && <p className="error-message" role="alert">{error} {error.includes('Reload') && <button onClick={() => void load().then(() => setError(''))}>Reload product</button>}</p>}{notice && <p className="success-message" role="status">{notice}</p>}{!isNew && !product ? <PageState title="Loading product" /> : <><form className="admin-form" onSubmit={save}><label>Name<input required maxLength={160} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label>Slug<input required pattern="[a-z0-9-]+" value={draft.slug} onChange={event => setDraft({ ...draft, slug: event.target.value })} /></label><label>Description<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label><label>Category<select required value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Choose category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="admin-check"><input type="checkbox" checked={draft.confirmed} onChange={event => setDraft({ ...draft, confirmed: event.target.checked })} /> Product details confirmed</label><label className="admin-check"><input type="checkbox" checked={draft.restricted18} onChange={event => setDraft({ ...draft, restricted18: event.target.checked })} /> Age restricted</label><button className="button button-primary" disabled={busy}>Save product</button></form>{product && <><div className="admin-actions"><strong>Status: {product.status}</strong>{product.status !== 'PUBLISHED' && <button disabled={busy} onClick={() => void changeStatus('PUBLISHED')}>Publish</button>}{product.status !== 'DRAFT' && <button disabled={busy} onClick={() => void changeStatus('DRAFT')}>Return to draft</button>}{product.status !== 'ARCHIVED' && <button disabled={busy} onClick={() => void changeStatus('ARCHIVED')}>Archive</button>}</div><h3>Variants</h3><ul className="admin-list">{product.variants.map(variant => <li key={variant.id}><strong>{variant.sku} — {variant.label}</strong><span>{variant.packDetails}</span><span>{variant.priceVnd === null ? 'Price pending' : `${variant.priceVnd} VND`}</span><span>Stock: {variant.stock}</span><label className="admin-check"><input type="checkbox" checked={variant.saleEnabled} disabled={busy} onChange={event => void updateVariant(variant, { saleEnabled: event.target.checked })} /> Sale enabled</label><Link to="/admin/inventory">Adjust stock</Link><VariantFields key={`${variant.id}-${variant.version}`} variant={variant} busy={busy} onSave={changes => updateVariant(variant, changes)} /></li>)}</ul><form className="admin-form" onSubmit={addVariant}><h3>Add variant</h3><label>SKU<input required value={sku} onChange={event => setSku(event.target.value)} /></label><label>Label<input required value={label} onChange={event => setLabel(event.target.value)} /></label><label>Pack details<input value={packDetails} onChange={event => setPackDetails(event.target.value)} /></label><label>Price in VND<input type="number" min="1" step="1" value={price} onChange={event => setPrice(event.target.value)} /></label><label className="admin-check"><input type="checkbox" checked={saleEnabled} onChange={event => setSaleEnabled(event.target.checked)} /> Sale enabled</label><button className="button button-primary" disabled={busy}>Add variant</button></form><h3>Images</h3><div className="admin-images">{product.images.map(image => <img key={image.id} src={imageUrl(image)} alt={`${product.name} product image`} />)}{preview && <img src={preview} alt="Selected image preview" />}</div><label className="admin-upload">Upload image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void onImage(event)} /></label>{progress !== null && <progress aria-label="Image upload progress" value={progress} max={100} />}</>}</>}</div>
}
