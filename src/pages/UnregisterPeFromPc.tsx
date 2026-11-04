import { useState } from 'react'
import Layout from '../components/Layout'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { toYaml } from '../utils/yaml'
import { useStore } from '../store'

type Intent = { pc_endpoint: string; pc_credential: string; pe_cluster_uuid: string;
  expected_pc_uuid?: string; expected_pe_name?: string; dependencies_reviewed?: boolean }
const workflow = 'unregister-pe-from-pc'
const filename = 'unregister-pe-from-pc.yml'

export default function UnregisterPeFromPc() {
  const admin = useStore(s => s.user?.role === 'admin')
  const [endpoint, setEndpoint] = useState('')
  const [credential, setCredential] = useState('')
  const [uuid, setUuid] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [yaml, setYaml] = useState('')
  const [dependencies, setDependencies] = useState(false)
  const [approval, setApproval] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [job, setJob] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const reset = () => { setIntent(null); setYaml(''); setDependencies(false); setApproval(''); setConfirmation(''); setJob(''); setMessage('') }
  const request = async <T,>(path: string, data: object): Promise<T> => {
    const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || `Request failed (HTTP ${response.status})`)
    return result as T
  }
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Request failed') }
    finally { setBusy(false) }
  }
  const generate = () => {
    reset()
    const draft = { pc_endpoint: endpoint.trim(), pc_credential: credential.trim(), pe_cluster_uuid: uuid.trim() }
    if (!/^https:\/\//.test(draft.pc_endpoint) || !/^[A-Za-z0-9_.-]{1,128}$/.test(draft.pc_credential) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(draft.pe_cluster_uuid)) {
      setMessage('Provide an HTTPS PC endpoint, a credential reference and a canonical PE UUID.'); return
    }
    setYaml(toYaml(draft))
  }
  const reviewedYaml = intent ? toYaml({ ...intent, dependencies_reviewed: dependencies }) : yaml
  const download = () => {
    const url = URL.createObjectURL(new Blob([reviewedYaml], { type: 'text/yaml' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Layout title="Unregister PE from PC" subtitle="Review one exact PE registration before approved removal">
    <div className="max-w-5xl space-y-5">
      <p className="card text-sm text-amber-500">This removes a PE registration from the selected PC. PC-managed services and policies may be affected. Review the version-specific Nutanix procedure and dependent services first. No force cleanup, SSH fallback or automatic mutation retry is available.</p>
      {!admin && <p role="alert">An Orchestrator administrator is required to review and execute removal.</p>}
      <section className="card space-y-4">
        <h2 className="section-title">1. Generate the removal YAML</h2>
        <label className="block">PC endpoint<input className="input mt-1" value={endpoint} placeholder="https://pc.example.com:9440" onChange={e => { reset(); setEndpoint(e.target.value) }} /></label>
        <label className="block">PC credential reference<input className="input mt-1" value={credential} placeholder="pc_admin_ref" autoComplete="off" onChange={e => { reset(); setCredential(e.target.value) }} /></label>
        <label className="block">PE cluster UUID<input className="input mt-1" value={uuid} placeholder="00000000-0000-4000-8000-000000000001" onChange={e => { reset(); setUuid(e.target.value) }} /></label>
        <button className="btn-secondary" disabled={busy} onClick={generate}>Generate YAML</button>
        <p className="text-sm text-gray-400">Generation is local and makes no target requests. Passwords stay in the selected global vault. The PC must support the Prism and Cluster Management v4.2 APIs; unavailable APIs block the action.</p>
      </section>
      {yaml && <section className="card space-y-4">
        <h2 className="section-title">2. Review the exact PC and PE identity</h2>
        <pre aria-label="Removal YAML" className="overflow-x-auto rounded border border-border p-3 text-sm">{reviewedYaml}</pre>
        <div className="flex flex-wrap gap-3"><button className="btn-secondary" onClick={download}>Download YAML</button>
          <button className="btn-secondary" disabled={!admin || busy || Boolean(job)} onClick={() => void act(async () => {
            setIntent(null); setDependencies(false); setApproval(''); setConfirmation('')
            const result = await request<{ config: Intent }>('/api/pc-unregistration/review', { configContent: yaml })
            setIntent(result.config)
          })}>Look up target (read-only)</button>
        </div>
        {intent && <div className="space-y-3">
          <p>PC UUID: <strong className="break-all">{intent.expected_pc_uuid}</strong></p>
          <p>PE: <strong>{intent.expected_pe_name}</strong> · <span className="break-all">{intent.pe_cluster_uuid}</span></p>
          <label className="flex gap-2"><input type="checkbox" disabled={Boolean(job)} checked={dependencies} onChange={e => { setDependencies(e.target.checked); setApproval(''); setConfirmation('') }} />I reviewed the applicable Nutanix prerequisites and dependent services, including DR/replication, networking and application management. This lookup does not verify those dependencies.</label>
          <p className="text-sm text-gray-400">The returned identities are captured into the YAML. Changing inputs or this acknowledgement clears the approval. Vendor unregistration preflight must also succeed before submission.</p>
        </div>}
      </section>}
      {intent && <section className="card space-y-4">
        <h2 className="section-title">3. Obtain approval and confirm removal</h2>
        <button className="btn-secondary" disabled={!admin || busy || !dependencies || Boolean(approval) || Boolean(job)} onClick={() => void act(async () => {
          const result = await request<{ id: string }>('/api/approvals', { workflow, configFile: filename, configContent: reviewedYaml, notes: `Remove the reviewed PE registration: ${intent.expected_pe_name}` })
          setApproval(result.id); setMessage('Approval requested. A different administrator must approve this exact YAML.')
        })}>Request removal approval</button>
        {approval && <p>Approval: <span className="break-all">{approval}</span> · <Link className="text-nutanix-cyan" to="/approvals">Open Approvals</Link></p>}
        <label className="block">Type UNREGISTER {intent.pe_cluster_uuid}<input className="input mt-1" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>
        <button className="btn-primary" disabled={!admin || busy || !dependencies || !approval || Boolean(job) || confirmation !== `UNREGISTER ${intent.pe_cluster_uuid}`} onClick={() => void act(async () => {
          const result = await request<{ id: string }>('/api/jobs', { workflow, configFile: filename, configContent: reviewedYaml, approvalId: approval,
            riskAcknowledged: true, destructiveConfirmation: confirmation })
          setJob(result.id)
        })}>Submit approved removal once</button>
        {job && <p>Submitted. <Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(job)}`}>Follow this job and its verification</Link>. Do not resubmit if the browser disconnects.</p>}
        <p className="text-sm text-gray-400">Verification requires a successful PC task and a fresh read showing the PE absent from the same PC inventory. PE-side registration state, cleanup and dependent-service acceptance remain separate follow-up checks. Cancellation does not guarantee target-side work stops.</p>
      </section>}
      {message && <p role="status" className="card break-words">{message}</p>}
    </div>
  </Layout>
}
