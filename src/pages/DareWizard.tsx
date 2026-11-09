import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { operationsRequest, type Operations } from '../components/ClusterOperations'
import { Link } from '../router'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

const base = '/api/dare'
const steps = ['Select cluster', 'Choose key manager', 'Preflight', 'Review & approve', 'Enable & verify']

function formatPlan(content: string) {
  try { return JSON.stringify(JSON.parse(content), null, 2) } catch { return content }
}
const checks = {
  license: 'I verified licensing and feature eligibility for this cluster.',
  keyManager: 'I verified Native KMS (Local) prerequisites for this hardware and software.',
  backup: 'I verified the key backup and recovery procedure and assigned an owner to capture the keys after enablement.',
  prismState: 'I checked the encryption state in Prism and verified there is no encryption operation in progress.',
  irreversible: 'I understand that software encryption cannot be disabled after enablement.',
}

type Connection = { pc_endpoint: string; pc_credential: string; pe_endpoint: string; pe_credential: string; cluster_uuid: string }
type Cluster = { name: string; uuid: string; aosVersion: string; hostSerials: string[] }
type Observation = { cluster: Cluster; state: 'unconfigured' | 'already_configured'; lastKeyBackupAt: string | null }
type Plan = Observation & { content: string; sha256: string }
type Job = { status: string; diagnostics?: { encryptionState?: string; lastKeyBackupAt?: string | null; evidence?: string; likelyFix?: string } }
type Pending = { plan: Plan; reference: string; approval: string; jobId?: string }
const emptyConnection: Connection = { pc_endpoint: '', pc_credential: '', pe_endpoint: '', pe_credential: '', cluster_uuid: '' }

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : {})
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error || 'Request failed. Check existing approvals, jobs and Prism Tasks before retrying.')
  return result
}

function restore(key: string): Pending | null {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

export default function DareWizard() {
  const username = useStore(state => state.user?.username)
  const key = 'ztf-dare:' + username
  const [pending, setPending] = useState(() => restore(key))
  const [step, setStep] = useState(() => pending?.jobId ? 4 : pending ? 3 : 0)
  const [clusters, setClusters] = useState<Operations['clusters']>([])
  const [connection, setConnection] = useState(emptyConnection)
  const [observation, setObservation] = useState<Observation | null>(null)
  const [review, setReview] = useState<Partial<Record<keyof typeof checks, boolean>>>({})
  const [reference, setReference] = useState('')
  const [plan, setPlan] = useState<Plan | null>(() => pending?.plan || null)
  const [applyEnabled, setApplyEnabled] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const approvalId = pending?.approval
  const jobId = pending?.jobId

  useEffect(() => {
    void request<{ applyEnabled: boolean }>(base).then(result => setApplyEnabled(result.applyEnabled)).catch(() => setApplyEnabled(false))
    void operationsRequest<Operations>('').then(result => setClusters(result.clusters.filter(cluster => cluster.expectedUuid))).catch(() => setClusters([]))
  }, [])
  useEffect(() => {
    try {
      if (pending) sessionStorage.setItem(key, JSON.stringify(pending))
      else sessionStorage.removeItem(key)
    } catch { /* Durable approvals and jobs remain accessible in the console. */ }
  }, [key, pending])
  useEffect(() => {
    if (!approvalId || jobId) return
    let active = true
    const poll = async () => {
      try {
        const result = await request<{ status: string; jobId?: string }>('/api/approvals/' + encodeURIComponent(approvalId))
        if (!active) return
        setApprovalStatus(result.status)
        if (result.jobId) {
          setPending(current => current?.approval === approvalId ? { ...current, jobId: result.jobId } : current)
          setStep(4)
        }
      } catch { if (active) setApprovalStatus('unavailable') }
    }
    void poll()
    const timer = window.setInterval(poll, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [approvalId, jobId])
  useEffect(() => {
    if (!jobId) return
    let active = true
    const poll = async () => {
      try {
        const result = await request<Job>('/api/jobs/' + encodeURIComponent(jobId) + '?logs=false')
        if (active) setJob(result)
      } catch { if (active) setJob(null) }
    }
    void poll()
    const timer = window.setInterval(poll, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [jobId])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setBusy(false) }
  }

  function startAgain() {
    setPending(null)
    setPlan(null)
    setObservation(null)
    setJob(null)
    setReview({})
    setReference('')
    setConfirmation('')
    setApprovalStatus('')
    setError('')
    setStep(0)
  }

  const fields: [keyof Connection, string][] = [
    ['pc_endpoint', 'Prism Central HTTPS endpoint'], ['pc_credential', 'PC credential reference'],
    ['pe_endpoint', 'Prism Element HTTPS endpoint'], ['pe_credential', 'PE credential reference'],
    ['cluster_uuid', 'Expected cluster UUID'],
  ]
  const expectedConfirmation = plan ? 'ENCRYPT ' + plan.cluster.uuid : ''
  const keyBackup = job?.diagnostics?.lastKeyBackupAt || plan?.lastKeyBackupAt

  return <Layout title="Enable Data-at-Rest Encryption (DARE)" subtitle="Configure → Security">
    <div className="max-w-6xl space-y-5">
      <Link to="/start/configure" className="text-sm text-primary">← Configure</Link>
      <ol aria-label="Encryption steps" className="grid gap-2 sm:grid-cols-5">
        {steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}
          className={step === index ? 'btn-primary justify-start' : 'btn-secondary justify-start'}><b>{index + 1}</b> {label}</li>)}
      </ol>
      {!applyEnabled && <p className="card text-sm">Planning mode. Discovery and preflight are available. Live enablement is disabled on this appliance.</p>}
      {error && <p role="alert" className="card text-sm text-red-500">{error}</p>}
      <section className="card space-y-5">
        <h2 className="text-lg font-semibold">{step === 3 ? "Review encryption plan" : steps[step]}</h2>
        {step === 0 && <>
          <p>Confirm the target through both Prism Central and Prism Element using trusted HTTPS.</p>
          <label className="block text-sm">Managed cluster (optional)
            <select className="input mt-1 w-full" defaultValue="" onChange={event => {
              const cluster = clusters.find(item => item.id === event.target.value)
              if (cluster) setConnection(current => ({ ...current, pe_endpoint: cluster.peEndpoint,
                pe_credential: cluster.peCredential, cluster_uuid: cluster.expectedUuid }))
            }}>
              <option value="">Enter target details manually</option>
              {clusters.map(cluster => <option value={cluster.id} key={cluster.id}>{cluster.name}</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">{fields.map(([field, label]) => <label className="block text-sm" key={field}>{label}
            <input className="input mt-1 w-full" value={connection[field]} onChange={event => setConnection({ ...connection, [field]: event.target.value })} />
          </label>)}</div>
          <button className="btn-primary" disabled={busy || Object.values(connection).some(value => !value.trim())}
            onClick={() => void act(async () => { setObservation(await request<Observation>(base + '/discover', connection)); setStep(1) })}>Discover cluster (read-only)</button>
        </>}
        {step === 1 && observation && <>
          <p>{observation.cluster.name} · AOS {observation.cluster.aosVersion} · {observation.cluster.hostSerials.length} AHV hosts</p>
          <div className="rounded-lg border border-border p-4">
            <h3 className="font-semibold">Native KMS (Local)</h3>
            <p className="mt-2 text-sm">Cluster-wide software encryption using Nutanix’s built-in key manager. This wizard supports this mode only.</p>
            <p className="mt-2 text-sm">{observation.state === 'already_configured' ? 'Prism reports the requested encryption configuration is already present.' : 'Prism returned an unconfigured encryption record.'}</p>
          </div>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setStep(0)}>Back</button>
            <button className="btn-primary" onClick={() => setStep(2)}>Continue to preflight</button></div>
        </>}
        {step === 2 && <>
          <p>Preflight reads cluster identity, host membership, health and encryption settings. Confirm these additional requirements in your change record.</p>
          <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Operator attestations</legend>
            {(Object.keys(checks) as (keyof typeof checks)[]).map(check => <label className="flex items-start gap-2 text-sm" key={check}>
              <input type="checkbox" className="mt-0.5" checked={review[check] || false}
                onChange={event => setReview({ ...review, [check]: event.target.checked })} />{checks[check]}</label>)}
          </fieldset>
          <label className="block text-sm">Change ticket or key recovery runbook ID
            <input className="input mt-1 w-full max-w-md" maxLength={80} value={reference} onChange={event => setReference(event.target.value)} />
          </label>
          <p className="text-sm">Keep keys and recovery secrets in your approved secure store.</p>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={busy || !reference.trim() || Object.keys(checks).some(check => !review[check as keyof typeof checks])}
              onClick={() => void act(async () => { setPlan(await request<Plan>(base + '/preflight', { connection, review, recoveryReference: reference.trim() })); setStep(3) })}>Run read-only preflight</button></div>
        </>}
        {step === 3 && plan && <>
          <p className="text-sm">Verify the target and key recovery arrangements before requesting approval.</p>
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-semibold">Software encryption cannot be disabled after enablement.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-border p-4">
              <h3 className="font-semibold">Target cluster</h3>
              <p className="mt-2">{plan.cluster.name}</p>
              <p className="break-all text-sm">{plan.cluster.uuid}</p>
              <p className="mt-2 text-sm">AOS {plan.cluster.aosVersion} · {plan.cluster.hostSerials.length} AHV hosts</p>
              <p className="break-words text-sm">{plan.cluster.hostSerials.join(', ')}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-sm">
                <dt className="font-medium">Encryption</dt><dd>Software</dd>
                <dt className="font-medium">Scope</dt><dd>Entire cluster</dd>
                <dt className="font-medium">Key manager</dt><dd>Native KMS (Local)</dd>
              </dl>
            </div>
            <div className="min-w-0 rounded-lg border border-border p-4">
              <h3 className="font-semibold">Preflight and evidence</h3>
              <ul className="mt-2 space-y-1 text-sm">
                <li><span className="mr-2 font-bold text-emerald-600" aria-hidden="true">✓</span>Cluster identity and AHV host membership matched</li>
                <li><span className="mr-2 font-bold text-emerald-600" aria-hidden="true">✓</span>Prism Element reported Good health</li>
              </ul>
              <p className="mt-2 text-sm">Licensing, KMS prerequisites and recovery arrangements confirmed by the operator.</p>
              <p className="mt-2 break-words text-sm">Recovery reference · {pending?.reference || reference}</p>
              <p className="mt-2 text-sm">{plan.state === 'already_configured' ? 'Requested configuration already present.' : 'Unconfigured encryption record read from Prism.'}</p>
            </div>
          </div>
          <details><summary className="cursor-pointer text-sm">Exact plan and SHA-256</summary>
            <p className="my-2 break-all font-mono text-xs">{plan.sha256}</p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{formatPlan(plan.content)}</pre>
          </details>
          {plan.state === 'already_configured' ? <p className="text-sm">No enablement is needed. Check background encryption and key backup in Prism.</p> :
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">Independent approval</h3>
              <p className="mt-1 text-sm">A second administrator must approve this exact plan.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
              {!approvalId ? <button className="btn-primary" disabled={busy || !applyEnabled} onClick={() => void act(async () => {
                const result = await request<{ id: string }>(base + '/approval', { content: plan.content })
                setPending({ plan, reference: reference.trim(), approval: result.id })
              })}>Request independent approval</button> : <>
                <Link className="btn-secondary" to="/approvals">Open Approvals</Link>
                <span role="status" className="text-sm">Approval · {approvalStatus || 'checking'}</span>
                <button className="btn-primary" disabled={busy || !applyEnabled || approvalStatus !== 'approved'} onClick={() => setStep(4)}>Continue to enablement</button>
              </>}
              </div>
            </div>}
          <button className="btn-secondary" disabled={busy} onClick={startAgain}>Start a new review</button>
        </>}
        {step === 4 && plan && (jobId ? <>
          <p role="status">Job {jobId} · {job?.status || 'status unavailable'}</p>
          {job?.diagnostics?.encryptionState === 'enabled' && <p className="font-semibold text-emerald-600">Encryption configuration verified in Prism.</p>}
          {job?.diagnostics?.encryptionState === 'already_configured' && <p>Matching configuration already present. No change was submitted.</p>}
          <p>Check background encryption progress and confirm that the encryption keys have been backed up in Prism.</p>
          {keyBackup && <p className="text-sm">Last key backup reported by Prism · {keyBackup}</p>}
          {job?.diagnostics?.evidence && <p role="alert">{job.diagnostics.evidence} {job.diagnostics.likelyFix}</p>}
          <Link className="btn-secondary" to={'/jobs?job=' + encodeURIComponent(jobId)}>Open Jobs / Queue</Link>
        </> : <>
          <p>Enable cluster-wide software encryption on <strong>{plan.cluster.name}</strong>. Prism runs the operation in the background.</p>
          <label className="block text-sm">Type {expectedConfirmation}
            <input className="input mt-1 w-full max-w-xl" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={busy} onClick={() => setStep(3)}>Back to review</button>
            <button className="btn-primary" disabled={busy || !applyEnabled || !approvalId || approvalStatus !== 'approved' || confirmation !== expectedConfirmation}
              onClick={() => void act(async () => {
                const result = await request<{ id: string }>(base + '/apply', { content: plan.content, approvalId, confirmation })
                setPending(current => current ? { ...current, jobId: result.id } : current)
              })}>Enable approved encryption</button></div>
        </>)}
      </section>
    </div>
  </Layout>
}
