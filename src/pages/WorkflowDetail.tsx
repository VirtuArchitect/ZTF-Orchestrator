import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useParams, Link, useLocation } from '../router'
import {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
  ArrowLeft, Play, Download, ListChecks, Upload,
  CheckCircle, ShieldCheck, Network, KeyRound, Lock, Boxes, X
} from 'lucide-react'
import Layout from '../components/Layout'
import YamlPreview from '../components/YamlPreview'
import ExecutionModal from '../components/ExecutionModal'
import Terminal from '../components/Terminal'
import { WORKFLOWS } from '../data'
import {
  buildClusterCreateYaml, buildImagingOnlyYaml, buildSiteDeployYaml,
  buildPCDeployYaml, buildClusterConfigYaml, buildCalmWorkloadsYaml,
  buildNDBYaml, fromYaml
} from '../utils/yaml'
import ClusterCreateForm from '../components/forms/ClusterCreateForm'
import ImagingOnlyForm from '../components/forms/ImagingOnlyForm'
import SiteDeployForm from '../components/forms/SiteDeployForm'
import PCDeployForm from '../components/forms/PCDeployForm'
import ClusterConfigForm from '../components/forms/ClusterConfigForm'
import CalmWorkloadsForm from '../components/forms/CalmWorkloadsForm'
import NDBForm from '../components/forms/NDBForm'
import GenericWorkflowForm from '../components/forms/GenericWorkflowForm'
import PostFoundationWorkflowForm from '../components/forms/PostFoundationWorkflowForm'
import Ztf2WorkflowForm from '../components/forms/Ztf2WorkflowForm'
import type { Ztf2WorkflowArtifacts } from '../components/forms/Ztf2WorkflowForm'
import clsx from 'clsx'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import type { ApprovalRequest, ExecutionJob, ExecutionJobLogEvent } from '../types'

const ICON_MAP: Record<string, React.ComponentType<{ size?: string | number; className?: string }>> = {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
  CheckCircle, ShieldCheck, Network, KeyRound, Lock, Boxes,
}

const TABS = ['Configure', 'YAML Preview'] as const
const MAX_IMPORT_BYTES = 1024 * 1024
const STANDALONE_FCA_CONFIRMATION_PREFIX = 'RUN STANDALONE-FCA'
const POST_FOUNDATION_WORKFLOWS = new Set([
  'post-foundation-baseline',
  'pe-monitoring-baseline',
  'pe-security-hardening',
  'pe-network-baseline',
  'pe-certificate-baseline',
  'hardware-out-of-band-baseline',
])

const WORKFLOW_IMPORT_KEYS: Record<string, string[]> = {
  'cluster-create': ['common_network_settings', 'create_clusters'],
  'cluster-create-standalone-fca': ['fca_ip', 'fca_credential', 'common_network_settings', 'create_clusters'],
  'imaging-only': ['imaging_batches'],
  'imaging-only-standalone-fca': ['fca_ip', 'fca_credential', 'imaging_batches'],
  'imaging-standalone-fca': ['fca_ip', 'fca_credential', 'imaging_batches'],
  'site-deploy': ['sites'],
  'site-deploy-standalone-fca': ['fca_ip', 'fca_credential', 'sites'],
  'deploy-pc': ['clusters'],
  'config-cluster': ['clusters'],
  'post-foundation-baseline': ['ztf_orchestrator', 'target', 'plan'],
  'pe-monitoring-baseline': ['ztf_orchestrator', 'target', 'plan'],
  'pe-security-hardening': ['ztf_orchestrator', 'target', 'plan'],
  'pe-network-baseline': ['ztf_orchestrator', 'target', 'plan'],
  'pe-certificate-baseline': ['ztf_orchestrator', 'target', 'plan'],
  'hardware-out-of-band-baseline': ['ztf_orchestrator', 'target', 'plan'],
  'calm-vm-workloads': ['bp_list', 'projects'],
  ndb: ['cluster_ip'],
}

function formatDate(value?: string | null): string {
  if (!value) return 'not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function validateWorkflowImport(workflowId: string, parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Imported config must be a YAML or JSON object.'
  }

  const expectedKeys = WORKFLOW_IMPORT_KEYS[workflowId]
  if (!expectedKeys?.length) return null

  const obj = parsed as Record<string, unknown>
  const missing = expectedKeys.filter(key => !(key in obj))
  return missing.length
    ? `Imported config does not look like ${workflowId}; missing ${missing.join(', ')}.`
    : null
}

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const workflow = WORKFLOWS.find(w => w.id === id)
  const workflowId = workflow?.id || ''
  const isZtf2Workflow = workflow?.runtimeMode === 'ztf2'
  const location = useLocation()
  const workflowsBasePath = location.pathname.startsWith('/workflows-2x') || isZtf2Workflow ? '/workflows-2x' : '/workflows'
  const settings = useStore(s => s.settings)
  const activeProfile = settings.connectionProfiles?.find(p => p.id === settings.activeProfileId)

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Configure')
  const [yamlContent, setYamlContent] = useState('')
  const [importedConfig, setImportedConfig] = useState<{ workflowId: string; parsed: unknown } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showExecution, setShowExecution] = useState(false)
  const [showZtf2Plan, setShowZtf2Plan] = useState(false)
  const [isDryRun, setIsDryRun] = useState(false)
  const [approvalId, setApprovalId] = useState('')
  const [runExtraParams, setRunExtraParams] = useState<Record<string, string> | undefined>(undefined)
  const [ztf2Artifacts, setZtf2Artifacts] = useState<Ztf2WorkflowArtifacts | null>(null)

  if (!workflow) {
    return (
      <Layout title="Workflow Not Found">
        <div className="text-center py-16">
          <p className="text-gray-500">Workflow "{id}" not found.</p>
          <Link to="/workflows" className="btn-primary mt-4 inline-flex">Back to Workflows</Link>
        </div>
      </Layout>
    )
  }

  const Icon = ICON_MAP[workflow.icon] || Server
  const approvalRequired = Boolean(settings.approvalRequiredWorkflows?.includes(workflow.id))
  const handleYamlGenerated = useCallback((yaml: string) => {
    setYamlContent(yaml)
  }, [])

  const download = () => {
    if (!yamlContent) return
    const blob = new Blob([yamlContent], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = workflow.configFile; a.click()
    URL.revokeObjectURL(url)
  }

  const startExecution = (dryRun: boolean) => {
    if (!yamlContent) return
    if (isZtf2Workflow) {
      setShowZtf2Plan(true)
      return
    }
    setIsDryRun(dryRun)
    const extraParams: Record<string, string> = {}
    if (!dryRun && approvalId.trim()) {
      extraParams.approvalId = approvalId.trim()
    }
    if (!dryRun && workflow.id.endsWith('-standalone-fca')) {
      const expected = `${STANDALONE_FCA_CONFIRMATION_PREFIX} ${workflow.id}`
      const entered = window.prompt(
        `Standalone FCA execution will submit a Lifecycle API request.\n\nType exactly: ${expected}`
      )
      if (entered !== expected) return
      extraParams.riskAcknowledged = 'true'
      extraParams.destructiveConfirmation = expected
    }
    setRunExtraParams(Object.keys(extraParams).length ? extraParams : undefined)
    setShowExecution(true)
  }

  const handleImportConfig = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_IMPORT_BYTES) {
      setImportMessage({ type: 'error', text: 'Config import is limited to 1 MB.' })
      return
    }

    try {
      const text = await file.text()
      const trimmed = text.trim()
      if (!trimmed) {
        setImportMessage({ type: 'error', text: 'Imported config is empty.' })
        return
      }

      const parsed = fromYaml(trimmed)
      const validationError = validateWorkflowImport(workflow.id, parsed)
      if (validationError) {
        setImportMessage({ type: 'error', text: validationError })
        return
      }

      setYamlContent(trimmed.endsWith('\n') ? trimmed : `${trimmed}\n`)
      setImportedConfig({ workflowId: workflow.id, parsed })
      setActiveTab('YAML Preview')
      setImportMessage({ type: 'success', text: `Imported ${file.name} for ${workflow.name}.` })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to parse config.'
      setImportMessage({ type: 'error', text: `Import failed: ${detail}` })
    }
  }

  const renderForm = () => {
    const props = {
      onYamlChange: handleYamlGenerated,
      profile: activeProfile,
      importedConfig: importedConfig?.workflowId === workflow.id ? importedConfig.parsed : undefined,
    }
    if (POST_FOUNDATION_WORKFLOWS.has(workflow.id)) {
      return <PostFoundationWorkflowForm workflow={workflow} {...props} />
    }
    if (workflow.runtimeMode === 'ztf2') {
      return <Ztf2WorkflowForm workflow={workflow} {...props} onArtifactsChange={setZtf2Artifacts} />
    }
    switch (workflow.id) {
      case 'cluster-create': return <ClusterCreateForm {...props} />
      case 'cluster-create-standalone-fca': return <ClusterCreateForm {...props} forcedFoundationCentralTarget="standalone_fca" />
      case 'imaging-only': return <ImagingOnlyForm {...props} />
      case 'imaging-only-standalone-fca': return <ImagingOnlyForm {...props} standaloneFca />
      case 'imaging-standalone-fca': return <ImagingOnlyForm {...props} standaloneFca />
      case 'site-deploy': return <SiteDeployForm {...props} />
      case 'site-deploy-standalone-fca': return <SiteDeployForm {...props} standaloneFca />
      case 'deploy-pc': return <PCDeployForm {...props} />
      case 'config-cluster': return <ClusterConfigForm {...props} />
      case 'calm-vm-workloads': return <CalmWorkloadsForm {...props} />
      case 'ndb': return <NDBForm {...props} />
      default: return <GenericWorkflowForm workflow={workflow} {...props} />
    }
  }

  return (
    <Layout
      title={workflow.name}
      subtitle={workflow.description}
      actions={
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".yml,.yaml,.json,text/yaml,application/x-yaml,application/json"
            className="hidden"
            onChange={handleImportConfig}
          />
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary gap-1.5">
            <Upload size={14} />
            Import Config
          </button>
          {yamlContent && (
            <button onClick={download} className="btn-secondary gap-1.5">
              <Download size={14} />
              Download Config
            </button>
          )}
          {!isZtf2Workflow && (
            <button
              onClick={() => startExecution(true)}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Validate config and check connectivity without running'}
            >
              <ListChecks size={14} />
              Dry Run
            </button>
          )}
          <button
            onClick={() => startExecution(false)}
            disabled={!yamlContent || (approvalRequired && !approvalId.trim())}
            className="btn-success gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : approvalRequired && !approvalId.trim() ? 'Select an approved request first' : undefined}
          >
            <Play size={14} />
            {isZtf2Workflow ? 'Run Plan' : 'Run Workflow'}
          </button>
        </div>
      }
    >
      {/* Back + Info */}
      <div className="flex items-start gap-4 mb-6">
        <Link to={workflowsBasePath} className="btn-ghost p-2 -ml-2 mt-0.5">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-nutanix-cyan" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">{workflow.name}</h2>
              <span className="text-xs font-mono text-gray-500">
                {isZtf2Workflow ? 'ztf plan --input input.yml --global-file global.yml' : `--workflow ${workflow.id} -f ${workflow.configFile}`}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed max-w-3xl">{workflow.details}</p>
        </div>
      </div>

      {importMessage && (
        <div
          className={clsx(
            'mb-4 rounded-lg border px-3 py-2 text-sm',
            importMessage.type === 'success'
              ? 'border-emerald-700/30 bg-emerald-900/10 text-emerald-300'
              : 'border-red-700/30 bg-red-900/10 text-red-300'
          )}
        >
          {importMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === tab
                ? 'bg-nutanix-blue text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Configure' && renderForm()}
      {activeTab === 'YAML Preview' && (
        yamlContent
          ? <YamlPreview content={yamlContent} filename={workflow.configFile} />
          : (
            <div className="card text-center py-12 text-gray-500">
              <p>Fill out the Configuration form to see the generated YAML</p>
            </div>
          )
      )}

      {approvalRequired && (
        <ApprovalSelector
          workflowId={workflow.id}
          value={approvalId}
          onChange={setApprovalId}
        />
      )}

      {showExecution && yamlContent && (
        <ExecutionModal
          onClose={() => setShowExecution(false)}
          workflow={workflow.id}
          configContent={yamlContent}
          configFile={workflow.configFile}
          extraParams={runExtraParams}
          dryRun={isDryRun}
        />
      )}

      {showZtf2Plan && ztf2Artifacts && (
        <Ztf2WorkflowPlanModal
          onClose={() => setShowZtf2Plan(false)}
          workflowId={workflow.id}
          artifacts={ztf2Artifacts}
        />
      )}
    </Layout>
  )
}

export function Ztf2WorkflowPlanModal({
  onClose,
  workflowId,
  artifacts,
}: {
  onClose: () => void
  workflowId: string
  artifacts: Ztf2WorkflowArtifacts
}) {
  const [job, setJob] = useState<ExecutionJob | null>(null)
  const [logs, setLogs] = useState<Array<{ type: string; data: string; ts: number }>>([])
  const [status, setStatus] = useState<'running' | 'done' | 'error'>('running')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    const append = (type: string, data: unknown) => {
      setLogs(prev => [...prev, { type, data: typeof data === 'string' ? data : JSON.stringify(data), ts: Date.now() }])
    }

    const poll = async (jobId: string) => {
      const resp = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`)
      if (!resp.ok || cancelled) return
      const next = await resp.json()
      if (cancelled) return
      setJob(next)
      setLogs((next.logs || []).map((event: ExecutionJobLogEvent) => ({
        type: event.type,
        data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
        ts: Date.parse(event.ts || '') || Date.now(),
      })))
      if (['success', 'failed', 'cancelled', 'interrupted'].includes(next.status)) {
        setStatus(next.status === 'success' ? 'done' : 'error')
        return
      }
      timer = window.setTimeout(() => poll(jobId), 1000)
    }

    const submit = async () => {
      try {
        append('start', 'Submitting ZTF 2.x plan workflow...')
        const resp = await apiFetch('/api/jobs', {
          method: 'POST',
          body: JSON.stringify({
            framework: 'ztf2',
            ztf2Action: 'plan',
            workflowTemplate: workflowId,
            inputContent: artifacts.inputContent,
            globalContent: artifacts.globalContent,
            inputFile: artifacts.inputFile,
            globalFile: artifacts.globalFile,
            stateFile: artifacts.stateFile,
          }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok) {
          throw new Error(data.error || `Server returned ${resp.status}`)
        }
        if (cancelled) return
        setJob(data)
        append('job', `Queued ${data.workflow || 'ztf2:plan'} as ${data.id}`)
        poll(data.id)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to submit ZTF 2.x plan'
        setError(message)
        append('error', message)
        setStatus('error')
      }
    }

    submit()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [artifacts, workflowId])

  const terminalStatus = job?.status === 'success' ? 'done' : status

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-3xl bg-gray-950 rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 flex items-center justify-center">
              <Boxes size={14} className="text-nutanix-cyan" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Planning: {workflowId}</h3>
              <p className="text-xs text-gray-500">{job?.id ? `Job ${job.id}` : 'Submitting plan job'}</p>
            </div>
          </div>
          {terminalStatus !== 'running' && (
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-4">
          {job?.trace?.planId && (
            <div className="mb-4 rounded-lg border border-border bg-surface/70 px-4 py-3 text-xs text-gray-400">
              <div>Plan ID: <span className="font-mono text-gray-200 break-all">{job.trace.planId}</span></div>
              {job.trace.planPath && <div className="mt-1">Plan path: <span className="font-mono text-gray-200 break-all">{job.trace.planPath}</span></div>}
              <div className="mt-1">State path: <span className="font-mono text-gray-200 break-all">{job.trace.statePath || artifacts.stateFile}</span></div>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-lg border border-red-700/30 bg-red-900/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <Terminal
            logs={logs}
            status={terminalStatus}
            title="ztf plan"
            statusLabel={job?.status || status}
          />
        </div>
        {terminalStatus !== 'running' && (
          <div className="px-6 pb-4 flex justify-end">
            <button onClick={onClose} className="btn-secondary">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalSelector({
  workflowId,
  value,
  onChange,
}: {
  workflowId: string
  value: string
  onChange: (value: string) => void
}) {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(false)

  const approvedWorkflowApprovals = useMemo(() => {
    const now = Date.now()
    return approvals
      .filter(approval => {
        if (approval.workflow !== workflowId || approval.status !== 'approved') return false
        const expiresAt = Date.parse(approval.expiresAt || '')
        return Number.isNaN(expiresAt) || expiresAt > now
      })
      .sort((a, b) => Date.parse(b.decidedAt || b.requestedAt || '') - Date.parse(a.decidedAt || a.requestedAt || ''))
  }, [approvals, workflowId])
  const selectedApproval = approvedWorkflowApprovals.find(approval => approval.id === value)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch('/api/approvals?status=approved')
      .then(response => response.ok ? response.json() : [])
      .then(data => {
        if (!cancelled) setApprovals(Array.isArray(data) ? data : [])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [workflowId])

  useEffect(() => {
    if (value && !approvedWorkflowApprovals.some(approval => approval.id === value)) {
      onChange('')
    }
  }, [approvedWorkflowApprovals, onChange, value])

  return (
    <div className="mt-6 card border-amber-700/30 bg-amber-900/5">
      <label className="label">Approved Request</label>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="input"
        disabled={loading}
      >
        <option value="">
          {loading ? 'Loading approved requests...' : 'Select approved request'}
        </option>
        {approvedWorkflowApprovals.map(approval => (
          <option key={approval.id} value={approval.id}>
            {approval.notes || approval.configFile || approval.id.slice(0, 8)} / requested by {approval.requestedBy} / expires {formatDate(approval.expiresAt)}
          </option>
        ))}
      </select>
      {selectedApproval ? (
        <div className="mt-3 rounded-lg border border-border bg-gray-950/40 px-3 py-2 text-xs text-gray-400">
          <div className="font-mono text-gray-300 break-all">{selectedApproval.id}</div>
          <div className="mt-1">Approved by {selectedApproval.decidedBy || 'admin'} on {formatDate(selectedApproval.decidedAt || selectedApproval.requestedAt)}</div>
        </div>
      ) : (
        !loading && (
          <p className="mt-2 text-xs text-amber-600">
            No approved, unexpired request is available for this workflow.
          </p>
        )
      )}
      <p className="text-xs text-gray-500 mt-2">
        Dry Run does not require approval. Run Workflow requires a matching approved request for this workflow and YAML.
      </p>
    </div>
  )
}
