import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'

const base = '/api/virtual-switch-mtu'
const fields = {
  pc_endpoint: 'Prism Central HTTPS endpoint',
  pc_credential: 'PC credential reference',
  pe_endpoint: 'Prism Element HTTPS endpoint',
  pe_credential: 'PE credential reference',
  cluster_uuid: 'Cluster UUID',
}
const emptyConnection = { pc_endpoint: '', pc_credential: '', pe_endpoint: '', pe_credential: '', cluster_uuid: '' }
type Host = { hostId: string; host: string; uplinks: { name: string; mtu: number }[]; verified?: boolean }
type Review = { content: string; changeRequired: boolean; plan: {
  clusterName: string; switch: { config: { mtu: number; extId: string } }; targetMtu: number; hosts: Host[]
} }
type Job = { status: string; diagnostics?: { verifiedHosts?: Host[]; evidence?: string; likelyFix?: string } }
type SavedReview = { connection: typeof emptyConnection; rollbackJobId: string; review: Review;
  approval: string; jobId: string }

function restore(key: string): SavedReview | null {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {})
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Request failed. Check the current approval or job before retrying.')
  return result
}

function HostTable({ hosts }: { hosts: Host[] }) {
  return <table className="w-full text-left text-sm">
    <thead><tr><th className="p-2">Host</th><th className="p-2">Physical uplinks and observed MTU</th><th className="p-2">Result</th></tr></thead>
    <tbody>{hosts.map(host => <tr key={host.hostId} className="border-t border-border">
      <th scope="row" className="p-2">{host.host}</th>
      <td className="p-2">{host.uplinks.map(nic => nic.name + ' · ' + nic.mtu).join(', ')}</td>
      <td className="p-2">{host.verified === undefined ? 'Observed' : host.verified ? 'Verified' : 'Mismatch'}</td>
    </tr>)}</tbody>
  </table>
}

export default function VirtualSwitchMtu() {
  const username = useStore(state => state.user?.username)
  const storageKey = 'ztf-vs0-mtu-review:' + username
  const [saved] = useState(() => restore(storageKey))
  const [connection, setConnection] = useState(saved?.connection || emptyConnection)
  const [rollbackJobId, setRollbackJobId] = useState(saved?.rollbackJobId || '')
  const [fabricReviewed, setFabricReviewed] = useState(!!saved)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [review, setReview] = useState<Review | null>(saved?.review || null)
  const [approval, setApproval] = useState(saved?.approval || '')
  const [approvalStatus, setApprovalStatus] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [jobId, setJobId] = useState(saved?.jobId || '')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      if (approval && review) sessionStorage.setItem(storageKey, JSON.stringify({ connection, rollbackJobId, review, approval, jobId }))
      else sessionStorage.removeItem(storageKey)
    } catch { /* The approval and job remain available from their own pages. */ }
  }, [approval, connection, jobId, review, rollbackJobId, storageKey])

  useEffect(() => {
    void request<{ applyEnabled: boolean }>(base).then(result => setEnabled(result.applyEnabled))
      .catch(() => setError('Could not read MTU feature availability.'))
  }, [])
  useEffect(() => {
    if (!approval && !jobId) return
    let stopped = false
    let timer: number | undefined
    async function poll() {
      let again = true
      try {
        if (jobId) {
          const result = await request<Job>('/api/jobs/' + encodeURIComponent(jobId) + '?logs=false')
          if (!stopped) setJob(result)
          again = ['queued', 'running', 'cancelling'].includes(result.status)
        } else {
          const result = await request<{ status: string; jobId?: string }>('/api/approvals/' + encodeURIComponent(approval))
          if (!stopped) {
            setApprovalStatus(result.status)
            if (result.jobId) setJobId(result.jobId)
          }
        }
      } catch {
        if (!stopped && !jobId) setApprovalStatus('unavailable')
      }
      if (!stopped && again) timer = window.setTimeout(poll, 5000)
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [approval, jobId])

  function resetReview() {
    setReview(null)
    setApproval('')
    setApprovalStatus('')
    setConfirmation('')
    setJobId('')
    setJob(null)
  }

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setBusy(false) }
  }

  const expected = (rollbackJobId.trim() ? 'ROLLBACK MTU ' : 'APPLY MTU ') + connection.cluster_uuid.trim().toLowerCase()
  return <Layout title="Change Virtual Switch MTU" subtitle="Review and change the MTU on default AHV switch vs0 (br0)">
    <div className="max-w-5xl space-y-5">
      {enabled === false && <p className="card">Planning mode. Read-only preflight and approval are available. Live changes are disabled.</p>}
      {error && <p className="card text-red-500" role="alert">{error}</p>}
      <section className="card space-y-4">
        <h2 className="section-title">Target and read-only preflight</h2>
        <fieldset disabled={busy || !!approval} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(fields) as (keyof typeof fields)[]).map(key => <label key={key}>{fields[key]}
              <input className="input mt-1" value={connection[key]} autoComplete="off"
                onChange={event => { resetReview(); setConnection({ ...connection, [key]: event.target.value }) }} />
            </label>)}
            <label>Original change job ID for rollback
              <input className="input mt-1" value={rollbackJobId} onChange={event => { resetReview(); setRollbackJobId(event.target.value) }} />
            </label>
          </div>
          <p className="text-sm">Leave the job ID empty to set MTU 9000. For rollback, reconcile the original Prism task before entering the Orchestrator job ID.</p>
          <label className="flex gap-2"><input type="checkbox" checked={fabricReviewed}
            onChange={event => { resetReview(); setFabricReviewed(event.target.checked) }} />
            I verified fabric MTU, maintenance capacity, out-of-band access and any original Prism task state.
          </label>
          <button className="btn-primary" disabled={!fabricReviewed} onClick={() => void act(async () => {
            resetReview()
            setReview(await request<Review>(base + '/preflight', {
              connection: Object.fromEntries(Object.entries(connection).map(([key, value]) => [key, value.trim()])),
              fabricReviewed, rollbackJobId: rollbackJobId.trim(),
            }))
          })}>Run read-only preflight</button>
        </fieldset>
        {approval && <button className="btn-secondary" disabled={busy || (!!jobId && (!job || ['queued', 'running', 'cancelling'].includes(job.status)))}
          onClick={() => { resetReview(); setFabricReviewed(false) }}>Start a new plan</button>}
      </section>
      {review && <section className="card space-y-4">
        <h2 className="section-title">{review.plan.clusterName} · vs0 (br0)</h2>
        <p>Switch {review.plan.switch.config.extId} · Current MTU {review.plan.switch.config.mtu} · Requested MTU {review.plan.targetMtu}</p>
        <HostTable hosts={review.plan.hosts} />
        {!review.changeRequired && <p>Requested switch and uplink MTU already verified. No change is required.</p>}
        {review.changeRequired && !approval && <button className="btn-primary" disabled={busy} onClick={() => void act(async () => {
          setApproval((await request<{ id: string }>(base + '/approval', { content: review.content })).id)
        })}>Request approval</button>}
        {approval && <p><Link to="/approvals">Open Approvals</Link> · {approvalStatus || 'pending'} · {approval}</p>}
        {enabled && approvalStatus === 'approved' && !jobId && <>
          <label className="block">Type {expected}
            <input className="input mt-1" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
          </label>
          <button className="btn-primary" disabled={busy || confirmation !== expected} onClick={() => void act(async () => {
            setJobId((await request<{ id: string }>(base + '/apply', { content: review.content, approvalId: approval, confirmation })).id)
          })}>{rollbackJobId.trim() ? 'Submit approved rollback' : 'Apply approved MTU change'}</button>
        </>}
      </section>}
      {jobId && <section className="card space-y-4">
        <h2 className="section-title">Job {jobId} · {job?.status || 'awaiting status'}</h2>
        <Link to="/jobs">Open Jobs / Queue</Link>
        {!!job?.diagnostics?.verifiedHosts?.length && <HostTable hosts={job.diagnostics.verifiedHosts} />}
        {job?.diagnostics?.evidence && <p>{job.diagnostics.evidence}</p>}
        {job?.diagnostics?.likelyFix && <p>{job.diagnostics.likelyFix}</p>}
        {job?.status === 'success' && <p>Verify end-to-end VLAN connectivity and jumbo frames before accepting the change.</p>}
      </section>}
    </div>
  </Layout>
}
