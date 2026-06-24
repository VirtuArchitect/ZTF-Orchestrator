import { useEffect, useMemo, useState } from 'react'
import {
  Archive, CheckCircle, Clock, ExternalLink, FileCheck, Layers, Loader, PackageCheck,
  Plus, RefreshCw, Server, ShieldCheck, Trash2, Upload, XCircle,
} from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch, authHeaders } from '../utils/api'
import { useStore } from '../store'
import { APP_VERSION } from '../version'
import clsx from 'clsx'

type Tab = 'artifacts' | 'updates' | 'firstboot' | 'readiness' | 'ztf'

interface ArtifactRecord {
  id: string
  profile: 'standard' | 'airgap' | 'minimal'
  version: string
  artifactName?: string
  archiveLocation?: string
  checksum?: string
  checksumFile?: string
  workflowUrl?: string
  releaseUrl?: string
  sizeBytes?: number
  expiresAt?: string
  verifiedAt?: string
  notes?: string
  status: 'verified' | 'archived' | 'expiring' | 'expired' | 'pending' | string
  createdAt: string
  updatedAt: string
}

interface ArtifactSummary {
  total: number
  verified: number
  archived: number
  expiring: number
  expired: number
  pending: number
}

interface UpdateRecord {
  id: string
  target?: 'ztf-orchestrator' | 'ztf-framework' | 'nkp-framework' | string
  targetLabel?: string
  targetPath?: string
  source: 'github' | 'offline' | string
  repository: string
  version: string
  name: string
  releaseUrl?: string
  artifactUrl?: string
  containerImage: string
  sourceRef: string
  checksum?: string
  imageTarPath?: string
  frameworkArchivePath?: string
  manifestSha256?: string
  packageId?: string
  packagePath?: string
  publishedAt?: string
  notes?: string
  prerelease?: boolean
  status: 'available' | 'imported' | 'verified' | 'staged' | 'applied' | string
  assets?: Array<{ name: string; size: number; url: string }>
  packageArtifacts?: Array<{ type: string; name: string; path: string; relativePath: string; sha256: string; sizeBytes: number }>
  verifiedAt?: string
  stagedAt?: string
  requestPath?: string
  appliedAt?: string
  createdAt: string
  updatedAt: string
}

interface UpdateState {
  current: {
    version: string
    containerImage: string
    requestPath: string
  }
  updates: UpdateRecord[]
  staged?: UpdateRecord | null
  allowedRepositories: string[]
  targets?: UpdateTarget[]
}

interface UpdateTarget {
  id: 'ztf-orchestrator' | 'ztf-framework' | 'nkp-framework' | string
  label: string
  defaultRepo: string
  defaultPath: string
}

interface ApplianceStatus {
  detected: boolean
  checks: Array<{ name: string; ok: boolean; value: string }>
  containerPaths: Record<string, string>
}

interface ZtfCompatibility {
  installed: boolean
  compatible: boolean
  layout: string
  entrypoint: string
  requiredRef: string
  message: string
  supportedModes: Array<{ id: string; label: string; available: boolean; description: string }>
}

interface NkpProfile {
  id: string
  name: string
  revision?: number
}

interface ReadinessResult {
  status: 'ready' | 'needs_review' | 'blocked' | string
  score: number
  checks: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail' | string; message: string }>
}

const EMPTY_ARTIFACT = {
  profile: 'airgap',
  version: `v${APP_VERSION}`,
  artifactName: '',
  archiveLocation: '',
  checksum: '',
  checksumFile: '',
  workflowUrl: '',
  releaseUrl: '',
  sizeBytes: 0,
  expiresAt: '',
  notes: '',
}

const EXAMPLE_UPDATE_MANIFEST = JSON.stringify({
  target: 'ztf-orchestrator',
  version: `v${APP_VERSION}`,
  repository: 'VirtuArchitect/ZTF-Orchestrator',
  containerImage: `ghcr.io/virtuarchitect/ztf-orchestrator:v${APP_VERSION}`,
  targetPath: '',
  sourceRef: `v${APP_VERSION}`,
  releaseUrl: 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/vX.Y.Z',
  checksum: '',
  notes: 'Offline update manifest staged from a connected environment.',
}, null, 2)

const DEFAULT_UPDATE_TARGETS: UpdateTarget[] = [
  { id: 'ztf-orchestrator', label: 'ZTF-Orchestrator', defaultRepo: 'VirtuArchitect/ZTF-Orchestrator', defaultPath: '' },
  { id: 'ztf-framework', label: 'ZeroTouch Framework', defaultRepo: 'nutanixdev/zerotouch-framework', defaultPath: '/opt/zerotouch-framework' },
  { id: 'nkp-framework', label: 'NKP Framework', defaultRepo: 'VirtuArchitect/nkp-zerotouch-framework', defaultPath: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework' },
]

export default function Appliance() {
  const user = useStore(s => s.user)
  const canEdit = user?.role === 'admin' || user?.role === 'operator'
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<Tab>('artifacts')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([])
  const [summary, setSummary] = useState<ArtifactSummary | null>(null)
  const [form, setForm] = useState(EMPTY_ARTIFACT)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)
  const [updateTarget, setUpdateTarget] = useState('ztf-orchestrator')
  const [updateRepo, setUpdateRepo] = useState('VirtuArchitect/ZTF-Orchestrator')
  const [updateTargetPath, setUpdateTargetPath] = useState('')
  const [includePrerelease, setIncludePrerelease] = useState(false)
  const [updateManifest, setUpdateManifest] = useState(EXAMPLE_UPDATE_MANIFEST)
  const [updatePackage, setUpdatePackage] = useState<File | null>(null)
  const [updateBusy, setUpdateBusy] = useState('')
  const [appliance, setAppliance] = useState<ApplianceStatus | null>(null)
  const [ztf, setZtf] = useState<ZtfCompatibility | null>(null)
  const [profiles, setProfiles] = useState<NkpProfile[]>([])
  const [selectedProfile, setSelectedProfile] = useState('')
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [artifactResp, applianceResp, ztfResp, profilesResp] = await Promise.all([
        apiFetch('/api/appliance/artifacts'),
        apiFetch('/api/appliance/status'),
        apiFetch('/api/ztf/compatibility'),
        apiFetch('/api/nkp/profiles'),
      ])
      if (artifactResp.ok) {
        const data = await artifactResp.json()
        setArtifacts(data.artifacts || [])
        setSummary(data.summary || null)
      }
      if (applianceResp.ok) setAppliance(await applianceResp.json())
      if (ztfResp.ok) setZtf(await ztfResp.json())
      if (profilesResp.ok) {
        const data = await profilesResp.json()
        setProfiles(data || [])
        if (!selectedProfile && data?.length) setSelectedProfile(data[0].id)
      }
      const updateResp = await apiFetch('/api/appliance/updates')
      if (updateResp.ok) setUpdateState(await updateResp.json())
    } catch {
      setError('Could not load appliance operations state.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updateTargets = updateState?.targets?.length ? updateState.targets : DEFAULT_UPDATE_TARGETS
  const selectedUpdateTarget = updateTargets.find(item => item.id === updateTarget) || updateTargets[0]
  const frameworkUpdateSelected = selectedUpdateTarget?.id !== 'ztf-orchestrator'

  const archiveCoverage = useMemo(() => {
    const profiles = new Set(artifacts.filter(item => ['verified', 'archived'].includes(item.status)).map(item => item.profile))
    return (['standard', 'airgap', 'minimal'] as const).map(profile => ({ profile, done: profiles.has(profile) }))
  }, [artifacts])

  const createArtifact = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch('/api/appliance/artifacts', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`${data.profile} ${data.version} archive record created.`)
      setForm({ ...EMPTY_ARTIFACT, version: form.version })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const verifyArtifact = async (record: ArtifactRecord) => {
    const resp = await apiFetch(`/api/appliance/artifacts/${record.id}/verify`, { method: 'POST' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setError(data.error || `Server returned ${resp.status}`)
      return
    }
    setMessage(`${record.profile} ${record.version} marked verified.`)
    await load()
  }

  const deleteArtifact = async (record: ArtifactRecord) => {
    if (!confirm(`Delete archive record for ${record.profile} ${record.version}?`)) return
    const resp = await apiFetch(`/api/appliance/artifacts/${record.id}`, { method: 'DELETE' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setError(data.error || `Server returned ${resp.status}`)
      return
    }
    await load()
  }

  const selectUpdateTarget = (targetId: string) => {
    const target = updateTargets.find(item => item.id === targetId) || DEFAULT_UPDATE_TARGETS[0]
    setUpdateTarget(target.id)
    setUpdateRepo(target.defaultRepo)
    setUpdateTargetPath(target.defaultPath || '')
  }

  const checkGithubUpdate = async () => {
    setUpdateBusy('check')
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch('/api/appliance/updates/check', {
        method: 'POST',
        body: JSON.stringify({
          target: updateTarget,
          repository: updateRepo,
          targetPath: updateTargetPath,
          includePrerelease,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Found ${data.version} for ${data.targetLabel || data.target || 'update'} from ${data.repository}.`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const importOfflineUpdate = async () => {
    setUpdateBusy('import')
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch('/api/appliance/updates/import', {
        method: 'POST',
        body: JSON.stringify({ manifest: updateManifest }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Imported update manifest for ${data.targetLabel || data.target || 'update'} ${data.version}.`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const importOfflineUpdatePackage = async () => {
    if (!updatePackage) return
    setUpdateBusy('import-package')
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('package', updatePackage)
      const resp = await fetch('/api/appliance/updates/import-package', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setUpdatePackage(null)
      setMessage(`Imported update package for ${data.targetLabel || data.target || 'update'} ${data.version}.`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const verifyUpdate = async (record: UpdateRecord) => {
    setUpdateBusy(`verify:${record.id}`)
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch(`/api/appliance/updates/${record.id}/verify`, { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`${record.version} marked verified.`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const stageUpdate = async (record: UpdateRecord) => {
    if (!confirm(`Stage ${record.targetLabel || record.target || 'update'} ${record.version}? This writes an appliance update request for host-side application.`)) return
    setUpdateBusy(`stage:${record.id}`)
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch(`/api/appliance/updates/${record.id}/stage`, { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Staged ${data.update.version}. Request path: ${data.update.requestPath}`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const markUpdateApplied = async (record: UpdateRecord) => {
    if (!confirm(`Mark ${record.version} as applied? Use this after the host-side update has completed and health checks pass.`)) return
    setUpdateBusy(`applied:${record.id}`)
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch(`/api/appliance/updates/${record.id}/applied`, { method: 'POST' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`${data.version} marked applied.`)
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const deleteUpdate = async (record: UpdateRecord) => {
    if (!confirm(`Delete update record for ${record.version}?`)) return
    setUpdateBusy(`delete:${record.id}`)
    setError('')
    setMessage('')
    try {
      const resp = await apiFetch(`/api/appliance/updates/${record.id}`, { method: 'DELETE' })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      await load()
    } finally {
      setUpdateBusy('')
    }
  }

  const loadReadiness = async () => {
    if (!selectedProfile) return
    setReadinessLoading(true)
    setError('')
    try {
      const resp = await apiFetch(`/api/nkp/profiles/${selectedProfile}/readiness`)
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setReadiness(data)
    } finally {
      setReadinessLoading(false)
    }
  }

  return (
    <Layout
      title="Appliance Operations"
      subtitle="Archive AHV artifacts, validate first boot, review NKP readiness, and track ZTF compatibility"
      actions={
        <button onClick={load} disabled={loading} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        {error && <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-200">{error}</div>}
        {message && <div className="rounded-lg border border-nutanix-teal/30 bg-nutanix-teal/10 px-4 py-3 text-sm text-nutanix-teal">{message}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
          <TabButton active={tab === 'artifacts'} icon={Archive} label="Artifacts" onClick={() => setTab('artifacts')} />
          <TabButton active={tab === 'updates'} icon={PackageCheck} label="Updates" onClick={() => setTab('updates')} />
          <TabButton active={tab === 'firstboot'} icon={Server} label="First Boot" onClick={() => setTab('firstboot')} />
          <TabButton active={tab === 'readiness'} icon={ShieldCheck} label="NKP Readiness" onClick={() => setTab('readiness')} />
          <TabButton active={tab === 'ztf'} icon={Layers} label="ZTF Modes" onClick={() => setTab('ztf')} />
        </div>

        {tab === 'artifacts' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Metric label="Total" value={summary?.total ?? 0} />
              <Metric label="Verified" value={summary?.verified ?? 0} tone="good" />
              <Metric label="Archived" value={summary?.archived ?? 0} tone="good" />
              <Metric label="Expiring" value={summary?.expiring ?? 0} tone="warn" />
              <Metric label="Expired" value={summary?.expired ?? 0} tone="bad" />
              <Metric label="Pending" value={summary?.pending ?? 0} />
            </div>

            <div className="card">
              <div className="mb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-100">Archive Coverage</h2>
                  <p className="text-sm text-gray-500 mt-1">Track whether each generated QCOW2 profile has been copied to durable storage and checksum-verified.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {archiveCoverage.map(item => (
                    <span key={item.profile} className={clsx('badge text-xs', item.done ? 'badge-green' : 'badge-yellow')}>
                      {item.profile}
                    </span>
                  ))}
                </div>
              </div>

              {canEdit && (
                <div className="grid grid-cols-1 xl:grid-cols-6 gap-3 border-t border-border pt-4">
                  <Field label="Profile">
                    <select className="input" value={form.profile} onChange={event => setForm(prev => ({ ...prev, profile: event.target.value }))}>
                      <option value="standard">standard</option>
                      <option value="airgap">airgap</option>
                      <option value="minimal">minimal</option>
                    </select>
                  </Field>
                  <Field label="Version">
                    <input className="input" value={form.version} onChange={event => setForm(prev => ({ ...prev, version: event.target.value }))} />
                  </Field>
                  <Field label="Archive Location">
                    <input className="input" value={form.archiveLocation} onChange={event => setForm(prev => ({ ...prev, archiveLocation: event.target.value }))} placeholder="Nutanix Files, SharePoint, object storage..." />
                  </Field>
                  <Field label="SHA-256">
                    <input className="input font-mono" value={form.checksum} onChange={event => setForm(prev => ({ ...prev, checksum: event.target.value }))} />
                  </Field>
                  <Field label="Expires At">
                    <input className="input" value={form.expiresAt} onChange={event => setForm(prev => ({ ...prev, expiresAt: event.target.value }))} placeholder="2026-09-18T14:22:19Z" />
                  </Field>
                  <div className="flex items-end">
                    <button onClick={createArtifact} disabled={saving || !form.version} className="btn-primary w-full gap-1.5">
                      {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {artifacts.map(record => (
                <div key={record.id} className="card">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-100">{record.profile} {record.version}</h3>
                        <span className={clsx('badge text-xs', statusBadge(record.status))}>{record.status}</span>
                        {record.verifiedAt && <span className="badge badge-green text-xs">verified</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500">
                        <span className="font-mono truncate">{record.archiveLocation || 'No archive location recorded'}</span>
                        <span>{record.expiresAt ? `Expires ${formatDate(record.expiresAt)}` : 'No expiry recorded'}</span>
                        <span>{formatBytes(record.sizeBytes || 0)}</span>
                        <span className="font-mono truncate">{record.checksumFile || record.artifactName || 'No artifact filename recorded'}</span>
                      </div>
                      {record.checksum && <p className="mt-2 font-mono text-xs text-gray-600 break-all">{record.checksum}</p>}
                      {record.notes && <p className="mt-3 text-sm text-gray-400">{record.notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit && <button onClick={() => verifyArtifact(record)} className="btn-secondary gap-1.5"><CheckCircle size={14} /> Verify</button>}
                      {isAdmin && <button onClick={() => deleteArtifact(record)} className="btn-danger gap-1.5"><Trash2 size={14} /> Delete</button>}
                    </div>
                  </div>
                </div>
              ))}
              {!artifacts.length && (
                <div className="empty-state py-12">
                  <Archive size={34} className="mx-auto mb-3 text-gray-700" />
                  <p className="text-sm font-medium text-gray-400">No appliance artifact archive records yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'updates' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Metric label="Current App Version" value={updateState?.current.version || APP_VERSION} />
              <Metric label="Tracked Updates" value={updateState?.updates.length ?? 0} />
              <Metric label="Staged" value={updateState?.staged?.version || 'none'} tone={updateState?.staged ? 'warn' : 'neutral'} />
              <Metric label="Request Path" value={updateState?.current.requestPath || 'not configured'} mono />
            </div>

            <div className="card">
              <div className="mb-4">
                <h2 className="font-semibold text-gray-100">Appliance Update Manager</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Discover release metadata for the appliance, ZeroTouch Framework, or NKP Framework, then stage a host-side update request.
                </p>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <div className="rounded-lg border border-border bg-gray-950/40 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-100">Connected Release Check</h3>
                    <p className="text-xs text-gray-500 mt-1">Fetches GitHub Release metadata only. It does not download or execute release code.</p>
                  </div>
                  <Field label="Update Target">
                    <select className="input" value={updateTarget} onChange={event => selectUpdateTarget(event.target.value)} disabled={!canEdit}>
                      {updateTargets.map(target => (
                        <option key={target.id} value={target.id}>{target.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Repository">
                    <input className="input font-mono" value={updateRepo} onChange={event => setUpdateRepo(event.target.value)} disabled={!canEdit} />
                  </Field>
                  {frameworkUpdateSelected && (
                    <Field label="Target Path">
                      <input className="input font-mono" value={updateTargetPath} onChange={event => setUpdateTargetPath(event.target.value)} disabled={!canEdit} placeholder={selectedUpdateTarget?.defaultPath || '/opt/zerotouch-framework'} />
                    </Field>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={includePrerelease} onChange={event => setIncludePrerelease(event.target.checked)} disabled={!canEdit} />
                    Include prereleases
                  </label>
                  <button onClick={checkGithubUpdate} disabled={!canEdit || updateBusy === 'check'} className="btn-secondary gap-1.5">
                    {updateBusy === 'check' ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Check GitHub
                  </button>
                  <p className="text-xs text-gray-500">
                    Allowed repositories: {(updateState?.allowedRepositories || ['virtuarchitect/ztf-orchestrator']).join(', ')}
                  </p>
                  {frameworkUpdateSelected && (
                    <p className="text-xs text-gray-500">
                      Framework targets update a host-visible git checkout at the target path; baked framework copies require an appliance rebuild.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-gray-950/40 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-100">Offline Manifest Import</h3>
                    <p className="text-xs text-gray-500 mt-1">Paste reviewed metadata or import a zip package with manifest.json and checksum-verified artifacts.</p>
                  </div>
                  <textarea
                    className="input min-h-40 font-mono text-xs resize-y"
                    value={updateManifest}
                    onChange={event => setUpdateManifest(event.target.value)}
                    disabled={!canEdit}
                  />
                  <button onClick={importOfflineUpdate} disabled={!canEdit || updateBusy === 'import'} className="btn-secondary gap-1.5">
                    {updateBusy === 'import' ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
                    Import Manifest
                  </button>
                  <div className="border-t border-border pt-3 space-y-3">
                    <Field label="Offline Update Package">
                      <input
                        className="input file:mr-3 file:rounded file:border-0 file:bg-gray-800 file:px-3 file:py-1.5 file:text-sm file:text-gray-200"
                        type="file"
                        accept=".zip,application/zip"
                        disabled={!canEdit}
                        onChange={event => setUpdatePackage(event.target.files?.[0] || null)}
                      />
                    </Field>
                    <button onClick={importOfflineUpdatePackage} disabled={!canEdit || !updatePackage || updateBusy === 'import-package'} className="btn-primary gap-1.5">
                      {updateBusy === 'import-package' ? <Loader size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                      Import Package
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {(updateState?.updates || []).map(record => (
                <div key={record.id} className="card">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-100">{record.name || record.version}</h3>
                        <span className="badge badge-gray text-xs">{record.targetLabel || record.target || 'ZTF-Orchestrator'}</span>
                        <span className={clsx('badge text-xs', updateStatusBadge(record.status))}>{record.status}</span>
                        <span className="badge badge-gray text-xs">{record.source}</span>
                        {record.prerelease && <span className="badge badge-yellow text-xs">prerelease</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-500">
                        <span className="font-mono truncate">{record.containerImage || record.targetPath || 'No target path recorded'}</span>
                        <span className="font-mono truncate">{record.repository}</span>
                        <span>{record.publishedAt ? `Published ${formatDate(record.publishedAt)}` : 'No publish date recorded'}</span>
                        <span>{record.stagedAt ? `Staged ${formatDate(record.stagedAt)}` : record.verifiedAt ? `Verified ${formatDate(record.verifiedAt)}` : 'Not verified'}</span>
                      </div>
                      {record.targetPath && <p className="mt-2 text-xs text-gray-500">Framework path: <span className="font-mono">{record.targetPath}</span></p>}
                      {record.imageTarPath && <p className="mt-2 text-xs text-gray-500">Container image tar: <span className="font-mono break-all">{record.imageTarPath}</span></p>}
                      {record.frameworkArchivePath && <p className="mt-2 text-xs text-gray-500">Framework archive: <span className="font-mono break-all">{record.frameworkArchivePath}</span></p>}
                      {record.manifestSha256 && <p className="mt-2 font-mono text-xs text-gray-600 break-all">manifest {record.manifestSha256}</p>}
                      {record.checksum && <p className="mt-1 font-mono text-xs text-gray-600 break-all">checksum {record.checksum}</p>}
                      {record.requestPath && <p className="mt-2 text-xs text-gray-500">Host update request: <span className="font-mono">{record.requestPath}</span></p>}
                      {record.notes && <p className="mt-3 text-sm text-gray-400">{record.notes}</p>}
                      {!!record.assets?.length && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.assets.slice(0, 4).map(asset => (
                            <span key={`${record.id}-${asset.name}`} className="badge badge-gray text-xs">{asset.name || formatBytes(asset.size)}</span>
                          ))}
                        </div>
                      )}
                      {!!record.packageArtifacts?.length && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {record.packageArtifacts.slice(0, 4).map(artifact => (
                            <span key={`${record.id}-${artifact.relativePath || artifact.path}`} className="badge badge-blue text-xs">
                              {artifact.name || artifact.relativePath || artifact.type} {formatBytes(artifact.sizeBytes || 0)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {record.releaseUrl && (
                        <a href={record.releaseUrl} target="_blank" rel="noreferrer" className="btn-secondary gap-1.5">
                          <ExternalLink size={14} /> Release
                        </a>
                      )}
                      {canEdit && !record.verifiedAt && (
                        <button onClick={() => verifyUpdate(record)} disabled={updateBusy === `verify:${record.id}`} className="btn-secondary gap-1.5">
                          {updateBusy === `verify:${record.id}` ? <Loader size={14} className="animate-spin" /> : <FileCheck size={14} />}
                          Verify
                        </button>
                      )}
                      {isAdmin && record.verifiedAt && !record.stagedAt && (
                        <button onClick={() => stageUpdate(record)} disabled={updateBusy === `stage:${record.id}`} className="btn-primary gap-1.5">
                          {updateBusy === `stage:${record.id}` ? <Loader size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                          Stage
                        </button>
                      )}
                      {isAdmin && record.stagedAt && !record.appliedAt && (
                        <button onClick={() => markUpdateApplied(record)} disabled={updateBusy === `applied:${record.id}`} className="btn-secondary gap-1.5">
                          {updateBusy === `applied:${record.id}` ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                          Mark Applied
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => deleteUpdate(record)} disabled={updateBusy === `delete:${record.id}`} className="btn-danger gap-1.5">
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!updateState?.updates.length && (
                <div className="empty-state py-12">
                  <PackageCheck size={34} className="mx-auto mb-3 text-gray-700" />
                  <p className="text-sm font-medium text-gray-400">No appliance update records yet</p>
                  <p className="text-xs text-gray-600 mt-1">Check GitHub or import an offline manifest to begin.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'firstboot' && (
          <div className="card">
            <div className="mb-4">
              <h2 className="font-semibold text-gray-100">First-Boot Appliance Status</h2>
              <p className="text-sm text-gray-500 mt-1">Confirms whether expected appliance paths and preload mounts are present on this host.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {appliance?.checks.map(check => (
                <CheckRow key={check.name} label={check.name} ok={check.ok} value={check.value} />
              ))}
            </div>
            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(appliance?.containerPaths || {}).map(([key, value]) => (
                <Metric key={key} label={key} value={value} mono />
              ))}
            </div>
          </div>
        )}

        {tab === 'readiness' && (
          <div className="card">
            <div className="mb-4 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-100">NKP Deployment Readiness</h2>
                <p className="text-sm text-gray-500 mt-1">Guided profile checklist for binary, registry, proxy, Prism, DNS/NTP, SSH, and image-builder readiness signals.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select className="input min-w-64" value={selectedProfile} onChange={event => setSelectedProfile(event.target.value)}>
                  <option value="">Select NKP profile</option>
                  {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
                <button onClick={loadReadiness} disabled={!selectedProfile || readinessLoading} className="btn-primary gap-1.5">
                  {readinessLoading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Check
                </button>
              </div>
            </div>
            {readiness ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Metric label="Status" value={readiness.status} tone={readiness.status === 'ready' ? 'good' : readiness.status === 'blocked' ? 'bad' : 'warn'} />
                  <Metric label="Score" value={`${readiness.score}%`} />
                  <Metric label="Checks" value={readiness.checks.length} />
                </div>
                {readiness.checks.map(check => (
                  <CheckRow key={check.id} label={check.label} ok={check.status === 'pass'} warn={check.status === 'warn'} value={check.message} />
                ))}
              </div>
            ) : (
              <div className="empty-state py-12">
                <ShieldCheck size={34} className="mx-auto mb-3 text-gray-700" />
                <p className="text-sm font-medium text-gray-400">Select a profile and run the readiness checklist</p>
              </div>
            )}
          </div>
        )}

        {tab === 'ztf' && (
          <div className="card">
            <div className="mb-5">
              <h2 className="font-semibold text-gray-100">ZeroTouch Framework Compatibility</h2>
              <p className="text-sm text-gray-500 mt-1">{ztf?.message || 'Compatibility status unavailable.'}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <Metric label="Layout" value={ztf?.layout || 'unknown'} />
              <Metric label="Required Ref" value={ztf?.requiredRef || 'unknown'} />
              <Metric label="Current Mode" value={ztf?.compatible ? 'legacy ready' : 'blocked'} tone={ztf?.compatible ? 'good' : 'bad'} />
            </div>
            <div className="space-y-3">
              {ztf?.supportedModes.map(mode => (
                <CheckRow key={mode.id} label={mode.label} ok={mode.available} warn={!mode.available && mode.id === 'ztf2-iac'} value={mode.description} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Archive; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx('rounded-lg border px-4 py-3 text-left transition-colors', active ? 'border-nutanix-cyan bg-nutanix-blue/20 text-white' : 'border-border bg-surface text-gray-400 hover:text-gray-200')}>
      <div className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} />{label}</div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}

function Metric({ label, value, tone = 'neutral', mono = false }: { label: string; value: string | number; tone?: 'neutral' | 'good' | 'warn' | 'bad'; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-gray-950/40 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
      <p className={clsx('mt-1 truncate text-sm font-semibold', mono && 'font-mono', tone === 'good' ? 'text-nutanix-teal' : tone === 'warn' ? 'text-yellow-400' : tone === 'bad' ? 'text-red-400' : 'text-gray-100')}>{value}</p>
    </div>
  )
}

function CheckRow({ label, ok, warn = false, value }: { label: string; ok: boolean; warn?: boolean; value: string }) {
  const Icon = ok ? CheckCircle : warn ? Clock : XCircle
  return (
    <div className="rounded-lg border border-border bg-gray-950/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <Icon size={16} className={clsx('mt-0.5 flex-shrink-0', ok ? 'text-nutanix-teal' : warn ? 'text-yellow-400' : 'text-red-400')} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-100">{label}</p>
          <p className="mt-1 text-xs text-gray-500 break-words">{value}</p>
        </div>
      </div>
    </div>
  )
}

function statusBadge(status: string) {
  if (status === 'verified' || status === 'archived') return 'badge-green'
  if (status === 'expiring') return 'badge-yellow'
  if (status === 'expired') return 'badge-red'
  return 'badge-gray'
}

function updateStatusBadge(status: string) {
  if (status === 'applied') return 'badge-green'
  if (status === 'staged') return 'badge-yellow'
  if (status === 'verified') return 'badge-blue'
  if (status === 'available' || status === 'imported') return 'badge-purple'
  return 'badge-gray'
}

function formatDate(value?: string) {
  if (!value) return 'not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatBytes(value: number) {
  if (!value) return 'size not recorded'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}
