import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../lib/api'
import { FormField } from '../../components/FormField'
import { useSession } from './session'
type Mode = 'login' | 'register' | 'forgot' | 'reset'
const titles: Record<Mode, string> = { login: 'Sign in', register: 'Create account', forgot: 'Forgot password', reset: 'Reset password' }
function localNext(value: string | null): string { return value && /^\/(?:products(?:\/[a-z0-9-]+)?|account|cart|checkout)(?:\?.*)?$/.test(value) ? value : '/' }
export function AuthPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams(), navigate = useNavigate(), session = useSession()
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string[]>>({})
  const [values, setValues] = useState({ name: '', email: '', password: '' })
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    setBusy(true); setMessage(''); setError(''); setFields({})
    try {
      if (mode === 'login') { await session.login(values.email, values.password); navigate(localNext(params.get('next')), { replace: true }) }
      else if (mode === 'register') { await api('/auth/register', { method: 'POST', body: values }); setMessage('If your registration is accepted, check your email for a verification link.') }
      else if (mode === 'forgot') { await api('/auth/forgot-password', { method: 'POST', body: { email: values.email } }); setMessage('If this address has an account, a reset link will be sent.') }
      else { const token = params.get('token'); if (!token) throw new ApiError(400, 'TOKEN_MISSING', 'This reset link is invalid.'); await api('/auth/reset-password', { method: 'POST', body: { token, password: values.password } }); window.history.replaceState({}, '', '/reset-password'); setMessage('Password changed. You can now sign in.') }
      setValues(current => ({ ...current, password: '' }))
    } catch (caught) { if (caught instanceof ApiError) { setError(caught.message); setFields(caught.fields ?? {}) } else setError('Please try again later.') }
    finally { setBusy(false) }
  }
  return <section className="container auth-section"><div className="auth-panel"><span className="section-kicker">ANHEMFARM ACCOUNT</span><h1>{titles[mode]}</h1>{message && <p role="status" className="success-message">{message}</p>}{error && <p role="alert" className="error-message">{error}</p>}<form onSubmit={submit}>{mode === 'register' && <FormField name="name" label="Name" value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} required autoComplete="name" error={fields.name?.[0]} />}{mode !== 'reset' && <FormField name="email" type="email" label="Email" value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} required autoComplete="email" error={fields.email?.[0]} />}{mode !== 'forgot' && <FormField name="password" type="password" label={mode === 'reset' ? 'New password' : 'Password'} value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} required minLength={mode === 'login' ? 1 : 12} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} error={fields.password?.[0]} />}<button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : titles[mode]}</button></form><div className="auth-links">{mode !== 'login' && <Link to="/login">Sign in</Link>}{mode !== 'register' && <Link to="/register">Create account</Link>}{mode === 'login' && <Link to="/forgot-password">Forgot password?</Link>}</div></div></section>
}
