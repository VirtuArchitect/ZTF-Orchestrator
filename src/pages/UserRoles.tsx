import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { Trash2, Plus, RefreshCw, KeyRound, Check, X } from 'lucide-react'

type UserRecord = {
  username: string
  role: 'admin' | 'operator' | 'viewer'
  created_at?: string
}

const ROLES = ['admin', 'operator', 'viewer'] as const

export default function UserRoles() {
  const currentUser = useStore(s => s.user)
  const isAdmin     = currentUser?.role === 'admin'

  const [users,        setUsers]        = useState<UserRecord[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [newUsername,  setNewUsername]  = useState('')
  const [newPassword,  setNewPassword]  = useState('')
  const [newRole,      setNewRole]      = useState<typeof ROLES[number]>('operator')
  const [resetTarget,  setResetTarget]  = useState<string | null>(null)
  const [resetPw,      setResetPw]      = useState('')
  const [resetSaving,  setResetSaving]  = useState(false)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const createUser = async () => {
    setError('')
    if (!newUsername || !newPassword) { setError('Username and password are required'); return }
    const res = await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
    setNewUsername('')
    setNewPassword('')
    fetchUsers()
  }

  const deleteUser = async (username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return
    const res = await apiFetch(`/api/users/${username}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
    fetchUsers()
  }

  const changeRole = async (username: string, role: string) => {
    const res = await apiFetch(`/api/users/${username}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
    fetchUsers()
  }

  const savePassword = async () => {
    if (!resetPw || !resetTarget) { setError('New password is required'); return }
    setResetSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/users/${resetTarget}`, {
        method: 'PUT',
        body: JSON.stringify({ password: resetPw }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
      setResetTarget(null)
      setResetPw('')
    } finally {
      setResetSaving(false)
    }
  }

  return (
    <Layout title="Users & Roles" subtitle="Manage user accounts and role assignments">
      <div className="max-w-2xl space-y-6">

        {!isAdmin && (
          <div className="card border-amber-700/30 bg-amber-900/5 text-sm text-amber-400">
            User management requires the <strong>admin</strong> role.
          </div>
        )}

        {/* User list */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-100">Users</h3>
            <button onClick={fetchUsers} disabled={loading} className="btn-ghost p-1.5">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-2">
            {users.map(u => (
              <div key={u.username}
                className="rounded-lg bg-gray-900 border border-border/50 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{u.username}</p>
                    {u.created_at && (
                      <p className="text-xs text-gray-500">
                        Created {new Date(u.created_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {isAdmin ? (
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.username, e.target.value)}
                      className="input text-xs py-1 px-2 w-28"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400 px-2 py-1 rounded bg-gray-800 border border-border">
                      {u.role}
                    </span>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => { setResetTarget(resetTarget === u.username ? null : u.username); setResetPw(''); setError('') }}
                      className="btn-ghost p-1.5 text-gray-500 hover:text-nutanix-cyan"
                      title="Reset password"
                    >
                      <KeyRound size={14} />
                    </button>
                  )}

                  {isAdmin && u.username !== currentUser?.username && (
                    <button
                      onClick={() => deleteUser(u.username)}
                      className="btn-ghost p-1.5 text-gray-500 hover:text-red-400"
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Inline password reset form */}
                {isAdmin && resetTarget === u.username && (
                  <div className="flex items-center gap-2 px-3 pb-3 pt-0 border-t border-border/40">
                    <input
                      className="input text-xs flex-1"
                      type="password"
                      placeholder="New password"
                      value={resetPw}
                      onChange={e => setResetPw(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && savePassword()}
                      autoFocus
                    />
                    <button
                      onClick={savePassword}
                      disabled={resetSaving || !resetPw}
                      className="btn-primary text-xs px-3 py-1.5 gap-1"
                    >
                      <Check size={12} />
                      {resetSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setResetTarget(null); setResetPw('') }}
                      className="btn-ghost p-1.5 text-gray-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!loading && users.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No users found</p>
            )}
          </div>
        </div>

        {/* Create user */}
        {isAdmin && (
          <div className="card">
            <h3 className="font-semibold text-gray-100 mb-4">Create User</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Username</label>
                <input className="input" value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  placeholder="alice" />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters" />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={newRole}
                  onChange={e => setNewRole(e.target.value as typeof ROLES[number])}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button onClick={createUser} className="btn-primary gap-1.5">
                <Plus size={14} /> Create User
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  )
}
