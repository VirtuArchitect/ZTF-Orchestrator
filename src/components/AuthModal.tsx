import { X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

interface AuthModalProps {
  open: boolean
  onClose: () => void
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const setCurrentUser = useStore(s => s.setCurrentUser)

  const signIn = async () => {
    if (!username) {
      setError('Enter a username')
      return
    }

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error || 'Sign-in failed')
        return
      }
      const user = await res.json()
      setCurrentUser(user)
      setUsername('')
      setError('')
      onClose()
    } catch (err) {
      setError('Sign-in failed')
      console.error(err)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Sign in</h2>
            <p className="text-sm text-gray-400">Enter your username to use auth and role-based actions.</p>
          </div>
          <button className="btn-ghost p-2" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-gray-300">Username</label>
          <input
            className="input w-full"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="alice"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={signIn}>Sign in</button>
          </div>
        </div>
      </div>
    </div>
  )
}
