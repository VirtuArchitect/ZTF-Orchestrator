import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronDown, ChevronUp, FileSearch,
  HelpCircle, MinusCircle, PlusCircle, RefreshCw, Shuffle
} from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch } from '../utils/api'
import type { DriftFinding, DriftRun, WorkflowDef } from '../types'
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

export default function DriftDetection() {
  const user = useStore(s => s.user)
  const [configs, setConfigs] = useState<ConfigFile[]>([])
  const [runs, setRuns] = useState<DriftRun[]>([])
  const [configFile, setConfigFile] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [baseline, setBaseline] = useState<'last_applied' | 'current_state'>('last_applied')
  const [currentStateContent, setCurrentStateContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const canRunChecks = user?.role === 'admin' || user?.role === 'operator'
  const canClearRuns = user?.role === 'admin'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [configResp, driftResp] = await Promise.all([
        apiFetch('/api/configs'),
        apiFetch('/api/drift'),
      ])
      if (configResp.ok) {
        const data: ConfigFile[] = await configResp.json()
        setConfigs(data)
        setConfigFile(current => current || data[0]?.name || '')
      }
      if (driftResp.ok) setRuns(await driftResp.json())
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

  const latest = runs[0]
  const drifted = runs.filter(run => run.status === 'drifted').length
  const matched = runs.filter(run => run.status === 'matched').length
  const unknown = runs.filter(run => run.status === 'unknown').length

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

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Matched" value={matched} tone="text-nutanix-teal" />
            <Metric label="Drifted" value={drifted} tone="text-red-400" />
            <Metric label="Unknown" value={unknown} tone="text-yellow-300" />
          </div>
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
