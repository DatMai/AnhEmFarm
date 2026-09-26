import { useState } from 'react'
import { api } from '../../lib/api'
import { ErrorMessage, Pager, type Page, useAdminData } from './operations'
type Settings = { version: number; salesEnabled: boolean; wineEnabled: boolean; businessName: string | null; supportEmail: string | null; supportPhone: string | null }
type Zone = { id: string; version: number; code: string; displayName: string; feeVnd: number; enabled: boolean }
export function SettingsPage() {
  const [refresh, setRefresh] = useState(0), [page, setPage] = useState(1)
  const { data: settings, setData: setSettings, error: settingsError } = useAdminData<Settings>('/admin/settings', refresh)
  const { data: zones, error: zonesError } = useAdminData<Page<Zone>>(`/admin/shipping-zones?page=${page}&pageSize=20`, refresh)
  const [draft, setDraft] = useState<Partial<Settings>>({}), [confirmLaunch, setConfirmLaunch] = useState(false), [confirmWine, setConfirmWine] = useState(false)
  const [newZone, setNewZone] = useState({ code: '', displayName: '', feeVnd: 0, enabled: false })
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const form = { ...settings, ...draft }
  async function saveSettings() { if (!settings) return; setBusy(true); setMessage('')
    try { const saved = await api<Settings>('/admin/settings', { method: 'PUT', body: { version: settings.version,
      salesEnabled: !!form.salesEnabled, wineEnabled: !!form.wineEnabled, businessName: form.businessName || null,
      supportEmail: form.supportEmail || null, supportPhone: form.supportPhone || null, confirmLaunch, confirmWine } })
      setSettings(saved); setDraft({}); setMessage('Store settings saved.') }
    catch { setMessage('Settings could not be saved. Check launch requirements and reload current values.') }
    finally { setBusy(false) }
  }
  async function addZone() { setBusy(true); setMessage('')
    try { await api('/admin/shipping-zones', { method: 'POST', body: newZone }); setNewZone({ code: '', displayName: '', feeVnd: 0, enabled: false }); setRefresh(x => x + 1); setMessage('Delivery zone added.') }
    catch { setMessage('Could not add zone. Check its code, name and nonnegative fee.') }
    finally { setBusy(false) }
  }
  async function toggle(zone: Zone) { setBusy(true); setMessage('')
    try { await api(`/admin/shipping-zones/${zone.id}`, { method: 'PATCH', body: { version: zone.version, enabled: !zone.enabled } }); setRefresh(x => x + 1); setMessage('Delivery zone updated.') }
    catch { setMessage('Zone changed elsewhere. Reload before retrying.') }
    finally { setBusy(false) }
  }
  return <div><h2>Store settings</h2><ErrorMessage message={settingsError} />
    {settings && <div className="admin-form"><label>Business name <input value={form.businessName ?? ''} onChange={e => setDraft({ ...draft, businessName: e.target.value })} /></label>
      <label>Support email <input type="email" value={form.supportEmail ?? ''} onChange={e => setDraft({ ...draft, supportEmail: e.target.value })} /></label>
      <label>Support phone <input value={form.supportPhone ?? ''} onChange={e => setDraft({ ...draft, supportPhone: e.target.value })} /></label>
      <label><input type="checkbox" checked={!!form.salesEnabled} onChange={e => setDraft({ ...draft, salesEnabled: e.target.checked })} /> Enable live sales</label>
      <label><input type="checkbox" checked={confirmLaunch} onChange={e => setConfirmLaunch(e.target.checked)} /> I confirm launch information, products, zones and published policies are approved</label>
      <label><input type="checkbox" checked={!!form.wineEnabled} onChange={e => setDraft({ ...draft, wineEnabled: e.target.checked })} /> Enable age restricted products</label>
      <label><input type="checkbox" checked={confirmWine} onChange={e => setConfirmWine(e.target.checked)} /> I separately confirm age restricted sales requirements</label>
      <button disabled={busy} onClick={() => void saveSettings()}>Save settings</button></div>}
    <p className="notice">Live sales require production configuration, verified business details, a delivery zone, a confirmed sellable SKU and approved policies.</p>
    <h3>Delivery zones</h3><ErrorMessage message={zonesError} />{zones && <><ul className="admin-list">{zones.items.map(zone => <li key={zone.id}>
      <span>{zone.displayName} · {zone.code} · {zone.feeVnd.toLocaleString('en-US')} VND</span>
      <button disabled={busy} onClick={() => void toggle(zone)}>{zone.enabled ? 'Disable' : 'Enable'}</button></li>)}</ul>
      <Pager page={page} pageSize={zones.pageSize} total={zones.total} onChange={setPage} /></>}
    <div className="admin-form"><h4>Add a delivery zone</h4><label>Code <input value={newZone.code} onChange={e => setNewZone({ ...newZone, code: e.target.value.toUpperCase() })} /></label>
      <label>Display name <input value={newZone.displayName} onChange={e => setNewZone({ ...newZone, displayName: e.target.value })} /></label>
      <label>Fee in VND <input type="number" min="0" max="1000000000" value={newZone.feeVnd} onChange={e => setNewZone({ ...newZone, feeVnd: Number(e.target.value) })} /></label>
      <label><input type="checkbox" checked={newZone.enabled} onChange={e => setNewZone({ ...newZone, enabled: e.target.checked })} /> Enabled</label>
      <button disabled={busy || !newZone.code || !newZone.displayName} onClick={() => void addZone()}>Add zone</button></div>
    {message && <p role="status">{message}</p>}
  </div>
}
