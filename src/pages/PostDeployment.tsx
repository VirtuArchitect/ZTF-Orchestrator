import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { Link } from '../router'
import { apiFetch } from '../utils/api'

const fqdnWorkflow = 'set-cluster-fqdn'
const lcmWorkflow = 'managed-cluster-lcm-inventory'
const base = '/api/post-deployment'
type Workflow = typeof fqdnWorkflow | typeof lcmWorkflow
type Mode = Workflow | 'acceptance' | 'certificate-check' | 'cvm-rename-plan'
type Plan = { content: string; sha256: string; confirmation: string }
type Result = { status: string; clusterUuid: string; collectedAt: string; checks: { label: string; passed: boolean }[] }
type CertificateResult = { fqdn: string; endpoints: { address: string; leafSha256: string }[] }
type RenamePlan = { nodes: { serial: string; cvmAddress: string; displayName: string }[] }
const modes: { id: Mode; label: string }[] = [
  { id: fqdnWorkflow, label: 'Cluster FQDN' },
  { id: lcmWorkflow, label: 'LCM inventory' },
  { id: 'certificate-check', label: 'PE certificate check' },
  { id: 'cvm-rename-plan', label: 'CVM rename plan' },
  { id: 'acceptance', label: 'Acceptance checks' },
]
const submitLabel: Record<Mode, string> = {
  [fqdnWorkflow]: 'Run read-only preflight',
  [lcmWorkflow]: 'Run read-only preflight',
  'certificate-check': 'Verify installed certificate',
  'cvm-rename-plan': 'Build read-only rename plan',
  acceptance: 'Collect read-only checks',
}
const fields = [
  { id: 'pe_endpoint', label: 'Prism Element endpoint', placeholder: 'https://pe.example.com:9440' },
  { id: 'pe_credential', label: 'PE credential reference', placeholder: 'pe_admin_ref' },
  { id: 'pc_endpoint', label: 'Prism Central endpoint', placeholder: 'https://pc.example.com:9440' },
  { id: 'pc_credential', label: 'PC credential reference', placeholder: 'pc_admin_ref' },
  { id: 'cluster_uuid', label: 'Managed cluster UUID', placeholder: '' },
] as const
const splitLines = (value: string) => value.split(/\r?\n/).map(line => line.trim()).filter(Boolean)

async function post<T>(action: string, body: object): Promise<T> {
  const response = await apiFetch(`${base}/${action}`, { method: 'POST', body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `Request failed (HTTP ${response.status})`)
  return result as T
}

export default function PostDeployment() {
  const [mode, setMode] = useState<Mode>(fqdnWorkflow)
  const [values, setValues] = useState<Record<string, string>>({})
  const [enabled, setEnabled] = useState<Partial<Record<Workflow, boolean>>>({})
  const [plan, setPlan] = useState<Plan | null>(null)
  const [approval, setApproval] = useState('')
  const [approvalState, setApprovalState] = useState('')
  const [confirm, setConfirm] = useState('')
  const [job, setJob] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [certificate, setCertificate] = useState<CertificateResult | null>(null)
  const [rename, setRename] = useState<RenamePlan | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    apiFetch(base).then(response => response.ok ? response.json() : {}).then(value => {
      if (active) setEnabled(value)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const clear = () => {
    setPlan(null); setApproval(''); setApprovalState(''); setConfirm(''); setJob(''); setResult(null); setError('')
    setCertificate(null); setRename(null)
  }
  const change = (id: string, value: string) => {
    clear()
    setValues(previous => ({ ...previous, [id]: value }))
  }
  const run = async (action: () => Promise<void>) => {
    setError(''); setBusy(true)
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed') }
    finally { setBusy(false) }
  }
  const connection = Object.fromEntries(fields.map(field => [field.id, (values[field.id] || '').trim()]))
  const canSubmit = (mode === fqdnWorkflow || mode === lcmWorkflow) && enabled[mode] === true
  const input = (id: string, label: string, placeholder = '') => (
    <label key={id} className="label">
      {label}
      <input className="input mt-1" value={values[id] || ''} onChange={event => change(id, event.target.value)}
        placeholder={placeholder} required autoComplete="off" spellCheck={false} />
    </label>
  )
  return (
    <Layout title="Post-deployment checks" subtitle="Managed AHV cluster configuration and acceptance">
      <div className="max-w-5xl space-y-6">
        <Link className="btn-secondary" to="/configure/post-deployment/runs">Post-deployment sequence</Link>
        <div role="group" aria-label="Post-deployment operation" className="flex flex-wrap gap-2">
          {modes.map(item => <button key={item.id} type="button" aria-pressed={mode === item.id}
            className={mode === item.id ? 'btn-primary' : 'btn-secondary'} disabled={busy}
            onClick={() => { if (item.id !== mode) { clear(); setMode(item.id) } }}>{item.label}</button>)}
        </div>
        <form className="space-y-4" onSubmit={event => {
          event.preventDefault()
          clear()
          void run(async () => {
            if (mode === 'certificate-check') {
              setCertificate(await post<CertificateResult>(mode, { connection, fqdn: values.fqdn?.trim() }))
            } else if (mode === 'cvm-rename-plan') {
              setRename(await post<RenamePlan>(mode, { connection, hostSerials: splitLines(values.hostSerials || '') }))
            } else if (mode === 'acceptance') {
              setResult(await post<Result>('acceptance', { connection, fqdn: values.fqdn?.trim(),
                repository: values.repository?.trim(), hostSerials: splitLines(values.hostSerials || ''),
                containers: splitLines(values.containers || '') }))
            } else {
              const desired = mode === fqdnWorkflow ? { fqdn: values.fqdn?.trim() } : { repository: values.repository?.trim() }
              setPlan(await post<Plan>('preflight', { workflow: mode, intent: { connection, ...desired } }))
            }
          })
        }}>
          <fieldset className="space-y-4" disabled={busy || Boolean(job)}>
            <legend className="section-title mb-3">Managed cluster</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map(field => input(field.id, field.label, field.placeholder))}
              {(mode === fqdnWorkflow || mode === 'acceptance' || mode === 'certificate-check')
                && input('fqdn', 'Expected cluster FQDN', 'pe.example.com')}
              {(mode === lcmWorkflow || mode === 'acceptance')
                && input('repository', 'Expected Dark Site repository URL', 'https://lcm.example.com/release')}
            </div>
            {(mode === 'acceptance' || mode === 'cvm-rename-plan') && <div className="grid gap-3 sm:grid-cols-2">
              {[['hostSerials', mode === 'cvm-rename-plan' ? 'Expected AHV host serials in node order' : 'Expected AHV host serials'],
                ...(mode === 'acceptance' ? [['containers', 'Expected storage containers']] : [])].map(([id, label]) =>
                <label className="label" key={id}>{label} (one per line)
                  <textarea className="input mt-1" rows={4} required value={values[id] || ''}
                    onChange={event => change(id, event.target.value)} />
                </label>)}
            </div>}
            <button className="btn-primary" type="submit">{submitLabel[mode]}</button>
          </fieldset>
        </form>
        {plan && <section aria-labelledby="post-deployment-plan" className="space-y-3 border-t border-border pt-4">
          <h2 className="section-title" id="post-deployment-plan">Reviewed plan</h2>
          <p className="text-xs break-all text-gray-400">SHA-256: {plan.sha256}</p>
          <pre className="overflow-auto rounded border border-border p-3 text-xs">{JSON.stringify(JSON.parse(plan.content), null, 2)}</pre>
          {!canSubmit && <p role="status" className="text-sm text-gray-300">Submission is disabled for this operation.</p>}
          <button className="btn-secondary" disabled={!canSubmit || busy || Boolean(approval || job)}
            onClick={() => void run(async () => {
              setApproval((await post<{ id: string }>('approval', { content: plan.content })).id)
              setApprovalState('pending')
            })}>
            Request independent approval
          </button>
          {approval && <div className="space-y-3">
            <p role="status" className="text-sm">Approval: {approval} · {approvalState} · <Link className="text-nutanix-cyan"
              to="/approvals" target="_blank" rel="noopener noreferrer">Open Approvals</Link></p>
            <button className="btn-secondary" disabled={busy || Boolean(job)} onClick={() => void run(async () => {
              setApprovalState('')
              const response = await apiFetch(`/api/approvals/${encodeURIComponent(approval)}`)
              if (!response.ok) throw new Error('Could not read the approval status.')
              const observed = await response.json() as { status: string; configContent: string; jobId?: string }
              if (observed.configContent !== plan.content) throw new Error('The approval does not match this plan.')
              setApprovalState(observed.status)
              if (observed.jobId) setJob(observed.jobId)
            })}>Check approval status</button>
            <label className="label">Type {plan.confirmation}
              <input className="input mt-1" value={confirm} disabled={busy || Boolean(job)} autoComplete="off"
                onChange={event => setConfirm(event.target.value)} />
            </label>
            <button className="btn-primary" disabled={!canSubmit || busy || Boolean(job)
              || approvalState !== 'approved' || confirm !== plan.confirmation}
              onClick={() => void run(async () => setJob((await post<{ id: string }>('apply', {
                content: plan.content, approvalId: approval, confirmation: confirm,
              })).id))}>Submit approved job</button>
          </div>}
          {job && <p><Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(job)}`}>View submitted job</Link></p>}
        </section>}
        {result && <section aria-labelledby="post-deployment-results" className="space-y-3 border-t border-border pt-4">
          <h2 className="section-title" id="post-deployment-results">{result.status === 'blocked' ? 'Acceptance checks blocked' : 'Operator acceptance required'}</h2>
          <ul className="space-y-1 text-sm">
            {result.checks.map(check => <li key={check.label}>{check.passed ? 'Passed' : 'Not verified'}: {check.label}</li>)}
          </ul>
          <p className="text-xs text-gray-400 break-all">{result.clusterUuid} · {result.collectedAt}</p>
          <p className="text-sm text-gray-300">Outstanding evidence: NCC, completed LCM inventory, network and storage acceptance,
            and encryption completion and key backup where required.</p>
        </section>}
        {certificate && <section aria-labelledby="post-deployment-certificate" className="space-y-3 border-t border-border pt-4">
          <h2 className="section-title" id="post-deployment-certificate">Trusted PE certificate verified</h2>
          <p className="break-all text-sm">{certificate.fqdn}</p>
          <ul className="space-y-2 text-sm">
            {certificate.endpoints.map(endpoint => <li key={endpoint.address}>
              <span className="block">{endpoint.address}</span>
              <span className="break-all font-mono text-xs">Leaf SHA-256: {endpoint.leafSha256}</span>
            </li>)}
          </ul>
        </section>}
        {rename && <section aria-labelledby="post-deployment-rename" className="space-y-3 border-t border-border pt-4">
          <h2 className="section-title" id="post-deployment-rename">Proposed CVM display names</h2>
          <ol className="space-y-2 text-sm">
            {rename.nodes.map(node => <li key={node.serial} className="break-all">
              <strong>{node.displayName}</strong><span className="block">{node.serial} · {node.cvmAddress}</span>
            </li>)}
          </ol>
          <p className="text-sm text-gray-300">No CVMs were renamed. For supervised changes, verify the current mapping and recheck cluster health after each CVM.</p>
        </section>}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <section className="space-y-3 border-t border-border pt-4">
          <h2 className="section-title">Separate change workflows</h2>
          <div className="flex flex-wrap gap-3">
            <Link className="btn-secondary" to="/workflows/pe-certificate-baseline">PE certificate handoff</Link>
            <Link className="btn-secondary" to="/workflows/cluster-storage-standard">Cluster Storage Standard</Link>
            <Link className="btn-secondary" to="/configure/ahv-uplink-migration">AHV Uplink Migration</Link>
            <Link className="btn-secondary" to="/configure/dare">Enable DARE</Link>
          </div>
          <p className="text-sm text-gray-300">PE certificate replacement and rolling CVM display renames remain supervised.</p>
        </section>
      </div>
    </Layout>
  )
}
