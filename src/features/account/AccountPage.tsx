import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { useSession } from '../auth/session'
import { FormField } from '../../components/FormField'
import { AccountNav, errorText } from './shared'
export function AccountPage() {
  const { user, reload } = useSession()
  const [name, setName] = useState(user!.name),
    [currentPassword, setCurrent] = useState(''),
    [newPassword, setNew] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  async function run(e: FormEvent, password: boolean) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await api(password ? '/auth/change-password' : '/account', {
        method: password ? 'POST' : 'PATCH',
        body: password ? { currentPassword, newPassword } : { name }
      })
      setCurrent('')
      setNew('')
      setMessage(
        password ? 'Password changed. Please sign in again.' : 'Profile saved.'
      )
      await reload()
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="container section commerce">
      <AccountNav />
      <h1>Your account</h1>
      <p>{user!.email}</p>
      <p>{user!.verified ? 'Email verified' : 'Email verification required'}</p>
      {!user!.verified && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await api('/auth/resend-verification', {
                method: 'POST',
                body: { email: user!.email }
              })
              setMessage('Check your inbox for a verification email.')
            } catch (e) {
              setMessage(errorText(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Resend verification
        </button>
      )}
      {message && <p role="status">{message}</p>}
      <form onSubmit={(e) => void run(e, false)}>
        <FormField
          label="Name"
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={busy}>Save profile</button>
      </form>
      <h2>Change password</h2>
      <form onSubmit={(e) => void run(e, true)}>
        <FormField
          label="Current password"
          name="currentPassword"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <FormField
          label="New password"
          name="newPassword"
          type="password"
          minLength={12}
          maxLength={128}
          required
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          autoComplete="new-password"
        />
        <button disabled={busy}>Change password</button>
      </form>
    </section>
  )
}
