import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { operationsRequest, type Operations } from '../components/ClusterOperations'
import { Link } from '../router'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

const base = '/api/ahv-uplink-migration'
const steps = ['Select cluster', 'Assign uplinks', 'Preflight', 'Review & approve', 'Apply & verify']

type Connection = { pc_endpoint: string; pc_credential: string; pe_endpoint: string; pe_credential: string; cluster_uuid: string }
type Destination = { mode: 'create' | 'existing'; name: string; bondMode: string; mtu: number }
type Nic = { name: string; up: boolean; mac: string; switchPort: string; switchDevice: string; restricted: boolean }
type Inventory = { clusterName: string; source: { config: { clusters: { hosts: { extId: string; hostNics: string[] }[] }[] } };
  switches: { name: string; mtu: number; bondMode: string }[]; hosts: { id: string; name: string; nics: Nic[] }[] }
type Assignment = { hostId: string; host: string; keep: string[]; move: string[]; destination: string[] }
type Plan = { content: string; sha256: string; assignments: Assignment[]; clusterName: string }
type Job = { status: string; diagnostics?: { verifiedHosts?: { hostId: string; host: string; kept: string[]; moved: string[]; stage: 'verified' | 'retained_uplinks_verified' }[]; evidence?: string; likelyFix?: string } }
type Draft = { connection: Connection; destination: Destination; inventory: Inventory | null; move: Record<string, string[]>; reviewed: boolean;
  plan: Plan | null; approval: string; jobId: string; step: number }

const initial: Draft = {
  connection: { pc_endpoint: '', pc_credential: '', pe_endpoint: '', pe_credential: '', cluster_uuid: '' },
  destination: { mode: 'create', name: 'vs1', bondMode: 'ACTIVE_BACKUP', mtu: 1500 },
  inventory: null, move: {}, reviewed: false, plan: null, approval: '', jobId: '', step: 0,
}

function restore(key: string): Draft {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') || initial } catch { return initial }
}

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {})
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Request failed (HTTP ${response.status}). Check the existing approval or job before retrying.`)
  return result
}

function AssignmentReview({ rows }: { rows: Assignment[] }) {
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="border-b border-border"><th className="p-3">Host</th><th className="p-3">Keep on br0 (vs0)</th><th className="p-3">Move</th><th className="p-3">Final destination uplinks</th></tr></thead>
    <tbody>{rows.map(row => <tr className="border-b border-border" key={row.hostId}>
      <th scope="row" className="p-3">{row.host}</th><td className="p-3">{row.keep.join(', ')}</td><td className="p-3">{row.move.join(', ') || 'None'}</td><td className="p-3">{row.destination.join(', ')}</td>
    </tr>)}</tbody>
  </table></div>
}

export default function AhvUplinkMigration() {
  const username = useStore(state => state.user?.username)
  const storageKey = `ztf-ahv-uplink-draft:${username || ''}`
  const [draft, setDraft] = useState(() => restore(storageKey))
  const [clusters, setClusters] = useState<Operations['clusters']>([])
  const [applyEnabled, setApplyEnabled] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const { connection, destination, inventory, move, plan, approval, jobId, reviewed, step } = draft
  const stepper = useRef<HTMLOListElement>(null)

  useEffect(() => { stepper.current?.scrollIntoView({ block: 'start' }) }, [step])

  useEffect(() => {
    void request<{ applyEnabled: boolean }>(base).then(result => setApplyEnabled(result.applyEnabled)).catch(() => setApplyEnabled(false))
    void operationsRequest<Operations>('').then(result => setClusters(result.clusters.filter(cluster => cluster.expectedUuid))).catch(() => setClusters([]))
  }, [])
  useEffect(() => {
    if (!approval) return
    let stopped = false
    const poll = () => {
      void request<{ status: string; jobId?: string }>(`/api/approvals/${encodeURIComponent(approval)}`).then(result => {
        if (!stopped) {
          setApprovalStatus(result.status)
          if (result.jobId) setDraft(value => value.approval === approval && !value.jobId ? { ...value, step: 4, jobId: result.jobId! } : value)
        }
      }).catch(() => { if (!stopped) setApprovalStatus('unavailable') })
    }
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [approval])
  useEffect(() => {
    if (!jobId) return
    let stopped = false
    const poll = () => {
      void request<Job>(`/api/jobs/${encodeURIComponent(jobId)}?logs=false`).then(result => {
        if (!stopped) setJob(result)
      }).catch(() => { if (!stopped) setJob(null) })
    }
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [jobId])
  useEffect(() => {
    if (approval || jobId) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(draft)) } catch { /* The job remains in Jobs / Queue. */ }
    }
  }, [approval, jobId, storageKey, draft])

  function update(patch: Partial<Draft>) {
    if (approval) {
      try { sessionStorage.removeItem(storageKey) } catch { /* A fresh preflight is still required. */ }
    }
    setDraft(value => ({ ...value, ...patch, plan: null, approval: '', jobId: '' }))
    setApprovalStatus('')
    setConfirmation('')
    setError('')
  }

  function updateConnection(patch: Partial<Connection>) {
    update({ connection: { ...connection, ...patch }, inventory: null, move: {}, reviewed: false })
  }

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setBusy(false) }
  }

  function setPort(hostId: string, port: string, migrate: boolean) {
    const ports = move[hostId] || []
    update({ move: { ...move, [hostId]: migrate ? [...ports, port] : ports.filter(item => item !== port) }, reviewed: false })
  }

  const current = Object.fromEntries((inventory?.source.config.clusters[0]?.hosts || []).map(host => [host.extId, host.hostNics]))
  const total = Object.values(current).reduce((sum, nics) => sum + nics.length, 0)
  const migrating = Object.values(move).reduce((sum, ports) => sum + ports.length, 0)
  const expectedConfirmation = `APPLY UPLINKS ${connection.cluster_uuid.toLowerCase()}`

  return <Layout title="AHV Uplink Migration" subtitle="Review and migrate physical AHV uplinks">
    <div className="max-w-6xl space-y-5">
      <ol ref={stepper} aria-label="Migration steps" className="grid gap-2 sm:grid-cols-5">
        {steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
          className={step === index ? 'btn-primary justify-start' : 'btn-secondary justify-start'}>
          <span className="font-bold">{index + 1}</span> {label}
        </li>)}
      </ol>
      {!applyEnabled && <p className="card text-sm">Planning mode. Discovery, preflight and approval are available. Live changes are disabled on this appliance.</p>}
      {error && <p role="alert" className="card text-sm text-red-500">{error}</p>}
      <section className="card space-y-5">
        {step === 0 && <>
          <h2 className="section-title">Select cluster and destination switch</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">Target cluster
              <select className="input mt-1" value={clusters.find(item => item.expectedUuid === connection.cluster_uuid)?.id || ''}
                onChange={e => {
                  const selected = clusters.find(item => item.id === e.target.value)
                  if (selected) updateConnection({ pe_endpoint: selected.peEndpoint, pe_credential: selected.peCredential, cluster_uuid: selected.expectedUuid })
                  else updateConnection({ pe_endpoint: '', pe_credential: '', cluster_uuid: '' })
                }}>
                <option value="">Enter cluster details manually</option>
                {clusters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="block">Source switch<input className="input mt-1" readOnly value="br0 (vs0)" /></label>
            {([['pc_endpoint', 'Prism Central HTTPS endpoint'], ['pc_credential', 'PC credential reference'],
              ['pe_endpoint', 'Prism Element HTTPS endpoint'], ['pe_credential', 'PE credential reference'], ['cluster_uuid', 'Cluster UUID']] as const)
              .map(([key, label]) => <label className="block" key={key}>{label}<input className="input mt-1" value={connection[key]} disabled={busy}
                autoComplete="off" onChange={e => updateConnection({ [key]: e.target.value })} /></label>)}
          </div>
          <button className="btn-secondary" disabled={busy || Object.values(connection).some(value => !value.trim())} onClick={() => void act(async () => {
            const observed = await request<Inventory>(base + '/discover', connection)
            update({ inventory: observed, move: Object.fromEntries(observed.hosts.map(host => [host.id, []])), reviewed: false })
          })}>Discover cluster (read-only)</button>
          {inventory && <p className="text-sm">{inventory.clusterName} · {inventory.hosts.length} hosts discovered</p>}
          <fieldset className="rounded-lg border border-border p-4 space-y-4">
            <legend className="px-2 font-semibold">Destination switch</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {(['create', 'existing'] as const).map(mode => <label key={mode}
                className={`flex items-center gap-3 rounded-lg border p-4 ${destination.mode === mode ? 'border-nutanix-cyan bg-nutanix-cyan/10' : 'border-border'}`}>
                <input type="radio" name="switch-mode" checked={destination.mode === mode} disabled={busy}
                  onChange={() => update({ destination: { ...initial.destination, mode, name: mode === 'create' ? 'vs1' : '' }, reviewed: false })} />
                {mode === 'create' ? 'Create a new virtual switch' : 'Use an existing virtual switch'}
              </label>)}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {destination.mode === 'create' ? <label>Switch name<input className="input mt-1" value={destination.name} maxLength={64} disabled={busy}
                onChange={e => update({ destination: { ...destination, name: e.target.value } })} /></label> :
                <label>Existing switch<select className="input mt-1" value={destination.name} disabled={busy}
                  onChange={e => {
                    const selected = inventory?.switches.find(item => item.name === e.target.value)
                    update({ destination: { ...initial.destination, mode: 'existing', name: '', ...selected }, reviewed: false })
                  }}>
                  <option value="">Select a discovered switch</option>
                  {inventory?.switches.filter(item => item.bondMode === 'ACTIVE_BACKUP' && [1500, 9000].includes(item.mtu)).map(item => <option key={item.name}>{item.name}</option>)}
                </select></label>}
              <label>Bond mode<select className="input mt-1" value={destination.bondMode} disabled><option value="ACTIVE_BACKUP">Active-backup</option></select></label>
              <label>MTU<select className="input mt-1" value={destination.mtu} disabled={busy || destination.mode === 'existing'}
                onChange={e => update({ destination: { ...destination, mtu: Number(e.target.value) } })}><option>1500</option><option>9000</option></select></label>
            </div>
            <p className="text-sm text-gray-400">A new switch is created when you apply the approved plan.</p>
          </fieldset>
        </>}
        {step === 1 && inventory && <>
          <h2 className="section-title">Assign uplinks</h2>
          <p className="text-sm">{inventory.clusterName} · Source br0 (vs0) · Destination {destination.name}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm text-left">
            <thead><tr className="border-b border-border">
              {['Host', 'Physical NIC', 'Link / physical port', 'Keep on br0 (vs0)', `Move to ${destination.name}`].map(label => <th scope="col" className="p-3" key={label}>{label}</th>)}
            </tr></thead>
            {inventory.hosts.map(host => {
              const ports = host.nics.filter(nic => current[host.id]?.includes(nic.name))
              return <tbody key={host.id}>{ports.map((nic, index) => {
                const selected = move[host.id]?.includes(nic.name)
                return <tr className="border-b border-border" key={nic.name}>
                  {index === 0 && <th scope="rowgroup" className="p-3 align-top" rowSpan={ports.length}>{host.name}</th>}
                  <td className="p-3 font-mono">{nic.name}</td>
                  <td className="p-3">{nic.up ? 'Up' : 'Down / unknown'}{nic.switchPort && ` · ${nic.switchDevice} ${nic.switchPort}`}{nic.restricted && ' · Reserved'}</td>
                  <td className="p-3"><input type="radio" name={`${host.id}-${nic.name}`} aria-label={`${host.name} ${nic.name} keep on br0`}
                    checked={!selected} onChange={() => setPort(host.id, nic.name, false)} /></td>
                  <td className="p-3"><input type="radio" name={`${host.id}-${nic.name}`} aria-label={`${host.name} ${nic.name} move to ${destination.name}`}
                    checked={Boolean(selected)} disabled={!nic.up || nic.restricted} onChange={() => setPort(host.id, nic.name, true)} /></td>
                </tr>
              })}</tbody>
            })}
          </table></div>
          <p className="rounded-lg border border-border p-3 text-sm">{total - migrating} uplinks stay on br0 (vs0) · {migrating} move to {destination.name}</p>
        </>}
        {step === 2 && <>
          <h2 className="section-title">Read-only preflight</h2>
          <p>Check PC and PE identity, host health, switch membership and link state. Confirm the physical fabric separately.</p>
          <label className="flex items-start gap-3"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => update({ reviewed: e.target.checked })} />
            I verified physical cabling, VLANs, MTU, maintenance capacity and out-of-band access for every host.</label>
          <button className="btn-primary" disabled={busy || !reviewed} onClick={() => void act(async () => {
            const result = await request<Plan>(base + '/preflight', { connection, target: destination, move, fabricReviewed: reviewed })
            setDraft(value => ({ ...value, plan: result, step: 3 }))
          })}>Run read-only preflight</button>
        </>}
        {step === 3 && plan && <>
          <h2 className="section-title">Review and approve the migration</h2>
          <p>{plan.clusterName} · {destination.mode === 'create' ? 'Create' : 'Update'} {destination.name} · Active-backup · MTU {destination.mtu}</p>
          <AssignmentReview rows={plan.assignments} />
          <p className="text-xs break-all">Plan SHA-256 {plan.sha256}</p>
          <button className="btn-secondary" disabled={busy || Boolean(approval)} onClick={() => void act(async () => {
            const result = await request<{ id: string }>(base + '/approval', { content: plan.content })
            setDraft(value => ({ ...value, approval: result.id }))
          })}>Request independent approval</button>
          {approval && <p>Approval {approvalStatus || 'pending'} · <Link className="text-nutanix-cyan" to="/approvals">Open Approvals</Link></p>}
        </>}
        {step === 4 && plan && <>
          <h2 className="section-title">Apply and verify</h2>
          <p>The queued job checks the approved inventory again, releases the selected uplinks, verifies the retained links, then configures the destination. Any failed check stops the remaining work.</p>
          {!jobId && <>
            <label className="block">Type {expectedConfirmation}<input className="input mt-1" autoComplete="off" value={confirmation}
              disabled={busy || !applyEnabled} onChange={e => setConfirmation(e.target.value)} /></label>
            <button className="btn-primary" disabled={busy || !applyEnabled || approvalStatus !== 'approved' || confirmation !== expectedConfirmation}
              onClick={() => void act(async () => {
                const result = await request<{ id: string }>(base + '/apply', { content: plan.content, approvalId: approval, confirmation })
                setDraft(value => ({ ...value, jobId: result.id }))
              })}>Apply approved plan</button>
          </>}
          {jobId && <p><Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(jobId)}`}>Follow job {jobId}</Link> · {job?.status || 'Checking job status'}</p>}
          {jobId && <ul aria-label="Per-host verification" className="divide-y divide-border">
            {plan.assignments.map(row => {
              const result = job?.diagnostics?.verifiedHosts?.find(host => host.hostId === row.hostId)
              return <li className="py-2" key={row.hostId}><strong>{row.host}</strong> · {
                result?.stage === 'verified' ? 'Both switch assignments verified' :
                result?.stage === 'retained_uplinks_verified' ? 'Retained uplinks verified' : 'Awaiting readback'
              }</li>
            })}
          </ul>}
          {job && ['success', 'failed', 'cancelled', 'interrupted'].includes(job.status) &&
            <button className="btn-secondary" onClick={() => { setJob(null); update({ ...initial, connection }) }}>Start a new plan</button>}
          {job?.diagnostics?.evidence && <p role="alert">{job.diagnostics.evidence} {job.diagnostics.likelyFix}</p>}
        </>}
      </section>
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && !jobId && <button className="btn-secondary" disabled={busy} onClick={() => {
          setError('')
          if (step === 4) setDraft(value => ({ ...value, step: 3 }))
          else update({ step: step - 1 })
        }}>Back</button>}
        {!jobId && <button className="btn-secondary" disabled={busy} onClick={() => {
          try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); setNotice('Draft saved for this browser tab.') }
          catch { setError('Browser storage is unavailable.') }
        }}>Save draft</button>}
        {step === 0 && <button className="btn-primary ml-auto" disabled={busy || !inventory || !destination.name.trim()}
          onClick={() => setDraft(value => ({ ...value, step: 1 }))}>Continue to uplink assignment</button>}
        {step === 1 && <button className="btn-primary ml-auto" disabled={busy || !migrating}
          onClick={() => setDraft(value => ({ ...value, step: 2 }))}>Continue to preflight</button>}
        {step === 3 && <button className="btn-primary ml-auto" disabled={busy || approvalStatus !== 'approved'}
          onClick={() => setDraft(value => ({ ...value, step: 4 }))}>Continue to apply</button>}
      </div>
      {notice && <p role="status">{notice}</p>}
    </div>
  </Layout>
}
