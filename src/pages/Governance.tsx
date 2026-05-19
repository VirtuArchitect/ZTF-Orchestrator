import Layout from '../components/Layout'
import { ShieldCheck, Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStore } from '../store'

type Request = {
  id: string
  title: string
  details?: string
  requester?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export default function Governance() {
  const [items, setItems] = useState<Request[]>([])
  const [loading, setLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [users, setUsers] = useState<Array<{id:string; username:string; roles?:string[]}>>([])
  const currentUser = useStore(s => s.currentUser)
  const setCurrentUser = useStore(s => s.setCurrentUser)
  const [newUserName, setNewUserName] = useState('')
  const [newUserRoles, setNewUserRoles] = useState('approver')

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/governance/requests')
      const data = await r.json()
      setItems(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const r = await fetch('/api/users')
      const data = await r.json()
      setUsers(data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => {
    fetchRequests()
    fetchUsers()
  }, [])

  const submit = async () => {
    if (!title) return
    const headers: any = { 'Content-Type': 'application/json' }
    if (currentUser) {
      headers['x-user'] = currentUser.username
      if (currentUser.roles && currentUser.roles.length) headers['x-role'] = currentUser.roles[0]
    }
    const r = await fetch('/api/governance/requests', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, details, requester: currentUser?.username || 'local-user' }),
    })
    const created = await r.json()
    setItems(prev => [created, ...prev])
    setTitle('')
    setDetails('')
  }

  const userHasRole = (role: string) => !!currentUser?.roles?.includes(role)

  const act = async (id: string, action: 'approve' | 'reject') => {
    const headers: any = { 'Content-Type': 'application/json' }
    if (currentUser) {
      headers['x-user'] = currentUser.username
      if (currentUser.roles && currentUser.roles.length) headers['x-role'] = currentUser.roles[0]
    }
    const body = action === 'reject' ? JSON.stringify({ reason: 'Rejected from UI' }) : undefined
    const r = await fetch(`/api/governance/${id}/${action}`, { method: 'POST', headers, body })
    const updated = await r.json()
    setItems(prev => prev.map(p => (p.id === updated.id ? updated : p)))
  }

  const createUser = async () => {
    if (!newUserName) return
    const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUserName, roles: newUserRoles.split(',').map(s=>s.trim()) }) })
    if (r.ok) {
      setNewUserName('')
      setNewUserRoles('approver')
      fetchUsers()
    } else {
      const err = await r.json(); alert(err.error || 'failed')
    }
  }

  const selectUser = (u: {id:string; username:string; roles?:string[]} | null) => {
    setCurrentUser(u)
  }

  return (
    <Layout title="Governance" subtitle="Manage governance requests and approvals">
      <div className="max-w-3xl">
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-100 mb-2">Current User</h3>
          <div className="flex items-center gap-4 mb-2">
            <div>
              <div className="text-sm text-gray-300">{currentUser ? currentUser.username : 'Not signed in'}</div>
              <div className="text-xs text-gray-400">Roles: {currentUser?.roles?.join(', ') || '-'}</div>
            </div>
            <div className="ml-auto">
              <button className="btn" onClick={() => selectUser(null)}>Sign out</button>
            </div>
          </div>

          <div className="mb-2">
            <div className="text-sm text-gray-300 mb-1">Select user:</div>
            <div className="flex gap-2 flex-wrap">
              {users.map(u => (
                <button key={u.username} className="btn" onClick={() => selectUser(u)}>{u.username}</button>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="text-sm text-gray-300">Create user</div>
            <div className="flex gap-2 mt-2">
              <input className="input" placeholder="username" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
              <input className="input" placeholder="roles (comma)" value={newUserRoles} onChange={e => setNewUserRoles(e.target.value)} />
              <button className="btn btn-primary" onClick={createUser}>Create</button>
            </div>
          </div>
        </div>
        <div className="card mb-4">
          <h3 className="font-semibold text-gray-100 mb-2">New Governance Request</h3>
          {!currentUser && (
            <p className="text-sm text-yellow-300 mb-3">Sign in to create governance requests with an authenticated user.</p>
          )}
          <input className="input w-full mb-2" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} disabled={!currentUser} />
          <textarea className="input w-full mb-2" placeholder="Details" value={details} onChange={e => setDetails(e.target.value)} disabled={!currentUser} />
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={submit} disabled={!currentUser}>Create Request</button>
            <button className="btn" onClick={() => { setTitle(''); setDetails('') }}>Clear</button>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-2">Governance Requests</h3>
          {loading && <p className="text-sm text-gray-400">Loading…</p>}
          {!loading && items.length === 0 && <p className="text-sm text-gray-400">No governance requests yet.</p>}

          <div className="space-y-2 mt-2">
            {items.map(it => (
              <div key={it.id} className="p-3 bg-surface border rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-gray-400">{it.requester} • {new Date(it.createdAt).toLocaleString()}</div>
                    {it.details && <div className="text-sm mt-2 text-gray-300">{it.details}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-sm">
                      {it.status === 'pending' && <span className="px-2 py-1 rounded bg-yellow-600 text-xs">Pending</span>}
                      {it.status === 'approved' && <span className="px-2 py-1 rounded bg-green-600 text-xs">Approved</span>}
                      {it.status === 'rejected' && <span className="px-2 py-1 rounded bg-red-600 text-xs">Rejected</span>}
                    </div>
                    {it.status === 'pending' && (
                      <div className="flex gap-2">
                        {userHasRole('approver') ? (
                          <>
                            <button className="btn btn-success" onClick={() => act(it.id, 'approve')}><Check className="inline" /> Approve</button>
                            <button className="btn btn-danger" onClick={() => act(it.id, 'reject')}><X className="inline" /> Reject</button>
                          </>
                        ) : (
                          <span className="text-xs text-yellow-300">Approval requires approver role.</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  )
}
