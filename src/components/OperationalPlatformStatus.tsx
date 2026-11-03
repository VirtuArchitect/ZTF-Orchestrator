import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { httpFailure, pollReadOnly } from '../utils/readOnlyPolling'
import { Link } from '../router'
import { when } from './ClusterOperations'

export default function OperationalPlatformStatus({ health, backupAt, unavailable }: {
  health: { status: string; installed?: { versionTag?: string } } | null; backupAt?: string; unavailable: boolean
}) {
  const admin = useStore(s => s.user?.role === 'admin')
  const [service, setService] = useState<boolean | null>(null), [stale, setStale] = useState(false)
  useEffect(() => {
    if (!admin) return
    return pollReadOnly(async signal => {
      const response = await apiFetch('/api/appliance/updates/control', { signal })
      if (!response.ok) throw httpFailure(response, 'Update service status unavailable')
      const result = await response.json()
      if (typeof result.available !== 'boolean') throw new Error('Update service status unavailable')
      return result.available as boolean
    }, value => { setService(value); setStale(false) }, () => setStale(true))
  }, [admin])
  return <div className="card flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-400" aria-label="Appliance operational status">
    <p>Application health endpoint: <span className={unavailable || !health || health.status !== 'healthy' ? 'text-amber-400' : 'text-emerald-400'}>{unavailable ? 'Unavailable / stale' : health?.status || 'Not collected'}</span></p>
    <p>Latest database backup record: {admin ? when(backupAt) : 'Administrator view'} <span className="text-gray-500">(restore not implied)</span></p>
    <p>Host update service: {admin ? stale ? 'Status unavailable / stale' : service === null ? 'Checking' : service ? 'Online' : 'Unavailable / not configured' : 'Administrator view'}</p>
    <p>Installed build: {health?.installed?.versionTag || 'Not reported'}</p>
    <Link className="text-nutanix-cyan" to="/appliance">Appliance operations</Link>
  </div>
}
