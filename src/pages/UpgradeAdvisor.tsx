import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, CheckCircle, Download, ExternalLink, FileSearch, HelpCircle,
  Loader, Plus, RefreshCw, ShieldAlert, ShieldCheck, ScrollText, Trash2
} from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch } from '../utils/api'
import { useStore } from '../store'
import type {
  UpgradeAdvisorAssessment,
  UpgradeAdvisorFinding,
  UpgradeAdvisorRules,
  UpgradeAdvisorSourcePack,
  UpgradeAdvisorStatus,
} from '../types'
import clsx from 'clsx'

const COMPONENTS = [
  { key: 'aos', label: 'AOS' },
  { key: 'ahv', label: 'AHV' },
  { key: 'prismCentral', label: 'Prism Central' },
  { key: 'ncc', label: 'NCC' },
  { key: 'lcm', label: 'LCM' },
  { key: 'foundation', label: 'Foundation' },
  { key: 'firmware', label: 'Firmware' },
]

const STATUS_BADGE: Record<UpgradeAdvisorStatus, string> = {
  blocked: 'badge-red',
  warning: 'badge-yellow',
  review: 'badge-blue',
  unknown: 'badge-purple',
  clear: 'badge-green',
}

const STATUS_COPY: Record<UpgradeAdvisorStatus, string> = {
  blocked: 'Blocked',
  warning: 'Warning',
  review: 'Review',
  unknown: 'Unknown',
  clear: 'Clear',
}

type VersionMap = Record<string, string>

export default function UpgradeAdvisor() {
  const user = useStore(s => s.user)
  const canManagePacks = user?.role === 'admin' || user?.role === 'operator'
  const canDeletePacks = user?.role === 'admin'
  const [rules, setRules] = useState<UpgradeAdvisorRules | null>(null)
  const [sourcePacks, setSourcePacks] = useState<UpgradeAdvisorSourcePack[]>([])
  const [clusterName, setClusterName] = useState('Lab Cluster')
  const [current, setCurrent] = useState<VersionMap>({ aos: '6.8.1', ahv: '20230302.101026' })
  const [targets, setTargets] = useState<VersionMap>({ aos: '7.3.1' })
  const [features, setFeatures] = useState('')
  const [edition, setEdition] = useState<'enterprise' | 'community'>('enterprise')
  const [darkSite, setDarkSite] = useState(false)
  const [evidence, setEvidence] = useState({
    lcmPrecheck: '',
    releaseNotesReviewed: false,
    compatibilityReviewed: false,
    prismCentralVersionCaptured: false,
    darkSiteBundleReviewed: false,
  })
  const [assessment, setAssessment] = useState<UpgradeAdvisorAssessment | null>(null)
  const [assessmentInput, setAssessmentInput] = useState<Record<string, unknown> | null>(null)
  const [sourcePackName, setSourcePackName] = useState('')
  const [sourcePackType, setSourcePackType] = useState('kb-summary')
  const [sourcePackContent, setSourcePackContent] = useState(sourcePackTemplate())
  const [loadingRules, setLoadingRules] = useState(true)
  const [importingPack, setImportingPack] = useState(false)
  const [assessing, setAssessing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [packError, setPackError] = useState('')

  const loadRules = async () => {
    setLoadingRules(true)
    setError('')
    try {
      const [rulesResp, packsResp] = await Promise.all([
        apiFetch('/api/upgrade-advisor/rules'),
        apiFetch('/api/upgrade-advisor/source-packs'),
      ])
      const rulesData = await rulesResp.json().catch(() => ({}))
      const packsData = await packsResp.json().catch(() => ({}))
      if (!rulesResp.ok) setError(rulesData.error || `Server returned ${rulesResp.status}`)
      else setRules(rulesData)
      if (packsResp.ok) setSourcePacks(packsData.sourcePacks || [])
    } finally {
      setLoadingRules(false)
    }
  }

  useEffect(() => { loadRules() }, [])

  const targetCount = useMemo(
    () => Object.values(targets).filter(value => value.trim()).length,
    [targets]
  )

  const runAssessment = async () => {
    if (targetCount === 0) {
      setError('Enter at least one target version.')
      return
    }
    setAssessing(true)
    setError('')
    try {
      const input = {
        inventory: {
          clusterName,
          components: trimMap(current),
        },
        targets: trimMap(targets),
        evidence: {
          ...evidence,
          lcmPrecheck: evidence.lcmPrecheck || undefined,
        },
        context: {
          edition,
          darkSite,
          features,
        },
      }
      const resp = await apiFetch('/api/upgrade-advisor/assess', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(data.error || `Server returned ${resp.status}`)
        return
      }
      setAssessment(data)
      setAssessmentInput(input)
    } finally {
      setAssessing(false)
    }
  }

  const importSourcePack = async () => {
    setImportingPack(true)
    setPackError('')
    try {
      const resp = await apiFetch('/api/upgrade-advisor/source-packs', {
        method: 'POST',
        body: JSON.stringify({
          name: sourcePackName || undefined,
          sourceType: sourcePackType,
          content: sourcePackContent,
          enabled: true,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setPackError(data.error || `Server returned ${resp.status}`)
        return
      }
      setSourcePackName('')
      setSourcePackContent(sourcePackTemplate())
      await loadRules()
    } finally {
      setImportingPack(false)
    }
  }

  const toggleSourcePack = async (pack: UpgradeAdvisorSourcePack) => {
    const resp = await apiFetch(`/api/upgrade-advisor/source-packs/${pack.id}`, {
      method: 'PUT',
      body: JSON.stringify({ enabled: !pack.enabled }),
    })
    if (resp.ok) await loadRules()
  }

  const deleteSourcePack = async (pack: UpgradeAdvisorSourcePack) => {
    if (!confirm(`Delete source pack "${pack.name}"? This removes its curated rules from future assessments.`)) return
    setPackError('')
    const resp = await apiFetch(`/api/upgrade-advisor/source-packs/${pack.id}`, { method: 'DELETE' })
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      setPackError(data.error || `Server returned ${resp.status}`)
      return
    }
    await loadRules()
  }

  const exportAssessment = async () => {
    if (!assessmentInput && !assessment) return
    setExporting(true)
    setError('')
    try {
      const resp = await apiFetch('/api/upgrade-advisor/export', {
        method: 'POST',
        body: JSON.stringify(assessmentInput ? { assessmentInput } : { assessment }),
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
      link.download = `ztf-upgrade-advisor-${assessment?.id || 'assessment'}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout
      title="Upgrade Advisor"
      subtitle="Read-only Nutanix upgrade risk assessment with evidence-backed findings"
      actions={
        <button onClick={loadRules} disabled={loadingRules} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loadingRules ? 'animate-spin' : ''} />
          Refresh Rules
        </button>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <div className="space-y-6">
          <div className="card">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-700/30 bg-cyan-950/30">
                <ShieldAlert size={17} className="text-cyan-300" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-100">Assessment Inputs</h3>
                <p className="text-xs text-gray-500">Manual MVP, no cluster mutation</p>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="label">Cluster Name</span>
                <input className="input" value={clusterName} onChange={event => setClusterName(event.target.value)} />
              </label>

              <VersionGrid title="Current Versions" values={current} onChange={setCurrent} />
              <VersionGrid title="Target Versions" values={targets} onChange={setTargets} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Edition</span>
                  <select className="input" value={edition} onChange={event => setEdition(event.target.value as 'enterprise' | 'community')}>
                    <option value="enterprise">Enterprise</option>
                    <option value="community">Community</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-3 mt-6">
                  <input type="checkbox" checked={darkSite} onChange={event => setDarkSite(event.target.checked)} />
                  <span className="text-sm font-medium text-gray-200">Dark-site upgrade</span>
                </label>
              </div>

              <label className="block">
                <span className="label">Features / Workload Signals</span>
                <input
                  className="input"
                  value={features}
                  onChange={event => setFeatures(event.target.value)}
                  placeholder="Flow, Files, Objects, Metro, Commvault VSA..."
                />
              </label>

              <EvidenceChecklist evidence={evidence} setEvidence={setEvidence} darkSite={darkSite} />

              {error && (
                <div className="rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button onClick={runAssessment} disabled={assessing || targetCount === 0} className="btn-primary w-full justify-center gap-1.5">
                {assessing ? <Loader size={14} className="animate-spin" /> : <FileSearch size={14} />}
                {assessing ? 'Assessing...' : 'Run Assessment'}
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-100">Implementation Phases</h3>
            <div className="mt-4 space-y-3">
              {(rules?.phases || []).map(phase => (
                <div key={phase.id} className="rounded-lg border border-border bg-gray-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-gray-200">{phase.name}</span>
                    <span className={clsx('badge text-xs', phase.status === 'implemented' ? 'badge-green' : 'badge-blue')}>
                      {phase.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{phase.outcome}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <ScrollText size={16} className="text-nutanix-cyan" />
              <h3 className="font-semibold text-gray-100">Data Sources</h3>
            </div>
            <div className="space-y-3 text-sm text-gray-400">
              <SourceRow label="Current MVP" value="Manual inventory, operator evidence flags, and bundled ZTF rules." />
              <SourceRow label="Curated source packs" value={`${sourcePacks.filter(pack => pack.enabled).length} active / ${sourcePacks.length} total`} />
              <SourceRow label="Planned collectors" value="Prism Element, Prism Central, LCM inventory, LCM prechecks, NCC output, and compatibility metadata." />
            </div>
          </div>

          <div className="card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-100">Source Packs</h3>
              <span className="badge badge-blue">{rules?.sourcePacks?.reduce((total, pack) => total + pack.ruleCount, 0) || 0} active rules</span>
            </div>
            <div className="space-y-3">
              {sourcePacks.length === 0 ? (
                <p className="text-sm text-gray-500">No curated source packs imported.</p>
              ) : sourcePacks.map(pack => (
                <div key={pack.id} className="rounded-lg border border-border bg-gray-950/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-200">{pack.name}</span>
                        <span className={clsx('badge text-xs', pack.enabled ? 'badge-green' : 'badge-gray')}>{pack.enabled ? 'enabled' : 'disabled'}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {pack.version} / {pack.sourceType} / {pack.rules.length} rule{pack.rules.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => toggleSourcePack(pack)} disabled={!canManagePacks} className="btn-secondary text-xs">
                        {pack.enabled ? 'Disable' : 'Enable'}
                      </button>
                      {canDeletePacks && (
                        <button onClick={() => deleteSourcePack(pack)} className="btn-danger text-xs gap-1.5">
                          <Trash2 size={12} />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {canManagePacks && (
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Pack Name</span>
                    <input className="input" value={sourcePackName} onChange={event => setSourcePackName(event.target.value)} placeholder="Customer KB review" />
                  </label>
                  <label className="block">
                    <span className="label">Source Type</span>
                    <select className="input" value={sourcePackType} onChange={event => setSourcePackType(event.target.value)}>
                      <option value="kb-summary">KB summary</option>
                      <option value="release-notes">Release notes</option>
                      <option value="support-case">Support case</option>
                      <option value="lab-finding">Lab finding</option>
                      <option value="internal-standard">Internal standard</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="label">YAML / JSON Pack</span>
                  <textarea className="input min-h-56 font-mono text-xs" value={sourcePackContent} onChange={event => setSourcePackContent(event.target.value)} />
                </label>
                {packError && <div className="rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2 text-sm text-red-200">{packError}</div>}
                <button onClick={importSourcePack} disabled={importingPack || !sourcePackContent.trim()} className="btn-primary w-full justify-center gap-1.5">
                  {importingPack ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                  Import Source Pack
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          {assessment ? (
            <>
              <div className={clsx(
                'rounded-lg border p-5',
                assessment.status === 'clear' ? 'border-emerald-700/30 bg-emerald-950/10' :
                assessment.status === 'warning' ? 'border-amber-700/30 bg-amber-950/10' :
                assessment.status === 'blocked' ? 'border-red-700/40 bg-red-950/20' :
                'border-blue-700/30 bg-blue-950/10'
              )}>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusIcon status={assessment.status} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-gray-100">{STATUS_COPY[assessment.status]} Assessment</h2>
                    <p className="text-sm text-gray-500">
                      Rules {assessment.rulesVersion} / generated {new Date(assessment.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={clsx('badge capitalize', STATUS_BADGE[assessment.status])}>{assessment.status}</span>
                  <span className="badge badge-green">read-only</span>
                  <button onClick={exportAssessment} disabled={exporting} className="btn-secondary gap-1.5">
                    {exporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                    Export
                  </button>
                </div>
                <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Metric label="Blocked" value={assessment.summary.blocked || 0} tone="text-red-300" />
                  <Metric label="Warnings" value={assessment.summary.warning || 0} tone="text-yellow-300" />
                  <Metric label="Review" value={assessment.summary.review || 0} tone="text-blue-300" />
                  <Metric label="Unknown" value={assessment.summary.unknown || 0} tone="text-purple-300" />
                  <Metric label="Clear" value={assessment.summary.clear || 0} tone="text-nutanix-teal" />
                </div>
              </div>

              <div className="space-y-3">
                {assessment.findings.map(finding => <FindingCard key={finding.id} finding={finding} />)}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <ShieldCheck size={42} className="mx-auto mb-3 opacity-25 text-nutanix-cyan" />
              <p className="font-medium text-gray-400">No upgrade assessment yet</p>
              <p className="mt-1 text-sm text-gray-600">Enter target versions and run the read-only advisor.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function VersionGrid({ title, values, onChange }: { title: string; values: VersionMap; onChange: (values: VersionMap) => void }) {
  return (
    <div>
      <div className="label">{title}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {COMPONENTS.map(component => (
          <label key={component.key} className="block">
            <span className="mb-1 block text-xs text-gray-600">{component.label}</span>
            <input
              className="input"
              value={values[component.key] || ''}
              onChange={event => onChange({ ...values, [component.key]: event.target.value })}
              placeholder="version"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function EvidenceChecklist({
  evidence,
  setEvidence,
  darkSite,
}: {
  evidence: {
    lcmPrecheck: string
    releaseNotesReviewed: boolean
    compatibilityReviewed: boolean
    prismCentralVersionCaptured: boolean
    darkSiteBundleReviewed: boolean
  }
  setEvidence: (value: {
    lcmPrecheck: string
    releaseNotesReviewed: boolean
    compatibilityReviewed: boolean
    prismCentralVersionCaptured: boolean
    darkSiteBundleReviewed: boolean
  }) => void
  darkSite: boolean
}) {
  return (
    <div>
      <div className="label">Evidence</div>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-600">LCM Precheck</span>
          <select className="input" value={evidence.lcmPrecheck} onChange={event => setEvidence({ ...evidence, lcmPrecheck: event.target.value })}>
            <option value="">Not captured</option>
            <option value="passed">Passed</option>
            <option value="warning">Warnings</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <Checkbox label="Release notes reviewed" checked={evidence.releaseNotesReviewed} onChange={value => setEvidence({ ...evidence, releaseNotesReviewed: value })} />
        <Checkbox label="Compatibility matrix reviewed" checked={evidence.compatibilityReviewed} onChange={value => setEvidence({ ...evidence, compatibilityReviewed: value })} />
        <Checkbox label="Prism Central version captured" checked={evidence.prismCentralVersionCaptured} onChange={value => setEvidence({ ...evidence, prismCentralVersionCaptured: value })} />
        {darkSite && (
          <Checkbox label="Dark-site bundle reviewed" checked={evidence.darkSiteBundleReviewed} onChange={value => setEvidence({ ...evidence, darkSiteBundleReviewed: value })} />
        )}
      </div>
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-border bg-gray-950/40 px-3 py-2">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span className="text-sm text-gray-300">{label}</span>
    </label>
  )
}

function FindingCard({ finding }: { finding: UpgradeAdvisorFinding }) {
  return (
    <div className="card">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIcon status={finding.status} />
            <h3 className="font-semibold text-gray-100">{finding.title}</h3>
            <span className={clsx('badge text-xs', STATUS_BADGE[finding.status])}>{finding.status}</span>
            <span className="badge badge-purple text-xs">{finding.severity}</span>
            <span className="badge badge-blue text-xs">{finding.component}</span>
          </div>
          <p className="mt-3 text-sm text-gray-400">{finding.message}</p>
          <p className="mt-2 text-sm text-gray-300">{finding.guidance}</p>
          {(finding.sourceVersion || finding.targetVersion) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
              {finding.sourceVersion && <span className="font-mono">current {finding.sourceVersion}</span>}
              {finding.targetVersion && <span className="font-mono">target {finding.targetVersion}</span>}
            </div>
          )}
          {finding.evidence.length > 0 && (
            <div className="mt-3 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-gray-950 text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Evidence</th>
                    <th className="px-3 py-2 text-left font-medium">Expected</th>
                    <th className="px-3 py-2 text-left font-medium">Observed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {finding.evidence.map(item => (
                    <tr key={item.key}>
                      <td className="px-3 py-2 font-mono text-gray-400">{item.key}</td>
                      <td className="px-3 py-2 text-gray-500">{formatValue(item.expected)}</td>
                      <td className="px-3 py-2 text-gray-500">{formatValue(item.observed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {finding.source?.url && (
          <a href={finding.source.url} target="_blank" rel="noreferrer" className="btn-secondary gap-1.5 md:flex-shrink-0">
            <ExternalLink size={14} />
            Source
          </a>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-gray-950/50 p-3">
      <p className={clsx('text-xl font-bold', tone)}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-gray-950/40 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</div>
      <div className="mt-1 text-gray-300">{value}</div>
    </div>
  )
}

function StatusIcon({ status }: { status: UpgradeAdvisorStatus }) {
  if (status === 'clear') return <CheckCircle size={18} className="flex-shrink-0 text-nutanix-teal" />
  if (status === 'blocked' || status === 'warning') return <AlertTriangle size={18} className="flex-shrink-0 text-yellow-300" />
  if (status === 'review') return <FileSearch size={18} className="flex-shrink-0 text-blue-300" />
  return <HelpCircle size={18} className="flex-shrink-0 text-purple-300" />
}

function trimMap(values: VersionMap) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]))
}

function formatValue(value: unknown) {
  if (value === undefined) return 'not captured'
  if (value === null) return 'null'
  if (typeof value === 'string') return value || 'not captured'
  return JSON.stringify(value)
}

function sourcePackTemplate() {
  return `name: Customer Upgrade Advisory Pack
version: 2026.08.customer
description: Curated customer-owned release-note, KB, advisory, or support-case findings.
rules:
  - id: customer-aos-target-review
    title: Customer advisory review required for this AOS target
    status: review
    severity: high
    match:
      targetComponents: [aos]
      component: aos
      targetVersion: ">=7.5.0,<7.6.0"
    message: Customer-owned advisory notes require an explicit review for this target train.
    guidance: Confirm the advisory disposition in the change record before approving the maintenance window.
    source:
      label: Customer advisory summary
      url: ""`
}
