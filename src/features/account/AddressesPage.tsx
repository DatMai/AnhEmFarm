import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import {
  AccountNav,
  AddressFields,
  blankAddress,
  errorText,
  Pager,
  usePrivate,
  type Address,
  type Page,
  type SavedAddress
} from './shared'
export function AddressesPage() {
  const [page, setPage] = useState(1),
    [address, setAddress] = useState<Address>({ ...blankAddress }),
    [editing, setEditing] = useState<SavedAddress | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const query = usePrivate<Page<SavedAddress>>(
    `/account/addresses?page=${page}`
  )
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(
        editing ? `/account/addresses/${editing.id}` : '/account/addresses',
        {
          method: editing ? 'PATCH' : 'POST',
          body: { ...address, ...(editing ? { version: editing.version } : {}) }
        }
      )
      setEditing(null)
      setAddress({ ...blankAddress })
      await query.refetch()
    } catch (e) {
      setError(errorText(e))
      await query.refetch()
    } finally {
      setBusy(false)
    }
  }
  async function remove(a: SavedAddress) {
    setBusy(true)
    setError('')
    try {
      await api(`/account/addresses/${a.id}`, {
        method: 'DELETE',
        body: { version: a.version }
      })
      await query.refetch()
    } catch (e) {
      setError(errorText(e))
      await query.refetch()
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="container section commerce">
      <AccountNav />
      <h1>Address book</h1>
      {error && <p role="alert">{error}</p>}
      {query.isError && (
        <button onClick={() => void query.refetch()}>Retry addresses</button>
      )}
      {query.data?.items.map((a) => (
        <article className="commerce-card" key={a.id}>
          <h2>{a.recipient}</h2>
          <p>
            {a.line1} {a.line2}
          </p>
          <button
            disabled={busy}
            onClick={() => {
              const { id: _id, version: _version, ...fields } = a
              setEditing(a)
              setAddress(fields)
            }}
          >
            Edit address
          </button>
          <button disabled={busy} onClick={() => void remove(a)}>
            Delete address
          </button>
        </article>
      ))}
      <Pager page={page} total={query.data?.total ?? 0} change={setPage} />
      <h2>{editing ? 'Edit address' : 'Add address'}</h2>
      <form onSubmit={save}>
        <AddressFields value={address} change={setAddress} disabled={busy} />
        <button disabled={busy}>Save address</button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setAddress({ ...blankAddress })
            }}
          >
            Cancel editing
          </button>
        )}
      </form>
    </section>
  )
}
