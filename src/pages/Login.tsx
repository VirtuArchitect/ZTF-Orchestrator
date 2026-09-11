import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from '../router'
import { Eye, EyeOff } from 'lucide-react'
import { useStore } from '../store'
import './Login.css'

export default function Login() {
  const { setAuth, sessionToken } = useStore()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Already authenticated — skip the login page entirely
  if (sessionToken) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const resp = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        setError(data.error || 'Invalid credentials')
        return
      }
      const data = await resp.json()
      setAuth(data.token, data.user)
      navigate('/')           // ← redirect to dashboard after login
    } catch {
      setError('Could not reach the server. Is it running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-card" aria-labelledby="login-heading">
          <header className="login-brand">
            <img src={`${import.meta.env.BASE_URL}zto-logo-mark.svg`} alt="" width="72" height="72" />
            <div>
              <p className="login-product">ZTF-Orchestrator</p>
              <p className="login-tagline">Infrastructure orchestration</p>
            </div>
          </header>
          <form onSubmit={submit} className="login-form" aria-busy={loading}>
            <div className="login-intro">
              <h1 id="login-heading">Sign in</h1>
              <p>Access your orchestration workspace.</p>
            </div>

            {error && (
              <div id="login-error" role="alert" className="login-error">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-username">Username</label>
              <input
                id="login-username"
                className="login-input"
                aria-describedby={error ? 'login-error' : undefined}
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div>
              <label htmlFor="login-password">Password</label>
              <div className="relative">
                <input
                  id="login-password"
                  className="login-input login-password"
                  aria-describedby={error ? 'login-error' : undefined}
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  aria-controls="login-password"
                  disabled={loading}
                  onClick={() => setShowPw(v => !v)}
                >
                  {showPw ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="login-help">Need access? Contact your administrator.</p>
        </section>
        <footer className="login-footer">
          <span>ZTF-Orchestrator</span>
          <span aria-hidden="true">|</span>
          <a href="https://github.com/VirtuArchitect/ZTF-Orchestrator/tree/main/docs" target="_blank" rel="noopener noreferrer">Documentation</a>
        </footer>
      </div>
    </main>
  )
}
