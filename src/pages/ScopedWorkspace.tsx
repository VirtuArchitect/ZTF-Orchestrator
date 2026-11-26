import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'

type Scope = { id: string; name: string; datacenter: string; peIp: string; clusterUuid: string }
type Pipeline = { id: string; name: string; bindingId: string; scopeIds: string[]; steps: { workflow: string }[]; executable: boolean; reviewRequired: boolean }
type Event = { type: string; data: { step?: number; status?: string; returnCode?: number } }
type Run = { id: string; pipelineId: string; status: string; events: Event[]; canCancel: boolean; reconciliationRequired?: boolean }
type Workspace = { user: { username: string; role: 'admin'|'operator'|'viewer' }; capabilities: string[]; scopes: Scope[]; pipelines: Pipeline[]; runs: Run[]; requests: { id: string; kind: string; status: string }[]; recovery: { id: string; status: string; completedSteps: number; totalSteps: number }[]; drafts: { id: string; name: string; status: string }[] }

export default function ScopedWorkspace() {
  const [data, setData] = useState<Workspace | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [scope, setScope] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [chosen, setChosen] = useState<Pipeline | null>(null)
  const [busy, setBusy] = useState(false)
  const [events, setEvents] = useState<Event[]>([])
  const [draftName, setDraftName] = useState('')
  const [draftSteps, setDraftSteps] = useState('config-cluster')
  async function load() {
    try {
      const response = await apiFetch('/api/access/workspace')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Workspace unavailable')
      setData(result)
      const state = useStore.getState()
      if (state.user?.role !== result.user.role) state.setAuth(state.sessionToken, result.user)
      setError('')
    } catch (e) { setData(null); setError(String(e instanceof Error ? e.message : e)) }
  }
  useEffect(() => { void load() }, [])
  const can = (cap: string) => data?.user.role === 'operator' && data.capabilities.includes(cap)
  async function change(path: string, body: unknown) {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Request failed')
      setNotice('Recorded. A request or draft does not execute a workflow.'); await load()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    finally { setBusy(false) }
  }
  async function execute() {
    if (!chosen || confirmation !== `RUN ${chosen.id}`) return
    setBusy(true); setEvents([]); setError(''); setNotice('')
    try {
      const response = await apiFetch(`/api/access/pipelines/${encodeURIComponent(chosen.bindingId)}/run`, { method: 'POST', body: JSON.stringify({ confirmation }) })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Run refused') }
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No status stream. Ask an administrator to reconcile before retrying.')
      const decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const next = await reader.read()
        if (next.done) break
        buffer += decoder.decode(next.value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6))
          if (event.type !== 'receipt') setEvents(old => [...old, event])
        }
      }
      setNotice('Status stream ended. Review the recorded result before another run.'); await load()
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); await load() }
    finally { setBusy(false); setChosen(null); setConfirmation('') }
  }
  return <Layout title="Operations workspace" subtitle="Assigned clusters, reviewed pipelines and structured recovery status" actions={<button className="btn-secondary" onClick={() => void load()}>Refresh status</button>}>
    <div className="space-y-5 max-w-6xl">
      <div className="card"><h2 className="font-semibold text-lg">{data?.user.role === 'viewer' ? 'Read-only access' : 'Scoped operational access'}</h2><p className="text-sm text-gray-400 mt-2">Only assigned targets are visible. Credentials, raw configuration, unrestricted scripts and administration are restricted. Recovery execution and approvals remain administrator controlled.</p></div>
      {error && <div role="alert" className="card border-red-500 text-red-400">{error}</div>}
      {notice && <div role="status" className="card">{notice}</div>}
      {data && <>
        <section className="card"><h2 className="text-lg font-semibold mb-3">Assigned datacentres and clusters</h2>
          {!data.scopes.length && <p>No clusters assigned. Ask an administrator to grant target access.</p>}
          <div className="grid gap-3 sm:grid-cols-2">{data.scopes.map(item => <article className="rounded-lg border border-border p-4" key={item.id}><p className="text-sm text-gray-400">{item.datacenter}</p><h3 className="font-semibold">{item.name}</h3><p className="text-sm break-all">{item.peIp}</p><p className="text-xs text-gray-500 break-all">UUID {item.clusterUuid}</p></article>)}</div>
        </section>
        <section className="card"><h2 className="text-lg font-semibold mb-3">Reviewed pipelines</h2>
          {!data.pipelines.length && <p>No reviewed pipelines available for these assignments.</p>}
          {data.pipelines.map(item => <article className="border border-border rounded-lg p-4 mb-3" key={item.bindingId}><h3 className="font-semibold">{item.name}</h3><ol className="list-decimal ml-5 text-sm my-2">{item.steps.map((step, i) => <li key={i}>{step.workflow}</li>)}</ol><p className="text-sm">{item.reviewRequired ? 'Administrator review required: saved intent changed.' : 'Exact pipeline and target scope reviewed.'}</p>{can('pipeline.execute') && <button className="btn-primary mt-3" disabled={!item.executable || busy} onClick={() => { setChosen(item); setConfirmation('') }}>Run reviewed pipeline</button>}</article>)}
          {chosen && <div className="border border-border rounded-lg p-4" role="group" aria-label="Confirm reviewed pipeline"><p>Run {chosen.name}. Existing Governance checks still apply.</p><label className="block my-3">Type RUN {chosen.id}<input className="input mt-2" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><button className="btn-primary" disabled={busy || confirmation !== `RUN ${chosen.id}`} onClick={() => void execute()}>Confirm execution</button></div>}
          {!!events.length && <ol role="status" className="mt-4 text-sm">{events.map((event, i) => <li key={i}>{event.type.replace(/_/g, ' ')}{event.data.step !== undefined ? ` Â· Step ${event.data.step + 1}` : ''}{event.data.status ? ` Â· ${event.data.status}` : ''}</li>)}</ol>}
        </section>
        <section className="card"><h2 className="text-lg font-semibold mb-3">Pipeline run receipts</h2><p className="text-sm text-gray-400 mb-3">Structured status only. Cancellation may leave remote work running; an administrator must reconcile before retrying.</p>{!data.runs.length && <p>No scoped run receipts recorded.</p>}{data.runs.map(run => <article key={run.id} className="border-t border-border py-3"><p>{run.pipelineId} Â· {run.status}</p><p className="text-xs text-gray-500">{run.id}</p>{run.reconciliationRequired && <p className="text-amber-500">Administrator reconciliation required. Completed work must not be repeated.</p>}{run.events.map((event, i) => <p key={i} className="text-sm">{event.type.replace(/_/g, ' ')} {event.data.step !== undefined ? `Step ${event.data.step + 1}` : ''} {event.data.status || ''}</p>)}{run.canCancel && <button className="btn-secondary" disabled={busy} onClick={() => void change(`/api/access/runs/${encodeURIComponent(run.id)}/cancel`, {})}>Request cancellation of my run</button>}</article>)}</section>
        <section className="card"><h2 className="text-lg font-semibold mb-3">Recovery status</h2>{!data.recovery.length && <p>No recovery runs for assigned clusters.</p>}{data.recovery.map(run => <p key={run.id}>{run.id} Â· {run.status} Â· {run.completedSteps}/{run.totalSteps} configuration steps completed</p>)}<p className="text-sm text-gray-400 mt-3">An administrator resumes recovery using the existing approvals and completed-step journal.</p></section>
        {(can('requests.create') || can('drafts.create')) && <section className="card"><h2 className="text-lg font-semibold mb-3">Plan or request work</h2><label className="block mb-3">Assigned cluster<select aria-label="Assigned cluster" className="input mt-2" value={scope} onChange={e => setScope(e.target.value)}><option value="">Select a cluster</option>{data.scopes.map(item => <option key={item.id} value={item.id}>{item.datacenter} / {item.name}</option>)}</select></label>{can('requests.create') && <div className="flex flex-wrap gap-2">{['deployment','recovery','change'].map(kind => <button className="btn-secondary" key={kind} disabled={!scope || busy} onClick={() => void change('/api/access/requests', { kind, scopeIds: [scope] })}>Request {kind}</button>)}</div>}{can('drafts.create') && <div className="mt-4"><p className="text-sm">Drafts are action plans. An administrator authors and reviews executable configuration separately.</p><label className="block my-2">Draft name<input className="input" value={draftName} onChange={e => setDraftName(e.target.value)} maxLength={120} /></label><label className="block my-2">Action IDs, one per line<textarea className="input" value={draftSteps} onChange={e => setDraftSteps(e.target.value)} /></label><p className="text-xs text-gray-400">config-cluster, ChangeDefaultAdminPasswordPe, CreateLocalUsersPe, SetPrismLoginTitlePe</p><button className="btn-secondary mt-2" disabled={!scope || !draftName.trim() || busy} onClick={() => void change('/api/access/drafts', { name: draftName, steps: draftSteps.split('\n').map(s => s.trim()).filter(Boolean), scopeIds: [scope] })}>Save action-plan draft</button></div>}</section>}
        <section className="card"><h2 className="text-lg font-semibold mb-3">Operational requests</h2>{!data.requests.length && <p>No requests for assigned clusters.</p>}{data.requests.map(item => <p key={item.id}>{item.kind} Â· {item.status}</p>)}{data.drafts.map(item => <p key={item.id}>Draft: {item.name} Â· {item.status}</p>)}</section>
      </>}
    </div>
  </Layout>
}
