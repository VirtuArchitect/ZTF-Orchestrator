import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import PeDirectConnection, { initialPeConnection, deploymentRecoveryTls, connectionPayload, connectionReady, transportSummary, type ClusterConnection } from '../components/PeDirectConnection'
import { operationsRequest, type Operations } from '../components/ClusterOperations'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'
import { Link } from '../router'
import { toYaml } from '../utils/yaml'

const base = '/api/create-virtual-switch'
type Plan = { content: string; sha256: string; changeRequired: boolean; plan: {
  clusterName: string; bridge: string; hosts: { id: string; name: string; serial: string; observed: { switches: Record<string, { ports: string[]; mtu: number }> } }[]
} }
type Job = { status: string; diagnostics?: { evidence?: string; verifiedHosts?: { hostId: string; host: string; bridge: string; mtu: number; action: string; stage: string }[] } }
async function request<T>(url: string, body?: object): Promise<T> {
  const response = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {})
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}). Review the existing job before retrying.`)
  return data
}
export default function CreateVirtualSwitch() {
  const username = useStore(s => s.user?.username)
  const storageKey = `ztf-create-switch:${username || ''}`
  const [saved] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null } })
  const [connection, setConnection] = useState<ClusterConnection>(saved?.connection || { ...initialPeConnection, ...deploymentRecoveryTls })
  const [switchName, setSwitchName] = useState(saved?.switchName || 'vs1')
  const [reviewed, setReviewed] = useState(false)
  const [clusters, setClusters] = useState<Operations['clusters']>([])
  const [plan, setPlan] = useState<Plan | null>(saved?.plan || null)
  const [approval, setApproval] = useState(saved?.approval || '')
  const [approvalStatus, setApprovalStatus] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [jobId, setJobId] = useState(saved?.jobId || '')
  const [job, setJob] = useState<Job | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [yaml, setYaml] = useState('')
  const ready = connectionReady(connection, true) && /^vs[1-9][0-9]{0,2}$/.test(switchName)
  const expected = `CREATE SWITCH ${connection.cluster_uuid.trim().toLowerCase()} ${switchName}`
  useEffect(() => {
    void request<{ applyEnabled: boolean }>(base).then(x => setEnabled(x.applyEnabled)).catch(() => setMessage('Cannot read workflow availability.'))
    void operationsRequest<Operations>('').then(x => setClusters(x.clusters.filter(c => c.expectedUuid))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!approval) return
    let active = true
    const poll = async () => {
      try {
        const result = await request<{ status: string; jobId?: string }>(`/api/approvals/${encodeURIComponent(approval)}`)
        if (!active) return
        setApprovalStatus(result.status)
        if (result.jobId) setJobId(result.jobId)
        if (jobId || result.jobId) {
          const value = await request<Job>(`/api/jobs/${encodeURIComponent(jobId || result.jobId!)}?logs=false`)
          if (active) setJob(value)
        }
      } catch { if (active) setMessage('Cannot refresh approval or job status. Review the existing record before retrying.') }
    }
    void poll(); const timer = window.setInterval(() => void poll(), 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [approval, jobId])
  useEffect(() => {
    try {
      if (approval) sessionStorage.setItem(storageKey, JSON.stringify({ connection, switchName, plan, approval, jobId }))
      else sessionStorage.removeItem(storageKey)
    } catch { /* Approval and job remain available in their own pages. */ }
  }, [storageKey, connection, switchName, plan, approval, jobId])
  function reset() { setPlan(null); setApproval(''); setApprovalStatus(''); setConfirmation(''); setJobId(''); setJob(null); setYaml(''); setMessage('') }
  async function act(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action() } catch (e) { setMessage(e instanceof Error ? e.message : 'Request failed') } finally { setBusy(false) } }
  const config = () => ({ connection: connectionPayload(connection, true), switchName, reviewed })
  function generate() { try { setYaml(toYaml(config())) } catch { setMessage('Complete the connection and valid SSH host-key JSON first.') } }
  return <Layout title="Create Virtual Switch" subtitle="Create an empty AHV switch through PE and pinned CVM SSH">
    <div className="max-w-5xl space-y-5">
      <p className="card">Create-only action. vs1 maps to cluster-local bridge br1. No physical NIC is moved or assigned. Use AHV Uplink Migration afterward to attach uplinks through a separate reviewed plan.</p>
      {!enabled && <p className="card">Planning mode. Preflight and approval are available; live switch creation is disabled pending hardware validation.</p>}
      {message && <p role="alert" className="card text-red-500">{message}</p>}
      <section className="card space-y-4"><h2 className="section-title">1. Target and configuration</h2>
        <fieldset disabled={busy || !!approval} className="space-y-4">
          <label className="block">Managed cluster (optional)<select className="input mt-1" value="" onChange={e => { const c = clusters.find(c => c.id === e.target.value); if (c) { reset(); setConnection(v => ({ ...v, pe_endpoint: c.peEndpoint, pe_credential: c.peCredential, cluster_uuid: c.expectedUuid })) } }}><option value="">Select a saved cluster</option>{clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <PeDirectConnection value={connection} onChange={patch => { reset(); setConnection(v => ({ ...v, ...patch })) }} disabled={busy || !!approval} cvm recoveryTls allowPc={false} />
          <label className="block">New switch name<input className="input mt-1" value={switchName} onChange={e => { reset(); setSwitchName(e.target.value) }} placeholder="vs1" /></label>
          <p className="text-sm">Use vs1 through vs999. MTU is reported from the created bridge; this action does not change it or configure VM networks.</p>
          <label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={e => { reset(); setReviewed(e.target.checked) }} />I reviewed exact hosts, maintenance access and any previous attempt; no switch creation is still in progress.</label>
          <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={!ready} onClick={generate}>Generate YAML</button>
            <button className="btn-secondary" disabled={!ready} onClick={() => { try { const url = URL.createObjectURL(new Blob([toYaml(config())], { type: 'text/yaml' })); const a = document.createElement('a'); a.href = url; a.download = 'create-virtual-switch.yml'; a.click(); URL.revokeObjectURL(url) } catch { setMessage('Complete the connection and SSH host-key JSON first.') } }}>Download Config</button>
            <button className="btn-primary" disabled={!ready || !reviewed} onClick={() => void act(async () => { setPlan(await request<Plan>(base + '/preflight', config())) })}>Run read-only preflight</button></div>
        </fieldset>
        {yaml && <pre aria-label="Generated YAML" className="overflow-auto text-xs border border-border rounded p-3">{yaml}</pre>}
        {approval && <button className="btn-secondary" disabled={busy || (!!jobId && (!job || ['running', 'queued', 'cancelling'].includes(job.status)))} onClick={() => { reset(); setReviewed(false) }}>Start a new plan</button>}
      </section>
      {plan && <section className="card space-y-4"><h2 className="section-title">2. Review {plan.plan.clusterName} · {plan.plan.bridge}</h2>
        <p>{transportSummary(plan.content, connection)}</p>
        <ul aria-label="Per-host creation plan">{plan.plan.hosts.map(h => <li key={h.id} className="border-b border-border p-2">{h.name} · {h.serial} · {h.observed.switches[plan.plan.bridge] ? 'Keep existing empty bridge' : 'Create empty bridge'} · br0 and all NIC assignments unchanged</li>)}</ul>
        <p className="text-xs break-all">SHA-256: {plan.sha256}</p><details><summary>Exact approval plan</summary><pre className="overflow-auto text-xs">{plan.content}</pre></details>
        {!plan.changeRequired && <p>Empty switch already present on every host. No change or approval is needed.</p>}
        {plan.changeRequired && !approval && <button className="btn-primary" disabled={busy} onClick={() => void act(async () => { setApproval((await request<{ id: string }>(base + '/approval', { content: plan.content })).id) })}>Request independent approval</button>}
        {approval && <p><Link to="/approvals">Open Approvals</Link> · {approvalStatus || 'pending'}</p>}
        {approval && enabled && !jobId && <><label className="block">Type {expected}<input className="input mt-1" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><button className="btn-primary" disabled={busy || approvalStatus !== 'approved' || confirmation !== expected} onClick={() => void act(async () => { setJobId((await request<{ id: string }>(base + '/apply', { content: plan.content, approvalId: approval, confirmation })).id) })}>Create approved virtual switch</button></>}
      </section>}
      {jobId && <section className="card space-y-3"><h2 className="section-title">3. Per-host verification · {job?.status || 'awaiting status'}</h2><Link to={`/jobs?job=${encodeURIComponent(jobId)}`}>Open job and logs</Link>{job?.diagnostics?.verifiedHosts?.map(h => <p key={h.hostId}>{h.host} · {h.bridge} · MTU {h.mtu} · {h.action} · {h.stage}</p>)}{job?.diagnostics?.evidence && <p role="alert">{job.diagnostics.evidence}</p>}</section>}
      <Link className="btn-secondary" to="/configure/ahv-uplink-migration">Open AHV Uplink Migration</Link>
    </div>
  </Layout>
}
