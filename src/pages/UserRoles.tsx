import Layout from '../components/Layout'
import { useEffect, useState } from 'react'
import { useStore } from '../store'

type UserRecord = {
  id: string
  username: string
  roles?: string[]
  createdAt?: string
}

type RoleRecord = {
  name: string
  permissions?: string[]
}

export default function UserRoles() {
  const currentUser = useStore(s => s.currentUser)
  const [users, setUsers] = useState<UserRecord[]>([])
  const [roles, setRoles] = useState<RoleRecord[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserRoles, setNewUserRoles] = useState('approver')
  const [newRoleName, setNewRoleName] = useState('admin')
  const [newRolePermissions, setNewRolePermissions] = useState('approve,execute')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('Failed to load users')
      setUsers(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles')
      if (!res.ok) throw new Error('Failed to load roles')
      setRoles(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [])

  const isAdmin = currentUser?.roles?.includes('admin')

  const createUser = async () => {
    setError('')
    if (!newUserName) {
      setError('Enter a username')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUserName, roles: newUserRoles.split(',').map(r => r.trim()).filter(Boolean) }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to create user')
      }
      setNewUserName('')
      setNewUserRoles('approver')
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const createRole = async () => {
    setError('')
    if (!newRoleName) {
      setError('Enter a role name')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, permissions: newRolePermissions.split(',').map(p => p.trim()).filter(Boolean) }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to create role')
      }
      setNewRoleName('')
      setNewRolePermissions('approve,execute')
      fetchRoles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create role')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout title="Users & Roles" subtitle="Manage auth identities and role permissions">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Users</h2>
          <p className="text-sm text-gray-400 mb-4">Create users and assign roles for auth and approvals.</p>
          {currentUser && !isAdmin && (
            <div className="rounded-lg bg-yellow-950 border border-yellow-700 p-3 mb-4 text-sm text-yellow-100">
              Only users with the <strong>admin</strong> role can manage users and roles.
            </div>
          )}
          <div className="space-y-3 mb-4">
            {users.map(user => (
              <div key={user.id} className="rounded-lg border border-border p-3 bg-surface">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-white">{user.username}</div>
                    <div className="text-xs text-gray-400">{user.roles?.join(', ') || 'No roles'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Username</label>
              <input className="input w-full" value={newUserName} onChange={e => setNewUserName(e.target.value)} disabled={!isAdmin} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Roles</label>
              <input className="input w-full" value={newUserRoles} onChange={e => setNewUserRoles(e.target.value)} disabled={!isAdmin} placeholder="approver,admin" />
            </div>
            <button className="btn btn-primary" onClick={createUser} disabled={!isAdmin || loading}>Create user</button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Roles</h2>
          <p className="text-sm text-gray-400 mb-4">Define role permissions to control approval and execution access.</p>
          <div className="space-y-3 mb-4">
            {roles.map(role => (
              <div key={role.name} className="rounded-lg border border-border p-3 bg-surface">
                <div className="font-medium text-white">{role.name}</div>
                <div className="text-xs text-gray-400">{role.permissions?.join(', ') || 'No permissions'}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Role name</label>
              <input className="input w-full" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} disabled={!isAdmin} />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Permissions</label>
              <input className="input w-full" value={newRolePermissions} onChange={e => setNewRolePermissions(e.target.value)} disabled={!isAdmin} placeholder="approve,execute" />
            </div>
            <button className="btn btn-primary" onClick={createRole} disabled={!isAdmin || loading}>Create role</button>
          </div>
          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        </section>
      </div>
    </Layout>
  )
}
