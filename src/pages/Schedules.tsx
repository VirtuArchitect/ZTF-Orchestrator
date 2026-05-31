import { useEffect, useState } from 'react'
import { Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import type { Schedule } from '../types'
import Layout from '../components/Layout'
import clsx from 'clsx'

const WORKFLOWS = [
  'cluster-create','imaging-only','imaging','site-deploy','config-cluster',
  'deploy-pc','config-pc','pod-config','deploy-management-pc',
  'config-management-pc','calm-vm-workloads','calm-edgeai-vm-workload',
  'ndb','lcm-update',
]

const CRON_PRESETS = [
  { label: 'Every hour',        value: '0 * * * *'   },
  { label: 'Every day at 02:00',value: '0 2 * * *'   },
  { label: 'Every Sunday 03:00',value: '0 3 * * 0'   },
  { label: 'Every Monday 06:00',value: '0 6 * * 1'   },
  { label: 'Every 6 hours',     value: '0 */6 * * *' },
]

function StatusBadge({ status }: { status: Schedule['lastStatus'] }) {
  if (!status) return <span className="text-gray-600 text-xs">—</span>
  const map: Record<string, { icon: React.ReactNode; cls: string }> = {
    success: { icon: <CheckCircle size={12} />, cls: 'text-emerald-400' },
    failed:  { icon: <XCircle    size={12} />, cls: 'text-red-400'     },
    error:   { icon: <AlertCircle size={12}/>, cls: 'text-amber-400'   },
  }
  const s = map[status] ?? { icon: null, cls: 'text-gray-400' }
  return (
    <span className={clsx('flex items-center gap-1 text-xs font-medium', s.cls)}>
      {s.icon} {status}
    </span>
  )
}

interface FormState {
  name: string; workflow: string; script: string
  configContent: string; cronExpr: string; enabled: boolean
}

const EMPTY: FormState = {
  name: '', workflow: WORKFLOWS[0], script: '', configContent: '', cronExpr: '0 2 * * *', enabled: true
}

export default function Schedules() {
  const sessionToken = useStore(s => s.sessionToken)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState<Schedule | null>(null)
  const [form, setForm]           = useState<FormState>(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [error, setError]         = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const r = await apiFetch('/api/schedules', { headers: { Authorization: `Bearer ${sessionToken}` } })
      if (r.ok) setSchedules(await r.json())
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowForm(true); setError('') }
  const openEdit   = (s: Schedule) => {
    setEditing(s)
    setForm({ name: s.name, workflow: s.workflow, script: s.script,
              configContent: s.configContent, cronExpr: s.cronExpr, enabled: s.enabled })
    setShowForm(true); setError('')
  }

  const save = async () => {
    if (!form.workflow && !form.script) { setError('Workflow or script is required'); return }
    if (form.cronExpr.trim().split(/\s+/).length !== 5) { setError('Cron expression must have 5 fields'); return }
    setSaving(true); setError('')
    try {
      const url = editing ? `/api/schedules/${editing.id}` : '/api/schedules'
      const method = editing ? 'PUT' : 'POST'
      const r = await apiFetch(url, {
        method,
        headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!r.ok) { const e = await r.json(); setError(e.error || 'Save failed'); return }
      setShowForm(false); await load()
    } finally { setSaving(false) }
  }

  const toggle = async (s: Schedule) => {
    await apiFetch(`/api/schedules/${s.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !s.enabled }),
    })
    await load()
  }

  const runNow = async (s: Schedule) => {
    setRunningId(s.id)
    await apiFetch(`/api/schedules/${s.id}/run-now`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
    setRunningId(null); await load()
  }

  const del = async (s: Schedule) => {
    if (!confirm(`Delete schedule "${s.name}"?`)) return
    await apiFetch(`/api/schedules/${s.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
    await load()
  }

  return (
    <Layout title="Scheduled Executions">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
              <Clock size={24} className="text-nutanix-teal" /> Scheduled Executions
            </h1>
            <p className="text-gray-400 text-sm mt-1">Automate workflow runs using cron expressions (UTC)</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-nutanix-blue hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New Schedule
          </button>
        </div>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading schedules…</div>
        ) : schedules.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <Clock size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400">No schedules configured. Create one to automate your workflows.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Workflow / Script</th>
                  <th className="px-4 py-3 text-left">Cron (UTC)</th>
                  <th className="px-4 py-3 text-left">Last Run</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Enabled</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedules.map(s => (
                  <tr key={s.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-200">
                      <button onClick={() => openEdit(s)} className="hover:text-nutanix-teal transition-colors text-left">
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 text-xs">
                      {s.workflow || s.script}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 text-xs">{s.cronExpr}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {s.lastRun ? new Date(s.lastRun).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.lastStatus} /></td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggle(s)} className="text-gray-400 hover:text-nutanix-teal transition-colors">
                        {s.enabled ? <ToggleRight size={20} className="text-nutanix-teal" /> : <ToggleLeft size={20} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => runNow(s)} disabled={runningId === s.id}
                          className="p-1.5 text-gray-400 hover:text-emerald-400 transition-colors" title="Run now">
                          <Play size={14} />
                        </button>
                        <button onClick={() => del(s)}
                          className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-border rounded-xl shadow-2xl w-full max-w-lg space-y-4 p-6">
              <h2 className="text-lg font-bold text-gray-100">
                {editing ? 'Edit Schedule' : 'New Schedule'}
              </h2>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue"
                    placeholder="Daily imaging check" />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Workflow</label>
                  <select value={form.workflow} onChange={e => setForm(f => ({...f, workflow: e.target.value}))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-nutanix-blue">
                    {WORKFLOWS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Cron Expression (UTC)</label>
                  <div className="flex gap-2">
                    <input value={form.cronExpr} onChange={e => setForm(f => ({...f, cronExpr: e.target.value}))}
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-nutanix-blue"
                      placeholder="0 2 * * *" />
                    <select onChange={e => { if (e.target.value) setForm(f => ({...f, cronExpr: e.target.value})) }}
                      className="bg-surface border border-border rounded-lg px-2 py-2 text-xs text-gray-400 focus:outline-none" defaultValue="">
                      <option value="">Preset…</option>
                      {CRON_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">minute hour day month weekday</p>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">Config (YAML)</label>
                  <textarea value={form.configContent} onChange={e => setForm(f => ({...f, configContent: e.target.value}))}
                    rows={5} placeholder="pc_ip: 10.0.0.1&#10;pc_credential: pc-cred"
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs font-mono text-gray-100 focus:outline-none focus:border-nutanix-blue resize-none" />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={form.enabled}
                    onChange={e => setForm(f => ({...f, enabled: e.target.checked}))}
                    className="rounded" />
                  Enabled
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving}
                  className="flex-1 py-2 bg-nutanix-blue hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                  {saving ? 'Saving…' : 'Save Schedule'}
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
