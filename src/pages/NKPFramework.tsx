import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Download, FilePlus, Loader, Plus, Play, RefreshCw, Save, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Terminal from '../components/Terminal'
import { apiFetch } from '../utils/api'
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
  name: string
  description: string
  environment: string
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
  nodes: NkpNode[]
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
  nkp: { version: '', binaryPath: '', registry: '', sshKeyRef: 'admin_cred' },
  prismCentral: { endpoint: '', credentialRef: 'pc_user' },
  cluster: { name: '', type: 'management', kubernetesVersion: '', vip: '' },
  network: { subnet: '', gateway: '', dnsServers: [], ntpServers: [], domain: '', vlanId: '' },
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
  const [profile, setProfile] = useState<NkpProfile>(emptyProfile)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileErrors, setProfileErrors] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [checkingReadiness, setCheckingReadiness] = useState(false)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [generatedYaml, setGeneratedYaml] = useState('')

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
    if (!profile.id && data.length) setProfile(data[0])
  }

  useEffect(() => {
    loadStatus()
    loadProfiles()
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

  const setProfileField = (path: string, value: string | string[]) => {
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
    setProfileMessage(`Generated ${data.filename} in Config Files.`)
    await loadStatus()
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
                  setGeneratedYaml('')
                  setProfileErrors([])
                  setProfileMessage('')
                  setReadiness(null)
                }}
              >
                <option value="">New deployment profile</option>
                {profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button className="btn-secondary gap-1.5" onClick={() => { setProfile(emptyProfile()); setReadiness(null); setGeneratedYaml('') }}>
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
            <ProfileField label="Profile Name" value={profile.name} onChange={value => setProfileField('name', value)} disabled={!canEdit} />
            <ProfileField label="Environment" value={profile.environment} onChange={value => setProfileField('environment', value)} disabled={!canEdit} />
            <ProfileField label="Description" value={profile.description} onChange={value => setProfileField('description', value)} disabled={!canEdit} />
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
                <h3 className="font-semibold text-gray-100">Generated YAML Preview</h3>
                <Link to="/configs" className="text-sm text-nutanix-cyan hover:text-nutanix-teal">Open Config Files</Link>
              </div>
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
