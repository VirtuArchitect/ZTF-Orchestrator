import { useEffect, useMemo, useState } from 'react'
import {
  Activity, Ban, CheckCircle, ChevronDown, ChevronUp, Clock,
  ListChecks, Loader, RefreshCw, Terminal, Trash2, XCircle
} from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'
import type { ExecutionJob, ExecutionJobStatus, ExecutionProgress } from '../types'
import { apiFetch } from '../utils/api'
import clsx from 'clsx'

type JobFilter = 'all' | 'active' | 'queued' | 'running' | 'failed' | 'success' | 'cancelled' | 'interrupted'

const FILTERS: Array<{ id: JobFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'queued', label: 'Queued' },
  { id: 'running', label: 'Running' },
  { id: 'failed', label: 'Failed' },
  { id: 'success', label: 'Success' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'interrupted', label: 'Interrupted' },
]

const ACTIVE_STATUSES: ExecutionJobStatus[] = ['queued', 'running', 'cancelling']

export default function Jobs() {
  const user = useStore(s => s.user)
  const [jobs, setJobs] = useState<ExecutionJob[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<JobFilter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')

  const canCancel = user?.role === 'admin' || user?.role === 'operator'
  const canDelete = user?.role === 'admin'

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const resp = await apiFetch('/api/jobs?limit=500')
      if (resp.ok) setJobs(await resp.json())
    } finally {
      setLoading(false)
      if (showSpinner) setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 5000)
    return () => clearInterval(interval)
  }, [])

  const counts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(job => ACTIVE_STATUSES.includes(job.status)).length,
    queued: jobs.filter(job => job.status === 'queued').length,
    running: jobs.filter(job => job.status === 'running' || job.status === 'cancelling').length,
    failed: jobs.filter(job => job.status === 'failed').length,
    success: jobs.filter(job => job.status === 'success').length,
    cancelled: jobs.filter(job => job.status === 'cancelled').length,
    interrupted: jobs.filter(job => job.status === 'interrupted').length,
  }), [jobs])

  const filtered = jobs.filter(job => {
    if (filter === 'all') return true
    if (filter === 'active') return ACTIVE_STATUSES.includes(job.status)
    if (filter === 'running') return job.status === 'running' || job.status === 'cancelling'
    return job.status === filter
  })

  const cancelJob = async (job: ExecutionJob) => {
    if (!canCancel || !ACTIVE_STATUSES.includes(job.status)) return
    if (!confirm(`Cancel job ${job.workflow}?`)) return
    setError('')
    setCancelling(job.id)
    try {
      const resp = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST' })
      if (resp.ok) {
        const updated = await resp.json()
        setJobs(prev => prev.map(item => item.id === updated.id ? updated : item))
      }
      await load()
    } finally {
      setCancelling(null)
    }
  }

  const deleteJob = async (job: ExecutionJob) => {
    if (!canDelete || ACTIVE_STATUSES.includes(job.status)) return
    if (!confirm(`Delete job ${job.workflow || job.id} from the durable queue? Execution history and audit logs are not removed.`)) return
    setError('')
    setDeleting(job.id)
    try {
      const resp = await apiFetch(`/api/jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setJobs(prev => prev.filter(item => item.id !== job.id))
      if (expanded === job.id) setExpanded(null)
      await load()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <Layout
      title="Jobs / Queue"
      subtitle="Durable execution jobs, worker state, persisted output, and cancellation"
      actions={
        <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Metric label="Active" value={counts.active} hint="Queued or running" icon={Activity} tone="text-nutanix-cyan" />
        <Metric label="Queued" value={counts.queued} hint="Waiting for worker" icon={ListChecks} tone="text-yellow-400" />
        <Metric label="Running" value={counts.running} hint="Worker attached" icon={Loader} tone="text-nutanix-teal" />
        <Metric label="Failed" value={counts.failed + counts.interrupted} hint="Needs review" icon={XCircle} tone="text-red-400" />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(item => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={clsx(
              'px-3 py-2 rounded-lg text-sm font-medium transition-all',
              filter === item.id
                ? 'bg-nutanix-blue text-white'
                : 'bg-surface border border-border text-gray-400 hover:text-gray-200'
            )}
          >
            {item.label} ({counts[item.id]})
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Loading jobs...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-state py-16">
          <Terminal size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-lg font-medium text-gray-400">No jobs found</p>
          <p className="text-sm mt-1 text-gray-600">Workflow and script submissions will appear here as durable jobs.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(job => {
          const isActive = ACTIVE_STATUSES.includes(job.status)
          const logs = job.logs || []
          return (
            <div key={job.id} className="card p-0 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                <StatusIcon status={job.status} />
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-100 truncate">{job.workflow || 'Untitled job'}</span>
                    <span className={clsx('badge text-xs', job.type === 'workflow' ? 'badge-blue' : 'badge-purple')}>
                      {job.type}
                    </span>
                    <span className={clsx('badge text-xs', statusBadge(job.status))}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                    <span>{new Date(job.createdAt).toLocaleString()}</span>
                    <span>user: {job.user || 'unknown'}</span>
                    <span className="font-mono">id: {job.id}</span>
                  </div>
                  {job.progress && (
                    <div className="mt-3 max-w-xl">
                      <ProgressBar progress={job.progress} compact />
                    </div>
                  )}
                </button>
                {canCancel && isActive && (
                  <button
                    onClick={() => cancelJob(job)}
                    disabled={cancelling === job.id}
                    className="btn-danger text-xs gap-1.5"
                  >
                    <Ban size={12} />
                    {cancelling === job.id ? 'Cancelling' : 'Cancel'}
                  </button>
                )}
                {canDelete && !isActive && (
                  <button
                    onClick={() => deleteJob(job)}
                    disabled={deleting === job.id}
                    className="btn-danger text-xs gap-1.5"
                    title="Delete this queue record"
                  >
                    {deleting === job.id ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                  className="btn-ghost p-2"
                  aria-label={expanded === job.id ? 'Collapse job details' : 'Expand job details'}
                >
                  {expanded === job.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {expanded === job.id && (
                <div className="border-t border-border px-5 py-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <Detail label="Started" value={formatDate(job.startedAt)} />
                    <Detail label="Finished" value={formatDate(job.finishedAt)} />
                    <Detail label="Return Code" value={job.returnCode === null || job.returnCode === undefined ? 'pending' : String(job.returnCode)} />
                    <Detail label="Log Events" value={String(logs.length)} />
                  </div>
                  {job.progress && <ProgressBar progress={job.progress} />}
                  {job.trace && (
                    <div className="rounded-lg border border-border bg-gray-900/50 px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="text-xs font-medium text-gray-500">Execution Trace</p>
                        {job.trace.schemaStatus && (
                          <span className={clsx(
                            'badge text-xs',
                            job.trace.schemaStatus === 'pass' ? 'badge-green' : job.trace.schemaStatus === 'warn' ? 'badge-yellow' : 'badge-red'
                          )}>
                            schema {job.trace.schemaStatus}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <Detail label="Framework / Phase" value={`${job.trace.framework || job.framework || 'unknown'}${job.trace.phase ? ` / ${job.trace.phase}` : ''}`} />
                        <Detail label="Profile" value={job.trace.profileName ? `${job.trace.profileName} rev ${job.trace.profileRevision || '?'}` : 'not linked'} />
                        <Detail label="Template" value={job.trace.templateName || job.trace.templateId || 'not linked'} />
                        <Detail label="Approval" value={job.trace.approvalId || 'not required'} />
                        <Detail label="Config" value={job.trace.generatedConfigFile || job.trace.configFile || 'not recorded'} />
                        <Detail label="Config Source" value={job.trace.configSource || 'not recorded'} />
                        <Detail label="Profile ID" value={job.trace.profileId || 'not linked'} />
                        <Detail label="Schema Notes" value={[...(job.trace.schemaMissing || []), ...(job.trace.schemaWarnings || [])].join('; ') || 'none'} />
                      </div>
                    </div>
                  )}
                  {job.taskIds && job.taskIds.length > 0 && (
                    <div className="rounded-lg border border-border bg-gray-900/50 px-3 py-2">
                      <p className="text-xs font-medium text-gray-500">Detected Nutanix Task IDs</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {job.taskIds.map(taskId => (
                          <span key={taskId} className="badge badge-blue font-mono text-xs">{taskId}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">Persisted Job Log</p>
                      <span className="text-xs text-gray-600">Auto-refreshes every 5 seconds</span>
                    </div>
                    <div className="rounded-lg border border-border bg-gray-950 max-h-96 overflow-auto p-3 font-mono text-xs">
                      {logs.length === 0 ? (
                        <p className="text-gray-600">No log events recorded yet.</p>
                      ) : (
                        logs.map((event, index) => (
                          <div key={`${job.id}-${index}`} className={clsx(
                            'whitespace-pre-wrap break-words leading-relaxed',
                            event.type === 'stderr' || event.type === 'error' ? 'text-red-300' :
                            event.type === 'start' ? 'text-nutanix-cyan' :
                            'text-gray-300'
                          )}>
                            <span className="text-gray-600">[{new Date(event.ts).toLocaleTimeString()}] </span>
                            <span className="text-gray-500">{event.type}: </span>
                            {formatLogData(event.data)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Layout>
  )
}

function ProgressBar({ progress, compact = false }: { progress: ExecutionProgress; compact?: boolean }) {
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
  return (
    <div className={compact ? '' : 'rounded-lg border border-border bg-gray-900/50 px-3 py-2'}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className={clsx('truncate', compact ? 'text-gray-500' : 'font-medium text-gray-300')}>
          {progress.phase || 'Preparing execution'}
        </span>
        <span className="text-gray-600 flex-shrink-0">{progress.estimated ? 'est.' : ''} {percent}%</span>
      </div>
      <div
        className={clsx('mt-2 rounded-full bg-gray-950 overflow-hidden', compact ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Estimated job progress"
      >
        <div className="h-full rounded-full bg-nutanix-cyan transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      {!compact && progress.detail && (
        <p className="mt-2 text-xs text-gray-500 break-words">{progress.detail}</p>
      )}
    </div>
  )
}

function Metric({ label, value, hint, icon: Icon, tone }: {
  label: string
  value: number
  hint: string
  icon: typeof Activity
  tone: string
}) {
  return (
    <div className="card flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-100 mt-1">{value}</p>
        <p className="text-xs text-gray-600 mt-1">{hint}</p>
      </div>
      <div className={clsx('p-2 rounded-md bg-gray-800', tone)}>
        <Icon size={18} />
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-900/50 border border-border px-3 py-2">
      <div className="text-gray-600">{label}</div>
      <div className="text-gray-300 mt-1 break-all">{value}</div>
    </div>
  )
}

function StatusIcon({ status }: { status: ExecutionJobStatus }) {
  if (status === 'success') return <CheckCircle size={18} className="text-nutanix-teal flex-shrink-0" />
  if (status === 'failed' || status === 'interrupted') return <XCircle size={18} className="text-red-400 flex-shrink-0" />
  if (status === 'cancelled') return <Ban size={18} className="text-gray-500 flex-shrink-0" />
  if (status === 'running' || status === 'cancelling') return <Loader size={18} className="text-nutanix-cyan flex-shrink-0 animate-spin" />
  return <Clock size={18} className="text-yellow-400 flex-shrink-0" />
}

function statusBadge(status: ExecutionJobStatus) {
  if (status === 'success') return 'badge-green'
  if (status === 'failed' || status === 'interrupted') return 'badge-red'
  if (status === 'running' || status === 'cancelling') return 'badge-blue'
  if (status === 'queued') return 'badge-yellow'
  return 'badge-gray'
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : 'pending'
}

function formatLogData(data: unknown) {
  if (typeof data === 'string') return data
  if (data === null || data === undefined) return ''
  return JSON.stringify(data)
}
