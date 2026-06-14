import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Download, FilePlus, FileSearch, Layers, Loader, Plus, Play, RefreshCw, Save, ShieldCheck, Star, Trash2, Upload, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Terminal from '../components/Terminal'
import { apiFetch, authHeaders } from '../utils/api'
import { useStore } from '../store'
import clsx from 'clsx'

interface LogLine { type: string; data: string; ts: number }

interface NkpStatus {
  installed: boolean
  path: string
  repoUrl: string
  script: string
  safePhases: string[]
  configs: string[]
}

interface NkpNode {
  name: string
  serial: string
  hostIp: string
  cvmIp: string
  ipmiIp: string
  rack: string
}

interface NkpProfile {
  id?: string
  revision?: number
  name: string
  description: string
  environment: string
  template: {
    id: string
    name: string
    category: string
    managementClusterRef: string
  }
  nkp: {
    version: string
    binaryPath: string
    registry: string
    sshKeyRef: string
  }
  prismCentral: {
    endpoint: string
    credentialRef: string
  }
  cluster: {
    name: string
    type: string
    kubernetesVersion: string
    vip: string
  }
  network: {
    subnet: string
    gateway: string
    dnsServers: string[]
    ntpServers: string[]
    domain: string
    vlanId: string
  }
  proxy: {
    httpProxy: string
    httpsProxy: string
    noProxy: string[]
  }
  registry: {
    endpoint: string
    namespace: string
    credentialRef: string
    caCert: string
    insecure: boolean
  }
  imageBuilder: {
    enabled: boolean
    prismElementCluster: string
    subnet: string
    sourceImage: string
    artifactBundle: string
    imageName: string
    bastionHost: string
    gpuProfile: string
    fips: boolean
    insecure: boolean
  }
  nodes: NkpNode[]
  createdAt?: string
  updatedAt?: string
}

interface NkpProfileRevision {
  id: string
  profileId: string
  profileName: string
  revision: number
  action: string
  createdAt: string
  createdBy: string
  profile: NkpProfile
}

interface ReadinessCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

interface ReadinessResult {
  status: 'ready' | 'needs_attention' | 'blocked'
  score: number
  summary: {
    passed: number
    warnings: number
    failed: number
  }
  checks: ReadinessCheck[]
}

interface NkpBinary {
  id: string
  name: string
  version: string
  path: string
  source: 'registered' | 'uploaded' | string
  checksum?: string
  size?: number | null
  default?: boolean
  exists?: boolean
  status?: 'available' | 'missing' | string
  createdAt?: string
}

interface NkpCompatibilityCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
  command: string
  output: string
}

interface NkpCompatibilityResult {
  status: 'compatible' | 'needs_review' | 'blocked'
  cliPath: string
  summary: {
    passed: number
    warnings: number
    failed: number
  }
  checks: NkpCompatibilityCheck[]
}

interface NkpTemplatePack {
  id: string
  name: string
  category: string
  description: string
  recommendedUse: string
  profileDefaults: Partial<NkpProfile>
  requiredFields: string[]
  optionalFields: string[]
  preflightChecklist: string[]
}

interface NkpExample {
  name: string
  path: string
  environmentType: string
  provider: string
  clusterName: string
  topLevelKeys: string[]
}

interface NkpSchema {
  source: string
  examples: Array<{ name: string; path: string; topLevelKeys: string[] }>
  requiredTopLevel: string[]
  optionalTopLevel: string[]
  nestedRequired: Record<string, string[]>
}

interface NkpSchemaValidation {
  status: 'pass' | 'warn' | 'fail'
  missing: string[]
  warnings: string[]
  errors: string[]
  schema?: NkpSchema
}

const PHASES = [
  { id: 'validate', label: 'Validate', hint: 'Schema, bundle, endpoint, and tool checks' },
  { id: 'prepare', label: 'Prepare', hint: 'Stage NKP tools and workspace metadata' },
  { id: 'generate', label: 'Generate', hint: 'Create cluster values, env, and deploy helper files' },
  { id: 'registry', label: 'Registry Plan', hint: 'Generate private registry plan only' },
  { id: 'deploy', label: 'Deploy Plan', hint: 'Generate dry-run deployment plan only' },
  { id: 'verify', label: 'Verify', hint: 'Collect local state and kubeconfig-based checks when available' },
  { id: 'runs', label: 'Runs', hint: 'Summarise NKP ZeroTouch run artifacts' },
]

const APPROVAL_REQUIRED_PHASES = new Set(['prepare', 'generate', 'registry', 'deploy'])

const emptyProfile = (): NkpProfile => ({
  name: '',
  description: '',
  environment: 'lab',
  template: { id: '', name: '', category: '', managementClusterRef: '' },
  nkp: { version: '', binaryPath: '', registry: '', sshKeyRef: 'admin_cred' },
  prismCentral: { endpoint: '', credentialRef: 'pc_user' },
  cluster: { name: '', type: 'management', kubernetesVersion: '', vip: '' },
  network: { subnet: '', gateway: '', dnsServers: [], ntpServers: [], domain: '', vlanId: '' },
  proxy: { httpProxy: '', httpsProxy: '', noProxy: [] },
  registry: { endpoint: '', namespace: 'nkp', credentialRef: '', caCert: '', insecure: false },
  imageBuilder: {
    enabled: false,
    prismElementCluster: '',
    subnet: '',
    sourceImage: '',
    artifactBundle: '',
    imageName: 'nkp-node-image',
    bastionHost: '',
    gpuProfile: '',
    fips: false,
    insecure: false,
  },
  nodes: [{ name: 'node-1', serial: '', hostIp: '', cvmIp: '', ipmiIp: '', rack: '' }],
})

const toCsv = (items: string[]) => (items || []).join(', ')
const fromCsv = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean)

export default function NKPFramework() {
  const user = useStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const [status, setStatus] = useState<NkpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installStatus, setInstallStatus] = useState<'running' | 'done' | 'error'>('running')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [phase, setPhase] = useState('validate')
  const [configFile, setConfigFile] = useState('')
  const [configContent, setConfigContent] = useState('')
  const [strict, setStrict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requestingApproval, setRequestingApproval] = useState(false)
  const [approvalId, setApprovalId] = useState('')
  const [message, setMessage] = useState('')
  const [profiles, setProfiles] = useState<NkpProfile[]>([])
  const [profileRevisions, setProfileRevisions] = useState<NkpProfileRevision[]>([])
  const [profile, setProfile] = useState<NkpProfile>(emptyProfile)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileErrors, setProfileErrors] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [previewingYaml, setPreviewingYaml] = useState(false)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [generatedYaml, setGeneratedYaml] = useState('')
  const [binaries, setBinaries] = useState<NkpBinary[]>([])
  const [binaryMessage, setBinaryMessage] = useState('')
  const [binaryError, setBinaryError] = useState('')
  const [binarySaving, setBinarySaving] = useState(false)
  const [compatibility, setCompatibility] = useState<NkpCompatibilityResult | null>(null)
  const [compatibilityChecking, setCompatibilityChecking] = useState(false)
  const [binaryUploadFile, setBinaryUploadFile] = useState<File | null>(null)
  const [binaryForm, setBinaryForm] = useState({ name: '', version: '', path: '' })
  const [templates, setTemplates] = useState<NkpTemplatePack[]>([])
  const [templateApplying, setTemplateApplying] = useState('')
  const [examples, setExamples] = useState<NkpExample[]>([])
  const [schema, setSchema] = useState<NkpSchema | null>(null)
  const [schemaValidation, setSchemaValidation] = useState<NkpSchemaValidation | null>(null)
  const [exampleImporting, setExampleImporting] = useState('')

  const safePhases = useMemo(() => new Set(status?.safePhases || []), [status])

  const appendLog = (type: string, data: string) =>
    setLogs(prev => [...prev, { type, data, ts: Date.now() }])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const resp = await apiFetch('/api/nkp/status')
      if (resp.ok) {
        const data = await resp.json()
        setStatus(data)
        if (!configFile && data.configs?.length) setConfigFile(data.configs[0])
      }
    } finally {
      setLoading(false)
    }
  }

  const loadProfiles = async () => {
    const resp = await apiFetch('/api/nkp/profiles')
    if (!resp.ok) return
    const data = await resp.json()
    setProfiles(data)
    if (!profile.id && data.length) {
      setProfile(data[0])
      await loadProfileRevisions(data[0].id)
    }
  }

  const loadProfileRevisions = async (profileId?: string) => {
    if (!profileId) {
      setProfileRevisions([])
      return
    }
    const resp = await apiFetch(`/api/nkp/profiles/${profileId}/revisions`)
    if (!resp.ok) {
      setProfileRevisions([])
      return
    }
    setProfileRevisions(await resp.json())
  }

  const loadBinaries = async () => {
    const resp = await apiFetch('/api/nkp/binaries')
    if (!resp.ok) return
    setBinaries(await resp.json())
  }

  const loadTemplates = async () => {
    const resp = await apiFetch('/api/nkp/templates')
    if (!resp.ok) return
    setTemplates(await resp.json())
  }

  const loadExamples = async () => {
    const resp = await apiFetch('/api/nkp/examples')
    if (!resp.ok) return
    const data = await resp.json()
    setExamples(data.examples || [])
    setSchema(data.schema || null)
  }

  useEffect(() => {
    loadStatus()
    loadProfiles()
    loadBinaries()
    loadTemplates()
    loadExamples()
  }, [])

  const runInstall = async () => {
    setInstalling(true)
    setInstallStatus('running')
    setLogs([])
    setMessage('')
    try {
      const resp = await apiFetch('/api/nkp/install', { method: 'POST' })
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}))
        appendLog('error', err.error || `Server returned ${resp.status}`)
        setInstallStatus('error')
        return
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            appendLog(evt.type, typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data))
            if (evt.type === 'done') setInstallStatus('done')
            if (evt.type === 'error') setInstallStatus('error')
          } catch { /* ignore malformed SSE line */ }
        }
      }
      setInstallStatus(prev => prev === 'error' ? 'error' : 'done')
      await loadStatus()
    } catch {
      appendLog('error', 'Could not reach the server.')
      setInstallStatus('error')
    } finally {
      setInstalling(false)
    }
  }

  const submitJob = async () => {
    setSubmitting(true)
    setMessage('')
    try {
      const resp = await apiFetch('/api/nkp/jobs', {
        method: 'POST',
        body: JSON.stringify({
          phase,
          configFile,
          configContent,
          strict,
          approvalId: approvalId.trim() || undefined,
          profileId: profile.id || undefined,
          profileName: profile.name || undefined,
          profileRevision: profile.revision || undefined,
          schemaValidation: schemaValidation || undefined,
          generatedConfigFile: configFile || undefined,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setMessage(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Submitted NKP ${phase} job ${data.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  const requestApproval = async () => {
    setRequestingApproval(true)
    setMessage('')
    try {
      const resp = await apiFetch('/api/approvals', {
        method: 'POST',
        body: JSON.stringify({
          workflow: `nkp:${phase}`,
          configFile,
          configContent,
          notes: `NKP ${phase} execution request${readiness ? `; readiness ${readiness.status} (${readiness.score}%)` : ''}`,
          metadata: {
            framework: 'nkp',
            phase,
            profileId: profile.id || undefined,
            profileName: profile.name || undefined,
            profileRevision: profile.revision || undefined,
            template: profile.template,
            configFile,
            schemaValidation,
            readiness,
          },
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setMessage(data.error || `Server returned ${resp.status}`)
        return
      }
      setApprovalId(data.id)
      setMessage(`Approval request ${data.id} created. Submit after an admin approves it.`)
    } finally {
      setRequestingApproval(false)
    }
  }

  const setProfileField = (path: string, value: unknown) => {
    setProfile(prev => {
      const next = structuredClone(prev) as NkpProfile
      const parts = path.split('.')
      let current: Record<string, unknown> = next as unknown as Record<string, unknown>
      for (const part of parts.slice(0, -1)) {
        current = current[part] as Record<string, unknown>
      }
      current[parts[parts.length - 1]] = value
      return next
    })
  }

  const updateNode = (index: number, key: keyof NkpNode, value: string) => {
    setProfile(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, idx) => idx === index ? { ...node, [key]: value } : node),
    }))
  }

  const addNode = () => {
    setProfile(prev => ({
      ...prev,
      nodes: [...prev.nodes, { name: `node-${prev.nodes.length + 1}`, serial: '', hostIp: '', cvmIp: '', ipmiIp: '', rack: '' }],
    }))
  }

  const removeNode = (index: number) => {
    setProfile(prev => ({
      ...prev,
      nodes: prev.nodes.filter((_, idx) => idx !== index),
    }))
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    setProfileErrors([])
    setProfileMessage('')
    try {
      const resp = await apiFetch(profile.id ? `/api/nkp/profiles/${profile.id}` : '/api/nkp/profiles', {
        method: profile.id ? 'PUT' : 'POST',
        body: JSON.stringify(profile),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setProfileErrors(data.validation || [data.error || `Server returned ${resp.status}`])
        return
      }
      setProfile(data)
      setProfileMessage('Deployment profile saved.')
      await loadProfiles()
      await loadProfileRevisions(data.id)
      await checkReadiness(data)
    } finally {
      setSavingProfile(false)
    }
  }

  const checkReadiness = async (profileOverride?: NkpProfile) => {
    setCheckingReadiness(true)
    setProfileErrors([])
    setProfileMessage('')
    try {
      const target = profileOverride || profile
      const resp = target.id
        ? await apiFetch(`/api/nkp/profiles/${target.id}/readiness`)
        : await apiFetch('/api/nkp/profiles/readiness', {
            method: 'POST',
            body: JSON.stringify(target),
          })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setProfileErrors([data.error || `Server returned ${resp.status}`])
        return
      }
      setReadiness(data)
    } finally {
      setCheckingReadiness(false)
    }
  }

  const generateProfileConfig = async () => {
    if (!profile.id) {
      setProfileErrors(['Save the deployment profile before generating YAML.'])
      return
    }
    setProfileErrors([])
    setProfileMessage('')
    const resp = await apiFetch(`/api/nkp/profiles/${profile.id}/generate`, {
      method: 'POST',
      body: JSON.stringify({ filename: `${profile.name || 'nkp-deployment'}.yaml` }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      setProfileErrors(data.validation || [data.error || `Server returned ${resp.status}`])
      return
    }
    setConfigFile(data.filename)
    setGeneratedYaml(data.content || '')
    if (data.readiness) setReadiness(data.readiness)
    if (data.schemaValidation) setSchemaValidation(data.schemaValidation)
    setProfileMessage(`Generated ${data.filename} in Config Files.`)
    if (data.trace?.profileRevision) {
      setProfile(prev => ({ ...prev, revision: data.trace.profileRevision }))
    }
    await loadStatus()
  }

  const previewProfileConfig = async () => {
    setPreviewingYaml(true)
    setProfileErrors([])
    setProfileMessage('')
    try {
      const resp = await apiFetch('/api/nkp/profiles/preview', {
        method: 'POST',
        body: JSON.stringify(profile),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setProfileErrors([data.error || `Server returned ${resp.status}`])
        return
      }
      setGeneratedYaml(data.content || '')
      if (data.readiness) setReadiness(data.readiness)
      if (data.schemaValidation) setSchemaValidation(data.schemaValidation)
      setProfileMessage('Preview generated. Review the YAML before saving or generating a config file.')
    } finally {
      setPreviewingYaml(false)
    }
  }

  const registerBinary = async () => {
    setBinarySaving(true)
    setBinaryError('')
    setBinaryMessage('')
    try {
      const resp = await apiFetch('/api/nkp/binaries', {
        method: 'POST',
        body: JSON.stringify(binaryForm),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setBinaryError(data.error || `Server returned ${resp.status}`)
        return
      }
      setBinaryForm({ name: '', version: '', path: '' })
      setBinaryMessage(`Registered ${data.name}.`)
      await loadBinaries()
    } finally {
      setBinarySaving(false)
    }
  }

  const uploadBinary = async () => {
    if (!binaryUploadFile) {
      setBinaryError('Choose a binary or bundle file to upload.')
      return
    }
    setBinarySaving(true)
    setBinaryError('')
    setBinaryMessage('')
    try {
      const body = new FormData()
      body.append('file', binaryUploadFile)
      body.append('name', binaryForm.name || binaryUploadFile.name)
      body.append('version', binaryForm.version)
      const resp = await fetch('/api/nkp/binaries/upload', {
        method: 'POST',
        headers: authHeaders(),
        body,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setBinaryError(data.error || `Server returned ${resp.status}`)
        return
      }
      setBinaryUploadFile(null)
      setBinaryForm({ name: '', version: '', path: '' })
      setBinaryMessage(`Uploaded ${data.name}.`)
      await loadBinaries()
    } finally {
      setBinarySaving(false)
    }
  }

  const setDefaultBinary = async (binary: NkpBinary) => {
    setBinaryError('')
    const resp = await apiFetch(`/api/nkp/binaries/${binary.id}/default`, { method: 'POST' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setBinaryError(data.error || `Server returned ${resp.status}`)
      return
    }
    setBinaryMessage(`${binary.name} is now the default NKP binary.`)
    await loadBinaries()
  }

  const deleteBinary = async (binary: NkpBinary) => {
    if (!confirm(`Delete NKP binary reference ${binary.name}?`)) return
    setBinaryError('')
    const resp = await apiFetch(`/api/nkp/binaries/${binary.id}`, { method: 'DELETE' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setBinaryError(data.error || `Server returned ${resp.status}`)
      return
    }
    setBinaryMessage(`${binary.name} removed.`)
    await loadBinaries()
  }

  const applyBinaryToProfile = (binary: NkpBinary) => {
    setProfile(prev => ({
      ...prev,
      nkp: {
        ...prev.nkp,
        version: binary.version || prev.nkp.version,
        binaryPath: binary.path,
      },
    }))
    setBinaryMessage(`${binary.name} applied to the deployment profile.`)
  }

  const checkCompatibility = async (binary?: NkpBinary) => {
    setCompatibilityChecking(true)
    setBinaryError('')
    setBinaryMessage('')
    try {
      const body = binary
        ? { binaryId: binary.id }
        : { path: binaryForm.path || profile.nkp.binaryPath }
      const resp = await apiFetch('/api/nkp/compatibility', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setBinaryError(data.error || `Server returned ${resp.status}`)
        return
      }
      setCompatibility(data)
      setBinaryMessage(`Compatibility check ${data.status === 'compatible' ? 'passed' : data.status === 'blocked' ? 'blocked' : 'needs review'}.`)
    } finally {
      setCompatibilityChecking(false)
    }
  }

  const restoreProfileRevision = async (revision: NkpProfileRevision) => {
    if (!profile.id) return
    if (!confirm(`Restore ${profile.name} from revision ${revision.revision}? This creates a new revision.`)) return
    setProfileErrors([])
    setProfileMessage('')
    const resp = await apiFetch(`/api/nkp/profiles/${profile.id}/revisions/${revision.revision}/restore`, { method: 'POST' })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      setProfileErrors(data.validation || [data.error || `Server returned ${resp.status}`])
      return
    }
    setProfile(data)
    setProfileMessage(`Restored from revision ${revision.revision}; current revision is ${data.revision}.`)
    await loadProfiles()
    await loadProfileRevisions(data.id)
    await checkReadiness(data)
  }

  const applyTemplate = async (template: NkpTemplatePack) => {
    setTemplateApplying(template.id)
    setProfileErrors([])
    setProfileMessage('')
    setGeneratedYaml('')
    try {
      const resp = await apiFetch(`/api/nkp/templates/${template.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ overrides: profile }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setProfileErrors([data.error || `Server returned ${resp.status}`])
        return
      }
      setProfile(data.profile)
      setReadiness(data.readiness || null)
      setSchemaValidation(data.generatedSchemaValidation || null)
      setProfileMessage(`${template.name} template applied. Review target-specific values, then save the profile.`)
    } finally {
      setTemplateApplying('')
    }
  }

  const importExample = async (example: NkpExample) => {
    setExampleImporting(example.path)
    setProfileErrors([])
    setProfileMessage('')
    setGeneratedYaml('')
    try {
      const resp = await apiFetch('/api/nkp/examples/import', {
        method: 'POST',
        body: JSON.stringify({ path: example.path }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setProfileErrors([data.error || `Server returned ${resp.status}`])
        return
      }
      setProfile(data.profile)
      setReadiness(data.readiness || null)
      setGeneratedYaml(data.generatedContent || '')
      setSchemaValidation(data.generatedSchemaValidation || null)
      setProfileMessage(`Imported ${example.name}. Review required site values, then save the profile.`)
    } finally {
      setExampleImporting('')
    }
  }

  return (
    <Layout
      title="NKP Framework"
      subtitle="Safe-phase orchestration for VirtuArchitect/nkp-zerotouch-framework"
      actions={
        <button onClick={loadStatus} disabled={loading} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <div className="card">
            <div className="flex items-start gap-3">
              <div className={clsx(
                'w-9 h-9 rounded-lg border flex items-center justify-center',
                status?.installed
                  ? 'bg-nutanix-teal/10 border-nutanix-teal/30 text-nutanix-teal'
                  : 'bg-amber-900/20 border-amber-700/30 text-amber-400'
              )}>
                {status?.installed ? <CheckCircle size={18} /> : <XCircle size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-100">NKP ZeroTouch Framework</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {status?.installed ? 'Installed and ready for safe phases' : 'Install or point Settings at a cloned NKP framework'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <ReadOnly label="Path" value={status?.path || 'loading'} />
              <ReadOnly label="Script" value={status?.script || 'not found'} />
              <ReadOnly label="Repository" value={status?.repoUrl || ''} />
            </div>

            <button onClick={runInstall} disabled={installing} className="btn-primary w-full justify-center mt-5 gap-1.5">
              {installing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              {status?.installed ? 'Reinstall / Update NKP Framework' : 'Install NKP Framework'}
            </button>
          </div>

          <div className="card">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 text-nutanix-cyan flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-100">Safe Phase Launcher</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Apply, upgrade, registry push, and destroy actions are intentionally blocked in this release.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
              <div>
                <label className="label">Phase</label>
                <select className="input" value={phase} onChange={e => setPhase(e.target.value)}>
                  {PHASES.map(item => (
                    <option key={item.id} value={item.id} disabled={!safePhases.has(item.id)}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {PHASES.find(item => item.id === phase)?.hint}
                </p>
              </div>

              <div>
                <label className="label">Config File</label>
                <input
                  className="input font-mono"
                  value={configFile}
                  onChange={e => setConfigFile(e.target.value)}
                  placeholder="connected.example.yaml or nkp-lab.yaml"
                  list="nkp-configs"
                />
                <datalist id="nkp-configs">
                  {status?.configs.map(item => <option key={item} value={item} />)}
                </datalist>
                <p className="text-xs text-gray-500 mt-2">
                  Use an existing config file, or paste YAML below to save it before execution.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Optional YAML Content</label>
              <textarea
                className="input font-mono min-h-48"
                value={configContent}
                onChange={e => setConfigContent(e.target.value)}
                placeholder="# Paste NKP environment YAML here to save/update the selected config file"
              />
            </div>

            {APPROVAL_REQUIRED_PHASES.has(phase) && (
              <div className="mt-4 rounded-lg border border-amber-700/30 bg-amber-950/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-300 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-100">Approval required for this NKP phase</p>
                    <p className="text-xs text-amber-100/70 mt-1">
                      Request approval, have an admin approve it in Approval Gates, then submit this phase with the approved ID.
                    </p>
                    <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2">
                      <input
                        className="input font-mono"
                        value={approvalId}
                        onChange={e => setApprovalId(e.target.value)}
                        placeholder="Approved request ID"
                      />
                      <button onClick={requestApproval} disabled={requestingApproval || !canEdit} className="btn-secondary gap-1.5">
                        {requestingApproval ? <Loader size={14} className="animate-spin" /> : <FilePlus size={14} />}
                        Request Approval
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />
                Strict validation
              </label>
              <div className="flex items-center gap-2">
                {message && (
                  <span className={clsx('text-sm', message.startsWith('Submitted') ? 'text-nutanix-teal' : 'text-red-300')}>
                    {message}
                  </span>
                )}
                {message.startsWith('Submitted') && (
                  <Link to="/jobs" className="btn-secondary text-sm">View Jobs</Link>
                )}
                <button onClick={submitJob} disabled={submitting || !status?.installed} className="btn-primary gap-1.5">
                  {submitting ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
                  Submit Phase
                </button>
              </div>
            </div>
          </div>
        </div>

        {logs.length > 0 && (
          <Terminal logs={logs} status={installStatus} title="NKP Framework Installation Output" />
        )}

        <div className="card">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 text-nutanix-cyan flex items-center justify-center">
                <FileSearch size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-100">NKP Example Schema Alignment</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Discover installed NKP example YAML, infer the expected shape, and import examples into editable profiles.
                </p>
              </div>
            </div>
            <button onClick={loadExamples} className="btn-secondary gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
            <div className="rounded-lg border border-border bg-gray-950/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inferred Schema</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className={clsx('badge text-xs', schema?.source === 'installed_examples' ? 'badge-green' : 'badge-yellow')}>
                  {schema?.source === 'installed_examples' ? 'installed examples' : 'fallback schema'}
                </span>
                <span className="badge badge-gray text-xs">{examples.length} examples</span>
              </div>
              <div className="mt-3 text-xs text-gray-500">Required top-level keys</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(schema?.requiredTopLevel || ['environment', 'nkp', 'nutanix', 'cluster']).map(key => (
                  <span key={key} className="badge badge-blue text-xs">{key}</span>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {examples.length === 0 ? (
                <div className="rounded-lg border border-border bg-gray-950/40 px-4 py-6 text-center text-sm text-gray-500">
                  No NKP examples found. Install or update the NKP framework to discover configs/environments examples.
                </div>
              ) : examples.map(example => (
                <div key={example.path} className="rounded-lg border border-border bg-gray-950/40 p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-100">{example.name}</h3>
                        {example.environmentType && <span className="badge badge-blue text-xs">{example.environmentType}</span>}
                        {example.provider && <span className="badge badge-gray text-xs">{example.provider}</span>}
                      </div>
                      <p className="font-mono text-xs text-gray-500 mt-2 break-all">{example.path}</p>
                      {example.clusterName && <p className="text-xs text-gray-500 mt-1">Cluster: {example.clusterName}</p>}
                    </div>
                    <button onClick={() => importExample(example)} disabled={!canEdit || exampleImporting === example.path} className="btn-secondary gap-1.5">
                      {exampleImporting === example.path ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                      Import Profile
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 text-nutanix-cyan flex items-center justify-center">
                <Layers size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-100">NKP Deployment Template Packs</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Start from a guided profile for common NKP deployment patterns, then fill in site-specific values before saving.
                </p>
              </div>
            </div>
            <button onClick={loadTemplates} className="btn-secondary gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-lg border border-border bg-gray-950/40 px-4 py-6 text-center text-sm text-gray-500">
              No NKP template packs are available.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {templates.map(template => (
                <div key={template.id} className="rounded-lg border border-border bg-gray-950/40 p-4 flex flex-col min-h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-100">{template.name}</h3>
                        <span className={clsx('badge text-xs', template.category === 'Restricted' ? 'badge-yellow' : 'badge-blue')}>
                          {template.category}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">{template.description}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-md border border-border bg-gray-950/50 px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Best for</div>
                    <p className="text-sm text-gray-300 mt-1">{template.recommendedUse}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                    <TemplateList title="Required" items={template.requiredFields} />
                    <TemplateList title="Preflight" items={template.preflightChecklist} />
                  </div>

                  <button
                    onClick={() => applyTemplate(template)}
                    disabled={!canEdit || templateApplying === template.id}
                    className="btn-primary mt-4 justify-center gap-1.5"
                  >
                    {templateApplying === template.id ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                    Apply Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-gray-100">NKP Binary Manager</h2>
              <p className="text-sm text-gray-500 mt-1">
                Register staged NKP tooling or upload smaller bundles, then apply a managed path to deployment profiles.
              </p>
            </div>
            <button onClick={loadBinaries} className="btn-secondary gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {binaryError && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{binaryError}</div>
          )}
          {binaryMessage && (
            <div className="mb-4 rounded-lg border border-nutanix-teal/30 bg-nutanix-teal/10 px-4 py-3 text-sm text-nutanix-teal">{binaryMessage}</div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-4">
            <div className="rounded-lg border border-border bg-gray-950/30 p-4">
              <h3 className="font-semibold text-gray-100">Register Existing Path</h3>
              <p className="text-xs text-gray-500 mt-1">
                Use this when NKP binaries are already staged on the Orchestrator VM or appliance.
              </p>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
                <ProfileField label="Name" value={binaryForm.name} onChange={value => setBinaryForm(prev => ({ ...prev, name: value }))} disabled={!canEdit} />
                <ProfileField label="Version" value={binaryForm.version} onChange={value => setBinaryForm(prev => ({ ...prev, version: value }))} disabled={!canEdit} />
                <ProfileField label="Server Path" value={binaryForm.path} onChange={value => setBinaryForm(prev => ({ ...prev, path: value }))} disabled={!canEdit} mono />
              </div>
              <button onClick={registerBinary} disabled={!canEdit || binarySaving || !binaryForm.path} className="btn-primary mt-4 gap-1.5">
                {binarySaving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                Register Path
              </button>
              <button onClick={() => checkCompatibility()} disabled={compatibilityChecking || (!binaryForm.path && !profile.nkp.binaryPath)} className="btn-secondary mt-2 gap-1.5">
                {compatibilityChecking ? <Loader size={14} className="animate-spin" /> : <FileSearch size={14} />}
                Check CLI Compatibility
              </button>
            </div>

            <div className="rounded-lg border border-border bg-gray-950/30 p-4">
              <h3 className="font-semibold text-gray-100">Upload Bundle</h3>
              <p className="text-xs text-gray-500 mt-1">
                Uploads are stored under the Orchestrator data directory with a SHA-256 checksum.
              </p>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
                <input
                  type="file"
                  className="input"
                  disabled={!canEdit}
                  onChange={event => setBinaryUploadFile(event.target.files?.[0] || null)}
                />
                <button onClick={uploadBinary} disabled={!canEdit || binarySaving || !binaryUploadFile} className="btn-primary gap-1.5">
                  {binarySaving ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                  Upload
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                For very large production payloads, stage the file on the VM and register its path.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {binaries.length === 0 ? (
              <div className="rounded-lg border border-border bg-gray-950/40 px-4 py-6 text-center text-sm text-gray-500">
                No NKP binaries registered yet.
              </div>
            ) : (
              binaries.map(binary => (
                <div key={binary.id} className="rounded-lg border border-border bg-gray-950/40 p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-100">{binary.name}</h3>
                        {binary.version && <span className="badge badge-blue text-xs">{binary.version}</span>}
                        {binary.default && <span className="badge badge-green text-xs">default</span>}
                        <span className={clsx('badge text-xs', binary.exists ? 'badge-green' : 'badge-red')}>
                          {binary.status || (binary.exists ? 'available' : 'missing')}
                        </span>
                        <span className="badge badge-gray text-xs">{binary.source}</span>
                      </div>
                      <p className="font-mono text-xs text-gray-500 mt-2 break-all">{binary.path}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                        {binary.size !== undefined && binary.size !== null && <span>{formatBytes(binary.size)}</span>}
                        {binary.checksum && <span className="font-mono">sha256 {binary.checksum.slice(0, 16)}...</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => applyBinaryToProfile(binary)} disabled={!canEdit || !binary.exists} className="btn-secondary gap-1.5">
                        <Download size={14} />
                        Use in Profile
                      </button>
                      <button onClick={() => checkCompatibility(binary)} disabled={compatibilityChecking || !binary.exists} className="btn-secondary gap-1.5">
                        {compatibilityChecking ? <Loader size={14} className="animate-spin" /> : <FileSearch size={14} />}
                        Check
                      </button>
                      <button onClick={() => setDefaultBinary(binary)} disabled={!canEdit || binary.default} className="btn-secondary gap-1.5">
                        <Star size={14} />
                        Default
                      </button>
                      <button onClick={() => deleteBinary(binary)} disabled={!canEdit} className="btn-danger gap-1.5">
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {compatibility && (
            <div className={clsx(
              'mt-5 rounded-lg border p-4',
              compatibility.status === 'compatible'
                ? 'border-nutanix-teal/30 bg-nutanix-teal/10'
                : compatibility.status === 'blocked'
                  ? 'border-red-500/30 bg-red-950/20'
                  : 'border-yellow-500/30 bg-yellow-950/20'
            )}>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-100">NKP CLI Compatibility</h3>
                  <p className="mt-1 text-sm text-gray-400">
                    {compatibility.summary.passed} passed, {compatibility.summary.warnings} warnings, {compatibility.summary.failed} failed.
                  </p>
                  <p className="mt-1 font-mono text-xs text-gray-500 break-all">{compatibility.cliPath || 'no executable resolved'}</p>
                </div>
                <span className={clsx(
                  'badge text-xs',
                  compatibility.status === 'compatible' ? 'badge-green' : compatibility.status === 'blocked' ? 'badge-red' : 'badge-yellow'
                )}>
                  {compatibility.status.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-2">
                {compatibility.checks.map(check => (
                  <div key={check.id} className="rounded-md border border-border bg-gray-950/60 px-3 py-2">
                    <div className="flex items-start gap-2">
                      {check.status === 'pass'
                        ? <CheckCircle size={14} className="text-nutanix-teal mt-0.5 flex-shrink-0" />
                        : check.status === 'fail'
                          ? <XCircle size={14} className="text-red-300 mt-0.5 flex-shrink-0" />
                          : <AlertTriangle size={14} className="text-yellow-300 mt-0.5 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-200">{check.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{check.detail}</div>
                        <div className="mt-1 font-mono text-[11px] text-gray-600 break-all">{check.command}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4 mb-5">
            <div>
              <h2 className="font-semibold text-gray-100">NKP Deployment Profile Builder</h2>
              <p className="text-sm text-gray-500 mt-1">
                Define the deployment target, network, binaries, credentials, and node inventory, then generate NKP YAML for safe-phase execution.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input min-w-56"
                value={profile.id || ''}
                onChange={e => {
                  const selected = profiles.find(item => item.id === e.target.value)
                  setProfile(selected || emptyProfile())
                  loadProfileRevisions(selected?.id)
                  setGeneratedYaml('')
                  setProfileErrors([])
                  setProfileMessage('')
                  setReadiness(null)
                }}
              >
                <option value="">New deployment profile</option>
                {profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button className="btn-secondary gap-1.5" onClick={() => { setProfile(emptyProfile()); setProfileRevisions([]); setReadiness(null); setGeneratedYaml('') }}>
                <Plus size={14} />
                New
              </button>
              <button className="btn-primary gap-1.5" onClick={saveProfile} disabled={!canEdit || savingProfile}>
                {savingProfile ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Save Profile
              </button>
              <button className="btn-secondary gap-1.5" onClick={generateProfileConfig} disabled={!canEdit || !profile.id}>
                <FilePlus size={14} />
                Generate YAML
              </button>
              <button className="btn-secondary gap-1.5" onClick={previewProfileConfig} disabled={previewingYaml}>
                {previewingYaml ? <Loader size={14} className="animate-spin" /> : <FilePlus size={14} />}
                Preview YAML
              </button>
              <button className="btn-secondary gap-1.5" onClick={() => checkReadiness()} disabled={checkingReadiness}>
                {checkingReadiness ? <Loader size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                Check Readiness
              </button>
            </div>
          </div>

          {profileErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {profileErrors.map(error => <div key={error}>{error}</div>)}
            </div>
          )}
          {profileMessage && (
            <div className="mb-4 rounded-lg border border-nutanix-teal/30 bg-nutanix-teal/10 px-4 py-3 text-sm text-nutanix-teal">
              {profileMessage}
            </div>
          )}

          {profile.id && (
            <div className="mb-5 rounded-lg border border-border bg-gray-950/40 p-4">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Profile Versioning</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-100">{profile.name}</span>
                    <span className="badge badge-blue text-xs">revision {profile.revision || 1}</span>
                    {profile.updatedAt && <span className="text-xs text-gray-500">updated {new Date(profile.updatedAt).toLocaleString()}</span>}
                  </div>
                </div>
                <button className="btn-secondary gap-1.5" onClick={() => loadProfileRevisions(profile.id)}>
                  <RefreshCw size={14} />
                  Refresh Versions
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
                {profileRevisions.length === 0 ? (
                  <div className="xl:col-span-3 rounded-md border border-border bg-gray-900/50 px-3 py-3 text-sm text-gray-500">
                    No profile revision entries recorded yet.
                  </div>
                ) : profileRevisions.slice(0, 6).map(revision => (
                  <div key={revision.id} className="rounded-md border border-border bg-gray-900/50 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-gray-200">Revision {revision.revision}</div>
                        <div className="text-xs text-gray-500 mt-1">{revision.action} by {revision.createdBy || 'unknown'}</div>
                        <div className="text-xs text-gray-600 mt-1">{new Date(revision.createdAt).toLocaleString()}</div>
                      </div>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => restoreProfileRevision(revision)}
                        disabled={!canEdit || revision.revision === profile.revision}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {readiness && (
            <div className={clsx(
              'mb-5 rounded-lg border p-4',
              readiness.status === 'ready'
                ? 'border-nutanix-teal/30 bg-nutanix-teal/10'
                : readiness.status === 'blocked'
                  ? 'border-red-500/30 bg-red-950/20'
                  : 'border-yellow-500/30 bg-yellow-950/20'
            )}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className={clsx(
                    'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border',
                    readiness.status === 'ready'
                      ? 'border-nutanix-teal/30 text-nutanix-teal'
                      : readiness.status === 'blocked'
                        ? 'border-red-500/30 text-red-300'
                        : 'border-yellow-500/30 text-yellow-300'
                  )}>
                    {readiness.status === 'ready'
                      ? <CheckCircle size={18} />
                      : readiness.status === 'blocked'
                        ? <XCircle size={18} />
                        : <AlertTriangle size={18} />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-100">
                      Readiness {readiness.status === 'ready' ? 'ready' : readiness.status === 'blocked' ? 'blocked' : 'needs attention'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {readiness.summary.passed} passed, {readiness.summary.warnings} warnings, {readiness.summary.failed} failed.
                    </p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-100">{readiness.score}%</div>
              </div>
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-2">
                {readiness.checks.map(check => (
                  <div key={check.id} className="rounded-md border border-border bg-gray-950/50 px-3 py-2">
                    <div className="flex items-start gap-2">
                      {check.status === 'pass'
                        ? <CheckCircle size={14} className="text-nutanix-teal mt-0.5 flex-shrink-0" />
                        : check.status === 'fail'
                          ? <XCircle size={14} className="text-red-300 mt-0.5 flex-shrink-0" />
                          : <AlertTriangle size={14} className="text-yellow-300 mt-0.5 flex-shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-200">{check.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{check.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {profile.template.id && (
              <div className="xl:col-span-3 rounded-lg border border-border bg-gray-950/40 px-4 py-3">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Template Pack</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-100">{profile.template.name || profile.template.id}</span>
                      {profile.template.category && (
                        <span className={clsx('badge text-xs', profile.template.category === 'Restricted' ? 'badge-yellow' : 'badge-blue')}>
                          {profile.template.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-secondary gap-1.5"
                    onClick={() => setProfileField('template', { id: '', name: '', category: '', managementClusterRef: '' })}
                    disabled={!canEdit}
                  >
                    Clear Template
                  </button>
                </div>
              </div>
            )}
            <ProfileField label="Profile Name" value={profile.name} onChange={value => setProfileField('name', value)} disabled={!canEdit} />
            <ProfileField label="Environment" value={profile.environment} onChange={value => setProfileField('environment', value)} disabled={!canEdit} />
            <ProfileField label="Description" value={profile.description} onChange={value => setProfileField('description', value)} disabled={!canEdit} />
            {profile.template.id === 'workload-cluster' && (
              <ProfileField label="Management Cluster Ref" value={profile.template.managementClusterRef} onChange={value => setProfileField('template.managementClusterRef', value)} disabled={!canEdit} />
            )}
            <ProfileField label="NKP Version" value={profile.nkp.version} onChange={value => setProfileField('nkp.version', value)} disabled={!canEdit} />
            <ProfileField label="NKP Binary Path" value={profile.nkp.binaryPath} onChange={value => setProfileField('nkp.binaryPath', value)} disabled={!canEdit} mono />
            <ProfileField label="Registry" value={profile.nkp.registry} onChange={value => setProfileField('nkp.registry', value)} disabled={!canEdit} />
            <ProfileField label="Prism Central Endpoint" value={profile.prismCentral.endpoint} onChange={value => setProfileField('prismCentral.endpoint', value)} disabled={!canEdit} />
            <ProfileField label="PC Credential Ref" value={profile.prismCentral.credentialRef} onChange={value => setProfileField('prismCentral.credentialRef', value)} disabled={!canEdit} mono />
            <ProfileField label="SSH Key Ref" value={profile.nkp.sshKeyRef} onChange={value => setProfileField('nkp.sshKeyRef', value)} disabled={!canEdit} mono />
            <ProfileField label="Cluster Name" value={profile.cluster.name} onChange={value => setProfileField('cluster.name', value)} disabled={!canEdit} />
            <ProfileField label="Cluster Type" value={profile.cluster.type} onChange={value => setProfileField('cluster.type', value)} disabled={!canEdit} />
            <ProfileField label="Kubernetes Version" value={profile.cluster.kubernetesVersion} onChange={value => setProfileField('cluster.kubernetesVersion', value)} disabled={!canEdit} />
            <ProfileField label="Cluster VIP" value={profile.cluster.vip} onChange={value => setProfileField('cluster.vip', value)} disabled={!canEdit} />
            <ProfileField label="Subnet CIDR" value={profile.network.subnet} onChange={value => setProfileField('network.subnet', value)} disabled={!canEdit} />
            <ProfileField label="Gateway" value={profile.network.gateway} onChange={value => setProfileField('network.gateway', value)} disabled={!canEdit} />
            <ProfileField label="DNS Servers" value={toCsv(profile.network.dnsServers)} onChange={value => setProfileField('network.dnsServers', fromCsv(value))} disabled={!canEdit} />
            <ProfileField label="NTP Servers" value={toCsv(profile.network.ntpServers)} onChange={value => setProfileField('network.ntpServers', fromCsv(value))} disabled={!canEdit} />
            <ProfileField label="Domain" value={profile.network.domain} onChange={value => setProfileField('network.domain', value)} disabled={!canEdit} />
            <ProfileField label="VLAN ID" value={profile.network.vlanId} onChange={value => setProfileField('network.vlanId', value)} disabled={!canEdit} />
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-3">
              <h3 className="font-semibold text-gray-100">Proxy & Air-Gapped Registry</h3>
              <p className="text-sm text-gray-500 mt-1">
                Capture proxy/no-proxy and local registry metadata required by proxied or air-gapped NKP deployments.
              </p>
            </div>
            <ProfileField label="HTTP Proxy" value={profile.proxy.httpProxy} onChange={value => setProfileField('proxy.httpProxy', value)} disabled={!canEdit} />
            <ProfileField label="HTTPS Proxy" value={profile.proxy.httpsProxy} onChange={value => setProfileField('proxy.httpsProxy', value)} disabled={!canEdit} />
            <ProfileField label="No Proxy" value={toCsv(profile.proxy.noProxy)} onChange={value => setProfileField('proxy.noProxy', fromCsv(value))} disabled={!canEdit} />
            <ProfileField label="Registry Endpoint" value={profile.registry.endpoint} onChange={value => setProfileField('registry.endpoint', value)} disabled={!canEdit} />
            <ProfileField label="Registry Namespace" value={profile.registry.namespace} onChange={value => setProfileField('registry.namespace', value)} disabled={!canEdit} />
            <ProfileField label="Registry Credential Ref" value={profile.registry.credentialRef} onChange={value => setProfileField('registry.credentialRef', value)} disabled={!canEdit} mono />
            <ProfileField label="Registry CA Cert Path" value={profile.registry.caCert} onChange={value => setProfileField('registry.caCert', value)} disabled={!canEdit} mono />
            <label className="flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-3">
              <input
                type="checkbox"
                checked={profile.registry.insecure}
                disabled={!canEdit}
                onChange={event => setProfileField('registry.insecure', event.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-200">Registry allows insecure TLS</span>
                <span className="block text-xs text-gray-500">Use only when the target registry intentionally does not validate TLS.</span>
              </span>
            </label>
          </div>

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="font-semibold text-gray-100">Nutanix Image Builder Planning</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Record the inputs needed for NKP image creation. Live image creation still requires CLI and infrastructure validation.
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-gray-950/40 px-3 py-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={profile.imageBuilder.enabled}
                  disabled={!canEdit}
                  onChange={event => setProfileField('imageBuilder.enabled', event.target.checked)}
                />
                Enable Image Builder checks
              </label>
            </div>
            <ProfileField label="PE Cluster" value={profile.imageBuilder.prismElementCluster} onChange={value => setProfileField('imageBuilder.prismElementCluster', value)} disabled={!canEdit} />
            <ProfileField label="Image Subnet" value={profile.imageBuilder.subnet} onChange={value => setProfileField('imageBuilder.subnet', value)} disabled={!canEdit} />
            <ProfileField label="Source/Base Image" value={profile.imageBuilder.sourceImage} onChange={value => setProfileField('imageBuilder.sourceImage', value)} disabled={!canEdit} />
            <ProfileField label="Artifact Bundle" value={profile.imageBuilder.artifactBundle} onChange={value => setProfileField('imageBuilder.artifactBundle', value)} disabled={!canEdit} mono />
            <ProfileField label="Target Image Name" value={profile.imageBuilder.imageName} onChange={value => setProfileField('imageBuilder.imageName', value)} disabled={!canEdit} />
            <ProfileField label="Bastion Host" value={profile.imageBuilder.bastionHost} onChange={value => setProfileField('imageBuilder.bastionHost', value)} disabled={!canEdit} />
            <ProfileField label="GPU / vGPU Profile" value={profile.imageBuilder.gpuProfile} onChange={value => setProfileField('imageBuilder.gpuProfile', value)} disabled={!canEdit} />
            <label className="flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-3">
              <input
                type="checkbox"
                checked={profile.imageBuilder.fips}
                disabled={!canEdit}
                onChange={event => setProfileField('imageBuilder.fips', event.target.checked)}
              />
              <span className="text-sm font-medium text-gray-200">FIPS image</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-3">
              <input
                type="checkbox"
                checked={profile.imageBuilder.insecure}
                disabled={!canEdit}
                onChange={event => setProfileField('imageBuilder.insecure', event.target.checked)}
              />
              <span className="text-sm font-medium text-gray-200">Allow insecure Prism TLS</span>
            </label>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-100">Node Inventory</h3>
              <button className="btn-secondary gap-1.5" onClick={addNode} disabled={!canEdit}>
                <Plus size={14} />
                Add Node
              </button>
            </div>
            <div className="space-y-3">
              {profile.nodes.map((node, index) => (
                <div key={index} className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_44px] gap-3 rounded-lg border border-border bg-gray-950/40 p-3">
                  <ProfileField label="Name" value={node.name} onChange={value => updateNode(index, 'name', value)} disabled={!canEdit} />
                  <ProfileField label="Host IP" value={node.hostIp} onChange={value => updateNode(index, 'hostIp', value)} disabled={!canEdit} />
                  <ProfileField label="CVM IP" value={node.cvmIp} onChange={value => updateNode(index, 'cvmIp', value)} disabled={!canEdit} />
                  <ProfileField label="IPMI IP" value={node.ipmiIp} onChange={value => updateNode(index, 'ipmiIp', value)} disabled={!canEdit} />
                  <ProfileField label="Serial / Rack" value={node.serial || node.rack} onChange={value => updateNode(index, 'serial', value)} disabled={!canEdit} />
                  <button className="btn-secondary self-end h-10 justify-center" onClick={() => removeNode(index)} disabled={!canEdit || profile.nodes.length === 1} title="Remove node">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {generatedYaml && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-100">Generated YAML Preview</h3>
                  {schemaValidation && (
                    <span className={clsx(
                      'badge text-xs',
                      schemaValidation.status === 'pass' ? 'badge-green' : schemaValidation.status === 'warn' ? 'badge-yellow' : 'badge-red'
                    )}>
                      schema {schemaValidation.status}
                    </span>
                  )}
                </div>
                <Link to="/configs" className="text-sm text-nutanix-cyan hover:text-nutanix-teal">Open Config Files</Link>
              </div>
              {schemaValidation && schemaValidation.status !== 'pass' && (
                <div className="mb-3 rounded-lg border border-amber-700/30 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                  {[...(schemaValidation.missing || []), ...(schemaValidation.warnings || []), ...(schemaValidation.errors || [])].join('; ')}
                </div>
              )}
              <pre className="rounded-lg border border-border bg-gray-950 p-4 text-xs text-gray-300 overflow-auto max-h-80">{generatedYaml}</pre>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 rounded-md border border-border bg-gray-950 px-3 py-2 font-mono text-xs text-gray-300 break-all">
        {value || 'not configured'}
      </div>
    </div>
  )
}

function TemplateList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 4).map(item => (
          <li key={item} className="flex items-start gap-2 text-xs text-gray-400">
            <CheckCircle size={12} className="mt-0.5 flex-shrink-0 text-nutanix-teal" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function ProfileField({
  label,
  value,
  onChange,
  disabled,
  mono = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className={clsx('input', mono && 'font-mono')}
        value={value || ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}
