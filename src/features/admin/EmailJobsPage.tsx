import { ErrorMessage, useAdminData } from './operations'
type Jobs = { pending: number; exhaustedCount: number; exhausted: Array<{ id: string; template: string; attempts: number; lastErrorCode: string | null }> }
export function EmailJobsPage() {
  const { data, error } = useAdminData<Jobs>('/admin/email-jobs')
  return <div><h2>Email delivery</h2><ErrorMessage message={error} />{!data && !error && <p role="status">Loading email jobs…</p>}
    {data && <><p>Pending: {data.pending} · Failed permanently: {data.exhaustedCount}</p>
      {data.exhausted.length ? <ul className="admin-list">{data.exhausted.map(job => <li key={job.id}>
        <strong>{job.template}</strong><span>{job.attempts} attempts</span><small>{job.lastErrorCode || 'No error code'}</small></li>)}</ul> : <p>No permanently failed jobs.</p>}</>}</div>
}
