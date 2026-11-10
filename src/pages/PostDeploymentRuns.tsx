import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { Link } from '../router'
import { apiFetch } from '../utils/api'

const base = '/api/post-deployment/runs'
const stages = [
  ['certificate', 'PE certificate replacement'],
  ['set-cluster-fqdn', 'Cluster FQDN'],
  ['cvm-renames', 'CVM display renames'],
  ['platform-changes', 'Storage, uplinks and DARE'],
  ['managed-cluster-lcm-inventory', 'LCM inventory'],
  ['post-deployment-ncc', 'NCC health checks'],
  ['acceptance', 'Acceptance checks'],
  ['signoff', 'Operator sign-off'],
]
const checkpoints: Record<string, string> = {
  certificate: 'Complete the PE certificate change outside this run and record its approval and verification.',
  'cvm-renames': 'Record the supervised renames and the health check after each CVM. This run checks membership and health, not current display names.',
  'platform-changes': 'Record evidence for in-scope storage, uplink and encryption changes, including any approved exclusions.',
  signoff: 'Record the final review of NCC, LCM, storage and network evidence, and encryption completion and key backup if required.',
}
const fields = [
  ['pe_endpoint', 'Prism Element endpoint', 'https://pe.example.com:9440'],
  ['pe_credential', 'PE credential reference', 'pe_admin_ref'],
  ['pc_endpoint', 'Prism Central endpoint', 'https://pc.example.com:9440'],
  ['pc_credential', 'PC credential reference', 'pc_admin_ref'],
  ['cluster_uuid', 'Managed cluster UUID', ''],
  ['fqdn', 'Expected cluster FQDN', 'pe.example.com'],
  ['repository', 'Expected Dark Site repository URL', 'https://lcm.example.com/release'],
  ['hostSerial', 'NCC CVM host serial', ''],
  ['credential', 'NCC CVM credential reference', 'cvm_ref'],
  ['hostKey', 'NCC CVM SSH host-key fingerprint', 'SHA256:'],
]
type Run = {
  id: string; revision: number; stage: string; attempt: string; approvalId: string; approvalStatus: string;
  confirmation: string; nccEnabled: boolean; jobVerified: boolean; intent: { connection: { cluster_uuid: string } };
  completed: { stage: string; at: string; actor: string; evidence: Record<string, unknown> }[];
  reconciliations: { stage: string; at: string; actor: string; reference: string }[];
  job: { id: string; status: string; diagnostics?: { counts?: Record<string, number> } } | null;
}
const title = (stage: string) => stages.find(([id]) => id === stage)?.[1] || stage
const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)

async function request<T>(url: string, body?: object): Promise<T> {
  const response = await apiFetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
  const data = await response.json().catch(() => null)
  if (!response.ok || data === null) throw new Error(data?.error || `Request failed (HTTP ${response.status}).`)
  return data as T
}

export default function PostDeploymentRuns() {
  const [runs, setRuns] = useState<Run[]>([])
  const [selection, select] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [reference, setReference] = useState('')
  const [fingerprint, setFingerprint] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [abandoning, setAbandoning] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    request<Run[]>(base).then(data => {
      if (alive) {
        setRuns(data)
        const resumable = data.find(item => !['complete', 'abandoned'].includes(item.stage))
        if (resumable) select(current => current || resumable.id)
      }
    })
      .catch(failure => { if (alive) setError(failure.message) })
    return () => { alive = false }
  }, [])

  const run = runs.find(item => item.id === selection)
  const reset = () => { setReference(''); setFingerprint(''); setConfirmation(''); setAbandoning(false) }
  const perform = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.') }
    finally { setBusy(false) }
  }
  const replace = (updated: Run) => {
    setRuns(previous => [updated, ...previous.filter(item => item.id !== updated.id)])
    select(updated.id); reset()
  }
  const update = (action: string) => {
    if (run) void perform(async () => replace(await request<Run>(`${base}/${encodeURIComponent(run.id)}`, {
      action, revision: run.revision, reference: reference.trim(), fingerprint: fingerprint.trim(), confirmation,
    })))
  }
  const checkpoint = run ? checkpoints[run.stage] : ''
  const closed = run?.stage === 'complete' || run?.stage === 'abandoned'
  const active = ['queued', 'running', 'cancelling'].includes(run?.job?.status || '')
  const stopped = Boolean(run?.attempt && !active && !run.jobVerified)
  const canContinue = run && !closed && !active && !stopped && (!checkpoint || reference.trim())
    && (run.stage !== 'certificate' || /^[a-f0-9]{64}$/.test(fingerprint.trim()))
    && (run.stage !== 'post-deployment-ncc' || run.nccEnabled || run.attempt)
    && (!run.confirmation || run.approvalStatus !== 'pending')
    && (run.approvalStatus !== 'approved' || run.attempt || confirmation === run.confirmation)
  const change = (id: string, value: string) => setValues(previous => ({ ...previous, [id]: value }))

  return (
    <Layout title="Post-deployment sequence" subtitle="Resumable cluster acceptance">
      <div className="max-w-5xl space-y-5">
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" to="/configure/post-deployment">Standalone checks</Link>
          <button className="btn-secondary" disabled={busy}
            onClick={() => void perform(async () => setRuns(await request<Run[]>(base)))}>Reload runs</button>
        </div>
        <label className="label">Run
          <select className="input mt-1 max-w-full" value={selection} disabled={busy}
            onChange={event => { select(event.target.value); reset(); setError('') }}>
            <option value="">New run</option>
            {runs.map(item => <option key={item.id} value={item.id}>
              {item.intent.connection.cluster_uuid} · {title(item.stage)}
            </option>)}
          </select>
        </label>
        {!run && <form className="space-y-4" onSubmit={event => {
          event.preventDefault()
          void perform(async () => {
            const connection = Object.fromEntries(fields.slice(0, 5).map(([id]) => [id, values[id]?.trim()]))
            replace(await request<Run>(base, { connection, fqdn: values.fqdn?.trim(), repository: values.repository?.trim(),
              hostSerials: lines(values.hostSerials || ''), containers: lines(values.containers || ''),
              ncc: { hostSerial: values.hostSerial?.trim(), credential: values.credential?.trim(), hostKey: values.hostKey?.trim() },
            }))
          })
        }}>
          <fieldset className="space-y-4" disabled={busy}>
            <legend className="section-title mb-3">Registered cluster and expected state</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(([id, label, placeholder]) => <label className="label" key={id}>{label}
                <input className="input mt-1" required autoComplete="off" spellCheck={false} placeholder={placeholder}
                  value={values[id] || ''} onChange={event => change(id, event.target.value)} />
              </label>)}
              {[['hostSerials', 'AHV host serials in node order'], ['containers', 'Expected storage containers']].map(([id, label]) =>
                <label className="label" key={id}>{label} (one per line)
                  <textarea className="input mt-1" rows={3} required value={values[id] || ''}
                    onChange={event => change(id, event.target.value)} />
                </label>)}
            </div>
            <button className="btn-primary" type="submit">Create sequence</button>
          </fieldset>
        </form>}
        {run && <>
          <ol className="grid gap-2 sm:grid-cols-2" aria-label="Sequence stages">
            {stages.map(([id, label]) => <li key={id} className="rounded border border-border px-3 py-2 text-sm"
              aria-current={run.stage === id ? 'step' : undefined}>
              <strong>{label}</strong>
              <span className="block text-xs">{run.stage === id ? 'Current' :
                run.completed.some(item => item.stage === id) ? 'Recorded' : 'Pending'}</span>
            </li>)}
          </ol>
          <section className="space-y-3 border-t border-border pt-4">
            <h2 className="section-title">{closed ? `Run ${run.stage}` : title(run.stage)}</h2>
            {checkpoint && <p className="text-sm">{checkpoint}</p>}
            {run.stage === 'post-deployment-ncc' && !run.nccEnabled && <p role="status">Automated NCC is disabled on this appliance.</p>}
            {run.approvalId && <p className="text-sm">Approval: {run.approvalStatus || 'unavailable'} · <Link className="text-nutanix-cyan"
              to="/approvals" target="_blank" rel="noopener noreferrer">Open Approvals</Link></p>}
            {run.job && <div className="text-sm">
              <p role="status">Job: {run.job.status} · <Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(run.job.id)}`}>View job</Link></p>
              {run.job.diagnostics?.counts && <p>{Object.entries(run.job.diagnostics.counts).map(([key, count]) => `${key}: ${count}`).join(' · ')}</p>}
            </div>}
            {stopped && <p role="status" className="text-sm">Outcome unverified. Check Prism Tasks or the CVM and confirm the operation has settled before retrying.</p>}
            {!closed && (checkpoint || stopped || abandoning) && <label className="label">Change or evidence reference
              <input className="input mt-1" value={reference} onChange={event => setReference(event.target.value)} maxLength={128} disabled={busy} />
            </label>}
            {run.stage === 'certificate' && <label className="label">Approved leaf certificate SHA-256 (lowercase hex)
              <input className="input mt-1" value={fingerprint} onChange={event => setFingerprint(event.target.value)} maxLength={64} disabled={busy} />
            </label>}
            {run.confirmation && run.approvalStatus === 'approved' && !run.attempt && <label className="label">Type {run.confirmation}
              <input className="input mt-1" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
            </label>}
            {!closed && <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={busy || !canContinue || abandoning} onClick={() => update('continue')}>
                {run.attempt ? 'Check job and advance' : checkpoint ? 'Record checkpoint' :
                  run.approvalStatus === 'approved' ? 'Submit approved job' : run.confirmation ? 'Review or request approval' :
                    run.stage === 'post-deployment-ncc' ? 'Run NCC checks' : 'Collect acceptance checks'}
              </button>
              {stopped && !abandoning && <button className="btn-secondary" disabled={busy || !reference.trim()}
                onClick={() => update('reconcile')}>Record reconciliation</button>}
              {!active && (abandoning
                ? <button className="btn-danger" disabled={busy || !reference.trim()} onClick={() => update('abandon')}>Confirm abandon</button>
                : <button className="btn-secondary" disabled={busy} onClick={() => setAbandoning(true)}>Abandon run</button>)}
              {abandoning && <button className="btn-secondary" disabled={busy} onClick={() => setAbandoning(false)}>Keep run</button>}
            </div>}
          </section>
          {run.completed.length > 0 && <section className="space-y-2 border-t border-border pt-4">
            <h2 className="section-title">Recorded evidence</h2>
            {run.completed.map(item => <details key={`${item.stage}-${item.at}`} className="rounded border border-border p-3 text-sm">
              <summary>{title(item.stage)} · {new Date(item.at).toLocaleString()} · {item.actor}</summary>
              <pre className="overflow-auto pt-2 text-xs">{JSON.stringify(item.evidence, null, 2)}</pre>
            </details>)}
          </section>}
          {run.reconciliations.length > 0 && <section className="space-y-2 border-t border-border pt-4">
            <h2 className="section-title">Reconciliation history</h2>
            <ul className="space-y-2 text-sm">
              {run.reconciliations.map(item => <li className="break-words" key={item.at}>
                {title(item.stage)} · {item.reference} · {item.actor} · {new Date(item.at).toLocaleString()}
              </li>)}
            </ul>
          </section>}
        </>}
        {error && <p role="alert" className="text-sm">{error}</p>}
      </div>
    </Layout>
  )
}
