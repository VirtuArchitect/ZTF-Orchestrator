import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CalendarClock, CheckCircle, ChevronDown, ChevronUp, FileSearch,
  HelpCircle, MinusCircle, Play, PlusCircle, RefreshCw, Save, Shuffle, Trash2,
  X
} from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch } from '../utils/api'
import type { DriftFinding, DriftPolicy, DriftPolicyNotifyOn, DriftRun, WorkflowDef } from '../types'
import { WORKFLOWS } from '../data'
import { useStore } from '../store'
import clsx from 'clsx'

interface ConfigFile {
  name: string
  size: number
  modified: number
}

const STATUS_BADGE: Record<string, string> = {
  matched:    'badge-green',
  drifted:    'badge-red',
  unknown:    'badge-yellow',
  changed:    'badge-red',
  missing:    'badge-yellow',
  unexpected: 'badge-purple',
}

const CRON_PRESETS = [
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Daily 02:00', value: '0 2 * * *' },
  { label: 'Weekdays 06:00', value: '0 6 * * 1-5' },
  { label: 'Sunday 03:00', value: '0 3 * * 0' },
]

interface PolicyForm {
  name: string
  configFile: string
  workflow: string
  baseline: 'last_applied' | 'current_state'
  currentStateContent: string
  cronExpr: string
  notifyOn: DriftPolicyNotifyOn
  enabled: boolean
}

const EMPTY_POLICY: PolicyForm = {
  name: '',
  configFile: '',
  workflow: '',
  baseline: 'last_applied',
  currentStateContent: '',
  cronExpr: '0 2 * * *',
  notifyOn: 'drift_or_unknown',
  enabled: true,
}

export default function DriftDetection() {
  const user = useStore(s => s.user)
  const [configs, setConfigs] = useState<ConfigFile[]>([])
  const [runs, setRuns] = useState<DriftRun[]>([])
  const [policies, setPolicies] = useState<DriftPolicy[]>([])
  const [configFile, setConfigFile] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [baseline, setBaseline] = useState<'last_applied' | 'current_state'>('last_applied')
  const [currentStateContent, setCurrentStateContent] = useState('')
  const [policyForm, setPolicyForm] = useState<PolicyForm>(EMPTY_POLICY)
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null)
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [runningPolicyId, setRunningPolicyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [policyError, setPolicyError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const canRunChecks = user?.role === 'admin' || user?.role === 'operator'
  const canClearRuns = user?.role === 'admin'
  const canManagePolicies = user?.role === 'admin' || user?.role === 'operator'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [configResp, driftResp, policyResp] = await Promise.all([
        apiFetch('/api/configs'),
        apiFetch('/api/drift'),
        apiFetch('/api/drift/policies'),
      ])
      if (configResp.ok) {
        const rawConfigs: Array<ConfigFile | string> = await configResp.json()
        const data = rawConfigs.map(item => typeof item === 'string'
          ? { name: item, size: 0, modified: 0 }
          : item
        )
        setConfigs(data)
        setConfigFile(current => current || data[0]?.name || '')
        setPolicyForm(current => ({ ...current, configFile: current.configFile || data[0]?.name || '' }))
      }
      if (driftResp.ok) setRuns(await driftResp.json())
      if (policyResp.ok) setPolicies(await policyResp.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedWorkflow = useMemo(
    () => WORKFLOWS.find((item: WorkflowDef) => item.id === workflow),
    [workflow]
  )

  const runCheck = async () => {
    if (!configFile) {
      setError('Select a config file first.')
      return
    }
    setChecking(true)
    setError('')
    try {
      const resp = await apiFetch('/api/drift/check', {
        method: 'POST',
        body: JSON.stringify({
          configFile,
          workflow,
          baseline,
          currentStateContent: baseline === 'current_state' ? currentStateContent : undefined,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setRuns(current => [data, ...current.filter(run => run.id !== data.id)])
      setExpanded(data.id)
    } finally {
      setChecking(false)
    }
  }

  const clearRuns = async () => {
    if (!confirm('Clear drift check history?')) return
    const resp = await apiFetch('/api/drift', { method: 'DELETE' })
    if (resp.ok) setRuns([])
  }

  const openPolicyCreate = () => {
    setEditingPolicyId(null)
    setPolicyForm({ ...EMPTY_POLICY, configFile: configFile || configs[0]?.name || '' })
    setPolicyError('')
    setShowPolicyForm(true)
  }

  const openPolicyEdit = (policy: DriftPolicy) => {
    setEditingPolicyId(policy.id)
    setPolicyForm({
      name: policy.name,
      configFile: policy.configFile,
      workflow: policy.workflow || '',
      baseline: policy.baseline,
      currentStateContent: policy.currentStateContent || '',
      cronExpr: policy.cronExpr,
      notifyOn: policy.notifyOn || 'drift_or_unknown',
      enabled: policy.enabled,
    })
    setPolicyError('')
    setShowPolicyForm(true)
  }

  const savePolicy = async () => {
    if (!policyForm.name.trim()) {
      setPolicyError('Policy name is required.')
      return
    }
    if (!policyForm.configFile) {
      setPolicyError('Config file is required.')
      return
    }
    if (policyForm.cronExpr.trim().split(/\s+/).length !== 5) {
      setPolicyError('Cron expression must have 5 fields.')
      return
    }
    if (policyForm.baseline === 'current_state' && !policyForm.currentStateContent.trim()) {
      setPolicyError('Snapshot content is required for Snapshot baseline policies.')
      return
    }
    setSavingPolicy(true)
    setPolicyError('')
    try {
      const resp = await apiFetch(editingPolicyId ? `/api/drift/policies/${editingPolicyId}` : '/api/drift/policies', {
        method: editingPolicyId ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...policyForm,
          currentStateContent: policyForm.baseline === 'current_state' ? policyForm.currentStateContent : '',
        }),
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setPolicyError(body.error || `Server returned ${resp.status}`)
        return
      }
      setShowPolicyForm(false)
      await load()
    } finally {
      setSavingPolicy(false)
    }
  }

  const togglePolicy = async (policy: DriftPolicy) => {
    await apiFetch(`/api/drift/policies/${policy.id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !policy.enabled }),
    })
    await load()
  }

  const runPolicyNow = async (policy: DriftPolicy) => {
    setRunningPolicyId(policy.id)
    setPolicyError('')
    try {
      const resp = await apiFetch(`/api/drift/policies/${policy.id}/run-now`, { method: 'POST' })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setPolicyError(body.error || `Server returned ${resp.status}`)
        return
      }
      if (body.run) {
        setRuns(current => [body.run, ...current.filter(run => run.id !== body.run.id)])
        setExpanded(body.run.id)
      }
      await load()
    } finally {
      setRunningPolicyId(null)
    }
  }

  const deletePolicy = async (policy: DriftPolicy) => {
    if (!confirm(`Delete drift policy "${policy.name}"?`)) return
    await apiFetch(`/api/drift/policies/${policy.id}`, { method: 'DELETE' })
    await load()
  }

  const latest = runs[0]
  const drifted = runs.filter(run => run.status === 'drifted').length
  const matched = runs.filter(run => run.status === 'matched').length
  const unknown = runs.filter(run => run.status === 'unknown').length
  const enabledPolicies = policies.filter(policy => policy.enabled).length

  return (
    <Layout
      title="Drift Detection"
      subtitle="Compare desired ZTF configuration against last applied or observed state"
      actions={
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-secondary gap-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canClearRuns && runs.length > 0 && (
            <button onClick={clearRuns} className="btn-danger gap-1.5">
              <MinusCircle size={14} />
              Clear
            </button>
          )}
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-700/30 flex items-center justify-center">
                <FileSearch size={16} className="text-blue-300" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-100">Run Check</h3>
                <p className="text-xs text-gray-500">Desired config versus baseline state</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Config File</label>
                <select className="input" value={configFile} onChange={e => setConfigFile(e.target.value)}>
                  {configs.length === 0 && <option value="">No config files found</option>}
                  {configs.map(config => (
                    <option key={config.name} value={config.name}>{config.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Workflow</label>
                <select className="input" value={workflow} onChange={e => setWorkflow(e.target.value)}>
                  <option value="">Any workflow</option>
                  {WORKFLOWS.map(item => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                {selectedWorkflow && (
                  <p className="text-xs text-gray-500 mt-1">{selectedWorkflow.category}</p>
                )}
              </div>

              <div>
                <label className="label">Baseline</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBaseline('last_applied')}
                    className={clsx(
                      'px-3 py-2 rounded-lg text-sm border transition-colors',
                      baseline === 'last_applied'
                        ? 'bg-nutanix-blue text-white border-nutanix-blue'
                        : 'bg-gray-900 border-border text-gray-400 hover:text-gray-200'
                    )}
                  >
                    Last Applied
                  </button>
                  <button
                    onClick={() => setBaseline('current_state')}
                    className={clsx(
                      'px-3 py-2 rounded-lg text-sm border transition-colors',
                      baseline === 'current_state'
                        ? 'bg-nutanix-blue text-white border-nutanix-blue'
                        : 'bg-gray-900 border-border text-gray-400 hover:text-gray-200'
                    )}
                  >
                    Snapshot
                  </button>
                </div>
              </div>

              {baseline === 'current_state' && (
                <div>
                  <label className="label">Current State JSON/YAML</label>
                  <textarea
                    className="input font-mono min-h-44 resize-y"
                    value={currentStateContent}
                    onChange={e => setCurrentStateContent(e.target.value)}
                    placeholder="Paste observed state exported from Prism Central, Foundation Central, or another source"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-sm text-red-300 flex items-center gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {!canRunChecks && (
                <div className="p-3 rounded-lg bg-amber-900/10 border border-amber-700/30 text-sm text-amber-300">
                  Drift checks are read-only for your role.
                </div>
              )}

              <button onClick={runCheck} disabled={checking || !configFile || !canRunChecks} className="btn-primary w-full justify-center">
                {checking ? <RefreshCw size={14} className="animate-spin" /> : <Shuffle size={14} />}
                {checking ? 'Checking...' : 'Run Drift Check'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-700/30 flex items-center justify-center">
                  <CalendarClock size={16} className="text-blue-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-100">Automation</h3>
                  <p className="text-xs text-gray-500">Scheduled config drift checks</p>
                </div>
              </div>
              {canManagePolicies && (
                <button onClick={openPolicyCreate} className="btn-secondary gap-1.5 px-3 py-1.5 text-xs">
                  <PlusCircle size={13} />
                  Add
                </button>
              )}
            </div>

            {policyError && (
              <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-sm text-red-300 flex items-center gap-2">
                <AlertTriangle size={14} className="flex-shrink-0" />
                {policyError}
              </div>
            )}

            {showPolicyForm && (
              <div className="mb-4 rounded-lg border border-border/70 bg-gray-950/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-gray-200">{editingPolicyId ? 'Edit Policy' : 'New Policy'}</p>
                  <button onClick={() => setShowPolicyForm(false)} className="text-gray-500 hover:text-gray-200">
                    <X size={14} />
                  </button>
                </div>
                <div>
                  <label className="label">Policy Name</label>
                  <input className="input" value={policyForm.name} onChange={e => setPolicyForm(form => ({ ...form, name: e.target.value }))} placeholder="Nightly baseline drift" />
                </div>
                <div>
                  <label className="label">Config File</label>
                  <select className="input" value={policyForm.configFile} onChange={e => setPolicyForm(form => ({ ...form, configFile: e.target.value }))}>
                    {configs.length === 0 && <option value="">No config files found</option>}
                    {configs.map(config => <option key={config.name} value={config.name}>{config.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Workflow Scope</label>
                  <select className="input" value={policyForm.workflow} onChange={e => setPolicyForm(form => ({ ...form, workflow: e.target.value }))}>
                    <option value="">Any workflow</option>
                    {WORKFLOWS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Baseline</label>
                  <select className="input" value={policyForm.baseline} onChange={e => setPolicyForm(form => ({ ...form, baseline: e.target.value as PolicyForm['baseline'] }))}>
                    <option value="last_applied">Last Applied</option>
                    <option value="current_state">Stored Snapshot</option>
                  </select>
                </div>
                {policyForm.baseline === 'current_state' && (
                  <div>
                    <label className="label">Stored Snapshot JSON/YAML</label>
                    <textarea className="input font-mono min-h-28 resize-y" value={policyForm.currentStateContent} onChange={e => setPolicyForm(form => ({ ...form, currentStateContent: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="label">Schedule</label>
                  <div className="flex gap-2">
                    <input className="input font-mono" value={policyForm.cronExpr} onChange={e => setPolicyForm(form => ({ ...form, cronExpr: e.target.value }))} />
                    <select className="input max-w-36" defaultValue="" onChange={e => e.target.value && setPolicyForm(form => ({ ...form, cronExpr: e.target.value }))}>
                      <option value="">Preset</option>
                      {CRON_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Notify</label>
                  <select className="input" value={policyForm.notifyOn} onChange={e => setPolicyForm(form => ({ ...form, notifyOn: e.target.value as DriftPolicyNotifyOn }))}>
                    <option value="drift_or_unknown">Drift or unknown</option>
                    <option value="drift_only">Drift only</option>
                    <option value="every_run">Every run</option>
                    <option value="never">Never</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={policyForm.enabled} onChange={e => setPolicyForm(form => ({ ...form, enabled: e.target.checked }))} />
                  Enabled
                </label>
                <button onClick={savePolicy} disabled={savingPolicy || !canManagePolicies} className="btn-primary w-full justify-center">
                  {savingPolicy ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                  {savingPolicy ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            )}

            {policies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-gray-500">
                No automated drift policies yet.
              </div>
            ) : (
              <div className="space-y-2">
                {policies.map(policy => (
                  <div key={policy.id} className="rounded-lg border border-border/70 bg-gray-950/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => openPolicyEdit(policy)} className="min-w-0 text-left">
                        <p className="font-medium text-sm text-gray-200 truncate">{policy.name}</p>
                        <p className="text-xs text-gray-500 truncate">{policy.configFile} - {policy.cronExpr}</p>
                      </button>
                      <span className={clsx('badge text-xs', policy.enabled ? 'badge-green' : 'badge-gray')}>
                        {policy.enabled ? 'enabled' : 'paused'}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>{policy.lastRun ? `Last ${new Date(policy.lastRun).toLocaleString()}` : 'Not run yet'}</span>
                      <span className={clsx('capitalize', policy.lastStatus === 'drifted' ? 'text-red-400' : policy.lastStatus === 'matched' ? 'text-nutanix-teal' : 'text-gray-500')}>
                        {policy.lastStatus || 'pending'}
                      </span>
                    </div>
                    {canManagePolicies && (
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => runPolicyNow(policy)} disabled={runningPolicyId === policy.id} className="btn-secondary gap-1.5 px-3 py-1.5 text-xs">
                          {runningPolicyId === policy.id ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                          Run
                        </button>
                        <button onClick={() => togglePolicy(policy)} className="btn-secondary px-3 py-1.5 text-xs">
                          {policy.enabled ? 'Pause' : 'Enable'}
                        </button>
                        {canClearRuns && (
                          <button onClick={() => deletePolicy(policy)} className="btn-danger gap-1.5 px-3 py-1.5 text-xs ml-auto">
                            <Trash2 size={12} />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Matched" value={matched} tone="text-nutanix-teal" />
            <Metric label="Drifted" value={drifted} tone="text-red-400" />
            <Metric label="Unknown" value={unknown} tone="text-yellow-300" />
          </div>
          <Metric label="Automated Policies" value={enabledPolicies} tone="text-blue-300" />
        </div>

        <div className="space-y-4">
          {latest && (
            <div className={clsx(
              'rounded-lg border p-5',
              latest.status === 'matched' ? 'bg-emerald-900/10 border-emerald-700/30' :
              latest.status === 'drifted' ? 'bg-red-900/10 border-red-700/30' :
              'bg-yellow-900/10 border-yellow-700/30'
            )}>
              <div className="flex flex-wrap items-center gap-3">
                <StatusIcon status={latest.status} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-100">
                    {latest.status === 'matched' ? 'No drift detected' : latest.status === 'drifted' ? 'Drift detected' : 'Baseline unavailable'}
                  </h3>
                  <p className="text-sm text-gray-500 truncate">
                    {latest.configFile} compared with {latest.observedLabel.toLowerCase()}
                  </p>
                </div>
                <span className={clsx('badge capitalize', STATUS_BADGE[latest.status])}>{latest.status}</span>
              </div>
              {latest.message && <p className="text-sm text-yellow-200 mt-3">{latest.message}</p>}
              <Summary run={latest} />
            </div>
          )}

          {runs.length === 0 && !loading && (
            <div className="empty-state">
              <FileSearch size={40} className="mx-auto mb-3 opacity-20 text-nutanix-cyan" />
              <p className="text-gray-400 font-medium">No drift checks yet</p>
              <p className="text-sm text-gray-600 mt-1">Run a check to record the first baseline comparison.</p>
            </div>
          )}

          <div className="space-y-2">
            {runs.map(run => {
              const isExpanded = expanded === run.id
              return (
                <div key={run.id} className="card p-0 overflow-hidden">
                  <button
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-elevated/50 transition-colors text-left"
                    onClick={() => setExpanded(isExpanded ? null : run.id)}
                  >
                    <StatusIcon status={run.status} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-100 truncate">{run.configFile}</span>
                        <span className={clsx('badge capitalize text-xs', STATUS_BADGE[run.status])}>{run.status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-500">{new Date(run.timestamp).toLocaleString()}</span>
                        <span className="text-xs text-gray-600">{run.observedLabel}</span>
                        {run.workflow && <span className="text-xs font-mono text-gray-600">{run.workflow}</span>}
                        {run.trigger === 'scheduled' && <span className="badge badge-blue text-xs">scheduled</span>}
                        {run.trigger === 'manual_policy' && <span className="badge badge-gray text-xs">policy run</span>}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-border">
                      <Summary run={run} compact />
                      {run.findings.length > 0 ? (
                        <FindingsTable findings={run.findings} />
                      ) : (
                        <p className="text-sm text-gray-500 mt-4">{run.message || 'No findings to display.'}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Layout>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className={clsx('text-2xl font-bold', tone)}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'matched') return <CheckCircle size={18} className="text-nutanix-teal flex-shrink-0" />
  if (status === 'drifted') return <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
  return <HelpCircle size={18} className="text-yellow-300 flex-shrink-0" />
}

function Summary({ run, compact = false }: { run: DriftRun; compact?: boolean }) {
  return (
    <div className={clsx('grid grid-cols-2 md:grid-cols-4 gap-3', compact ? 'mt-4' : 'mt-5')}>
      <SummaryItem label="Matched" value={run.summary.matched} tone="text-nutanix-teal" />
      <SummaryItem label="Changed" value={run.summary.changed} tone="text-red-400" />
      <SummaryItem label="Missing" value={run.summary.missing} tone="text-yellow-300" />
      <SummaryItem label="Unexpected" value={run.summary.unexpected} tone="text-purple-300" />
    </div>
  )
}

function SummaryItem({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-gray-950/50 p-3">
      <p className={clsx('text-lg font-bold', tone)}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function FindingsTable({ findings }: { findings: DriftFinding[] }) {
  return (
    <div className="mt-4 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-gray-950 text-xs text-gray-500">
          <tr>
            <th className="text-left font-medium px-3 py-2">Path</th>
            <th className="text-left font-medium px-3 py-2">Status</th>
            <th className="text-left font-medium px-3 py-2">Desired</th>
            <th className="text-left font-medium px-3 py-2">Observed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {findings.map(finding => (
            <tr key={`${finding.path}-${finding.status}`} className={finding.status === 'matched' ? 'text-gray-500' : 'text-gray-300'}>
              <td className="px-3 py-2 font-mono text-xs min-w-48">{finding.path}</td>
              <td className="px-3 py-2">
                <span className={clsx('badge capitalize text-xs', STATUS_BADGE[finding.status])}>
                  {finding.status === 'changed' && <Shuffle size={10} className="mr-1" />}
                  {finding.status === 'missing' && <MinusCircle size={10} className="mr-1" />}
                  {finding.status === 'unexpected' && <PlusCircle size={10} className="mr-1" />}
                  {finding.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs break-all">{formatValue(finding.desired)}</td>
              <td className="px-3 py-2 font-mono text-xs break-all">{formatValue(finding.observed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
