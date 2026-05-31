import { useEffect, useState } from 'react'
import { Layers, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Loader } from 'lucide-react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import type { ParallelRun, ParallelSiteInput } from '../types'
import Layout from '../components/Layout'
import clsx from 'clsx'

const WORKFLOWS = [
  'cluster-create','imaging-only','imaging','site-deploy','config-cluster',
  'deploy-pc','config-pc','pod-config','deploy-management-pc',
  'config-management-pc','calm-vm-workloads','calm-edgeai-vm-workload',
  'ndb','lcm-update',
]

function SiteStatusIcon({ status }: { status: string }) {
  if (status === 'success')  return <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
  if (status === 'failed')   return <XCircle size={14} className="text-red-400 flex-shrink-0" />
  if (status === 'running')  return <Loader size={14} className="text-nutanix-teal animate-spin flex-shrink-0" />
  if (status === 'pending')  return <Clock size={14} className="text-gray-500 flex-shrink-0" />
  return <XCircle size={14} className="text-amber-400 flex-shrink-0" />
}

function OverallBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    partial: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    failed:  'bg-red-500/20 text-red-300 border-red-500/30',
    unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded border font-medium', map[status] ?? map.unknown)}>
      {status}
    </span>
  )
}

const EMPTY_SITE = (): ParallelSiteInput => ({ label: '', configContent: '' })

export default function ParallelExecution() {
  const sessionToken = useStore(s => s.sessionToken)
  const [runs, setRuns]             = useState<ParallelRun[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [workflow, setWorkflow]     = useState(WORKFLOWS[0])
  const [sites, setSites]           = useState<ParallelSiteInput[]>([EMPTY_SITE(), EMPTY_SITE()])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})
  const [polling, setPolling]       = useState(false)

  const load = async () => {
    const r = await apiFetch('/api/parallel-runs', { headers: { Authorization: `Bearer ${sessionToken}` } })
    if (r.ok) setRuns(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Poll while any run is active
  useEffect(() => {
    const active = runs.some(r => r.status === 'running')
    if (active && !polling) {
      setPolling(true)
      const id = setInterval(load, 3000)
      return () => { clearInterval(id); setPolling(false) }
    }
  }, [runs])

  const addSite    = () => setSites(s => [...s, EMPTY_SITE()])
  const removeSite = (i: number) => setSites(s => s.filter((_, j) => j !== i))
  const updateSite = (i: number, field: keyof ParallelSiteInput, val: string) =>
    setSites(s => s.map((site, j) => j === i ? { ...site, [field]: val } : site))

  const submit = async () => {
    if (sites.length < 2) { setFormError('Add at least 2 sites'); return }
    if (sites.some(s => !s.configContent.trim())) { setFormError('All sites need config content'); return }
    setSubmitting(true); setFormError('')
    const namedSites = sites.map((s, i) => ({ ...s, label: s.label || `Site ${i + 1}` }))
    const r = await apiFetch('/api/parallel-runs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow, sites: namedSites }),
    })
    setSubmitting(false)
    if (!r.ok) { const e = await r.json(); setFormError(e.error || 'Failed'); return }
    setShowForm(false); await load()
  }

  const del = async (id: string) => {
    if (!confirm('Delete this parallel run record?')) return
    await apiFetch(`/api/parallel-runs/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` } })
    await load()
  }

  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <Layout title="Parallel Execution">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <Layers size={24} className="text-nutanix-teal" /> Parallel Execution
            </h1>
            <p className="text-gray-400 text-sm mt-1">Run the same workflow against multiple sites concurrently</p>
          </div>
          <button onClick={() => { setShowForm(true); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 bg-nutanix-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New Parallel Run
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading…</div>
        ) : runs.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <Layers size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">No parallel runs yet. Create one to execute a workflow across multiple sites simultaneously.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map(run => (
              <div key={run.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-200 text-sm">{run.workflow}</span>
                      <OverallBadge status={run.status} />
                      <span className="text-xs text-gray-500">{run.sites.length} sites</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(run.startedAt).toLocaleString()} · by {run.user}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => del(run.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                    <button onClick={() => toggle(run.id)} className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors">
                      {expanded[run.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {expanded[run.id] && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {run.sites.map((site, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <SiteStatusIcon status={site.status} />
                          <span className="text-sm font-medium text-gray-300">{site.label}</span>
                          {site.returnCode !== null && (
                            <span className="text-xs text-gray-600 font-mono">rc={site.returnCode}</span>
                          )}
                          {site.finishedAt && (
                            <span className="text-xs text-gray-600 ml-auto">{new Date(site.finishedAt).toLocaleTimeString()}</span>
                          )}
                        </div>
                        {site.output && (
                          <pre className="mt-2 text-xs font-mono text-gray-400 bg-gray-900/60 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                            {site.output}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4 p-6">
              <h2 className="text-lg font-bold text-gray-100">New Parallel Run</h2>

              {formError && <p className="text-red-400 text-sm">{formError}</p>}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Workflow</label>
                <select value={workflow} onChange={e => setWorkflow(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue">
                  {WORKFLOWS.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Sites ({sites.length} / 10)</label>
                  {sites.length < 10 && (
                    <button onClick={addSite} className="text-xs text-nutanix-teal hover:text-teal-300 flex items-center gap-1">
                      <Plus size={12} /> Add site
                    </button>
                  )}
                </div>
                {sites.map((site, i) => (
                  <div key={i} className="bg-surface border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={site.label} onChange={e => updateSite(i, 'label', e.target.value)}
                        placeholder={`Site ${i + 1} label`}
                        className="flex-1 bg-gray-800 border border-border rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-nutanix-blue" />
                      {sites.length > 2 && (
                        <button onClick={() => removeSite(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <textarea value={site.configContent} onChange={e => updateSite(i, 'configContent', e.target.value)}
                      rows={4} placeholder="pc_ip: 10.0.0.1&#10;pc_credential: pc-cred"
                      className="w-full bg-gray-800 border border-border rounded px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-nutanix-blue resize-none" />
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={submit} disabled={submitting}
                  className="flex-1 py-2 bg-nutanix-blue hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {submitting ? 'Submitting…' : 'Run in Parallel'}
                </button>
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2 bg-surface hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium border border-border transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
