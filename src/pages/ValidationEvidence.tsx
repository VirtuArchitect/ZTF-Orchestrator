import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Download, FileArchive, Loader, Plus, RefreshCw, ShieldCheck, Terminal, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch, authHeaders } from '../utils/api'
import { useStore } from '../store'
import clsx from 'clsx'
import type { Execution } from '../types'

interface NkpProfile {
  id: string
  name: string
  revision?: number
}

interface EvidenceRecord {
  id: string
  source?: 'nkp' | 'ztf-workflow' | string
  type?: string
  status: 'ready' | 'needs_review' | 'blocked' | string
  createdAt: string
  createdBy: string
  workflow?: string
  executionStatus?: string
  returnCode?: number | null
  profileId?: string
  profileName?: string
  profileRevision?: number
  configFile?: string
  configSha256?: string
  approvalId?: string
  jobId?: string
  notes?: string
  readiness?: { status: string; score: number; summary?: { passed: number; warnings: number; failed: number } }
  schemaValidation?: { status: string; missing?: string[]; warnings?: string[] }
  compatibility?: { status: string; summary?: { passed: number; warnings: number; failed: number } }
}

interface ConfigFile {
  name: string
}

export default function ValidationEvidence() {
  const user = useStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const isAdmin = user?.role === 'admin'
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const [profiles, setProfiles] = useState<NkpProfile[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [configs, setConfigs] = useState<ConfigFile[]>([])
  const [source, setSource] = useState<'nkp' | 'ztf-workflow'>('nkp')
  const [selectedProfile, setSelectedProfile] = useState('')
  const [selectedExecution, setSelectedExecution] = useState('')
  const [selectedConfig, setSelectedConfig] = useState('')
  const [workflowName, setWorkflowName] = useState('')
  const [notes, setNotes] = useState('')
  const [includeCompatibility, setIncludeCompatibility] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<EvidenceRecord | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [evidenceResp, profilesResp, executionsResp, configsResp] = await Promise.all([
        apiFetch('/api/validation-evidence'),
        apiFetch('/api/nkp/profiles'),
        apiFetch('/api/executions'),
        apiFetch('/api/configs'),
      ])
      if (evidenceResp.ok) setRecords(await evidenceResp.json())
      if (profilesResp.ok) {
        const data = await profilesResp.json()
        setProfiles(data)
        if (!selectedProfile && data.length) setSelectedProfile(data[0].id)
      }
      if (executionsResp.ok) {
        const data = await executionsResp.json()
        setExecutions(data)
        const firstWithConfig = data.find((item: Execution) => item.configContent || item.configFile)
        if (!selectedExecution && firstWithConfig) {
          setSelectedExecution(firstWithConfig.id)
          setWorkflowName(firstWithConfig.workflow)
        }
      }
      if (configsResp.ok) {
        const data = await configsResp.json()
        setConfigs(data)
        if (!selectedConfig && data.length) setSelectedConfig(data[0].name)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createEvidence = async () => {
    if (source === 'nkp' && !selectedProfile) {
      setError('Select an NKP profile first.')
      return
    }
    if (source === 'ztf-workflow' && !selectedExecution && !selectedConfig) {
      setError('Select an execution or saved config file first.')
      return
    }
    setCreating(true)
    setError('')
    setMessage('')
    try {
      const selectedExec = executions.find(item => item.id === selectedExecution)
      const resp = await apiFetch('/api/validation-evidence', {
        method: 'POST',
        body: JSON.stringify(source === 'nkp'
          ? {
              source: 'nkp',
              profileId: selectedProfile,
              includeCompatibility,
              notes,
            }
          : {
              source: 'ztf-workflow',
              jobId: selectedExecution || undefined,
              workflow: workflowName || selectedExec?.workflow || undefined,
              configFile: selectedExecution ? selectedExec?.configFile : selectedConfig,
              notes,
            }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Evidence record created for ${data.profileName || data.workflow || data.configFile || 'validation run'}.`)
      setNotes('')
      await load()
    } finally {
      setCreating(false)
    }
  }

  const deleteRecord = async () => {
    if (!deleteTarget || deleteConfirm !== deleteTarget.id) return
    setError('')
    const resp = await apiFetch(`/api/validation-evidence/${deleteTarget.id}`, { method: 'DELETE' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setError(data.error || `Server returned ${resp.status}`)
      return
    }
    setDeleteTarget(null)
    setDeleteConfirm('')
    await load()
  }

  const downloadRecord = async (record: EvidenceRecord) => {
    setError('')
    const resp = await fetch(`/api/validation-evidence/${record.id}/download`, {
      headers: authHeaders(),
    })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setError(data.error || `Server returned ${resp.status}`)
      return
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ztf-validation-evidence-${record.id}.zip`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout
      title="Validation Evidence"
      subtitle="Capture and export defensible UAT records for NKP readiness, ZTF workflow configs, approvals, jobs, and execution output"
      actions={
        <button onClick={load} disabled={loading} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        <div className="card">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-100">Create Evidence Run</h2>
              <p className="text-sm text-gray-500 mt-1">
                Build a timestamped bundle from either an NKP profile or a ZTF workflow execution/config record.
              </p>
            </div>
            <button
              onClick={createEvidence}
              disabled={!canEdit || creating || (source === 'nkp' ? !selectedProfile : (!selectedExecution && !selectedConfig))}
              className="btn-primary gap-1.5"
            >
              {creating ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
              Create Evidence
            </button>
          </div>

          {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</div>}
          {message && <div className="mt-4 rounded-lg border border-nutanix-teal/30 bg-nutanix-teal/10 px-4 py-3 text-sm text-nutanix-teal">{message}</div>}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSource('nkp')}
              className={clsx('btn-secondary gap-1.5', source === 'nkp' && 'border-nutanix-blue text-gray-100')}
            >
              <ShieldCheck size={14} />
              NKP Readiness
            </button>
            <button
              type="button"
              onClick={() => setSource('ztf-workflow')}
              className={clsx('btn-secondary gap-1.5', source === 'ztf-workflow' && 'border-nutanix-blue text-gray-100')}
            >
              <Terminal size={14} />
              ZTF UAT Pack
            </button>
          </div>

          {source === 'nkp' ? (
            <div className="mt-5 grid grid-cols-1 xl:grid-cols-[1fr_2fr] gap-4">
              <label className="block">
                <span className="label">NKP Profile</span>
                <select className="input" value={selectedProfile} onChange={event => setSelectedProfile(event.target.value)} disabled={!canEdit}>
                  <option value="">Select profile</option>
                  {profiles.map(profile => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} {profile.revision ? `(rev ${profile.revision})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Notes</span>
                <input className="input" value={notes} onChange={event => setNotes(event.target.value)} disabled={!canEdit} placeholder="Lab dry-run, CLI compatibility, customer UAT checkpoint..." />
              </label>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-4">
              <label className="block">
                <span className="label">Execution</span>
                <select
                  className="input"
                  value={selectedExecution}
                  onChange={event => {
                    const exec = executions.find(item => item.id === event.target.value)
                    setSelectedExecution(event.target.value)
                    if (exec) setWorkflowName(exec.workflow)
                  }}
                  disabled={!canEdit}
                >
                  <option value="">Use saved config instead</option>
                  {executions.filter(item => item.type === 'workflow' || item.type === 'script').map(exec => (
                    <option key={exec.id} value={exec.id}>
                      {exec.workflow} / {exec.status} / {new Date(exec.timestamp).toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Saved Config</span>
                <select className="input" value={selectedConfig} onChange={event => setSelectedConfig(event.target.value)} disabled={!canEdit || Boolean(selectedExecution)}>
                  <option value="">Select config</option>
                  {configs.map(config => (
                    <option key={config.name} value={config.name}>{config.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Workflow / Script</span>
                <input className="input" value={workflowName} onChange={event => setWorkflowName(event.target.value)} disabled={!canEdit || Boolean(selectedExecution)} placeholder="config-pc, cluster-create, CreateVmsPc..." />
              </label>
              <label className="block xl:col-span-3">
                <span className="label">Notes</span>
                <input className="input" value={notes} onChange={event => setNotes(event.target.value)} disabled={!canEdit} placeholder="UAT checkpoint, expected Prism state, change ticket, evidence store label..." />
              </label>
            </div>
          )}
          {source === 'nkp' && (
            <label className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-3">
              <input type="checkbox" checked={includeCompatibility} disabled={!canEdit} onChange={event => setIncludeCompatibility(event.target.checked)} />
              <span>
                <span className="block text-sm font-medium text-gray-200">Include NKP CLI compatibility check</span>
                <span className="block text-xs text-gray-500">Runs local `nkp --version` and help checks when the profile has a resolvable NKP binary path.</span>
              </span>
            </label>
          )}
        </div>

        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-100">Evidence Archive</h2>
            <span className="text-sm text-gray-500">{records.length} record{records.length === 1 ? '' : 's'}</span>
          </div>
          {records.length === 0 ? (
            <div className="empty-state py-10">
              <FileArchive size={32} className="mx-auto mb-3 text-gray-700" />
              <p className="text-sm font-medium text-gray-400">No validation evidence captured yet</p>
              <p className="mx-auto mt-1 max-w-xl text-xs text-gray-600">
                Production handover evidence should include an NKP readiness record or a ZTF workflow UAT pack with config hash, approval/job references, execution output, and operator notes.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link to="/nkp#profiles" className="btn-primary gap-1.5">
                  <Plus size={14} />
                  Create NKP Profile
                </Link>
                <Link to="/nkp#profiles" className="btn-secondary gap-1.5">
                  <ShieldCheck size={14} />
                  Run Readiness
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map(record => (
                <div key={record.id} className="rounded-lg border border-border bg-gray-950/40 p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShieldCheck size={16} className="text-nutanix-cyan" />
                        <h3 className="font-semibold text-gray-100">{record.profileName || record.workflow || record.configFile || 'Validation Evidence'}</h3>
                        <span className={clsx('badge text-xs', statusBadge(record.status))}>{record.status.replace('_', ' ')}</span>
                        <span className="badge badge-blue text-xs">{record.source === 'ztf-workflow' ? 'ZTF UAT' : 'NKP'}</span>
                        {record.profileRevision && <span className="badge badge-blue text-xs">rev {record.profileRevision}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>{new Date(record.createdAt).toLocaleString()}</span>
                        <span>by {record.createdBy || 'unknown'}</span>
                        {record.configFile && <span className="font-mono">{record.configFile}</span>}
                        {record.jobId && <span className="font-mono">job {record.jobId}</span>}
                        {record.configSha256 && <span className="font-mono">sha {record.configSha256.slice(0, 12)}</span>}
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                        <Metric label="Readiness" value={record.readiness ? `${record.readiness.status} ${record.readiness.score}%` : 'unknown'} />
                        <Metric label="Schema" value={record.schemaValidation?.status || 'unknown'} />
                        <Metric label={record.source === 'ztf-workflow' ? 'Execution' : 'CLI'} value={record.source === 'ztf-workflow' ? (record.executionStatus || 'not linked') : (record.compatibility?.status || 'not captured')} />
                      </div>
                      {record.notes && <p className="mt-3 text-sm text-gray-400">{record.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 xl:flex-shrink-0">
                      <button onClick={() => downloadRecord(record)} className="btn-secondary gap-1.5">
                        <Download size={14} />
                        Download
                      </button>
                      {isAdmin && (
                        <button onClick={() => { setDeleteTarget(record); setDeleteConfirm('') }} className="btn-danger gap-1.5">
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-red-700/40 bg-gray-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-2 text-red-300">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Delete validation evidence</h3>
                <p className="mt-1 text-sm text-gray-400">
                  This removes the evidence archive for <span className="text-gray-200">{deleteTarget.profileName || 'this profile'}</span>. Exported copies are not affected.
                </p>
              </div>
            </div>
            <label className="mt-5 block">
              <span className="label">Type the evidence ID to confirm</span>
              <input className="input font-mono" value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} autoFocus />
            </label>
            <p className="mt-2 break-all font-mono text-xs text-gray-600">{deleteTarget.id}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
              <button onClick={deleteRecord} disabled={deleteConfirm !== deleteTarget.id} className="btn-danger gap-1.5">
                <Trash2 size={14} />
                Delete Evidence
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-gray-900/50 px-3 py-2">
      <div className="text-gray-600">{label}</div>
      <div className="mt-1 font-semibold text-gray-300">{value}</div>
    </div>
  )
}

function statusBadge(status: string) {
  if (status === 'ready') return 'badge-green'
  if (status === 'blocked') return 'badge-red'
  return 'badge-yellow'
}
