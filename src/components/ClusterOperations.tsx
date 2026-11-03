import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'
import { Link } from '../router'
import { httpFailure, pollReadOnly } from '../utils/readOnlyPolling'

export type ClusterRecord = {
  id: string; name: string; datacenter: string; peEndpoint: string; peCredential: string; expectedUuid: string
  expectedNodes: { serial: string; hostIp: string; cvmIp: string }[]
  configFiles: string[]; pipelineId: string; recoveryProfileId: string; owner: string
  updatedAt: string; observationFresh?: boolean
  observation?: { status: string; collectedAt: string; message: string; checks: { name: string; status: string }[] }
}
type AttentionItem = { id: string; title: string; detail: string; status: string; owner: string; notes: string; jobId?: string; recoveryRunId?: string; clusterId?: string; updatedAt: string }
type Job = { id: string; workflow: string; configFile?: string; status: string; updatedAt: string }
export type Operations = {
  revision: number; collectedAt: string; clusters: ClusterRecord[]; attention: Record<string, AttentionItem>; jobs: Job[]
  pipelines: { id: string; name: string }[]
  recoveryProfiles: { id: string; name: string; revision: number; reviewed: boolean; drifted: boolean; lastRehearsal?: string }[]
  recoveryRuns: { id: string; profileId: string; status: string; updatedAt: string; steps: { jobId: string }[]; deploymentJobId?: string; currentJobId?: string; healthEvidence?: { at: string; source?: string } }[]
}

export function when(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not recorded'
}

export async function operationsRequest<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await apiFetch('/api/operations' + path, body === undefined ? {} : { method, body: JSON.stringify(body) })
  let result
  try { result = await response.json() } catch { throw new Error(`Operational request unavailable (HTTP ${response.status}). No execution was submitted.`) }
  if (!response.ok) throw new Error(result.error || `Operational request failed (HTTP ${response.status})`)
  return result
}

export function useOperations(externalRefresh = 0) {
  const [data, setData] = useState<Operations | null>(null)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey(v => v + 1), [])
  useEffect(() => {
    return pollReadOnly(async signal => {
      const response = await apiFetch('/api/operations', { signal })
      if (!response.ok) throw httpFailure(response, `Operational records unavailable (HTTP ${response.status}). Displayed records may be stale.`)
      let value
      try { value = await response.json() } catch { throw new Error('Operational response was not JSON. Previously displayed records may be stale.') }
      if (!value || !['clusters', 'jobs', 'pipelines', 'recoveryProfiles', 'recoveryRuns'].every(key => Array.isArray(value[key]))
          || !value.attention || typeof value.attention !== 'object' || Array.isArray(value.attention)) throw new Error('Operational response is unavailable. Previously displayed records may be stale.')
      return value as Operations
    }, value => { setData(value); setError('') }, setError)
  }, [refreshKey, externalRefresh])
  return { data, error, refresh }
}

export function freshObservation(cluster: ClusterRecord) {
  const age = Date.now() - Date.parse(cluster.observation?.collectedAt || '')
  return cluster.observationFresh === true && Number.isFinite(age) && age >= 0 && age <= 900_000
}

export function healthLabel(cluster: ClusterRecord, unavailable = false) {
  if (!cluster.observation) return 'Not checked'
  if (unavailable || !freshObservation(cluster)) return 'Stale observation'
  return cluster.observation.status === 'good' ? 'PE-reported health: Good' : cluster.observation.status === 'not_good' ? 'PE-reported health needs attention' : 'Unknown / review required'
}

export function ClusterWorkspace({ data, error, refresh, editable = false, aside }: { data: Operations | null; error: string; refresh: () => void; editable?: boolean; aside?: ReactNode }) {
  const role = useStore(s => s.user?.role)
  const [search, setSearch] = useState(''), [dc, setDc] = useState(''), [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const rows = data?.clusters.filter(c => (!dc || c.datacenter === dc) && `${c.name} ${c.owner} ${c.peEndpoint}`.toLowerCase().includes(search.toLowerCase())) || []
  const cluster = rows.find(c => c.id === selected) || rows[0]
  const runs = data?.recoveryRuns.filter(r => r.profileId === cluster?.recoveryProfileId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)) || []
  const run = runs[0]
  const profile = data?.recoveryProfiles.find(p => p.id === cluster?.recoveryProfileId)
  const related = data?.jobs.filter(j => cluster?.configFiles.includes(j.configFile || '') || run?.deploymentJobId === j.id || run?.currentJobId === j.id || run?.steps.some(s => s.jobId === j.id)) || []
  const observe = async () => {
    if (!cluster || busy) return
    setBusy(true); setMessage('')
    try { await operationsRequest(`/clusters/${cluster.id}/health`, {}); refresh() }
    catch (e) { setMessage(e instanceof Error ? e.message : 'PE collection unavailable') }
    finally { setBusy(false) }
  }
  return <section className="card space-y-4" aria-label="Managed cluster workspace">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="section-title mb-1">Managed clusters</h2><p className="text-sm text-gray-400">Explicit cluster records link automation and evidence. Registering a record does not deploy or discover infrastructure.</p></div><div className="flex gap-2 items-start"><button className="btn-secondary" onClick={refresh} aria-label="Refresh operational records"><RefreshCw size={15} /></button>{!editable && <Link to="/clusters" className="btn-secondary">Manage clusters</Link>}</div></div>
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm text-gray-400 min-w-0">Search clusters<input className="input mt-1" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, owner or PE endpoint" /></label><label className="text-sm text-gray-400">Managed datacenter<select className="input mt-1" value={dc} onChange={e => setDc(e.target.value)}><option value="">All datacenters</option>{[...new Set(data?.clusters.map(c => c.datacenter).filter(Boolean))].sort().map(name => <option key={name}>{name}</option>)}</select></label></div>
    {error && <p role="status" className="text-sm text-amber-400">{error}</p>}
    <p className="text-xs text-gray-500">Last successful refresh: {when(data?.collectedAt)}. PE observations become stale after 15 minutes; viewing this page never contacts PE.</p>
    <div className={aside ? "grid xl:grid-cols-3 gap-4 items-start" : ""}><div className={aside ? "xl:col-span-2 min-w-0" : "min-w-0"}><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-gray-400">{['Cluster', 'Datacenter', 'Observed state', 'Last PE readback', 'Action'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className={`border-b border-border ${cluster?.id === row.id ? 'bg-nutanix-blue/5' : ''}`}><td className="p-3 font-semibold text-gray-100">{row.name}<p className="text-xs font-normal text-gray-500">{row.owner || 'Owner not assigned'}</p></td><td className="p-3 text-gray-400">{row.datacenter || 'Unassigned'}</td><td className={`p-3 ${!error && freshObservation(row) && row.observation?.status === 'good' ? 'text-emerald-400' : 'text-amber-400'}`}>{healthLabel(row, Boolean(error))}</td><td className="p-3 text-gray-400 whitespace-nowrap">{when(row.observation?.collectedAt)}</td><td className="p-3"><button className="text-nutanix-cyan" onClick={() => { setSelected(row.id); setMessage('') }}>Review {row.name}</button></td></tr>)}</tbody></table></div>
    {!rows.length && <p className="text-sm text-gray-400">{data ? 'No managed clusters match. Add a cluster record in Clusters; existing recovery profiles and automation remain unchanged.' : 'Loading operational records…'}</p>}</div>{aside && <div className="min-w-0">{aside}</div>}</div>
    {cluster && <div className="border border-border rounded-lg p-4 space-y-4" aria-label="Selected cluster details"><div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold text-gray-100">{cluster.name} <span className="text-sm font-normal text-gray-400">{cluster.datacenter}</span></h3><p className="text-sm text-gray-400 break-all">{cluster.peEndpoint}</p></div>
      <div className="grid lg:grid-cols-3 gap-5"><div><h4 className="font-semibold text-sm text-gray-200">PE observation</h4><p className="text-sm mt-2">{healthLabel(cluster, Boolean(error))}</p><p className="text-xs text-gray-400 mt-2">{cluster.observation?.message || 'No live evidence has been collected. Job success does not imply healthy infrastructure.'}</p>{role !== 'viewer' && <button className="btn-secondary mt-3" disabled={busy || !cluster.expectedUuid || !cluster.expectedNodes.length || !cluster.peCredential} onClick={() => void observe()}>{busy ? 'Collecting read-only PE evidence…' : 'Collect PE health (read-only)'}</button>}<p className="text-xs text-gray-500 mt-2">Requires expected UUID, node baseline, a credential reference and trusted HTTPS. No TLS bypass. This is not NCC, resilience or application verification.</p>{cluster.observation?.checks.map(check => <p className="text-xs mt-1 text-gray-400" key={check.name}>{check.name}: {check.status.replace(/_/g, ' ')}</p>)}</div>
      <div><h4 className="font-semibold text-sm text-gray-200">Configuration and jobs</h4><p className="text-sm mt-2 text-gray-400">{data?.pipelines.find(p => p.id === cluster.pipelineId)?.name || 'No pipeline linked'}</p><p className="text-xs text-gray-400 mt-2">{cluster.configFiles.length} linked files · {related.length} associated jobs. Filename association is navigation, not verified target ownership.</p><div className="flex flex-wrap gap-3 mt-3"><Link className="text-sm text-nutanix-cyan" to="/pipelines">Open pipelines</Link><Link className="text-sm text-nutanix-cyan" to="/configs">Open configuration files</Link></div><ul className="space-y-2 mt-3">{related.slice(0, 4).map(j => <li key={j.id} className="text-xs text-gray-400"><Link className="text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(j.id)}`}>{j.workflow}</Link> · {j.status === 'success' ? 'Job succeeded' : j.status}</li>)}</ul></div>
      <div><h4 className="font-semibold text-sm text-gray-200">Recovery preparation</h4><p className="text-sm mt-2 text-gray-400">{profile ? `${profile.reviewed && !profile.drifted ? 'Reviewed baseline' : 'Baseline needs review'} · Revision ${profile.revision}` : 'No recovery profile linked'}</p><p className="text-xs text-gray-400 mt-2">Last rehearsal recorded: {when(profile?.lastRehearsal)}</p><p className="text-xs text-gray-400 mt-2">{run ? `Latest run: ${run.status.replace(/_/g, ' ')} · ${run.steps.length} successful configuration steps recorded` : 'No recovery run recorded'}</p><Link className="text-sm text-nutanix-cyan inline-block mt-3" to={run ? `/recovery?run=${encodeURIComponent(run.id)}` : '/recovery'}>{run ? 'Review existing recovery run' : 'Open recovery profiles'}</Link><p className="text-xs text-gray-500 mt-2">Continue only through the existing approval, health and reconciliation gates. No automatic replay.</p></div></div>
      {message && <p role="status" className="text-sm text-amber-400">{message}</p>}</div>}
  </section>
}

export function PersistentAttention({ data, error, refresh }: { data: Operations | null; error: string; refresh: () => void }) {
  const role = useStore(s => s.user?.role)
  const [selected, setSelected] = useState(''), [owner, setOwner] = useState(''), [notes, setNotes] = useState(''), [status, setStatus] = useState('acknowledged')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [showResolved, setShowResolved] = useState(false)
  const [reviewRevision, setReviewRevision] = useState(0)
  const items = Object.values(data?.attention || {}).filter(i => showResolved || i.status !== 'resolved').sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  const save = async () => {
    if (!data || !selected) return
    setBusy(true); setMessage('')
    try { await operationsRequest(`/attention/${encodeURIComponent(selected)}`, { revision: reviewRevision, status, owner, notes }, 'PUT'); setSelected(''); refresh() }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Attention update failed') }
    finally { setBusy(false) }
  }
  return <section className="card space-y-3" aria-label="Persistent attention items"><h2 className="section-title">Needs attention <span className="text-sm text-amber-400">{Object.values(data?.attention || {}).filter(i => i.status !== 'resolved').length} open</span></h2><p className="text-xs text-gray-400">Observed failures remain until explicitly resolved. Acknowledgement does not fix the target or change execution gates.</p>{error && <p role="status" className="text-sm text-amber-400">{error}</p>}<label className="flex gap-2 text-sm text-gray-400"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Include resolved records</label>
    <ul className="divide-y divide-border max-h-[450px] overflow-y-auto">{items.map(item => <li key={item.id} className="py-3 space-y-2"><p className="font-semibold text-sm text-gray-200 flex items-center gap-2">{item.status === 'resolved' ? <CheckCircle size={16} /> : <AlertTriangle size={16} className="text-amber-400" />}{item.title}</p><p className="text-sm text-gray-400 break-words">{item.detail} · {item.status}</p><p className="text-xs text-gray-500">Owner: {item.owner || 'Unassigned'}</p><div className="flex flex-wrap gap-3">{item.jobId && <Link className="text-sm text-nutanix-cyan" to={`/jobs?job=${encodeURIComponent(item.jobId)}`}>Review original job</Link>}{item.recoveryRunId && <Link className="text-sm text-nutanix-cyan" to={`/recovery?run=${encodeURIComponent(item.recoveryRunId)}`}>Review existing run</Link>}{item.clusterId && <Link className="text-sm text-nutanix-cyan" to="/clusters">Review cluster</Link>}{role !== 'viewer' && <button className="text-sm text-nutanix-cyan" onClick={() => { setSelected(item.id); setReviewRevision(data!.revision); setOwner(item.owner); setNotes(item.notes); setStatus(item.status === 'resolved' ? 'open' : 'acknowledged') }}>Update review</button>}</div>{item.notes && <p className="text-xs text-gray-400 break-words">{item.notes}</p>}</li>)}</ul>
    {!items.length && <p className="text-sm text-gray-400">{!data ? 'Attention records have not loaded.' : 'No open observed exceptions. This is not a live health assessment.'}</p>}
    {selected && <form className="space-y-3 border-t border-border pt-3" onSubmit={e => { e.preventDefault(); void save() }}><h3 className="font-semibold text-sm">Review attention item</h3><label className="block text-sm text-gray-400">Owner<input className="input mt-1" maxLength={128} value={owner} onChange={e => setOwner(e.target.value)} /></label><label className="block text-sm text-gray-400">Review status<select aria-label="Review status" className="input mt-1" value={status} onChange={e => setStatus(e.target.value)}><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved after review</option><option value="open">Open</option></select></label><label className="block text-sm text-gray-400">Review / reconciliation notes (no secrets)<textarea className="input mt-1" maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button disabled={busy || (status !== 'open' && !notes.trim()) || (status === 'acknowledged' && !owner.trim())} className="btn-primary" type="submit">Save attention review</button><button className="btn-secondary" type="button" onClick={() => setSelected('')}>Cancel</button></div></form>}
    {message && <p role="status" className="text-sm text-amber-400">{message}</p>}<p className="text-xs text-gray-500 flex gap-1"><Clock size={12} /> A new failed PE readback can reopen a resolved observation item.</p>
  </section>
}
