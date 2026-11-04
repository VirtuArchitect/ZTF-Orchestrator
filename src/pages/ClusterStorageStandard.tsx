import { useState } from 'react'
import yaml from 'js-yaml'
import Layout from '../components/Layout'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { toYaml } from '../utils/yaml'

const workflow = 'cluster-storage-standard'
const filename = 'cluster-storage-standard.yml'
type Reviewed = { expected_cluster_uuid: string; expected_default: { name: string; uuid: string } | null; [key: string]: unknown }
const example = toYaml({ pe_endpoint: 'https://pe.example.com:9440', pe_credential: 'pe_admin_ref', containers: [
  { name: 'CLUSTER01-DATA', replication_factor: 2, compression_enabled: true, on_disk_dedup: 'OFF', erasure_code: 'OFF' },
  { name: 'CLUSTER01-INFRA', replication_factor: 2, compression_enabled: true, on_disk_dedup: 'OFF', erasure_code: 'OFF' },
  { name: 'CLUSTER01-SERVICE', replication_factor: 2, compression_enabled: true, on_disk_dedup: 'OFF', erasure_code: 'OFF' },
] })

export default function ClusterStorageStandard() {
  const [draft, setDraft] = useState(example)
  const [reviewed, setReviewed] = useState<Reviewed | null>(null)
  const [ack, setAck] = useState(false)
  const [approval, setApproval] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [job, setJob] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const content = reviewed ? toYaml({ ...reviewed, dependencies_reviewed: ack }) : draft
  const reset = () => { setReviewed(null); setAck(false); setApproval(''); setConfirmation(''); setJob(''); setMessage('') }
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
  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Layout title="Cluster Storage Standard" subtitle="Create three cluster-specific containers and verify default cleanup">
    <div className="max-w-5xl space-y-5">
      <p className="card text-sm">Run after cluster deployment. The three container names and settings come from this cluster’s YAML. This workflow creates missing replacements, verifies their requested settings, then removes only the reviewed default-container-&lt;digits&gt;. Existing replacements are never modified. System containers are excluded.</p>
      <section className="card space-y-4">
        <h2 className="section-title">1. Define this cluster’s containers</h2>
        <p className="text-sm text-gray-400">Replace the example endpoint, credential reference, names and settings. Exactly three distinct containers are required. Use RF 1 only where the cluster supports it. Passwords belong in the global vault.</p>
        <label className="block" htmlFor="cluster-storage-yaml">Cluster storage YAML</label><textarea id="cluster-storage-yaml" className="input mt-1 font-mono text-sm min-h-80" value={draft} disabled={busy || Boolean(job)} onChange={e => { reset(); setDraft(e.target.value) }} />
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" disabled={busy || Boolean(job)} onClick={() => {
            try { yaml.load(draft); setMessage('YAML syntax is valid. Target lookup performs full intent validation; no target requests made by this syntax check.') }
            catch { setMessage('Invalid YAML syntax.') }
          }}>Check YAML syntax locally</button>
          <button className="btn-secondary" onClick={download}>Download YAML</button>
          <button className="btn-primary" disabled={busy || Boolean(job)} onClick={() => void act(async () => {
            reset()
            const result = await request<{ config: Reviewed }>('/api/cluster-storage-standard/review', { configContent: draft })
            setReviewed(result.config)
          })}>Discover default (read-only)</button>
        </div>
      </section>
      {reviewed && <section className="card space-y-4">
        <h2 className="section-title">2. Review identities and cleanup prerequisites</h2>
        <p className="break-all">Cluster UUID: {reviewed.expected_cluster_uuid}</p>
        <p className="break-all">Default: {reviewed.expected_default ? `${reviewed.expected_default.name} · ${reviewed.expected_default.uuid}` : 'Already absent at review; no deletion is planned.'}</p>
        <p className="text-sm text-amber-500">VDisk dependencies or incomplete inventory block cleanup. No disks, images or VMs are deleted or migrated. A failure may leave the three replacements created; reconcile the job before retrying. No automatic rollback or force cleanup is performed.</p>
        <label className="flex gap-2"><input type="checkbox" checked={ack} disabled={busy || Boolean(job)} onChange={e => { setAck(e.target.checked); setApproval(''); setConfirmation('') }} />I reviewed the cluster identity, replacement settings and dependencies, and authorize default cleanup only when eligible.</label>
        <pre aria-label="Reviewed storage YAML" className="overflow-x-auto rounded border border-border p-3 text-sm">{content}</pre>
        <button className="btn-secondary" disabled={busy || !ack || Boolean(approval) || Boolean(job)} onClick={() => void act(async () => {
          const result = await request<{ id: string }>('/api/approvals', { workflow, configFile: filename, configContent: content, notes: 'Create and verify three replacement containers, then clean up the exact reviewed default container.' })
          setApproval(result.id); setMessage('A different administrator must approve this exact YAML.')
        })}>Request storage approval</button>
        {approval && <p>Approval: {approval} · <Link className="text-nutanix-cyan" to="/approvals">Open Approvals</Link></p>}
        <label className="block">Type APPLY STORAGE {reviewed.expected_cluster_uuid}<input className="input mt-1" value={confirmation} disabled={busy || Boolean(job)} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label>
        <button className="btn-primary" disabled={busy || !ack || !approval || Boolean(job) || confirmation !== `APPLY STORAGE ${reviewed.expected_cluster_uuid}`} onClick={() => void act(async () => {
          const result = await request<{ id: string }>('/api/jobs', { workflow, configFile: filename, configContent: content, approvalId: approval,
            riskAcknowledged: true, destructiveConfirmation: confirmation })
          setJob(result.id)
        })}>Submit approved storage job once</button>
        {job && <p><Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(job)}`}>Follow storage job and verification</Link>. Do not resubmit after a browser disconnect.</p>}
      </section>}
      {message && <p role="status" className="card break-words">{message}</p>}
    </div>
  </Layout>
}
