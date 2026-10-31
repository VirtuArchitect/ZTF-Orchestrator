import { useEffect, useState } from 'react'
import { apiFetch, authHeaders } from '../utils/api'

interface PackageRecord { id: string; version: string; target?: string; packageId?: string; packageAvailable?: boolean }
interface Plan {
  id: string; purpose?: string; version: string; packageId: string; ready: boolean; backupBytes: number
  disks: Array<{ location: string; freeBytes: number; requiredBytes: number; ok: boolean }>
  cleanup: Array<{ id: string; label: string; sizeBytes: number }>
}
interface Operation {
  id: string; action: string; status: string; stage?: string; message?: string; plan?: Plan
  events?: Array<{ stage: string; message: string; at: number }>
  verification?: { image: string; imageId: string; database: string }
}
interface HostStatus {
  available: boolean; maintenance?: boolean; message?: string; operation?: Operation
  rollback?: { version: string; image: string; receipt: string }
}
const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GiB`
const terminal = ['succeeded', 'failed', 'interrupted', 'rejected']

function requestIdentity() {
  // randomUUID is unavailable on HTTP appliances; getRandomValues still works.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function GuidedApplianceUpdate({ updates, isAdmin, onImported }: { updates: PackageRecord[]; isAdmin: boolean; onImported: () => Promise<void> }) {
  const [host, setHost] = useState<HostStatus | null>(null)
  const [selected, setSelected] = useState('')
  const [cleanup, setCleanup] = useState<string[]>([])
  const [approval, setApproval] = useState('')
  const [rollbackApproval, setRollbackApproval] = useState('')
  const [compatible, setCompatible] = useState(false)
  const [error, setError] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [pending, setPending] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const packages = updates.filter(item => item.target === 'ztf-orchestrator' && item.packageId && item.packageAvailable !== false)
  const record = packages.find(item => item.id === selected)
  const op = host?.operation
  const plan = op?.status === 'succeeded' && (op.action === 'storage' || (op.action === 'preflight' && op.plan?.packageId === record?.packageId)) ? op.plan : undefined
  const busy = uploading || !!pending || (!!op && !terminal.includes(op.status))

  useEffect(() => {
    if (!isAdmin) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function poll() {
      try {
        const response = await apiFetch('/api/appliance/updates/control', { signal: controller.signal })
        if (!response.ok) throw new Error('status')
        const value = await response.json() as HostStatus
        if (!stopped) {
          setHost(value)
          setReconnecting(false)
          setPending(previous => value.operation?.id === previous ? '' : previous)
        }
      } catch {
        if (!stopped) setReconnecting(true)
      } finally {
        if (!stopped) timer = setTimeout(poll, 5000)
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer); controller.abort() }
  }, [isAdmin])

  async function command(action: string, payload: object) {
    const requestId = requestIdentity()
    setPending(requestId)
    setError('')
    try {
      const response = await apiFetch('/api/appliance/updates/control', { method: 'POST', body: JSON.stringify({ action, requestId, ...payload }) })
      const value = await response.json().catch(() => ({}))
      if (!response.ok) { setPending(''); setError(value.error || `Request rejected (HTTP ${response.status}). Refresh status before retrying.`) }
      else { setApproval(''); setCleanup([]) }
    } catch {
      setError('Submission could not be confirmed. Do not submit again. Reconnect and review the retained operation report and pending request before continuing.')
    }
  }

  async function upload() {
    if (!file) return
    setUploading(true)
    setError('')
    const form = new FormData()
    form.append('package', file)
    try {
      const response = await fetch('/api/appliance/updates/import-package', { method: 'POST', headers: authHeaders(), body: form })
      const value = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(value.error || `Upload failed (HTTP ${response.status}). Check available space and your session.`)
      if (typeof value.id !== 'string') throw new Error('Import did not return an update record. Refresh the package list; no installation was requested.')
      await onImported()
      setSelected(value.id)
      setFile(null)
      setApproval('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Upload could not be confirmed. Refresh the imported package list before retrying.')
    } finally { setUploading(false) }
  }

  if (!isAdmin) return <div className="card text-sm text-gray-400">An administrator can install appliance updates. Existing release information remains available below.</div>
  return <section className="card space-y-4" aria-label="Guided appliance update">
    <div>
      <h2 className="font-semibold text-gray-100">Guided Appliance Update</h2>
      <p className="text-sm text-gray-400">Upload → Check → Approve → Update → Verify</p>
      <p className="text-xs text-gray-500 mt-2">Import a complete offline ZIP or select an already imported package. Framework updates retain their existing staging procedure.</p>
    </div>
    {reconnecting && <p role="status" className="text-amber-500">Reconnecting to the appliance. The host service continues independently; do not resubmit the update.</p>}
    {!host?.available && <p role="status" className="text-amber-500">{host?.message || 'Checking the host update service…'}</p>}
    {host?.maintenance && <p className="text-amber-500">Update maintenance is active. New automation is blocked until verification or recovery is complete.</p>}
    {error && <p role="alert" className="text-red-500">{error}</p>}
    <button className="btn-secondary" disabled={!host?.available || busy || !!host.maintenance || reconnecting} onClick={() => void command('storage', {})}>Review Storage Before Upload</button>
    <label className="block text-sm">1. Upload offline appliance update ZIP
      <input type="file" className="input mt-2" accept=".zip,application/zip" disabled={busy || !!host?.maintenance} onChange={event => setFile(event.target.files?.[0] || null)} />
    </label>
    <button className="btn-secondary" disabled={!file || busy || !!host?.maintenance} onClick={() => void upload()}>{uploading ? 'Uploading and verifying package…' : 'Upload and Verify ZIP'}</button>
    <label className="block text-sm">2. Select imported appliance package
      <select className="input mt-2" value={selected} disabled={busy || !!host?.maintenance} onChange={event => { setSelected(event.target.value); setApproval(''); setCleanup([]) }}>
        <option value="">Select an imported update ZIP</option>
        {packages.map(item => <option key={item.id} value={item.id}>{item.version} · {item.packageId?.slice(0, 8)}</option>)}
      </select>
    </label>
    <button className="btn-secondary" disabled={!record || !host?.available || busy || !!host.maintenance || reconnecting} onClick={() => void command('preflight', { updateId: selected })}>Check Readiness</button>
    {plan && <div className="space-y-3 border-t border-border pt-4">
      <h3 className="font-medium">{plan.purpose === 'storage' ? 'Storage review (installation not approved)' : `Readiness: ${plan.ready ? 'Ready for review' : 'Needs attention'}`}</h3>
      <p className="text-sm text-gray-400">Estimated backup allowance: {size(plan.backupBytes)}. Imported update caches and preload bundles are excluded; keep their original packages separately.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Location</th><th>Available</th><th>Required allowance</th><th>Result</th></tr></thead><tbody>
        {plan.disks.map(disk => <tr key={disk.location}><td className="font-mono py-2">{disk.location}</td><td className="text-center">{size(disk.freeBytes)}</td><td className="text-center">{size(disk.requiredBytes)}</td><td className="text-center">{disk.ok ? 'Pass' : 'Insufficient space'}</td></tr>)}
      </tbody></table></div>
      <details><summary className="cursor-pointer">Review safe cleanup ({plan.cleanup.length} eligible entries)</summary>
        <p className="text-xs text-gray-400 my-2">The selected update, running/rollback image packages, latest service-verified backup pair and unknown/legacy backups are protected. No Docker images or volumes are pruned.</p>
        {plan.cleanup.map(item => <label className="flex gap-2 py-2 text-sm" key={item.id}><input type="checkbox" checked={cleanup.includes(item.id)} disabled={busy} onChange={event => setCleanup(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />{item.label} · {size(item.sizeBytes)}</label>)}
        <button className="btn-danger mt-2" disabled={!host?.available || !cleanup.length || busy || reconnecting} onClick={() => { if (confirm(`Permanently remove ${cleanup.length} selected obsolete artifact(s)? Retained rollback data is protected.`)) void command('cleanup', { planId: plan.id, selected: cleanup }) }}>Remove Selected Artifacts</button>
      </details>
      {plan.purpose !== 'storage' && <>
      <p className="text-sm">Installation briefly stops the application, creates and verifies a database/data backup pair, loads the selected image and checks the running image and service health. No cluster deployment is started.</p>
      <label className="block text-sm">Type INSTALL {record?.version} to approve this version
        <input className="input mt-2" value={approval} disabled={busy} onChange={event => setApproval(event.target.value)} />
      </label>
      <button className="btn-primary" disabled={!plan.ready || busy || !host?.available || reconnecting || approval !== `INSTALL ${record?.version}`} onClick={() => void command('install', { planId: plan.id, confirmation: approval })}>Back Up and Install</button>
      <p className="text-xs text-gray-500">Readiness approval expires after 15 minutes. Disk space, checksums and active jobs are checked again before installation.</p>
      </>}
    </div>}
    {op && <div className="border-t border-border pt-4 space-y-2" role="status">
      <h3 className="font-medium">Operation: {op.action} · {op.status}</h3>
      {op.action === 'install' && <ol className="flex flex-wrap gap-2 text-xs" aria-label="Installation stages">{['readiness', 'backup', 'load', 'restart', 'verify', 'complete'].map(stage => <li className="badge badge-gray" key={stage}>{stage}{op.stage === stage ? ' · current' : op.events?.some(event => event.stage === stage) ? ' · recorded' : ' · pending'}</li>)}</ol>}
      <p className="text-xs font-mono break-all">{op.id}</p><p className="text-sm">{op.message}</p>
      <ol className="text-sm space-y-1">{op.events?.map((event, index) => <li key={index}>{event.stage}: {event.message}</li>)}</ol>
      {op.verification && <div className="text-sm break-all"><p>Verified image: {op.verification.image}</p><p className="font-mono">{op.verification.imageId}</p><p>Database: {op.verification.database}</p></div>}
      <button className="btn-secondary" onClick={() => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify(op, null, 2)], { type: 'application/json' })); link.download = `appliance-update-${op.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000) }}>Download Operation Report</button>
    </div>}
    {host?.rollback && <details className="border-t border-border pt-4"><summary className="cursor-pointer">Recovery: previous application image ({host.rollback.version})</summary>
      <p className="text-sm my-2">This restores the application image only. Database/data restoration is a separate recovery procedure. Confirm version/schema compatibility independently before proceeding.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={compatible} onChange={event => setCompatible(event.target.checked)} />I have independently confirmed database compatibility with the previous application.</label>
      <label className="block text-sm mt-2">Type ROLLBACK {host.rollback.version}<input className="input mt-2" value={rollbackApproval} onChange={event => setRollbackApproval(event.target.value)} /></label>
      <button className="btn-danger mt-2" disabled={!compatible || !host.available || busy || reconnecting || rollbackApproval !== `ROLLBACK ${host.rollback.version}`} onClick={() => void command('rollback', { confirmation: rollbackApproval, databaseCompatible: compatible })}>Restore Previous Application Image</button>
    </details>}
    <details><summary className="cursor-pointer text-sm text-gray-400">If submission acknowledgement is lost</summary><p className="text-sm mt-2">Check the operation identifier and Jobs / Queue after reconnecting. Refresh this page to load host progress. Never repeat an installation merely because the browser disconnected. A consumed readiness plan cannot be installed twice.</p></details>
  </section>
}
