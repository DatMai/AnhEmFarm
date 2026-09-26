import { useState } from 'react'
import { ErrorMessage, Pager, type Page, useAdminData } from './operations'
type Entry = { id: string; action: string; targetType: string; targetId: string; changesJson: unknown; createdAt: string }
export function AuditPage() {
  const [page, setPage] = useState(1)
  const { data, error } = useAdminData<Page<Entry>>(`/admin/audit?page=${page}&pageSize=20`)
  return <div><h2>Audit history</h2><ErrorMessage message={error} />{!data && !error && <p role="status">Loading audit history…</p>}
    {data && (data.items.length ? <><ul className="admin-list">{data.items.map(entry => <li key={entry.id}>
      <strong>{entry.action}</strong><span>{entry.targetType} · {entry.targetId}</span><small>{new Date(entry.createdAt).toLocaleString('en-US')}</small></li>)}</ul>
      <Pager page={page} pageSize={data.pageSize} total={data.total} onChange={setPage} /></> : <p>No audit entries yet.</p>)}</div>
}
