import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Shield, X } from 'lucide-react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

type Session = {
  id: string; username: string; role: string; signedInAt: string | null
  lastActivityAt: string | null; expiresAt: string; isCurrent: boolean; recentlyActive: boolean
}
type Snapshot = {
  sessions: Session[]; observedAt: string; recentActivityWindowSeconds: number
  summary: { uniqueUsers: number; totalSessions: number; recentlyActiveUsers: number; recentlyActiveSessions: number }
}
const date = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not tracked'

export default function UserSessions() {
  const isAdmin = useStore(s => s.user?.role === 'admin')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<Session | null>(null)
  const [revoking, setRevoking] = useState(false)
  const sequence = useRef(0)
  const load = useCallback(async () => {
    if (!isAdmin) return
    const request = ++sequence.current
    setLoading(true)
    try {
      const response = await apiFetch('/api/auth/sessions')
      if (!response.ok) throw new Error('Session information is unavailable. Check your administrator access and retry.')
      const body: Snapshot = await response.json()
      if (!body.summary || !Array.isArray(body.sessions)) throw new Error('Session information is unavailable. Update the backend and retry.')
      if (request === sequence.current) { setSnapshot(body); setError('') }
    } catch (e) {
      if (request === sequence.current) { setSnapshot(null); setError(e instanceof Error ? e.message : 'Session information is unavailable.') }
    } finally { if (request === sequence.current) setLoading(false) }
  }, [isAdmin])
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15_000)
    return () => { window.clearInterval(timer); sequence.current++ }
  }, [load])
  if (!isAdmin) return null
  const revoke = async () => {
    if (!target) return
    setRevoking(true)
    setError('')
    try {
      const response = await apiFetch(`/api/auth/sessions/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      if (!response.ok) {
        setError(response.status === 404 ? 'That session has expired or was already revoked. Refresh the list.' : 'Session revocation failed. Check administrator access and refresh before retrying.')
        return
      }
      const result = await response.json()
      setTarget(null)
      if (result.currentSession) {
        useStore.getState().clearAuth()
        window.location.href = `${import.meta.env.BASE_URL}login`
      } else await load()
    } catch { setError('Session revocation could not be confirmed. Refresh the list before retrying.') }
    finally { setRevoking(false) }
  }
  return <section className="card space-y-4" aria-labelledby="sessions-title" data-testid="sessions-panel">
    <div className="flex items-start justify-between gap-3">
      <div><h3 id="sessions-title" className="font-semibold text-gray-100">Sessions</h3>
        <p className="mt-1 text-xs text-gray-500">Administrator only · unexpired sign-ins · refreshes every 15 seconds</p></div>
      <button className="btn-secondary gap-1.5" onClick={() => { void load() }} disabled={loading} aria-label="Refresh sessions"><RefreshCw size={14} />Refresh</button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Session summary">
      {[
        ['Signed-in users', snapshot?.summary.uniqueUsers], ['Total sessions', snapshot?.summary.totalSessions],
        ['Recently active users', snapshot?.summary.recentlyActiveUsers],
      ].map(([name, value]) => <div key={name} className="rounded-lg border border-border p-3"><p className="text-xs text-gray-500">{name}</p><p className="mt-1 text-2xl font-semibold text-gray-100">{value ?? '—'}</p></div>)}
    </div>
    <p className="text-xs text-gray-500">Recently active means reported console interaction within the last {Math.round((snapshot?.recentActivityWindowSeconds || 300) / 60)} minutes. Background polling does not count. An unexpired session does not prove its browser is open. Activity never extends expiry.</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {snapshot && <>
      <p className="text-xs text-gray-500">Last refreshed {date(snapshot.observedAt)}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs">
        <thead><tr className="border-b border-border text-gray-500">{['User / session', 'Role', 'Signed in', 'Last activity', 'Expires', 'Activity', 'Action'].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{snapshot.sessions.map(session => <tr key={session.id} className="border-b border-border/50">
          <td className="p-2"><span className="font-medium text-gray-200">{session.username}</span><span className="block font-mono text-gray-500">{session.id.slice(0, 8)}{session.isCurrent ? ' · This session' : ''}</span></td>
          <td className="p-2">{session.role}</td><td className="p-2">{date(session.signedInAt)}</td><td className="p-2">{date(session.lastActivityAt)}</td><td className="p-2">{date(session.expiresAt)}</td>
          <td className="p-2">{session.recentlyActive ? 'Recently active' : session.lastActivityAt ? 'Idle' : 'Not tracked'}</td>
          <td className="p-2"><button className="btn-danger text-xs" aria-label={`Revoke session ${session.id} for ${session.username}`} onClick={() => setTarget(session)}>Revoke</button></td>
        </tr>)}</tbody>
      </table></div>
      {snapshot.sessions.length === 0 && <p className="text-sm text-gray-500">No unexpired sessions were returned.</p>}
    </>}
    {target && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="revoke-session-title" className="w-full max-w-lg rounded-xl border border-red-700/40 bg-gray-950 p-5 shadow-xl">
        <div className="flex justify-between gap-3"><h3 id="revoke-session-title" className="text-lg font-semibold text-gray-100"><Shield className="mr-2 inline" size={18} />Revoke this session?</h3><button aria-label="Close session confirmation" disabled={revoking} onClick={() => setTarget(null)}><X size={18} /></button></div>
        <p className="mt-3 text-sm text-gray-400">User: {target.username} · {target.role}<br />Signed in: {date(target.signedInAt)}<br />Session: {target.id.slice(0, 8)}</p>
        <p className="mt-3 text-sm text-amber-400"><AlertTriangle className="mr-1 inline" size={14} />{target.isCurrent ? 'This signs you out of this browser session.' : 'This removes access for the selected sign-in.'} In-flight requests may finish; durable jobs continue. The action is audited.</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" disabled={revoking} onClick={() => setTarget(null)}>Cancel</button><button className="btn-danger" disabled={revoking} onClick={() => { void revoke() }}>{revoking ? 'Revoking...' : target.isCurrent ? 'Revoke and sign out' : 'Confirm revocation'}</button></div>
      </div>
    </div>}
  </section>
}
