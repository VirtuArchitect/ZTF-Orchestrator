import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { AlertTriangle, Check, Clock, KeyRound, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react'

type UserRecord = {
  username: string
  role: 'admin' | 'operator' | 'viewer'
  created_at?: string
  last_login_at?: string
  password_changed_at?: string
  disabled?: boolean
  mfa_supported?: boolean
  sso_supported?: boolean
  active_sessions_supported?: boolean
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
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')

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

  const deleteUser = async () => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.username) return
    const res = await apiFetch(`/api/users/${deleteTarget.username}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); return }
    setDeleteTarget(null)
    setDeleteConfirm('')
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
    <Layout title="Users & Roles" subtitle="Manage user accounts, role assignments, and local identity posture">
      <div className="max-w-5xl space-y-6">

        {!isAdmin && (
          <div className="card border-amber-700/30 bg-amber-900/5 text-sm text-amber-400">
            User management requires the <strong>admin</strong> role.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <IdentityPostureCard icon={Shield} label="MFA / SSO" value="Not configured" detail="Local password authentication only in this release." tone="warning" />
          <IdentityPostureCard icon={Clock} label="Active sessions" value="Not exposed" detail="Admins can expire sessions through token TTL or restart/restore workflows." tone="neutral" />
          <IdentityPostureCard icon={KeyRound} label="Password history" value="Reset timestamp" detail="Password reset time is tracked; password history enforcement is not supported." tone="neutral" />
        </div>

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
                <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-200 truncate">{u.username}</p>
                      <span className={u.disabled ? 'badge-red text-xs' : 'badge-green text-xs'}>
                        {u.disabled ? 'disabled' : 'active'}
                      </span>
                    </div>
                    <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-gray-500 sm:grid-cols-2 xl:grid-cols-4">
                      <span>Created {formatDate(u.created_at)}</span>
                      <span>Last login {formatDate(u.last_login_at)}</span>
                      <span>Password reset {formatDate(u.password_changed_at)}</span>
                      <span>MFA/SSO not supported</span>
                    </div>
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
                      onClick={() => { setDeleteTarget(u); setDeleteConfirm(''); setError('') }}
                      className="btn-ghost p-1.5 text-gray-500 hover:text-red-400"
                      title="Delete user"
                      aria-label={`Delete user ${u.username}`}
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
                      {resetSaving ? 'Saving...' : 'Save'}
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

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4">
            <div className="w-full max-w-lg rounded-xl border border-red-700/40 bg-gray-950 p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-2 text-red-300">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-100">Delete user account</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    This removes the local account for <span className="font-mono text-gray-200">{deleteTarget.username}</span>. Existing audit records remain, but the user will no longer be able to sign in.
                  </p>
                </div>
              </div>
              <label className="mt-5 block">
                <span className="label">Type the username to confirm</span>
                <input
                  className="input font-mono"
                  value={deleteConfirm}
                  onChange={event => setDeleteConfirm(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
                <button onClick={deleteUser} disabled={deleteConfirm !== deleteTarget.username} className="btn-danger gap-1.5">
                  <Trash2 size={14} />
                  Delete User
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  )
}

function formatDate(value?: string) {
  if (!value) return 'never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function IdentityPostureCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Shield
  label: string
  value: string
  detail: string
  tone: 'neutral' | 'warning'
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <Icon size={17} className={tone === 'warning' ? 'mt-0.5 flex-shrink-0 text-yellow-300' : 'mt-0.5 flex-shrink-0 text-nutanix-cyan'} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</p>
          <p className="mt-1 text-sm font-semibold text-gray-100">{value}</p>
          <p className="mt-1 text-xs text-gray-500">{detail}</p>
        </div>
      </div>
    </div>
  )
}
