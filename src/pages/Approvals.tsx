import { useEffect, useState } from 'react'
import { ShieldCheck, Plus, CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import type { ApprovalRequest, ApprovalStatus } from '../types'
import Layout from '../components/Layout'
import clsx from 'clsx'

const WORKFLOWS = [
  'cluster-create','imaging-only','imaging','site-deploy','config-cluster',
  'deploy-pc','config-pc','pod-config','deploy-management-pc',
  'config-management-pc','calm-vm-workloads','calm-edgeai-vm-workload',
  'ndb','lcm-update',
]

const STATUS_FILTERS: ApprovalStatus[] = ['pending','approved','rejected','expired']
type LifecycleFilter = 'active' | 'history' | 'all'

function StatusBadge({ status }: { status: ApprovalStatus }) {
  const map: Record<ApprovalStatus, { icon: React.ReactNode; cls: string }> = {
    pending:  { icon: <Clock size={12} />,      cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    approved: { icon: <CheckCircle size={12} />, cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    rejected: { icon: <XCircle size={12} />,    cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
    expired:  { icon: <AlertCircle size={12} />, cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  }
  const s = map[status]
  return (
    <span className={clsx('flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium', s.cls)}>
      {s.icon} {status}
    </span>
  )
}

interface FormState { workflow: string; configContent: string; notes: string }
const EMPTY_FORM: FormState = { workflow: WORKFLOWS[0], configContent: '', notes: '' }

export default function Approvals() {
  const sessionToken = useStore(s => s.sessionToken)
  const user         = useStore(s => s.user)
  const isAdmin      = user?.role === 'admin'

  const [approvals, setApprovals]   = useState<ApprovalRequest[]>([])
  const [filter, setFilter]         = useState<ApprovalStatus | 'all'>('all')
  const [lifecycle, setLifecycle]   = useState<LifecycleFilter>('active')
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})
  const [decideNote, setDecideNote] = useState<Record<string, string>>({})
  const [deciding, setDeciding]     = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await apiFetch('/api/approvals', { headers: { Authorization: `Bearer ${sessionToken}` } })
    if (r.ok) setApprovals(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!form.configContent.trim()) { setFormError('Config content is required'); return }
    setSaving(true); setFormError('')
    const r = await apiFetch('/api/approvals', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!r.ok) { const e = await r.json(); setFormError(e.error || 'Failed'); return }
    setShowForm(false); setForm(EMPTY_FORM); await load()
  }

  const decide = async (aid: string, decision: 'approve' | 'reject') => {
    setDeciding(aid)
    const note = decideNote[aid] || ''
    await apiFetch(`/api/approvals/${aid}/${decision}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: note }),
    })
    setDeciding(null)
    await load()
  }

  const del = async (aid: string) => {
    if (!confirm('Delete this approval request?')) return
    await apiFetch(`/api/approvals/${aid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionToken}` } })
    await load()
  }

  const toggle = (aid: string) => setExpanded(e => ({ ...e, [aid]: !e[aid] }))
  const pendingCount = approvals.filter(a => a.status === 'pending').length
  const historyCount = approvals.filter(a => a.status !== 'pending').length
  const visibleApprovals = approvals.filter(a => {
    if (lifecycle === 'active' && a.status !== 'pending') return false
    if (lifecycle === 'history' && a.status === 'pending') return false
    if (filter !== 'all' && a.status !== filter) return false
    return true
  })

  return (
    <Layout title="Approval Gates">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <ShieldCheck size={24} className="text-nutanix-teal" /> Approval Gates
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Request admin approval before executing sensitive workflows
            </p>
          </div>
          <button onClick={() => { setShowForm(true); setFormError('') }}
            className="flex items-center gap-2 px-4 py-2 bg-nutanix-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Request Approval
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'active', label: `Active (${pendingCount})` },
            { id: 'history', label: `History (${historyCount})` },
            { id: 'all', label: `All (${approvals.length})` },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setLifecycle(item.id as LifecycleFilter)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                lifecycle === item.id ? 'bg-nutanix-blue text-white border-nutanix-blue' : 'text-gray-400 border-border hover:text-gray-200')}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              filter === 'all' ? 'bg-nutanix-blue text-white border-nutanix-blue' : 'text-gray-400 border-border hover:text-gray-200')}>
            All
          </button>
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border capitalize',
                filter === s ? 'bg-nutanix-blue text-white border-nutanix-blue' : 'text-gray-400 border-border hover:text-gray-200')}>
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : visibleApprovals.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <ShieldCheck size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">No approval requests match the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleApprovals.map(a => (
              <div key={a.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-gray-200 text-sm font-mono">{a.workflow}</span>
                      <StatusBadge status={a.status} />
                      {a.status === 'pending' ? (
                        <span className="badge badge-yellow text-xs">active approval</span>
                      ) : (
                        <span className="badge badge-gray text-xs">historical record</span>
                      )}
                      {a.configFile && <span className="text-xs text-gray-500">{a.configFile}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Requested by <span className="text-gray-400">{a.requestedBy}</span>
                      {' - '}{new Date(a.requestedAt).toLocaleString()}
                      {' - '}Expires {new Date(a.expiresAt).toLocaleString()}
                    </div>
                    {a.decidedBy && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {a.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                        <span className="text-gray-400">{a.decidedBy}</span>
                        {a.decidedAt ? ` - ${new Date(a.decidedAt).toLocaleString()}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAdmin && a.status === 'pending' && (
                      <>
                        <button onClick={() => decide(a.id, 'approve')} disabled={deciding === a.id}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button onClick={() => decide(a.id, 'reject')} disabled={deciding === a.id}
                          className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                          <XCircle size={12} /> Reject
                        </button>
                      </>
                    )}
                    {isAdmin && (
                      <button onClick={() => del(a.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button onClick={() => toggle(a.id)} className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors">
                      {expanded[a.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {expanded[a.id] && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {a.configContent && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Config</p>
                        <pre className="text-xs font-mono text-gray-300 bg-gray-900/60 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {a.configContent}
                        </pre>
                      </div>
                    )}
                    {a.notes && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Notes</p>
                        <p className="text-sm text-gray-300">{a.notes}</p>
                      </div>
                    )}
                    {isAdmin && a.status === 'pending' && (
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">Decision note (optional)</label>
                        <input value={decideNote[a.id] || ''} onChange={e => setDecideNote(n => ({...n, [a.id]: e.target.value}))}
                          placeholder="Reason for approval or rejection"
                          className="w-full bg-gray-800 border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create request modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-border rounded-xl shadow-2xl w-full max-w-lg space-y-4 p-6">
              <h2 className="text-lg font-bold text-gray-100">Request Approval</h2>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Workflow</label>
                  <select value={form.workflow} onChange={e => setForm(f => ({...f, workflow: e.target.value}))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue">
                    {WORKFLOWS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Config (YAML)</label>
                  <textarea value={form.configContent} onChange={e => setForm(f => ({...f, configContent: e.target.value}))}
                    rows={6} placeholder="pc_ip: 10.0.0.1&#10;pc_credential: pc-cred"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-gray-100 focus:outline-none focus:border-nutanix-blue resize-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Notes for approver (optional)</label>
                  <input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Reason for this execution, change ticket, etc."
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={create} disabled={saving}
                  className="flex-1 py-2 bg-nutanix-blue hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Submitting...' : 'Submit Request'}
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
