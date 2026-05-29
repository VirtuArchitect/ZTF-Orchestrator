import { useState, FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useStore } from '../store'

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
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/veridian-mark.svg" alt="ZeroTouch" className="w-14 h-14 rounded-2xl mb-4" />
          <h1 className="text-2xl font-bold text-gray-100">ZTF Orchestrator</h1>
          <p className="text-sm text-gray-500 mt-1">Enterprise ZeroTouch operations console</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} className="card space-y-4">
          <h2 className="font-semibold text-gray-200 text-center">Sign in</h2>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="label">Username</label>
            <input
              className="input"
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
            <label className="label">Password</label>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                onClick={() => setShowPw(v => !v)}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center gap-2">
            <LogIn size={14} />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-600 mt-6">
          Default credentials are printed in the server console on first start.
        </p>
      </div>
    </div>
  )
}
