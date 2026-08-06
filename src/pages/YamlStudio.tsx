import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode,
  Save,
  Search,
  ShieldCheck,
  Wand2,
} from 'lucide-react'
import clsx from 'clsx'
import Layout from '../components/Layout'
import ScriptConfigWizard from '../components/ScriptConfigWizard'
import YamlPreview from '../components/YamlPreview'
import { SCRIPTS } from '../data'
import { SCRIPT_CONFIG_SCHEMAS } from '../scriptConfigSchemas'
import { apiFetch } from '../utils/api'
import { toYaml } from '../utils/yaml'

type StudioKind = 'cluster-baseline' | 'workflow-config' | 'global-config' | 'upgrade-rule-pack'

interface ValidationResult {
  kind: StudioKind | string
  valid: boolean
  errors: string[]
  warnings: string[]
  rootType?: string
}

interface BaselineValues {
  clusterIp: string
  clusterName: string
  peCredential: string
  dnsServers: string
  ntpServers: string
  enablePulse: boolean
  haReservation: boolean
  eulaUsername: string
  eulaCompany: string
  eulaJobTitle: string
  containerName: string
  replicationFactor: number
  compression: boolean
  dedup: boolean
  subnetName: string
  vlanId: number
  networkIp: string
  prefix: number
  gateway: string
  ipPools: string
}

const BASELINE_DEFAULTS: BaselineValues = {
  clusterIp: '10.20.30.200',
  clusterName: 'DEV_LAB',
  peCredential: 'pe_user',
  dnsServers: '10.20.30.10\n10.20.30.11',
  ntpServers: '0.pool.ntp.org\n1.pool.ntp.org',
  enablePulse: true,
  haReservation: false,
  eulaUsername: '',
  eulaCompany: '',
  eulaJobTitle: '',
  containerName: 'ztf-container',
  replicationFactor: 1,
  compression: false,
  dedup: false,
  subnetName: 'vlan-30',
  vlanId: 30,
  networkIp: '',
  prefix: 24,
  gateway: '',
  ipPools: '',
}

const tabs: Array<{ id: StudioKind; label: string }> = [
  { id: 'cluster-baseline', label: 'Cluster Baseline' },
  { id: 'workflow-config', label: 'Workflow YAML' },
  { id: 'global-config', label: 'Global Config' },
  { id: 'upgrade-rule-pack', label: 'Upgrade Rules' },
]

function list(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
}

function buildBaselineYaml(values: BaselineValues): string {
  const cluster: Record<string, unknown> = {
    ...(values.clusterName.trim() ? { name: values.clusterName.trim() } : {}),
    ...(values.peCredential.trim() ? { pe_credential: values.peCredential.trim() } : {}),
    ...(list(values.dnsServers).length ? { name_servers_list: list(values.dnsServers) } : {}),
    ...(list(values.ntpServers).length ? { ntp_servers_list: list(values.ntpServers) } : {}),
    pulse: values.enablePulse,
    ha_reservation: values.haReservation,
  }

  if (values.eulaUsername.trim()) {
    cluster.eula = {
      username: values.eulaUsername.trim(),
      company_name: values.eulaCompany.trim(),
      job_title: values.eulaJobTitle.trim(),
    }
  }

  if (values.containerName.trim()) {
    cluster.storage_containers = [{
      name: values.containerName.trim(),
      replication_factor: values.replicationFactor,
      compression: values.compression,
      dedup: values.dedup,
    }]
  }

  if (values.subnetName.trim()) {
    cluster.networks = [{
      name: values.subnetName.trim(),
      vlan_id: values.vlanId,
      ...(values.networkIp.trim() ? { network_ip: values.networkIp.trim() } : {}),
      ...(values.prefix ? { prefix: values.prefix } : {}),
      ...(values.gateway.trim() ? { default_gateway_ip: values.gateway.trim() } : {}),
      ...(list(values.ipPools).length ? { ip_pools: list(values.ipPools).map(range => ({ range })) } : {}),
    }]
  }

  return toYaml({
    clusters: {
      [values.clusterIp.trim() || 'cluster-ip-required']: cluster,
    },
  })
}

function exampleFor(kind: StudioKind): string {
  if (kind === 'global-config') {
    return toYaml({
      vault_to_use: 'local',
      ip_allocation_method: 'static',
      vaults: {
        local: {
          credentials: {
            pe_user: {
              username: 'admin',
              password: '<store-local-secret>',
            },
          },
        },
      },
    })
  }
  if (kind === 'upgrade-rule-pack') {
    return toYaml({
      name: 'Customer Upgrade Advisory Pack',
      version: '2026.08.customer',
      rules: [{
        id: 'customer-aos-target-review',
        title: 'Customer advisory review required',
        status: 'review',
        severity: 'high',
        match: {
          targetComponents: ['aos'],
          component: 'aos',
        },
        message: 'Customer-owned advisory notes require explicit review for this target.',
        guidance: 'Confirm advisory disposition in the change record before approving the window.',
        source: {
          label: 'Customer advisory summary',
          url: '',
        },
      }],
    })
  }
  return ''
}

export default function YamlStudio() {
  const [activeTab, setActiveTab] = useState<StudioKind>('cluster-baseline')
  const [baseline, setBaseline] = useState<BaselineValues>(BASELINE_DEFAULTS)
  const [scriptQuery, setScriptQuery] = useState('')
  const [selectedScriptId, setSelectedScriptId] = useState('AddNtpServersPe')
  const [yamlContent, setYamlContent] = useState(() => buildBaselineYaml(BASELINE_DEFAULTS))
  const [filename, setFilename] = useState('cluster-baseline.yaml')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'validate' | 'save' | 'export' | null>(null)

  const workflowScripts = useMemo(() => {
    const query = scriptQuery.trim().toLowerCase()
    return SCRIPTS
      .filter(script => SCRIPT_CONFIG_SCHEMAS[script.id])
      .filter(script => !query || `${script.name} ${script.id} ${script.category}`.toLowerCase().includes(query))
  }, [scriptQuery])

  const switchTab = (tab: StudioKind) => {
    setActiveTab(tab)
    setValidation(null)
    setMessage('')
    if (tab === 'cluster-baseline') {
      setYamlContent(buildBaselineYaml(baseline))
      setFilename('cluster-baseline.yaml')
    } else if (tab === 'workflow-config') {
      setFilename(`${selectedScriptId || 'workflow-config'}.yaml`)
      setYamlContent('')
    } else {
      setFilename(tab === 'global-config' ? 'global.yml' : 'upgrade-advisory-pack.yaml')
      setYamlContent(exampleFor(tab))
    }
  }

  const updateBaseline = (patch: Partial<BaselineValues>) => {
    const next = { ...baseline, ...patch }
    setBaseline(next)
    setYamlContent(buildBaselineYaml(next))
    setValidation(null)
    setMessage('')
  }

  const validate = async () => {
    setBusy('validate')
    setMessage('')
    try {
      const resp = await apiFetch('/api/yaml-studio/validate', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, content: yamlContent }),
      })
      const data = await resp.json()
      setValidation(data)
      setMessage(resp.ok ? 'Validation passed.' : 'Validation needs attention.')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setMessage('')
    try {
      const resp = await apiFetch('/api/yaml-studio/save', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, filename, content: yamlContent }),
      })
      const data = await resp.json()
      setValidation(data.validation ?? null)
      setMessage(resp.ok ? `Saved ${data.filename}.` : data.error || 'Save failed.')
    } finally {
      setBusy(null)
    }
  }

  const exportBundle = async () => {
    setBusy('export')
    setMessage('')
    try {
      const resp = await apiFetch('/api/yaml-studio/export', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, filename, content: yamlContent }),
      })
      if (!resp.ok) {
        const data = await resp.json()
        setValidation(data.validation ?? null)
        setMessage(data.error || 'Export failed.')
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ztf-yaml-studio-${filename.replace(/\.(yaml|yml)$/i, '')}.zip`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Export bundle downloaded.')
    } finally {
      setBusy(null)
    }
  }

  const selectedScript = SCRIPT_CONFIG_SCHEMAS[selectedScriptId]

  return (
    <Layout
      title="Nutanix YAML Studio"
      subtitle="Generate, validate, save, and export ZTF-compatible Nutanix YAML"
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={validate} disabled={!yamlContent || busy !== null} className="btn-secondary gap-1.5">
            <ShieldCheck size={14} />
            {busy === 'validate' ? 'Validating...' : 'Validate'}
          </button>
          <button onClick={exportBundle} disabled={!yamlContent || busy !== null} className="btn-secondary gap-1.5">
            <Download size={14} />
            {busy === 'export' ? 'Exporting...' : 'Export'}
          </button>
          <button onClick={save} disabled={!yamlContent || busy !== null} className="btn-primary gap-1.5">
            <Save size={14} />
            {busy === 'save' ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={clsx(
              'btn-secondary text-xs',
              activeTab === tab.id && 'border-nutanix-blue/60 text-nutanix-cyan',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-4">
          {activeTab === 'cluster-baseline' && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-4 flex items-center gap-2">
                <Wand2 size={16} className="text-nutanix-cyan" />
                <h2 className="text-sm font-semibold text-gray-100">Cluster Baseline</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Cluster IP" value={baseline.clusterIp} onChange={value => updateBaseline({ clusterIp: value })} />
                <Field label="Cluster Name" value={baseline.clusterName} onChange={value => updateBaseline({ clusterName: value })} />
                <Field label="PE Credential Ref" value={baseline.peCredential} onChange={value => updateBaseline({ peCredential: value })} />
                <Field label="Storage Container" value={baseline.containerName} onChange={value => updateBaseline({ containerName: value })} />
                <Field label="Replication Factor" type="number" value={baseline.replicationFactor} onChange={value => updateBaseline({ replicationFactor: Number(value) })} />
                <Field label="Subnet Name" value={baseline.subnetName} onChange={value => updateBaseline({ subnetName: value })} />
                <Field label="VLAN ID" type="number" value={baseline.vlanId} onChange={value => updateBaseline({ vlanId: Number(value) })} />
                <Field label="Network IP" value={baseline.networkIp} onChange={value => updateBaseline({ networkIp: value })} placeholder="10.20.30.0" />
                <Field label="Prefix" type="number" value={baseline.prefix} onChange={value => updateBaseline({ prefix: Number(value) })} />
                <Field label="Gateway" value={baseline.gateway} onChange={value => updateBaseline({ gateway: value })} placeholder="10.20.30.1" />
                <TextArea label="DNS Servers" value={baseline.dnsServers} onChange={value => updateBaseline({ dnsServers: value })} />
                <TextArea label="NTP Servers" value={baseline.ntpServers} onChange={value => updateBaseline({ ntpServers: value })} />
                <TextArea label="IP Pools" value={baseline.ipPools} onChange={value => updateBaseline({ ipPools: value })} placeholder="10.20.30.50-10.20.30.80" />
                <div className="grid gap-2">
                  <Toggle label="Pulse" checked={baseline.enablePulse} onChange={value => updateBaseline({ enablePulse: value })} />
                  <Toggle label="HA Reservation" checked={baseline.haReservation} onChange={value => updateBaseline({ haReservation: value })} />
                  <Toggle label="Compression" checked={baseline.compression} onChange={value => updateBaseline({ compression: value })} />
                  <Toggle label="Dedup" checked={baseline.dedup} onChange={value => updateBaseline({ dedup: value })} />
                </div>
                <Field label="EULA Username" value={baseline.eulaUsername} onChange={value => updateBaseline({ eulaUsername: value })} />
                <Field label="EULA Company" value={baseline.eulaCompany} onChange={value => updateBaseline({ eulaCompany: value })} />
                <Field label="EULA Job Title" value={baseline.eulaJobTitle} onChange={value => updateBaseline({ eulaJobTitle: value })} />
              </div>
            </section>
          )}

          {activeTab === 'workflow-config' && (
            <section className="space-y-3">
              <div className="rounded-lg border border-border bg-surface p-4">
                <label className="label mb-1">Workflow or Script</label>
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
                  <Search size={14} className="text-gray-500" />
                  <input
                    className="w-full bg-transparent text-sm text-gray-200 outline-none"
                    value={scriptQuery}
                    onChange={event => setScriptQuery(event.target.value)}
                    placeholder="Search generators"
                  />
                </div>
                <select
                  className="input text-sm"
                  value={selectedScriptId}
                  onChange={event => {
                    setSelectedScriptId(event.target.value)
                    setFilename(`${event.target.value}.yaml`)
                    setYamlContent('')
                    setValidation(null)
                  }}
                >
                  {workflowScripts.map(script => (
                    <option key={script.id} value={script.id}>{script.name} ({script.id})</option>
                  ))}
                </select>
                {selectedScript && <p className="mt-2 text-xs text-gray-500">{selectedScript.description}</p>}
              </div>
              <ScriptConfigWizard
                scriptIds={selectedScriptId ? [selectedScriptId] : []}
                onGenerate={yaml => {
                  setYamlContent(yaml)
                  setValidation(null)
                  setMessage('Workflow YAML generated. Validate before saving or running.')
                }}
              />
            </section>
          )}

          {(activeTab === 'global-config' || activeTab === 'upgrade-rule-pack') && (
            <section className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileCode size={16} className="text-nutanix-cyan" />
                <h2 className="text-sm font-semibold text-gray-100">
                  {activeTab === 'global-config' ? 'Global Config Template' : 'Upgrade Rule Pack Template'}
                </h2>
              </div>
              <textarea
                className="input h-96 resize-none font-mono text-xs"
                value={yamlContent}
                onChange={event => {
                  setYamlContent(event.target.value)
                  setValidation(null)
                  setMessage('')
                }}
                spellCheck={false}
              />
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <label className="label mb-1">Output Filename</label>
            <input
              className="input text-sm"
              value={filename}
              onChange={event => setFilename(event.target.value)}
              placeholder="cluster-baseline.yaml"
            />
          </section>

          {message && (
            <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-gray-300">
              {message}
            </div>
          )}

          {validation && (
            <ValidationPanel validation={validation} />
          )}

          {yamlContent ? (
            <YamlPreview content={yamlContent} filename={filename || 'generated.yaml'} />
          ) : (
            <div className="rounded-lg border border-border bg-surface p-10 text-center text-gray-500">
              <FileCode size={36} className="mx-auto mb-3 text-gray-700" />
              <p className="text-sm text-gray-400">Generate YAML to preview it here.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
}) {
  return (
    <div>
      <label className="label mb-1">{label}</label>
      <input
        className="input text-xs"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="label mb-1">{label}</label>
      <textarea
        className="input h-20 resize-none text-xs"
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        spellCheck={false}
      />
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs text-gray-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-border bg-surface"
      />
    </label>
  )
}

function ValidationPanel({ validation }: { validation: ValidationResult }) {
  const errors = Array.isArray(validation.errors) ? validation.errors : []
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : []

  return (
    <section className={clsx(
      'rounded-lg border px-3 py-2 text-sm',
      validation.valid ? 'border-emerald-900/50 bg-emerald-950/20' : 'border-red-900/50 bg-red-950/20',
    )}>
      <div className="flex items-center gap-2">
        {validation.valid ? <CheckCircle2 size={15} className="text-emerald-300" /> : <AlertTriangle size={15} className="text-red-300" />}
        <span className="font-medium text-gray-100">{validation.valid ? 'Validation Passed' : 'Validation Failed'}</span>
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-red-200">
          {errors.map(error => <li key={error}>{error}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-yellow-200">
          {warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </section>
  )
}
