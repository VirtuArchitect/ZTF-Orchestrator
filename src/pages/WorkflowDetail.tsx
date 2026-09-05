import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useParams, Link, useLocation } from '../router'
import {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
  ArrowLeft, Play, Download, ListChecks, Upload,
  CheckCircle, ShieldCheck, Network, KeyRound, Lock, Boxes, CalendarClock, X
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
import NativeFoundationDeployForm from '../components/forms/NativeFoundationDeployForm'
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
  CheckCircle, ShieldCheck, Network, KeyRound, Lock, Boxes, CalendarClock,
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
  'native-foundation-deploy': ['ztf_orchestrator', 'foundation_engine', 'sites'],
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

interface NativeFoundationPhase {
  id: string
  name: string
  order: number
  status: string
  readOnly: boolean
  mutatingActionsEnabled: boolean
  operatorOutcome: string
  evidenceRequired: string[]
  nextGate: string
}

interface NativeFoundationPhaseCatalog {
  currentExecutionMode: string
  contractVersion: string
  mutatingActionsEnabled: boolean
  phases: NativeFoundationPhase[]
  readOnly: boolean
  summary: {
    phaseCount: number
    implementedPhaseCount: number
    mutatingEnabledPhaseCount: number
    currentBoundary: string
  }
  supportedReadinessPhases: string[]
}

interface NativeFoundationProviderAdapter {
  providerId: string
  status: string
  readOnly: boolean
  mutatingActionsEnabled: boolean
  readOnlyDiscovery: boolean
  adapterFamily?: string
  vendor?: string
  serviceRoot?: string
  environmentControls?: Record<string, string>
  controlledUatMutatingOperations?: string[]
}

interface NativeFoundationProviderAdapterManifest {
  adapterInterfaceVersion: string
  providerAdapters: NativeFoundationProviderAdapter[]
  readOnly: boolean
  status: string
  mutatingActionsEnabled: boolean
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

function formatNativeFoundationStatus(value?: string): string {
  return (value || 'unknown').replace(/_/g, ' ')
}

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const workflow = WORKFLOWS.find(w => w.id === id)
  const workflowId = workflow?.id || ''
  const isZtf2Workflow = workflow?.runtimeMode === 'ztf2'
  const isNativeFoundationWorkflow = workflowId === 'native-foundation-deploy'
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
  const [nativeFoundationEvidenceId, setNativeFoundationEvidenceId] = useState('')
  const [nativeFoundationPhases, setNativeFoundationPhases] = useState<NativeFoundationPhaseCatalog | null>(null)
  const [nativeFoundationPhasesError, setNativeFoundationPhasesError] = useState('')
  const [nativeFoundationProviderAdapters, setNativeFoundationProviderAdapters] = useState<NativeFoundationProviderAdapterManifest | null>(null)
  const [nativeFoundationProviderAdaptersError, setNativeFoundationProviderAdaptersError] = useState('')
  const [nativeFoundationReadinessPhase, setNativeFoundationReadinessPhase] = useState('imaging_only')
  const [nativeFoundationAdvancementPhase, setNativeFoundationAdvancementPhase] = useState('production_hardening')

  useEffect(() => {
    if (!isNativeFoundationWorkflow) return

    let cancelled = false
    apiFetch('/api/native-foundation/phases')
      .then(async resp => {
        const body = await resp.json()
        if (cancelled) return
        if (!resp.ok) {
          setNativeFoundationPhasesError(body.error || 'Unable to load native Foundation phases.')
          return
        }
        setNativeFoundationPhases(body)
        if (Array.isArray(body.phases) && body.phases.length && !body.phases.some((phase: NativeFoundationPhase) => phase.id === nativeFoundationAdvancementPhase)) {
          setNativeFoundationAdvancementPhase(body.phases[body.phases.length - 1].id)
        }
        setNativeFoundationPhasesError('')
      })
      .catch(error => {
        if (!cancelled) {
          setNativeFoundationPhasesError(error instanceof Error ? error.message : 'Unable to load native Foundation phases.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isNativeFoundationWorkflow, nativeFoundationAdvancementPhase])

  useEffect(() => {
    if (!isNativeFoundationWorkflow) return

    let cancelled = false
    apiFetch('/api/native-foundation/provider-adapters')
      .then(async resp => {
        const body = await resp.json()
        if (cancelled) return
        if (!resp.ok) {
          setNativeFoundationProviderAdaptersError(body.error || 'Unable to load native Foundation provider adapters.')
          return
        }
        setNativeFoundationProviderAdapters(body)
        setNativeFoundationProviderAdaptersError('')
      })
      .catch(error => {
        if (!cancelled) {
          setNativeFoundationProviderAdaptersError(error instanceof Error ? error.message : 'Unable to load native Foundation provider adapters.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [isNativeFoundationWorkflow])

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
  const nativeFoundationDellAdapter = nativeFoundationProviderAdapters?.providerAdapters?.find(adapter => adapter.providerId === 'dell_idrac_redfish')
  const nativeFoundationDeploymentEnabled = Boolean(isNativeFoundationWorkflow && nativeFoundationDellAdapter?.mutatingActionsEnabled)
  const handleYamlGenerated = useCallback((yaml: string) => {
    setYamlContent(yaml)
    setNativeFoundationEvidenceId('')
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

  const previewNativeFoundationDiscovery = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/discovery/preview', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation discovery preview failed.',
        })
        return
      }
      const siteCount = Array.isArray(body.sites) ? body.sites.length : 0
      const clusterCount = Array.isArray(body.sites)
        ? body.sites.reduce((total: number, site: { clusters?: unknown[] }) => total + (Array.isArray(site.clusters) ? site.clusters.length : 0), 0)
        : 0
      const nodeCount = Array.isArray(body.sites)
        ? body.sites.reduce((total: number, site: { clusters?: Array<{ nodes?: unknown[] }> }) => (
          total + (Array.isArray(site.clusters)
            ? site.clusters.reduce((siteTotal, cluster) => siteTotal + (Array.isArray(cluster.nodes) ? cluster.nodes.length : 0), 0)
            : 0)
        ), 0)
        : 0
      setImportMessage({
        type: 'success',
        text: `Discovery preview normalized ${siteCount} site(s), ${clusterCount} cluster(s), and ${nodeCount} node(s).`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to preview discovery.'
      setImportMessage({ type: 'error', text: `Discovery preview failed: ${detail}` })
    }
  }

  const generateNativeFoundationPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation plan generation failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'success',
        text: `Generated ${body.planId}: ${summary.siteCount || 0} site(s), ${summary.clusterCount || 0} cluster(s), ${summary.nodeCount || 0} node(s).`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to generate native Foundation plan.'
      setImportMessage({ type: 'error', text: `Plan generation failed: ${detail}` })
    }
  }

  const checkNativeFoundationReadiness = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/readiness', {
        method: 'POST',
        body: JSON.stringify({ phase: nativeFoundationReadinessPhase, content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.message || 'Native Foundation readiness check failed.',
        })
        return
      }
      const gates = Array.isArray(body.gates) ? body.gates : []
      const blocked = gates.filter((gate: { status?: string }) => gate.status === 'blocked').length
      const passed = gates.filter((gate: { status?: string }) => gate.status === 'pass').length
      setImportMessage({
        type: blocked ? 'error' : 'success',
        text: `Execution readiness for ${body.phase || nativeFoundationReadinessPhase} is ${body.status}: ${passed} gate(s) passed, ${blocked} blocked.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to check native Foundation readiness.'
      setImportMessage({ type: 'error', text: `Readiness check failed: ${detail}` })
    }
  }

  const reviewNativeFoundationPhaseAdvancement = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/phases/advancement-review', {
        method: 'POST',
        body: JSON.stringify({ phaseId: nativeFoundationAdvancementPhase, content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation phase advancement review failed.',
        })
        return
      }
      const summary = body.summary || {}
      const phaseName = body.requestedPhase?.name || nativeFoundationAdvancementPhase
      setImportMessage({
        type: 'error',
        text: `Phase advancement review for ${phaseName} is ${body.status}: ${summary.predecessorPhaseCount || 0} predecessor phase(s), ${summary.acceptedPhaseEvidenceCount || 0}/${summary.requiredPhaseEvidenceCount || 0} phase evidence item(s) accepted, ${summary.blockedCheckCount || 0} blocked check(s), ${summary.mutatingEnabledPhaseCount || 0} mutating-enabled phase(s). Promotion remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation phase advancement.'
      setImportMessage({ type: 'error', text: `Phase advancement review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderTopologyMatrix = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-topology-matrix', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation provider/topology matrix failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider/topology matrix is ${body.status}: ${summary.matrixRowCount || 0} cluster row(s), ${summary.providerCount || 0} provider(s), ${summary.deploymentTypeCount || 0} deployment type(s), ${summary.missingEvidenceCount || 0} missing evidence item(s). Execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider/topology matrix.'
      setImportMessage({ type: 'error', text: `Provider/topology matrix failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderOperationCatalog = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-operation-catalog', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation provider operation catalog failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider operation catalog is ${body.status}: ${summary.operationCatalogRowCount || 0} cluster row(s), ${summary.operationCount || 0} operation(s), ${summary.mutatingOperationCount || 0} mutating operation(s), ${summary.runnableOperationCount || 0} runnable operation(s). Execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider operation catalog.'
      setImportMessage({ type: 'error', text: `Provider operation catalog failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderOperationAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-operation-admission-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent, phase: nativeFoundationAdvancementPhase }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation provider operation admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider operation admission review is ${body.status}: ${summary.operationAdmissionRecordCount || 0} record(s), ${summary.admittedOperationCount || 0} admitted operation(s), ${summary.runnableOperationCount || 0} runnable operation(s). Operation execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider operation admission.'
      setImportMessage({ type: 'error', text: `Provider operation admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderOperationQueuePlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-operation-queue-plan', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: nativeFoundationAdvancementPhase,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation provider operation queue plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider operation queue plan is ${body.status}: ${summary.operationQueueItemCount || 0} item(s), ${summary.queuedOperationCount || 0} queued operation(s), ${summary.persistedOperationQueueCount || 0} persisted queue(s), ${summary.runnableOperationCount || 0} runnable operation(s). Operation queueing remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider operation queue plan.'
      setImportMessage({ type: 'error', text: `Provider operation queue plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderOperationQueueAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-operation-queue-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: nativeFoundationAdvancementPhase,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation provider operation queue admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider operation queue admission review is ${body.status}: ${summary.operationQueueAdmissionRecordCount || 0} record(s), ${summary.admittedOperationQueueCount || 0} admitted queue(s), ${summary.persistedOperationQueueCount || 0} persisted queue(s), ${summary.queuedOperationCount || 0} queued operation(s), ${summary.runnableOperationCount || 0} runnable operation(s). Operation queueing remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider operation queue admission.'
      setImportMessage({ type: 'error', text: `Provider operation queue admission review failed: ${detail}` })
    }
  }

  const probeNativeFoundationDellIdracRedfish = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/providers/dell-idrac/redfish-probe', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Dell iDRAC Redfish probe failed.',
        })
        return
      }
      const summary = body.summary || {}
      const failedCheckCount = summary.failedCheckCount || 0
      const blockedCheckCount = summary.blockedCheckCount || 0
      const passedCheckCount = summary.passedCheckCount || 0
      const readOnlyProbeReady = body.status === 'ready' || (failedCheckCount === 0 && blockedCheckCount <= 1 && passedCheckCount > 0)
      setImportMessage({
        type: readOnlyProbeReady ? 'success' : 'error',
        text: `Dell iDRAC Redfish probe is ${readOnlyProbeReady ? 'ready' : body.status}: ${passedCheckCount} passed, ${readOnlyProbeReady ? 0 : blockedCheckCount} blocked, ${failedCheckCount} failed. Probe is read-only; deployment mutation is controlled separately.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to probe Dell iDRAC Redfish.'
      setImportMessage({ type: 'error', text: `Dell iDRAC Redfish probe failed: ${detail}` })
    }
  }

  const reviewNativeFoundationImageSources = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/images/manifest', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation image source review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Image source manifest is ${body.status}: ${summary.imageCount || 0} image(s), ${summary.missingChecksumCount || 0} missing checksum(s). Staging remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation image sources.'
      setImportMessage({ type: 'error', text: `Image source review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationImagingPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/imaging/plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation node imaging plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Node imaging plan is ${body.status}: ${summary.readyForReviewNodeCount || 0}/${summary.nodePlanCount || 0} node(s) ready for review, ${summary.missingPayloadFieldCount || 0} missing field(s). Imaging remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation node imaging plan.'
      setImportMessage({ type: 'error', text: `Node imaging plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationClusterFormation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/clusters/formation-plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation cluster formation plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Cluster formation plan is ${body.status}: ${summary.readyForReviewClusterCount || 0}/${summary.clusterPlanCount || 0} cluster(s) ready for review, ${summary.missingFormationFieldCount || 0} missing field(s). Cluster creation remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation cluster formation plan.'
      setImportMessage({ type: 'error', text: `Cluster formation plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationPostCreateValidation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/post-create/validation-plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation post-create validation plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Post-create validation plan is ${body.status}: ${summary.readyForReviewValidationCount || 0}/${summary.validationPlanCount || 0} cluster validation plan(s) ready, ${summary.missingValidationInputCount || 0} missing input(s). Live validation remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation post-create validation plan.'
      setImportMessage({ type: 'error', text: `Post-create validation plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/admission-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution admission is ${body.status}: ${summary.selectedClusterCount || 0} cluster(s) scoped, ${summary.blockedAdmissionCheckCount || 0} blocked check(s). Native Foundation execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution admission.'
      setImportMessage({ type: 'error', text: `Execution admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionAdapterContract = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/adapter-contract', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution adapter contract review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution adapter contract is ${body.status}: ${summary.adapterRequestCount || 0} adapter request(s), ${summary.blockedAdapterContractCheckCount || 0} blocked check(s). Adapter loading remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution adapter contract.'
      setImportMessage({ type: 'error', text: `Execution adapter contract review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionRequest = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/request-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution request review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution request review is ${body.status}: ${summary.executionRequestCount || 0} request(s), ${summary.submittedExecutionCount || 0} submitted. Job submission remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution request.'
      setImportMessage({ type: 'error', text: `Execution request review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionRequestPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/request-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution request persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Request persistence admission review is ${body.status}: ${summary.requestPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.requestPersistenceAdmittedCount || 0} admitted, ${summary.executionRequestPersistedCount || 0} request record(s) persisted. Request persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution request persistence admission.'
      setImportMessage({ type: 'error', text: `Request persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationRecoveryPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/recovery-plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation recovery plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Recovery plan is ${body.status}: ${summary.recoveryActionCount || 0} recovery action(s), ${summary.blockedRecoveryCheckCount || 0} blocked check(s). Recovery execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation recovery plan.'
      setImportMessage({ type: 'error', text: `Recovery plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationJobStatePlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/job-state-plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation job state plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Job state plan is ${body.status}: ${summary.stateTransitionCount || 0} transition(s), ${summary.persistedStateTransitionCount || 0} persisted. Durable job persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation job state plan.'
      setImportMessage({ type: 'error', text: `Job state plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationRestartResume = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/restart-resume-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation restart/resume review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Restart/resume review is ${body.status}: ${summary.resumeRecordCount || 0} resume record(s), ${summary.requiredRestartArtifactCount || 0} restart artifact(s), ${summary.persistedStateTransitionCount || 0} persisted transition(s). Replay remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation restart/resume readiness.'
      setImportMessage({ type: 'error', text: `Restart/resume review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationBackupRestore = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/backup-restore-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation backup/restore review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Backup/restore review is ${body.status}: ${summary.backupRestoreRecordCount || 0} record(s), ${summary.backupCreatedCount || 0} backup(s) created, ${summary.restoreTestedCount || 0} restore(s) tested. Backup and restore remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation backup/restore readiness.'
      setImportMessage({ type: 'error', text: `Backup/restore review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationMutatingEnablement = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/mutating-enablement-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation mutating enablement review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Mutating enablement review is ${body.status}: ${summary.enablementItemCount || 0} item(s), ${summary.blockedEnablementItemCount || 0} blocked, ${summary.mutatingJobSubmissionEnabledCount || 0} mutating submissions enabled. Deployment execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation mutating enablement.'
      setImportMessage({ type: 'error', text: `Mutating enablement review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionSubmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/submission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution submission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution submission review is ${body.status}: ${summary.submissionRecordCount || 0} submission record(s), ${summary.enqueuedJobCount || 0} job(s) enqueued, ${summary.mutatingJobSubmissionEnabledCount || 0} mutating submissions enabled. Job enqueue remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution submission.'
      setImportMessage({ type: 'error', text: `Execution submission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionSubmissionPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/submission-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution submission persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Submission persistence admission review is ${body.status}: ${summary.submissionPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.submissionPersistenceAdmittedCount || 0} admitted, ${summary.executionSubmissionPersistedCount || 0} submission record(s) persisted. Submission persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution submission persistence admission.'
      setImportMessage({ type: 'error', text: `Submission persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationQueuePersistence = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/queue-persistence-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation queue persistence review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Queue persistence review is ${body.status}: ${summary.queueRecordCount || 0} queue record(s), ${summary.persistedQueueRecordCount || 0} persisted, ${summary.replayRegisteredCount || 0} replay registration(s). Queue persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation queue persistence.'
      setImportMessage({ type: 'error', text: `Queue persistence review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationQueuePersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/queue-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation queue persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Queue persistence admission review is ${body.status}: ${summary.queuePersistenceAdmissionRecordCount || 0} admission record(s), ${summary.queuePersistenceAdmittedCount || 0} admitted, ${summary.queueRecordPersistedCount || 0} queue record(s) persisted. Queue persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation queue persistence admission.'
      setImportMessage({ type: 'error', text: `Queue persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationJobPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/job-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation job persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Job persistence admission review is ${body.status}: ${summary.persistenceAdmissionRecordCount || 0} admission record(s), ${summary.jobStatePersistedCount || 0} job state record(s) persisted, ${summary.executionAuthorizationPersistedCount || 0} authorization record(s) persisted. Persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation job persistence admission.'
      setImportMessage({ type: 'error', text: `Job persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionAuthorizationPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/authorization-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution authorization persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Authorization persistence admission review is ${body.status}: ${summary.authorizationPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.executionAuthorizationPersistenceAdmittedCount || 0} admitted, ${summary.executionAuthorizationPersistedCount || 0} authorization record(s) persisted. Authorization persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution authorization persistence admission.'
      setImportMessage({ type: 'error', text: `Authorization persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationMutatingAdapterBinding = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/mutating-adapter-binding-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation mutating adapter binding review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter binding review is ${body.status}: ${summary.bindingRecordCount || 0} binding record(s), ${summary.persistedBindingRecordCount || 0} persisted, ${summary.adapterExecutedCount || 0} adapter execution(s). Adapter binding remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation mutating adapter binding.'
      setImportMessage({ type: 'error', text: `Adapter binding review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatLaneSelection = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/lane-selection-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT lane selection review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT lane selection review is ${body.status}: ${summary.laneRecordCount || 0} lane record(s), ${summary.persistedLaneSelectionCount || 0} persisted, ${summary.issuedUatEntryCount || 0} UAT entr${summary.issuedUatEntryCount === 1 ? 'y' : 'ies'} issued. Lane selection remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT lane selection.'
      setImportMessage({ type: 'error', text: `UAT lane selection review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatLanePersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/lane-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT lane persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT lane persistence admission review is ${body.status}: ${summary.lanePersistenceAdmissionRecordCount || 0} admission record(s), ${summary.lanePersistenceAdmittedCount || 0} admitted, ${summary.hardwareReservationAdmittedCount || 0} hardware reservation admission(s). Lane persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT lane persistence admission.'
      setImportMessage({ type: 'error', text: `UAT lane persistence admission review failed: ${detail}` })
    }
  }

  const queueNativeFoundationReviewJob = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/review-job', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          configFile: workflow.configFile,
          phase: 'full_deployment',
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation review job could not be queued.',
        })
        return
      }
      setImportMessage({
        type: 'success',
        text: `Queued native Foundation review job ${body.id}. Deployment execution remains disabled; monitor Jobs / Queue for persisted review logs.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to queue native Foundation review job.'
      setImportMessage({ type: 'error', text: `Native Foundation review job failed: ${detail}` })
    }
  }

  const reviewNativeFoundationNetworkManifest = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/network/manifest', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation network manifest review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Network manifest is ${body.status}: ${summary.siteNetworkCount || 0} site(s), ${summary.duplicateIpCount || 0} duplicate IP(s), ${summary.outsideSubnetCount || 0} outside subnet. Configuration remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation network manifest.'
      setImportMessage({ type: 'error', text: `Network manifest review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretReferences = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/manifest', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret reference review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret references are ${body.status}: ${summary.missingCredentialRefCount || 0} missing ref(s), ${summary.inlineSecretFindingCount || 0} inline secret finding(s). Secret use remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret references.'
      setImportMessage({ type: 'error', text: `Secret reference review failed: ${detail}` })
    }
  }

  const previewNativeFoundationExecutionGraph = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/graph', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation execution graph failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'success',
        text: `Execution graph planned ${summary.stepCount || 0} step(s) across ${summary.siteCount || 0} site(s) and ${summary.clusterCount || 0} cluster(s).`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to preview native Foundation execution graph.'
      setImportMessage({ type: 'error', text: `Execution graph failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterContracts = async () => {
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-contracts', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation adapter contract review failed.',
        })
        return
      }
      const requirements = body.intentRequirements || {}
      const providers = Array.isArray(requirements.providersInIntent) ? requirements.providersInIntent.length : 0
      const deploymentTypes = Array.isArray(requirements.deploymentTypesInIntent) ? requirements.deploymentTypesInIntent.length : 0
      setImportMessage({
        type: 'success',
        text: `Adapter contract ${body.contractVersion} covers ${providers} provider type(s) and ${deploymentTypes} deployment type(s) in this intent.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter contracts.'
      setImportMessage({ type: 'error', text: `Adapter contract review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderAdapters = async () => {
    try {
      const resp = await apiFetch('/api/native-foundation/provider-adapters', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation provider adapter review failed.',
        })
        return
      }
      const adapters = Array.isArray(body.providerAdapters) ? body.providerAdapters.length : 0
      setImportMessage({
        type: 'error',
        text: `Provider adapter manifest ${body.adapterInterfaceVersion}: ${adapters} provider adapter(s), mutating operations disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider adapters.'
      setImportMessage({ type: 'error', text: `Provider adapter review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationProviderPreflight = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/provider-preflight', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation provider preflight failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Provider preflight is ${body.status}: ${summary.sitePreflightCount || 0} site(s), ${summary.blockedPreflightCheckCount || 0} blocked check(s). Live discovery remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation provider preflight.'
      setImportMessage({ type: 'error', text: `Provider preflight failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretResolution = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/resolution-plan', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret resolution plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret resolution plan is ${body.status}: ${summary.resolutionRequestCount || 0} reference(s) inventoried, ${summary.resolvedSecretCount || 0} secret value(s) resolved. Secret resolution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret resolution plan.'
      setImportMessage({ type: 'error', text: `Secret resolution plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretBinding = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/store-binding-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret-store binding review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret-store binding review is ${body.status}: ${summary.bindingCount || 0} binding(s), ${summary.resolvedBindingCount || 0} resolved, ${summary.adapterHandoffEnabledCount || 0} adapter handoff(s) enabled. Secret-store binding remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret-store bindings.'
      setImportMessage({ type: 'error', text: `Secret-store binding review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretProviderContract = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/provider-contract-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret-store provider contract review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret-store provider contract review is ${body.status}: ${summary.credentialReferenceCount || 0} reference(s), ${summary.supportedProviderCount || 0} provider contract(s) recognized, ${summary.secretValueExposureCount || 0} secret value(s) exposed. Secret-store provider approval remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret-store provider contract.'
      setImportMessage({ type: 'error', text: `Secret-store provider contract review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretLeaseExecution = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/lease-execution-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret lease execution review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret lease execution review is ${body.status}: ${summary.leaseOpenedCount || 0}/${summary.leaseExecutionRecordCount || 0} lease(s) opened, ${summary.blockedLeaseExecutionCheckCount || 0} blocked check(s). Secret lease execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret lease execution.'
      setImportMessage({ type: 'error', text: `Secret lease execution review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationSecretAuditPersistence = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/secrets/audit-persistence-review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation secret audit persistence review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Secret audit persistence review is ${body.status}: ${summary.auditEventPersistedCount || 0}/${summary.auditEventRecordCount || 0} audit event(s) persisted, ${summary.blockedAuditPersistenceCheckCount || 0} blocked check(s). Secret audit persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation secret audit persistence.'
      setImportMessage({ type: 'error', text: `Secret audit persistence review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDiscoveryContract = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/discovery/contract', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation discovery contract review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Discovery contract is ${body.status}: ${summary.providerDiscoveryContractCount || 0} provider contract(s), ${summary.blockedDiscoveryContractCheckCount || 0} blocked check(s). Live discovery remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation discovery contract.'
      setImportMessage({ type: 'error', text: `Discovery contract review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDiscoveryReconciliation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/discovery/reconcile', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation discovery reconciliation failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Discovery reconciliation is ${body.status}: ${summary.matchedNodeCount || 0}/${summary.expectedNodeCount || 0} node(s) matched, ${summary.missingDiscoveryNodeCount || 0} missing, ${summary.unexpectedDiscoveryNodeCount || 0} unexpected. Promotion remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation discovery reconciliation.'
      setImportMessage({ type: 'error', text: `Discovery reconciliation failed: ${detail}` })
    }
  }

  const previewNativeFoundationEvidencePacks = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/evidence-packs', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation evidence pack preview failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'success',
        text: `Prepared ${summary.packCount || 0} read-only evidence pack(s) for ${summary.clusterCount || 0} cluster(s).`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to preview native Foundation evidence packs.'
      setImportMessage({ type: 'error', text: `Evidence pack preview failed: ${detail}` })
    }
  }

  const reviewNativeFoundationEvidencePackApproval = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/evidence-packs/approval-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation evidence pack approval review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Pack approval is ${body.status}: ${summary.packApprovalCount || 0} pack(s), ${summary.readyForReviewPackApprovalCount || 0} ready for review, ${summary.missingEvidenceRequirementCount || 0} missing evidence requirement(s). Execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation evidence pack approvals.'
      setImportMessage({ type: 'error', text: `Evidence pack approval review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterReadiness = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-readiness', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter readiness review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter readiness is ${body.status}: ${summary.adapterCount || 0} adapter target(s), ${summary.missingEvidenceCount || 0} missing evidence requirement(s). Execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter readiness.'
      setImportMessage({ type: 'error', text: `Adapter readiness review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentPolicy = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-policy', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment policy review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Deployment policy is ${body.status}: ${summary.sitePolicyCount || 0} site policy record(s), ${summary.blockedPolicyCheckCount || 0} blocked check(s). Scheduling remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment policy.'
      setImportMessage({ type: 'error', text: `Deployment policy review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentWaveGates = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-wave-gates/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment wave gate review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Wave gates are ${body.status}: ${summary.waveGateCount || 0} wave(s), ${summary.siteGateCount || 0} site gate(s), ${summary.blockedWaveGateCheckCount || 0} blocked check(s). Opening waves remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment wave gates.'
      setImportMessage({ type: 'error', text: `Deployment wave gate review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentWaveRehearsal = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-wave-rehearsal', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment wave rehearsal failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Wave rehearsal is ${body.status}: ${summary.waveRehearsalCount || 0} wave package(s), ${summary.rehearsalClusterCount || 0} cluster(s), ${summary.runnerBlockerCount || 0} runner blocker(s). Wave execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment wave rehearsal.'
      setImportMessage({ type: 'error', text: `Deployment wave rehearsal failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentWaveAuthorization = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-waves/authorization-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment wave authorization review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Wave authorization is ${body.status}: ${summary.waveAuthorizationCount || 0} wave record(s), ${summary.readyForReviewPackApprovalCount || 0}/${summary.packApprovalCount || 0} pack approval(s) ready, ${summary.lockRequestCount || 0} lock request(s). Authorization remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment wave authorization.'
      setImportMessage({ type: 'error', text: `Deployment wave authorization review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentWindowReservation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-windows/reservation-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment window reservation review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Window reservation review is ${body.status}: ${summary.reservationRequestCount || 0} request(s), ${summary.readyForReviewReservationCount || 0} ready for review, ${summary.linkedLockRequestCount || 0} linked lock request(s). Reservation remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment window reservations.'
      setImportMessage({ type: 'error', text: `Deployment window reservation review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentScheduler = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-scheduler/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment scheduler review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Scheduler review is ${body.status}: ${summary.scheduleItemCount || 0} schedule item(s), ${summary.scheduleLedgerEntryCount || 0} ledger entry link(s), ${summary.scheduleRecoveryActionCount || 0} recovery action link(s). Wave opening and job enqueue remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment scheduler.'
      setImportMessage({ type: 'error', text: `Deployment scheduler review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDeploymentTypeSupport = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/deployment-types/support-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation deployment type support review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Topology support review is ${body.status}: ${summary.supportRecordCount || 0} provider/topology record(s), ${summary.deploymentTypeCount || 0} deployment type(s), ${summary.missingUatEvidenceCount || 0} missing UAT evidence reference(s). Mutating support remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation deployment type support.'
      setImportMessage({ type: 'error', text: `Deployment type support review failed: ${detail}` })
    }
  }

  const previewNativeFoundationResumeCheckpoint = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/resume-checkpoint', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation resume checkpoint failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: body.status === 'blocked' ? 'error' : 'success',
        text: `Resume checkpoint ${body.checkpointId}: ${summary.completedStepCount || 0} completed, ${summary.nextStepCount || 0} next, ${summary.blockedStepCount || 0} blocked.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to preview native Foundation resume checkpoint.'
      setImportMessage({ type: 'error', text: `Resume checkpoint failed: ${detail}` })
    }
  }

  const reviewNativeFoundationPromotion = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-promotion/review', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation promotion review failed.',
        })
        return
      }
      const blocked = Array.isArray(body.checks)
        ? body.checks.filter((check: { status?: string }) => check.status === 'blocked').length
        : 0
      setImportMessage({
        type: 'error',
        text: `Adapter promotion is ${body.status}: ${blocked} blocker(s); controlled hardware UAT is still required.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter promotion.'
      setImportMessage({ type: 'error', text: `Promotion review failed: ${detail}` })
    }
  }

  const previewNativeFoundationUatChecklist = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/checklist', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation UAT checklist failed.',
        })
        return
      }
      const caseCount = Array.isArray(body.cases) ? body.cases.length : 0
      setImportMessage({
        type: 'error',
        text: `UAT checklist ${body.checklistId}: ${caseCount} case(s), promotion remains blocked pending controlled hardware UAT.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to prepare native Foundation UAT checklist.'
      setImportMessage({ type: 'error', text: `UAT checklist failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatEvidenceAcceptance = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/evidence-acceptance-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim() || undefined,
          evidenceId: nativeFoundationEvidenceId.trim() || undefined,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation UAT evidence acceptance review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: body.status === 'ready_for_review' ? 'success' : 'error',
        text: `UAT evidence acceptance is ${body.status}: ${summary.acceptedEvidenceCount || 0} accepted, ${summary.missingEvidenceCount || 0} missing. Acceptance persistence and deployment execution remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation UAT evidence acceptance.'
      setImportMessage({ type: 'error', text: `UAT evidence acceptance failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterUatRehearsal = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-uat/rehearsal', {
        method: 'POST',
        body: JSON.stringify({ content: yamlContent }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter UAT rehearsal failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter UAT rehearsal ${body.rehearsalId}: ${summary.rehearsalCaseCount || 0} planned case(s), ${summary.requiredEvidenceCount || 0} evidence item(s). UAT execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter UAT rehearsal.'
      setImportMessage({ type: 'error', text: `Adapter UAT rehearsal failed: ${detail}` })
    }
  }

  const downloadNativeFoundationReviewPacket = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/review-packet', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim() || undefined,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        setImportMessage({
          type: 'error',
          text: body.error || body.warnings?.[0] || 'Native Foundation review packet export failed.',
        })
        return
      }
      const blob = await resp.blob()
      const disposition = resp.headers.get('content-disposition') || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const filename = match?.[1] || 'native-foundation-review-packet.zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setImportMessage({ type: 'success', text: `Downloaded ${filename}.` })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to download native Foundation review packet.'
      setImportMessage({ type: 'error', text: `Review packet export failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatHardwareReservation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/hardware-reservation-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT hardware reservation review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT hardware reservation review is ${body.status}: ${summary.reservationRecordCount || 0} reservation record(s), ${summary.persistedHardwareReservationCount || 0} persisted, ${summary.openedMaintenanceWindowCount || 0} maintenance window(s) opened. Hardware reservation remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT hardware reservation.'
      setImportMessage({ type: 'error', text: `UAT hardware reservation review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatReservationPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/reservation-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT reservation persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT reservation persistence admission review is ${body.status}: ${summary.reservationPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.reservationPersistenceAdmittedCount || 0} admitted, ${summary.openedMaintenanceWindowCount || 0} maintenance window(s) opened. Reservation persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT reservation persistence admission.'
      setImportMessage({ type: 'error', text: `UAT reservation persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatEntryIssuance = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/entry-issuance-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT entry issuance review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT entry issuance review is ${body.status}: ${summary.entryIssuanceRecordCount || 0} issuance record(s), ${summary.persistedUatEntryCount || 0} persisted, ${summary.issuedUatEntryCount || 0} issued. UAT entry issuance remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT entry issuance.'
      setImportMessage({ type: 'error', text: `UAT entry issuance review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatEntryPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/entry-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT entry persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT entry persistence admission review is ${body.status}: ${summary.entryPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.entryPersistenceAdmittedCount || 0} admitted, ${summary.issuedUatEntryCount || 0} UAT entr${summary.issuedUatEntryCount === 1 ? 'y' : 'ies'} issued. Entry persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT entry persistence admission.'
      setImportMessage({ type: 'error', text: `UAT entry persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatStartReadiness = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/start-readiness-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT start readiness review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT start readiness review is ${body.status}: ${summary.startReadinessRecordCount || 0} start record(s), ${summary.controlledUatStartedCount || 0} UAT start(s), ${summary.runnerStartedCount || 0} runner(s) started. Controlled UAT start remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT start readiness.'
      setImportMessage({ type: 'error', text: `UAT start readiness review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatRunnerAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/runner-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT runner admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT runner admission review is ${body.status}: ${summary.runnerAdmissionRecordCount || 0} admission record(s), ${summary.admittedRunnerCount || 0} admitted, ${summary.runnerStartedCount || 0} runner(s) started. Runner admission remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT runner admission.'
      setImportMessage({ type: 'error', text: `UAT runner admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatStartPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/start-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT start persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT start persistence admission review is ${body.status}: ${summary.startPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.startPersistenceAdmittedCount || 0} admitted, ${summary.controlledUatStartPersistedCount || 0} UAT start(s) persisted. Start persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT start persistence admission.'
      setImportMessage({ type: 'error', text: `UAT start persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatRunnerPersistenceAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/runner-persistence-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT runner persistence admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT runner persistence admission review is ${body.status}: ${summary.runnerPersistenceAdmissionRecordCount || 0} admission record(s), ${summary.runnerPersistenceAdmittedCount || 0} admitted, ${summary.persistedRunnerAdmissionCount || 0} runner admission(s) persisted. Runner persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT runner persistence admission.'
      setImportMessage({ type: 'error', text: `UAT runner persistence admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatExecutionAuthorization = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/execution-authorization-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT execution authorization review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT execution authorization review is ${body.status}: ${summary.executionAuthorizationRecordCount || 0} authorization record(s), ${summary.authorizedExecutionCount || 0} authorized, ${summary.adapterCommandInvokedCount || 0} adapter command(s) invoked. Execution authorization remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT execution authorization.'
      setImportMessage({ type: 'error', text: `UAT execution authorization review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationControlledUatCompletion = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/completion-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId.trim(),
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT completion review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `UAT completion review is ${body.status}: ${summary.uatCompletionRecordCount || 0} completion record(s), ${summary.completedUatCount || 0} completed, ${summary.adapterPromotionEligibleCount || 0} promotion-eligible. UAT completion remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT completion.'
      setImportMessage({ type: 'error', text: `UAT completion review failed: ${detail}` })
    }
  }

  const captureNativeFoundationEvidence = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/validation-evidence', {
        method: 'POST',
        body: JSON.stringify({
          source: 'native-foundation',
          workflow: workflow.id,
          configFile: workflow.configFile,
          configContent: yamlContent,
          phase: 'full_deployment',
          approvalId: approvalId.trim() || undefined,
          notes: 'Native Foundation planning review packet captured from workflow detail.',
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || 'Native Foundation evidence capture failed.',
        })
        return
      }
      setImportMessage({
        type: 'success',
        text: `Captured native Foundation evidence record ${body.id}.`,
      })
      setNativeFoundationEvidenceId(body.id || '')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to capture native Foundation evidence.'
      setImportMessage({ type: 'error', text: `Evidence capture failed: ${detail}` })
    }
  }

  const reviewNativeFoundationApprovalBinding = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/approval-binding/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation approval binding review failed.',
        })
        return
      }
      const checks = Array.isArray(body.checks) ? body.checks : []
      const passed = checks.filter((check: { status?: string }) => check.status === 'pass').length
      const blocked = checks.filter((check: { status?: string }) => check.status === 'blocked').length
      setImportMessage({
        type: 'error',
        text: `Approval binding is ${body.status}: ${passed} check(s) passed, ${blocked} blocked. Execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation approval binding.'
      setImportMessage({ type: 'error', text: `Approval binding review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterActivation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-activation/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter activation review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter activation review is ${body.status}: ${summary.acceptedEvidenceCount || 0}/${summary.requiredEvidenceCount || 0} evidence item(s) accepted, ${summary.blockedActivationCheckCount || 0} blocked check(s). Adapter activation remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter activation.'
      setImportMessage({ type: 'error', text: `Adapter activation review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterEnablements = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-enablements/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter enablement review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter registry review is ${body.status}: ${summary.disabledRegistryEntryCount || 0}/${summary.registryEntryCount || 0} registry entr${summary.registryEntryCount === 1 ? 'y' : 'ies'} disabled, ${summary.blockedEnablementCheckCount || 0} blocked check(s). Adapter enablement remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter enablements.'
      setImportMessage({ type: 'error', text: `Adapter enablement review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterAllowList = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapter-allowlist/review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter allow-list review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter allow-list review is ${body.status}: ${summary.allowedEntryCount || 0}/${summary.allowListEntryCount || 0} entr${summary.allowListEntryCount === 1 ? 'y' : 'ies'} allowed, ${summary.blockedAllowListCheckCount || 0} blocked check(s). Adapter allow-list persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter allow-list.'
      setImportMessage({ type: 'error', text: `Adapter allow-list review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterLoadPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/load-plan-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter load plan review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter load plan review is ${body.status}: ${summary.loadedAdapterCount || 0}/${summary.loadPlanEntryCount || 0} adapter entr${summary.loadPlanEntryCount === 1 ? 'y' : 'ies'} loaded, ${summary.blockedLoadPlanCheckCount || 0} blocked check(s). Adapter loading remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter load plan.'
      setImportMessage({ type: 'error', text: `Adapter load plan review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterPackageProvenance = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/package-provenance-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter package provenance review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter package provenance review is ${body.status}: ${summary.signatureVerifiedCount || 0}/${summary.packageProvenanceEntryCount || 0} signature(s) verified, ${summary.blockedPackageProvenanceCheckCount || 0} blocked check(s). Package reads remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter package provenance.'
      setImportMessage({ type: 'error', text: `Adapter package provenance review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterSbom = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/sbom-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter SBOM review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter SBOM review is ${body.status}: ${summary.vulnerabilityScanRunCount || 0}/${summary.sbomEntryCount || 0} vulnerability scan(s) run, ${summary.blockedSbomCheckCount || 0} blocked check(s). SBOM reads remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter SBOM metadata.'
      setImportMessage({ type: 'error', text: `Adapter SBOM review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterRuntimeIsolation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/runtime-isolation-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter runtime isolation review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter runtime isolation review is ${body.status}: ${summary.sandboxCreatedCount || 0}/${summary.runtimeIsolationEntryCount || 0} sandbox(es) created, ${summary.blockedRuntimeIsolationCheckCount || 0} blocked check(s). Adapter process start remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter runtime isolation.'
      setImportMessage({ type: 'error', text: `Adapter runtime isolation review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterRuntimeAdmission = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/runtime-admission-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter runtime admission review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter runtime admission review is ${body.status}: ${summary.runtimeAdmittedCount || 0}/${summary.runtimeAdmissionEntryCount || 0} runtime(s) admitted, ${summary.blockedRuntimeAdmissionCheckCount || 0} blocked check(s). Mutating job submission remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter runtime admission.'
      setImportMessage({ type: 'error', text: `Adapter runtime admission review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterExecutionPreflight = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/execution-preflight-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter execution preflight review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter execution preflight review is ${body.status}: ${summary.adapterPreflightRunCount || 0}/${summary.executionPreflightEntryCount || 0} preflight(s) run, ${summary.blockedExecutionPreflightCheckCount || 0} blocked check(s). Live target connectivity remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter execution preflight.'
      setImportMessage({ type: 'error', text: `Adapter execution preflight review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterTargetConnectivity = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/target-connectivity-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter target connectivity review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter target connectivity review is ${body.status}: ${summary.targetConnectionsOpenedCount || 0}/${summary.targetConnectivityEntryCount || 0} target connection(s) opened, ${summary.blockedTargetConnectivityCheckCount || 0} blocked check(s). Live probes remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter target connectivity.'
      setImportMessage({ type: 'error', text: `Adapter target connectivity review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterCredentialHandoff = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/credential-handoff-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter credential handoff review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter credential handoff review is ${body.status}: ${summary.credentialsHandedToAdapterCount || 0}/${summary.credentialHandoffEntryCount || 0} handoff(s) performed, ${summary.blockedCredentialHandoffCheckCount || 0} blocked check(s). Secret leases remain disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter credential handoff.'
      setImportMessage({ type: 'error', text: `Adapter credential handoff review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterCommandInvocation = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/command-invocation-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter command invocation review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter command invocation review is ${body.status}: ${summary.adapterInvokedCount || 0}/${summary.commandInvocationEntryCount || 0} adapter command(s) invoked, ${summary.blockedCommandInvocationCheckCount || 0} blocked check(s). Command execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter command invocation.'
      setImportMessage({ type: 'error', text: `Adapter command invocation review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationAdapterOutputEvidence = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/adapters/output-evidence-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation adapter output evidence review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Adapter output evidence review is ${body.status}: ${summary.evidencePersistedCount || 0}/${summary.outputEvidenceEntryCount || 0} evidence item(s) persisted, ${summary.blockedOutputEvidenceCheckCount || 0} blocked check(s). Live output capture remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation adapter output evidence.'
      setImportMessage({ type: 'error', text: `Adapter output evidence review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationRetainedEvidenceExport = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/retained-evidence-export-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation retained evidence export review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Retained evidence export review is ${body.status}: ${summary.zipGeneratedCount || 0}/${summary.exportItemCount || 0} export package(s) generated, ${summary.blockedExportCheckCount || 0} blocked check(s). Retained evidence export remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation retained evidence export.'
      setImportMessage({ type: 'error', text: `Retained evidence export review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationDryRunLedger = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/dry-run-ledger', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation dry-run ledger review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Dry-run ledger is ${body.status}: ${summary.ledgerEntryCount || 0} recorded step(s), ${summary.mutatingOperationPlannedCount || 0} mutating operation(s) planned, ${summary.executedStepCount || 0} executed. Adapter execution remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation dry-run ledger.'
      setImportMessage({ type: 'error', text: `Dry-run ledger review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionPermit = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/permit-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
          approvalId: approvalId.trim(),
          evidenceId: nativeFoundationEvidenceId,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution permit review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution permit review is ${body.status}: ${summary.issuedPermitCount || 0}/${summary.permitCount || 0} permit(s) issued, ${summary.adapterRequestCount || 0} adapter request(s), ${summary.blockedPermitCheckCount || 0} blocked check(s). Permit issuance remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution permit.'
      setImportMessage({ type: 'error', text: `Execution permit review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionLockPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/lock-plan', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution lock plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution lock plan is ${body.status}: ${summary.lockRequestCount || 0} lock request(s), ${summary.acquiredLockCount || 0} acquired, ${summary.blockedLockCheckCount || 0} blocked check(s). Lock acquisition remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution lock plan.'
      setImportMessage({ type: 'error', text: `Execution lock plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionAuditPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/audit-plan', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution audit plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution audit plan is ${body.status}: ${summary.auditEventCount || 0} event(s), ${summary.retentionArtifactCount || 0} retention artifact(s), ${summary.blockedAuditCheckCount || 0} blocked check(s). Audit persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution audit plan.'
      setImportMessage({ type: 'error', text: `Execution audit plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationExecutionRetentionPlan = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/retention-plan', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation execution retention plan failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Execution retention plan is ${body.status}: ${summary.retentionPolicyCount || 0} retention policy record(s), ${summary.backupTargetCount || 0} backup target(s), ${summary.restoreRehearsalCheckCount || 0} restore check(s). Retention persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation execution retention plan.'
      setImportMessage({ type: 'error', text: `Execution retention plan failed: ${detail}` })
    }
  }

  const reviewNativeFoundationRunnerReadiness = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/execution/runner-readiness', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation runner readiness review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Runner readiness is ${body.status}: ${summary.readinessItemCount || 0} readiness item(s), ${summary.blockedReadinessItemCount || 0} blocked, ${summary.runnerStartEnabledCount || 0} runner starts enabled. Native Foundation runner start remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation runner readiness.'
      setImportMessage({ type: 'error', text: `Runner readiness review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatEntry = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/entry-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT entry review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT entry review is ${body.status}: ${summary.entryItemCount || 0} entry item(s), ${summary.blockedEntryItemCount || 0} blocked, ${summary.rehearsalCaseCount || 0} rehearsal case(s). Controlled UAT entry remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT entry.'
      setImportMessage({ type: 'error', text: `Controlled UAT entry review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatScope = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/scope-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT scope review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT scope review is ${body.status}: ${summary.scopeRecordCount || 0} scope record(s), ${summary.siteScopeCount || 0} site(s), ${summary.nodeScopeCount || 0} node(s). Scope authorization remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT scope.'
      setImportMessage({ type: 'error', text: `Controlled UAT scope review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatRunbook = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/runbook-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT runbook review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT runbook review is ${body.status}: ${summary.runbookStepCount || 0} step(s), ${summary.blockedRunbookStepCount || 0} blocked, ${summary.scopeRecordCount || 0} scope record(s). Runbook approval remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT runbook.'
      setImportMessage({ type: 'error', text: `Controlled UAT runbook review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatSecurity = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/security-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT security review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT security review is ${body.status}: ${summary.securityItemCount || 0} item(s), ${summary.blockedSecurityItemCount || 0} blocked, ${summary.secretValueExposureCount || 0} exposed secret value(s). Security approval remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT security.'
      setImportMessage({ type: 'error', text: `Controlled UAT security review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatOperations = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/operations-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT operations review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT operations review is ${body.status}: ${summary.operationsItemCount || 0} item(s), ${summary.blockedOperationsItemCount || 0} blocked, ${summary.lockRequestCount || 0} future lock(s). Operations approval remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT operations.'
      setImportMessage({ type: 'error', text: `Controlled UAT operations review failed: ${detail}` })
    }
  }

  const reviewNativeFoundationUatSignoff = async () => {
    if (!yamlContent) return
    try {
      const resp = await apiFetch('/api/native-foundation/uat/signoff-review', {
        method: 'POST',
        body: JSON.stringify({
          content: yamlContent,
        }),
      })
      const body = await resp.json()
      if (!resp.ok) {
        setImportMessage({
          type: 'error',
          text: body.error || body.requiredActions?.[0] || 'Native Foundation controlled UAT signoff review failed.',
        })
        return
      }
      const summary = body.summary || {}
      setImportMessage({
        type: 'error',
        text: `Controlled UAT signoff review is ${body.status}: ${summary.signoffItemCount || 0} item(s), ${summary.blockedSignoffItemCount || 0} blocked, ${summary.sourceReviewCount || 0} source review(s). Signoff persistence remains disabled.`,
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to review native Foundation controlled UAT signoff.'
      setImportMessage({ type: 'error', text: `Controlled UAT signoff review failed: ${detail}` })
    }
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
      setNativeFoundationEvidenceId('')
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
      case 'native-foundation-deploy': return <NativeFoundationDeployForm {...props} />
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
        isNativeFoundationWorkflow ? (
          <div className="flex items-center gap-2">
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
            <button
              onClick={() => startExecution(true)}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Validate config and check connectivity without running'}
            >
              <ListChecks size={14} />
              Dry Run
            </button>
            <button
              onClick={() => startExecution(false)}
              disabled={!yamlContent || !nativeFoundationDeploymentEnabled || (approvalRequired && !approvalId.trim())}
              className="btn-success gap-1.5"
              title={
                !yamlContent
                  ? 'Fill out the form first'
                  : !nativeFoundationDeploymentEnabled
                    ? 'Enable Dell iDRAC controlled-UAT deployment gates in the runtime environment first'
                    : approvalRequired && !approvalId.trim()
                      ? 'Select an approved request first'
                      : undefined
              }
            >
              <Play size={14} />
              Run Workflow
            </button>
          </div>
        ) : (
        <div className="flex flex-wrap gap-2">
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
            disabled={!yamlContent || (isNativeFoundationWorkflow && !nativeFoundationDeploymentEnabled) || (approvalRequired && !approvalId.trim())}
            className="btn-success gap-1.5"
            title={
              !yamlContent
                ? 'Fill out the form first'
                : isNativeFoundationWorkflow && !nativeFoundationDeploymentEnabled
                  ? 'Enable Dell iDRAC controlled-UAT deployment gates in the runtime environment first'
                  : approvalRequired && !approvalId.trim()
                    ? 'Select an approved request first'
                    : undefined
            }
          >
            <Play size={14} />
            {isZtf2Workflow ? 'Run Plan' : 'Run Workflow'}
          </button>
          {isNativeFoundationWorkflow && (
            <button
              onClick={previewNativeFoundationDiscovery}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Normalize read-only site, cluster, and node facts'}
            >
              <ListChecks size={14} />
              Discovery Preview
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={generateNativeFoundationPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Generate read-only plan hashes and approval metadata'}
            >
              <ShieldCheck size={14} />
              Generate Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={checkNativeFoundationReadiness}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Check UAT evidence gates before execution adapters'}
            >
              <ShieldCheck size={14} />
              Readiness
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationImageSources}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review AOS and hypervisor image source metadata'}
            >
              <HardDrive size={14} />
              Image Sources
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationImagingPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review per-node Foundation imaging payload previews'}
            >
              <HardDrive size={14} />
              Imaging Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationClusterFormation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review cluster formation payload previews for HCI, compute, storage, or mixed topologies'}
            >
              <Layers size={14} />
              Formation Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationPostCreateValidation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review post-create Prism Element and topology validation payload previews'}
            >
              <CheckCircle size={14} />
              Post-Create Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review approval, evidence, adapter, and policy gates before native Foundation execution'}
            >
              <ShieldCheck size={14} />
              Admission Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionAdapterContract}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review the future native Foundation adapter request contract without loading adapters'}
            >
              <Wrench size={14} />
              Execution Contract
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionRequest}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review the future native Foundation execution request without submitting a job'}
            >
              <Play size={14} />
              Request Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDryRunLedger}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review step-level native Foundation dry-run ledger without executing adapters'}
            >
              <ListChecks size={14} />
              Dry-Run Ledger
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionPermit}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review final native Foundation execution permit blockers without issuing a permit'}
            >
              <ShieldCheck size={14} />
              Permit Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionLockPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future native Foundation execution locks without acquiring them'}
            >
              <Lock size={14} />
              Lock Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionAuditPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future native Foundation audit and retention records without persisting them'}
            >
              <ListChecks size={14} />
              Audit Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionRetentionPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future native Foundation retention, backup, and restore readiness without persisting artifacts'}
            >
              <ListChecks size={14} />
              Retention Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationRunnerReadiness}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review final native Foundation runner blockers without starting execution'}
            >
              <ShieldCheck size={14} />
              Runner Readiness
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationRestartResume}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review restart and resume-after-restart readiness without replaying jobs'}
            >
              <GitBranch size={14} />
              Restart Resume
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationBackupRestore}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review backup and restore readiness without creating backups or restoring checkpoints'}
            >
              <Database size={14} />
              Backup Restore
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationMutatingEnablement}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review final mutating execution enablement blockers without enabling deployment'}
            >
              <ShieldCheck size={14} />
              Mutating Gate
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionSubmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review the future native Foundation job submission envelope without enqueueing jobs'}
            >
              <Play size={14} />
              Submission Gate
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionRequestPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review execution request persistence admission without persisting request state or submitting jobs'}
            >
              <Lock size={14} />
              Req Persist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionSubmissionPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review execution submission persistence admission without persisting submission state or queue records'}
            >
              <Lock size={14} />
              Sub Persist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationQueuePersistence}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future native Foundation queue persistence without creating durable records'}
            >
              <Database size={14} />
          Queue Persist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationQueuePersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review queue persistence admission without persisting queue state or replay'}
            >
              <Lock size={14} />
              Queue Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationJobPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review native Foundation job persistence admission without writing durable records'}
            >
              <Lock size={14} />
              Persist Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationMutatingAdapterBinding}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future mutating adapter binding after persistence admission without loading or executing adapters'}
            >
              <Wrench size={14} />
              Adapter Bind
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatLaneSelection}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review bounded controlled UAT lane selection without issuing UAT entry'}
            >
              <GitBranch size={14} />
              UAT Lane
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatLanePersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT lane persistence admission without persisting selections or admitting hardware reservation'}
            >
              <Lock size={14} />
              Lane Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatHardwareReservation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT hardware reservation records without reserving nodes or opening windows'}
            >
              <CalendarClock size={14} />
              UAT Reserve
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatReservationPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT reservation persistence admission without persisting reservations or opening windows'}
            >
              <Lock size={14} />
              Reserve Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatEntry}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT entry blockers without authorizing hardware testing'}
            >
              <ListChecks size={14} />
              UAT Entry
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatEntryIssuance}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT entry issuance records without issuing UAT entry'}
            >
              <CheckCircle size={14} />
              UAT Issue
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatEntryPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT entry persistence admission without persisting or issuing entry'}
            >
              <Lock size={14} />
              Entry Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatStartReadiness}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT start readiness without starting runners or adapters'}
            >
              <Zap size={14} />
              UAT Start
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatStartPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT start persistence admission without persisting start state or starting runners'}
            >
              <Lock size={14} />
              Start Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatRunnerAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT runner admission without admitting runtimes or starting runners'}
            >
              <Monitor size={14} />
              UAT Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatRunnerPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT runner persistence admission without persisting admission or starting runners'}
            >
              <Lock size={14} />
              Runner Persist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatExecutionAuthorization}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT execution authorization without invoking adapters or submitting jobs'}
            >
              <Play size={14} />
              UAT Authorize
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationControlledUatCompletion}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT completion without marking UAT complete or promoting adapters'}
            >
              <CheckCircle size={14} />
              UAT Complete
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationExecutionAuthorizationPersistenceAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review execution authorization persistence admission without persisting authorization or jobs'}
            >
              <Lock size={14} />
              Auth Persist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatScope}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review bounded site, node, provider, and topology scope without authorizing UAT'}
            >
              <Boxes size={14} />
              UAT Scope
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatRunbook}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT runbook metadata without approving UAT'}
            >
              <ListChecks size={14} />
              UAT Runbook
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatSecurity}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT security blockers without approving UAT'}
            >
              <ShieldCheck size={14} />
              UAT Security
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatOperations}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT operations readiness without approving UAT or reserving hardware'}
            >
              <ListChecks size={14} />
              UAT Ops
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatSignoff}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled UAT signoff dependencies without issuing UAT entry'}
            >
              <ShieldCheck size={14} />
              UAT Signoff
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationRecoveryPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review stop, retry, rollback, and evidence actions without executing recovery'}
            >
              <Wrench size={14} />
              Recovery Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationJobStatePlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future durable job state and replay boundaries'}
            >
              <GitBranch size={14} />
              Job State Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={queueNativeFoundationReviewJob}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Queue a durable read-only native Foundation review job'}
            >
              <Play size={14} />
              Queue Review Job
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationNetworkManifest}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review VIP, BMC, host, CVM, DNS, NTP, subnet, and duplicate IP metadata'}
            >
              <Network size={14} />
              Network Manifest
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretReferences}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review named credential references and inline secret findings'}
            >
              <Lock size={14} />
              Secret Refs
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretResolution}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future secret-store resolution requests without reading secret values'}
            >
              <KeyRound size={14} />
              Secret Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretBinding}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future secret-store lease, audit, RBAC, and adapter handoff bindings without resolving secrets'}
            >
              <KeyRound size={14} />
              Secret Binding
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretProviderContract}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future secret-store provider contract without opening leases or resolving secrets'}
            >
              <KeyRound size={14} />
              Secret Provider
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretLeaseExecution}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future secret lease execution records without opening leases or resolving values'}
            >
              <KeyRound size={14} />
              Secret Lease
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationSecretAuditPersistence}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future secret audit persistence records without appending audit events or reading retained artifacts'}
            >
              <ListChecks size={14} />
              Secret Audit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={previewNativeFoundationExecutionGraph}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Preview read-only multi-site execution ordering'}
            >
              <GitBranch size={14} />
              Execution Graph
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderTopologyMatrix}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review per-cluster provider, topology, phase, and evidence blockers'}
            >
              <Boxes size={14} />
              Topology Matrix
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderOperationCatalog}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review disabled provider and deployment operations per cluster'}
            >
              <Wrench size={14} />
              Operation Catalog
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderOperationAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future provider operation admission without admitting or running operations'}
            >
              <ShieldCheck size={14} />
              Operation Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderOperationQueuePlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future provider operation queue ordering without persisting or enqueueing operations'}
            >
              <GitBranch size={14} />
              Operation Queue
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderOperationQueueAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future provider operation queue admission without persisting or enqueueing operations'}
            >
              <ShieldCheck size={14} />
              Op Queue Admit
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={probeNativeFoundationDellIdracRedfish}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Probe the Dell iDRAC Redfish service root when controlled UAT discovery is enabled'}
            >
              <Network size={14} />
              Dell Probe
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterContracts}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review versioned read-only provider and topology contracts'}
            >
              <KeyRound size={14} />
              Adapter Contracts
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderAdapters}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review read-only provider adapter operation scaffold'}
            >
              <KeyRound size={14} />
              Provider Adapters
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationProviderPreflight}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review provider preflight prerequisites before live discovery UAT'}
            >
              <Monitor size={14} />
              Provider Preflight
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDiscoveryContract}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review live discovery adapter input and evidence contract'}
            >
              <Monitor size={14} />
              Discovery Contract
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDiscoveryReconciliation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Reconcile supplied discovery facts against the intended node plan'}
            >
              <ListChecks size={14} />
              Discovery Reconcile
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={previewNativeFoundationEvidencePacks}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Preview read-only per-cluster UAT evidence packs'}
            >
              <Boxes size={14} />
              Evidence Packs
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationEvidencePackApproval}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review per-cluster evidence pack approval records without persisting go/no-go decisions'}
            >
              <ShieldCheck size={14} />
              Pack Approval
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterReadiness}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review provider and topology adapter readiness blockers'}
            >
              <ShieldCheck size={14} />
              Adapter Readiness
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentPolicy}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review deployment windows and blast-radius policy'}
            >
              <ListChecks size={14} />
              Deployment Policy
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentWaveGates}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review per-wave site gates without reserving windows or opening waves'}
            >
              <ListChecks size={14} />
              Wave Gates
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentWaveRehearsal}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review wave rehearsal packages without starting execution or reserving windows'}
            >
              <ListChecks size={14} />
              Wave Rehearsal
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentWaveAuthorization}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review wave authorization prerequisites without persisting approvals, acquiring locks, or starting execution'}
            >
              <ShieldCheck size={14} />
              Wave Authorize
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentWindowReservation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review deployment window reservation requests without persisting reservations or acquiring locks'}
            >
              <Lock size={14} />
              Window Reserve
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentScheduler}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review future deployment wave opening and job enqueue order without creating queue records'}
            >
              <CalendarClock size={14} />
              Schedule Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationDeploymentTypeSupport}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review HCI, compute-only, storage-only, and mixed topology support evidence without enabling mutation'}
            >
              <Boxes size={14} />
              Topology Support
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={previewNativeFoundationResumeCheckpoint}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Preview read-only restart and resume position'}
            >
              <GitBranch size={14} />
              Resume Checkpoint
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationPromotion}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review controlled-UAT promotion blockers'}
            >
              <ShieldCheck size={14} />
              Promotion Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={previewNativeFoundationUatChecklist}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Prepare read-only controlled-UAT checklist'}
            >
              <ListChecks size={14} />
              UAT Checklist
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationUatEvidenceAcceptance}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review accepted UAT evidence IDs before adapter enablement'}
            >
              <ShieldCheck size={14} />
              UAT Evidence
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterUatRehearsal}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter UAT rehearsal cases before controlled hardware testing'}
            >
              <ListChecks size={14} />
              UAT Rehearsal
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={downloadNativeFoundationReviewPacket}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Download redacted read-only review packet'}
            >
              <Download size={14} />
              Review Packet
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={captureNativeFoundationEvidence}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Capture native Foundation review packet as validation evidence'}
            >
              <Boxes size={14} />
              Capture Evidence
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationApprovalBinding}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review approval and captured evidence binding for the current native Foundation plan'}
            >
              <ShieldCheck size={14} />
              Approval Binding
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterActivation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review final adapter activation blockers'}
            >
              <ShieldCheck size={14} />
              Activation Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterEnablements}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review disabled adapter registry entries for the current native Foundation plan'}
            >
              <ShieldCheck size={14} />
              Registry Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterAllowList}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter allow-list entries without persisting or enabling them'}
            >
              <ShieldCheck size={14} />
              Allow-List Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterLoadPlan}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter load plan entries without loading code or starting runners'}
            >
              <ShieldCheck size={14} />
              Load Plan
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterPackageProvenance}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter package provenance metadata without reading packages or verifying signatures'}
            >
              <ShieldCheck size={14} />
              Package Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterSbom}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter SBOM metadata without reading SBOMs or scanning packages'}
            >
              <ShieldCheck size={14} />
              SBOM Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterRuntimeIsolation}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter runtime isolation metadata without creating sandboxes or starting adapter processes'}
            >
              <ShieldCheck size={14} />
              Runtime Review
            </button>
          )}
          {isNativeFoundationWorkflow && (
            <button
              onClick={reviewNativeFoundationAdapterRuntimeAdmission}
              disabled={!yamlContent}
              className="btn-secondary gap-1.5"
              title={!yamlContent ? 'Fill out the form first' : 'Review adapter runtime admission metadata without loading adapters or submitting mutating jobs'}
          >
            <ShieldCheck size={14} />
            Runtime Admit
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationAdapterExecutionPreflight}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review adapter execution preflight metadata without running commands or opening target connections'}
          >
            <ShieldCheck size={14} />
            Exec Preflight
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationAdapterTargetConnectivity}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review target connectivity metadata without opening sockets or running live probes'}
          >
            <ShieldCheck size={14} />
            Target Links
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationAdapterCredentialHandoff}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review credential handoff metadata without opening leases or resolving secrets'}
          >
            <ShieldCheck size={14} />
            Credential Gate
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationAdapterCommandInvocation}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review adapter command invocation metadata without writing command files or invoking adapters'}
          >
            <ShieldCheck size={14} />
            Command Gate
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationAdapterOutputEvidence}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review adapter output evidence metadata without capturing live output or writing artifacts'}
          >
            <ShieldCheck size={14} />
            Output Gate
          </button>
        )}
        {isNativeFoundationWorkflow && (
          <button
            onClick={reviewNativeFoundationRetainedEvidenceExport}
            disabled={!yamlContent}
            className="btn-secondary gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : 'Review retained evidence export metadata without reading artifacts or generating ZIPs'}
          >
            <ShieldCheck size={14} />
            Export Gate
          </button>
        )}
        </div>
        )
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
                {isZtf2Workflow
                  ? 'ztf plan --input input.yml --global-file global.yml'
                  : isNativeFoundationWorkflow
                    ? `native-foundation plan --intent ${workflow.configFile}`
                    : `--workflow ${workflow.id} -f ${workflow.configFile}`}
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

      {isNativeFoundationWorkflow && (
        <div className="mb-6 rounded-lg border border-border bg-surface/60 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-nutanix-cyan" />
                <h3 className="text-sm font-semibold text-gray-100">Native Foundation Phase Status</h3>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {nativeFoundationPhases?.summary?.currentBoundary || nativeFoundationPhasesError || 'Loading native Foundation phase status.'}
              </p>
            </div>
            {nativeFoundationPhases && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-56">
                  <label htmlFor="native-foundation-readiness-phase" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Readiness Phase
                  </label>
                  <select
                    id="native-foundation-readiness-phase"
                    value={nativeFoundationReadinessPhase}
                    onChange={event => setNativeFoundationReadinessPhase(event.target.value)}
                    className="input h-9 text-sm"
                  >
                    {(nativeFoundationPhases.supportedReadinessPhases || []).map(phase => (
                      <option key={phase} value={phase}>{phase.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-56">
                  <label htmlFor="native-foundation-advancement-phase" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                    Advancement Phase
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="native-foundation-advancement-phase"
                      value={nativeFoundationAdvancementPhase}
                      onChange={event => setNativeFoundationAdvancementPhase(event.target.value)}
                      className="input h-9 text-sm"
                    >
                      {(nativeFoundationPhases.phases || []).map(phase => (
                        <option key={phase.id} value={phase.id}>{phase.order}. {phase.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={reviewNativeFoundationPhaseAdvancement}
                      disabled={!yamlContent}
                      className="btn-secondary h-9 shrink-0 gap-1.5 px-3"
                      title={!yamlContent ? 'Fill out the form first' : 'Review phase promotion blockers without changing phase state'}
                    >
                      <ShieldCheck size={14} />
                      Review
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="min-w-16">
                    <div className="text-lg font-bold text-gray-100">{nativeFoundationPhases.summary?.implementedPhaseCount || 0}</div>
                    <div className="text-[10px] uppercase leading-tight text-gray-500">Done</div>
                  </div>
                    <div className="min-w-16">
                    <div className="text-lg font-bold text-gray-100">{nativeFoundationPhases.summary?.phaseCount || 0}</div>
                    <div className="text-[10px] uppercase leading-tight text-gray-500">Total</div>
                  </div>
                    <div className="min-w-16">
                    <div className="text-lg font-bold text-red-300">{nativeFoundationPhases.summary?.mutatingEnabledPhaseCount || 0}</div>
                    <div className="text-[10px] uppercase leading-tight text-gray-500">Live</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          {(nativeFoundationDellAdapter || nativeFoundationProviderAdaptersError) && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase leading-tight text-gray-500">Provider Adapter Status</div>
                  {nativeFoundationDellAdapter ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-100">Dell iDRAC Redfish</span>
                      <span className="badge badge-blue text-[11px]">{formatNativeFoundationStatus(nativeFoundationDellAdapter.status)}</span>
                      <span className="badge badge-gray text-[11px]">{nativeFoundationDellAdapter.readOnlyDiscovery ? 'discovery gated' : 'discovery planned'}</span>
                      <span className={clsx('badge text-[11px]', nativeFoundationDellAdapter.mutatingActionsEnabled ? 'badge-red' : 'badge-gray')}>
                        {nativeFoundationDellAdapter.mutatingActionsEnabled ? 'mutation enabled' : 'mutation locked'}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-red-300">{nativeFoundationProviderAdaptersError}</div>
                  )}
                </div>
                {nativeFoundationDellAdapter && (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <button
                      onClick={probeNativeFoundationDellIdracRedfish}
                      disabled={!yamlContent}
                      className="btn-secondary gap-1.5"
                      title={!yamlContent ? 'Fill out the form first' : 'Probe the Dell iDRAC Redfish service root when controlled UAT discovery is enabled'}
                    >
                      <Network size={14} />
                      Dell Probe
                    </button>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="min-w-16">
                        <div className="text-base font-semibold text-gray-100">{nativeFoundationDellAdapter.readOnlyDiscovery ? 'Yes' : 'No'}</div>
                        <div className="text-[10px] uppercase leading-tight text-gray-500">Probe</div>
                      </div>
                      <div className="min-w-16">
                        <div className="text-base font-semibold text-red-300">{nativeFoundationDellAdapter.mutatingActionsEnabled ? 'Yes' : 'No'}</div>
                        <div className="text-[10px] uppercase leading-tight text-gray-500">Deploy</div>
                      </div>
                      <div className="min-w-16">
                        <div className="text-base font-semibold text-gray-100">{nativeFoundationDellAdapter.controlledUatMutatingOperations?.length || 0}</div>
                        <div className="text-[10px] uppercase leading-tight text-gray-500">Ops</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {nativeFoundationDellAdapter?.environmentControls && (
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                  {nativeFoundationDellAdapter.environmentControls.liveDiscovery && (
                    <span className="font-mono">{nativeFoundationDellAdapter.environmentControls.liveDiscovery}</span>
                  )}
                  {nativeFoundationDellAdapter.environmentControls.mutatingUat && (
                    <span className="font-mono">{nativeFoundationDellAdapter.environmentControls.mutatingUat}</span>
                  )}
                </div>
              )}
            </div>
          )}
          {isNativeFoundationWorkflow && (
            <details className="mt-4 rounded-md border border-border bg-gray-950/30">
              <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gray-100">
                Advanced Validation And Evidence Reviews
              </summary>
              <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <button
                  onClick={previewNativeFoundationDiscovery}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Normalize read-only site, cluster, and node facts'}
                >
                  <ListChecks size={14} />
                  Discovery Preview
                </button>
                <button
                  onClick={generateNativeFoundationPlan}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Generate read-only plan hashes and approval metadata'}
                >
                  <ShieldCheck size={14} />
                  Generate Plan
                </button>
                <button
                  onClick={checkNativeFoundationReadiness}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Check UAT evidence gates before execution adapters'}
                >
                  <ShieldCheck size={14} />
                  Readiness
                </button>
                <button
                  onClick={reviewNativeFoundationImageSources}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review AOS and hypervisor image source metadata'}
                >
                  <HardDrive size={14} />
                  Image Sources
                </button>
                <button
                  onClick={reviewNativeFoundationImagingPlan}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review per-node Foundation imaging payload previews'}
                >
                  <HardDrive size={14} />
                  Imaging Plan
                </button>
                <button
                  onClick={reviewNativeFoundationClusterFormation}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review cluster formation payload previews'}
                >
                  <Layers size={14} />
                  Formation Plan
                </button>
                <button
                  onClick={reviewNativeFoundationPostCreateValidation}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review post-create Prism Element and topology validation payload previews'}
                >
                  <CheckCircle size={14} />
                  Post-Create Plan
                </button>
                <button
                  onClick={reviewNativeFoundationExecutionAdmission}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review approval, evidence, adapter, and policy gates before native Foundation execution'}
                >
                  <ShieldCheck size={14} />
                  Admission Review
                </button>
                <button
                  onClick={reviewNativeFoundationMutatingEnablement}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review final mutating execution enablement blockers without enabling deployment'}
                >
                  <ShieldCheck size={14} />
                  Mutating Gate
                </button>
                <button
                  onClick={downloadNativeFoundationReviewPacket}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Download redacted read-only review packet'}
                >
                  <Download size={14} />
                  Review Packet
                </button>
                <button
                  onClick={captureNativeFoundationEvidence}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Capture native Foundation review packet as validation evidence'}
                >
                  <Boxes size={14} />
                  Capture Evidence
                </button>
                <button
                  onClick={reviewNativeFoundationApprovalBinding}
                  disabled={!yamlContent}
                  className="btn-secondary justify-start gap-1.5"
                  title={!yamlContent ? 'Fill out the form first' : 'Review approval and captured evidence binding for the current native Foundation plan'}
                >
                  <ShieldCheck size={14} />
                  Approval Binding
                </button>
              </div>
            </details>
          )}
          {nativeFoundationPhases && (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(nativeFoundationPhases.phases || []).map(phase => (
                <div key={phase.id} className="rounded-md border border-border bg-gray-950/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-100">{phase.order}. {phase.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{phase.operatorOutcome}</div>
                    </div>
                    <span
                      className={clsx(
                        'badge shrink-0 text-[11px]',
                        phase.mutatingActionsEnabled ? 'badge-red' : phase.readOnly ? 'badge-blue' : 'badge-gray'
                      )}
                    >
                      {phase.mutatingActionsEnabled ? 'mutating' : 'read-only'}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">
                    <span className="font-medium text-gray-400">{phase.status.replace(/_/g, ' ')}</span>
                    {' -> '}
                    {phase.nextGate}
                  </div>
                </div>
              ))}
            </div>
          )}
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
