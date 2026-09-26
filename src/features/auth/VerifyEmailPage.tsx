import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
export function VerifyEmailPage() {
  const [params] = useSearchParams(), [state, setState] = useState<'working' | 'success' | 'error'>('working')
  const token = params.get('token')
  const submitted = useRef(false)
  useEffect(() => {
    window.history.replaceState({}, '', '/verify-email')
    if (!token) { setState('error'); return }
    if (submitted.current) return
    submitted.current = true
    api<void>('/auth/verify-email', { method: 'POST', body: { token } }).then(() => setState('success')).catch(() => setState('error'))
  }, [token])
  return <section className="container auth-section"><div className="auth-panel"><h1>Email verification</h1><p role="status">{state === 'working' ? 'Verifying your email…' : state === 'success' ? 'Your email is verified. You can sign in.' : 'This verification link is invalid or expired.'}</p><Link to="/login">Sign in</Link></div></section>
}
