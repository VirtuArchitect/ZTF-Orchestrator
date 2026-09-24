import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  FileCode,
  FileInput,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Wand2,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { Link } from '../router'
import Layout from '../components/Layout'
import ScriptConfigWizard from '../components/ScriptConfigWizard'
import YamlPreview from '../components/YamlPreview'
import { SCRIPTS } from '../data'
import { SCRIPT_CONFIG_SCHEMAS } from '../scriptConfigSchemas'
import { apiFetch } from '../utils/api'
import { fromYaml, toYaml } from '../utils/yaml'

type StudioKind = 'cluster-baseline' | 'workflow-config' | 'ztf2-iac' | 'global-config' | 'upgrade-rule-pack'
type StudioTemplateId = 'native-foundation' | 'cluster-create' | 'global-config' | 'ztf2-iac' | 'blank'
type StudioMessage = { tone: 'success' | 'warning' | 'error' | 'info'; text: string } | null

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
  clusterIp: 'pe-demo.example.invalid',
  clusterName: 'DEV_LAB',
  peCredential: 'pe_user',
  dnsServers: 'dns1.example.invalid\ndns2.example.invalid',
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
  { id: 'ztf2-iac', label: 'ZTF 2.x IaC' },
  { id: 'global-config', label: 'Global Config' },
  { id: 'upgrade-rule-pack', label: 'Upgrade Rules' },
]

const templates: Array<{
  id: StudioTemplateId
  label: string
  description: string
  badge?: string
}> = [
  {
    id: 'native-foundation',
    label: 'Native Foundation Deploy',
    description: 'Dell iDRAC controlled-UAT AHV HCI deployment intent',
  },
  {
    id: 'cluster-create',
    label: 'Cluster Create',
    description: 'ZTF 1.x Foundation Central cluster creation config',
  },
  {
    id: 'global-config',
    label: 'Global Config',
    description: 'Credential, vault, and IPAM target configuration',
  },
  {
    id: 'ztf2-iac',
    label: 'ZTF 2.x IaC',
    description: 'Preview IaC domain input structure',
    badge: 'Preview',
  },
  {
    id: 'blank',
    label: 'Blank YAML',
    description: 'Start with an empty configuration file',
  },
]

const nativeFoundationTemplate = toYaml({
  ztf_orchestrator: {
    workflow: 'native-foundation-deploy',
    workflow_family: 'native_foundation',
    execution_scope: 'controlled_uat',
  },
  foundation_engine: {
    mode: 'controlled_uat',
    target: 'embedded_foundation',
    compatibility_baseline: 'foundation_5_11',
    foundation_version: '5.11',
  },
  credentials: {
    foundation_central: 'foundation_central',
  },
  sites: [{
    site_name: 'LAB_UAT',
    hardware_provider: 'dell_idrac_redfish',
    provider_credential_ref: 'dell-idrac-provider',
    bmc_credential_ref: 'dell-idrac-bmc',
    clusters: [{
      cluster_name: 'LAB_UAT',
      deployment_type: 'hci',
      hypervisor: 'ahv',
      cluster_vip: '10.20.31.120',
      aos_image: {
        source: 'nutanix_installer_package-release.tar.gz',
        version: '7.5.1.8',
        sha256: '<aos-sha256>',
      },
      hypervisor_image: {
        source: 'AHV-DVD-x86_64.iso',
        version: '11.0.1.3',
        sha256: '<ahv-sha256>',
      },
      nodes: [{
        node_serial: 'ABCDEF1',
        role: 'hci',
        hardware_model: 'Dell XC770 Core',
        bmc_address: '10.20.30.50',
        bmc_credential_ref: 'dell-idrac-bmc',
        host_ip: '10.20.31.80',
        cvm_ip: '10.20.31.81',
        hypervisor_hostname: 'LAB-UAT-N01',
      }],
    }],
  }],
})

const clusterCreateTemplate = toYaml({
  ztf_orchestrator: {
    foundation_central_target: 'integrated_pc_fc',
  },
  pc_credential: 'foundation_central',
  cvm_credential: 'cvm_credential',
  pc_ip: '10.20.40.10',
  common_network_settings: {
    dns_servers: ['10.20.40.1', '10.20.40.2'],
    ntp_servers: ['10.20.40.1', '10.20.40.2'],
  },
  create_clusters: [{
    cluster_name: 'LAB_UAT',
    cluster_vip: '10.20.31.120',
    redundancy_factor: 2,
    timezone: 'UTC',
    nodes_list: [{
      node_serial: 'ABCDEF1',
      cvm_ip: '10.20.31.81',
      host_ip: '10.20.31.80',
      ipmi_ip: '10.20.30.50',
    }],
  }],
})

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
  if (kind === 'ztf2-iac') {
    return toYaml({
      domains: {
        lab: {
          data: {},
          resources: {
            prism_central_category: {
              example_category: {
                name: 'ztf-demo-category',
                description: 'Generated by ZTF-Orchestrator YAML Studio',
              },
            },
          },
          outputs: {
            category_name: '${resources.prism_central_category.example_category.name}',
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
  const [activeTemplate, setActiveTemplate] = useState<StudioTemplateId>('cluster-create')
  const [baseline, setBaseline] = useState<BaselineValues>(BASELINE_DEFAULTS)
  const [scriptQuery, setScriptQuery] = useState('')
  const [selectedScriptId, setSelectedScriptId] = useState('AddNtpServersPe')
  const [yamlContent, setYamlContent] = useState(() => buildBaselineYaml(BASELINE_DEFAULTS))
  const [filename, setFilename] = useState('cluster-baseline.yaml')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [message, setMessage] = useState<StudioMessage>(null)
  const [busy, setBusy] = useState<'validate' | 'save' | 'export' | null>(null)
  const [credentialRefs, setCredentialRefs] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    apiFetch('/api/global-config')
      .then(resp => resp.ok ? resp.json() : null)
      .then(data => {
        if (!mounted || !data?.content) return
        const refs = extractGlobalCredentialRefs(data.content)
        setCredentialRefs(refs)
      })
      .catch(() => {
        if (mounted) setCredentialRefs([])
      })
    return () => {
      mounted = false
    }
  }, [])

  const workflowScripts = useMemo(() => {
    const query = scriptQuery.trim().toLowerCase()
    return SCRIPTS
      .filter(script => SCRIPT_CONFIG_SCHEMAS[script.id])
      .filter(script => !query || `${script.name} ${script.id} ${script.category}`.toLowerCase().includes(query))
  }, [scriptQuery])

  const syntaxState = useMemo(() => getYamlSyntaxState(yamlContent), [yamlContent])
  const referencedCredentialRefs = useMemo(() => extractCredentialRefs(yamlContent), [yamlContent])
  const missingCredentialRefs = useMemo(
    () => referencedCredentialRefs.filter(ref => credentialRefs.length > 0 && !credentialRefs.includes(ref)),
    [credentialRefs, referencedCredentialRefs],
  )
  const isNativeFoundationIntent = /native[-_]foundation|dell_idrac_redfish/i.test(yamlContent)
  const commandPreview = useMemo(
    () => runtimeCommandFor(activeTemplate, activeTab, yamlContent, selectedScriptId, filename),
    [activeTemplate, activeTab, yamlContent, selectedScriptId, filename],
  )

  const switchTab = (tab: StudioKind) => {
    setActiveTab(tab)
    setValidation(null)
    setMessage(null)
    if (tab === 'cluster-baseline') {
      setActiveTemplate('cluster-create')
      setYamlContent(buildBaselineYaml(baseline))
      setFilename('cluster-baseline.yaml')
    } else if (tab === 'workflow-config') {
      setActiveTemplate('cluster-create')
      setFilename(`${selectedScriptId || 'workflow-config'}.yaml`)
      setYamlContent('')
    } else {
      setActiveTemplate(tab === 'global-config' ? 'global-config' : tab === 'ztf2-iac' ? 'ztf2-iac' : 'blank')
      setFilename(tab === 'global-config' ? 'global.yml' : tab === 'ztf2-iac' ? 'input.yml' : 'upgrade-advisory-pack.yaml')
      setYamlContent(exampleFor(tab))
    }
  }

  const selectTemplate = (templateId: StudioTemplateId) => {
    setActiveTemplate(templateId)
    setValidation(null)
    setMessage(null)
    if (templateId === 'native-foundation') {
      setActiveTab('workflow-config')
      setFilename('native-foundation-deploy.yml')
      setYamlContent(nativeFoundationTemplate)
      return
    }
    if (templateId === 'cluster-create') {
      setActiveTab('workflow-config')
      setFilename('create_cluster.yml')
      setYamlContent(clusterCreateTemplate)
      return
    }
    if (templateId === 'global-config') {
      setActiveTab('global-config')
      setFilename('global.yml')
      setYamlContent(exampleFor('global-config'))
      return
    }
    if (templateId === 'ztf2-iac') {
      setActiveTab('ztf2-iac')
      setFilename('input.yml')
      setYamlContent(exampleFor('ztf2-iac'))
      return
    }
    setActiveTab('workflow-config')
    setFilename('config.yml')
    setYamlContent('')
  }

  const updateBaseline = (patch: Partial<BaselineValues>) => {
    const next = { ...baseline, ...patch }
    setBaseline(next)
    setYamlContent(buildBaselineYaml(next))
    setValidation(null)
    setMessage(null)
  }

  const validate = async () => {
    setBusy('validate')
    setMessage(null)
    try {
      const resp = await apiFetch('/api/yaml-studio/validate', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, content: yamlContent }),
      })
      const data = await resp.json()
      setValidation(data)
      setMessage(resp.ok
        ? { tone: 'success', text: 'Validation passed.' }
        : { tone: 'warning', text: 'Validation needs attention.' })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setMessage(null)
    try {
      const resp = await apiFetch('/api/yaml-studio/save', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, filename, content: yamlContent }),
      })
      const data = await resp.json()
      setValidation(data.validation ?? null)
      setMessage(resp.ok
        ? { tone: 'success', text: `Saved ${data.filename}.` }
        : { tone: 'error', text: data.error || 'Save failed.' })
    } finally {
      setBusy(null)
    }
  }

  const exportBundle = async () => {
    setBusy('export')
    setMessage(null)
    try {
      const resp = await apiFetch('/api/yaml-studio/export', {
        method: 'POST',
        body: JSON.stringify({ kind: activeTab, filename, content: yamlContent }),
      })
      if (!resp.ok) {
        const data = await resp.json()
        setValidation(data.validation ?? null)
        setMessage({ tone: 'error', text: data.error || 'Export failed.' })
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ztf-yaml-studio-${filename.replace(/\.(yaml|yml)$/i, '')}.zip`
      link.click()
      URL.revokeObjectURL(url)
      setMessage({ tone: 'success', text: 'Export bundle downloaded.' })
    } finally {
      setBusy(null)
    }
  }

  const selectedScript = SCRIPT_CONFIG_SCHEMAS[selectedScriptId]

  return (
    <Layout
      title="YAML Studio"
      subtitle="Author, validate, and resolve ZTF configuration before execution"
      actions={
        <div className="flex flex-wrap gap-2">
          <button onClick={validate} disabled={!yamlContent || busy !== null} className="btn-secondary gap-1.5">
            <RefreshCw size={14} />
            {busy === 'validate' ? 'Validating...' : 'Revalidate'}
          </button>
          <button onClick={exportBundle} disabled={!yamlContent || busy !== null} className="btn-secondary gap-1.5">
            <Download size={14} />
            {busy === 'export' ? 'Exporting...' : 'Download'}
          </button>
          <button onClick={save} disabled={!yamlContent || busy !== null} className="btn-primary gap-1.5">
            <Save size={14} />
            {busy === 'save' ? 'Saving...' : 'Save to ZTF'}
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

      <ReadinessStrip
        syntaxState={syntaxState}
        validation={validation}
        credentialRefs={credentialRefs}
        referencedCredentialRefs={referencedCredentialRefs}
        missingCredentialRefs={missingCredentialRefs}
        commandPreview={commandPreview}
        isNativeFoundationIntent={isNativeFoundationIntent}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[260px_minmax(420px,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-100">Start from template</h2>
              <p className="mt-1 text-xs text-gray-500">Choose a known config shape, then validate before saving.</p>
            </div>
            <div className="space-y-2">
              {templates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => selectTemplate(template.id)}
                  className={clsx(
                    'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                    activeTemplate === template.id
                      ? 'border-nutanix-blue bg-blue-900/20'
                      : 'border-border bg-surface-elevated hover:border-border-light',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className={clsx(
                      'mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                      activeTemplate === template.id ? 'border-nutanix-cyan bg-nutanix-blue' : 'border-border-light',
                    )}>
                      {activeTemplate === template.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-100">
                        {template.label}
                        {template.badge && <span className="badge-blue text-[10px] uppercase">{template.badge}</span>}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500">{template.description}</span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <label className="label mb-1">Output Filename</label>
            <input
              className="input text-sm"
              value={filename}
              onChange={event => setFilename(event.target.value)}
              placeholder="cluster-baseline.yaml"
            />
          </section>
        </div>

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
                <Field label="Network IP" value={baseline.networkIp} onChange={value => updateBaseline({ networkIp: value })} placeholder="demo-network.example.invalid" />
                <Field label="Prefix" type="number" value={baseline.prefix} onChange={value => updateBaseline({ prefix: Number(value) })} />
                <Field label="Gateway" value={baseline.gateway} onChange={value => updateBaseline({ gateway: value })} placeholder="demo-gateway.example.invalid" />
                <TextArea label="DNS Servers" value={baseline.dnsServers} onChange={value => updateBaseline({ dnsServers: value })} />
                <TextArea label="NTP Servers" value={baseline.ntpServers} onChange={value => updateBaseline({ ntpServers: value })} />
                <TextArea label="IP Pools" value={baseline.ipPools} onChange={value => updateBaseline({ ipPools: value })} placeholder="demo-pool-start.example.invalid-demo-pool-end.example.invalid" />
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
                  setMessage({ tone: 'info', text: 'Workflow YAML generated. Validate before saving or running.' })
                }}
              />
            </section>
          )}

          <section className="rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <FileCode size={16} className="text-nutanix-cyan" />
                <h2 className="text-sm font-semibold text-gray-100">{filename || 'generated.yaml'}</h2>
              </div>
              <span className="badge-gray text-[10px] uppercase">YAML</span>
            </div>
            <div className="grid grid-cols-[48px_minmax(0,1fr)]">
              <pre className="select-none overflow-hidden border-r border-border bg-surface-elevated px-3 py-3 text-right font-mono text-xs leading-6 text-gray-500">
                {lineNumbersFor(yamlContent)}
              </pre>
              <textarea
                className="min-h-[520px] w-full resize-y bg-transparent px-4 py-3 font-mono text-xs leading-6 text-gray-200 outline-none placeholder-gray-500"
                value={yamlContent}
                onChange={event => {
                  setYamlContent(event.target.value)
                  setValidation(null)
                  setMessage(null)
                }}
                placeholder="Select a template or paste YAML here..."
                spellCheck={false}
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          {message && (
            <MessageBanner message={message} />
          )}

          <FieldGuidance
            yamlContent={yamlContent}
            activeTemplate={activeTemplate}
            missingCredentialRefs={missingCredentialRefs}
          />

          {validation && (
            <ValidationPanel validation={validation} />
          )}

          <RuntimeCommandPreview commandPreview={commandPreview} missingCredentialRefs={missingCredentialRefs} validation={validation} />

          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-nutanix-cyan" />
              <h2 className="text-sm font-semibold text-gray-100">YAML Preview</h2>
            </div>
            {yamlContent ? (
              <YamlPreview content={yamlContent} filename={filename || 'generated.yaml'} />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-surface-elevated p-8 text-center text-gray-500">
                <FileCode size={30} className="mx-auto mb-3 text-gray-700" />
                <p className="text-sm text-gray-400">Select a template or paste YAML to preview it here.</p>
              </div>
            )}
          </section>
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

function MessageBanner({ message }: { message: NonNullable<StudioMessage> }) {
  const Icon = message.tone === 'success'
    ? CheckCircle2
    : message.tone === 'error'
      ? XCircle
      : message.tone === 'warning'
        ? AlertTriangle
        : FileInput
  return (
    <div className={clsx(
      'rounded-lg border px-3 py-2 text-sm',
      message.tone === 'success' && 'border-emerald-700/30 bg-emerald-900/30 text-gray-300',
      message.tone === 'warning' && 'border-yellow-900/40 bg-yellow-950/10 text-gray-300',
      message.tone === 'error' && 'border-red-900/50 bg-red-950/20 text-red-200',
      message.tone === 'info' && 'border-blue-700/20 bg-blue-900/10 text-gray-300',
    )}>
      <div className="flex items-center gap-2">
        <Icon
          size={15}
          className={clsx(
            message.tone === 'success' && 'text-emerald-400',
            message.tone === 'warning' && 'text-yellow-300',
            message.tone === 'error' && 'text-red-300',
            message.tone === 'info' && 'text-blue-300',
          )}
        />
        <span>{message.text}</span>
      </div>
    </div>
  )
}

function ReadinessStrip({
  syntaxState,
  validation,
  credentialRefs,
  referencedCredentialRefs,
  missingCredentialRefs,
  commandPreview,
  isNativeFoundationIntent,
}: {
  syntaxState: { valid: boolean; error?: string }
  validation: ValidationResult | null
  credentialRefs: string[]
  referencedCredentialRefs: string[]
  missingCredentialRefs: string[]
  commandPreview: { command: string; runnable: boolean; reason: string }
  isNativeFoundationIntent: boolean
}) {
  const validationReady = validation?.valid === true
  const credentialStatus = referencedCredentialRefs.length === 0
    ? { state: 'unknown' as const, title: 'Credentials resolved', detail: 'No credential refs detected' }
    : missingCredentialRefs.length === 0 && credentialRefs.length > 0
      ? { state: 'good' as const, title: 'Credentials resolved', detail: `${referencedCredentialRefs.length} reference${referencedCredentialRefs.length === 1 ? '' : 's'} found` }
      : credentialRefs.length === 0
        ? { state: 'warn' as const, title: 'Credentials unresolved', detail: 'Global Config not loaded yet' }
        : { state: 'bad' as const, title: 'Credentials unresolved', detail: `${missingCredentialRefs.length} missing reference${missingCredentialRefs.length === 1 ? '' : 's'}` }

  const cards = [
    {
      state: syntaxState.valid ? 'good' as const : 'bad' as const,
      title: 'YAML valid',
      detail: syntaxState.valid ? 'Syntax parsed successfully' : syntaxState.error || 'Syntax needs attention',
    },
    credentialStatus,
    {
      state: commandPreview.runnable && validationReady ? 'good' as const : validation ? 'bad' as const : 'warn' as const,
      title: 'Workflow runnable',
      detail: commandPreview.runnable && validationReady ? 'Ready after save/review' : validation ? commandPreview.reason : 'Validate to confirm execution',
    },
    {
      state: isNativeFoundationIntent ? (commandPreview.runnable ? 'good' as const : 'warn' as const) : 'unknown' as const,
      title: 'Adapter ready',
      detail: isNativeFoundationIntent ? commandPreview.reason : 'No adapter handoff detected',
    },
  ]

  return (
    <section className="mt-5 grid gap-3 lg:grid-cols-4">
      {cards.map(card => (
        <div key={card.title} className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <StatusIcon state={card.state} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-100">{card.title}</p>
              <p className="mt-1 truncate text-xs text-gray-500" title={card.detail}>{card.detail}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}

function FieldGuidance({
  yamlContent,
  activeTemplate,
  missingCredentialRefs,
}: {
  yamlContent: string
  activeTemplate: StudioTemplateId
  missingCredentialRefs: string[]
}) {
  const selected = selectedGuidance(yamlContent, activeTemplate, missingCredentialRefs)
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen size={16} className="text-nutanix-cyan" />
        <h2 className="text-sm font-semibold text-gray-100">Field Guidance</h2>
      </div>
      <div className="space-y-4">
        <div>
          <p className="label mb-1">Selected field</p>
          <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-sm text-gray-100">
            {selected.field}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Description</p>
          <p className="mt-1 text-sm leading-6 text-gray-300">{selected.description}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expected value</p>
          <p className="mt-1 text-sm leading-6 text-gray-300">{selected.expected}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Example</p>
          <code className="mt-1 block rounded-md border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-gray-100">
            {selected.example}
          </code>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source</p>
          <p className="mt-1 text-sm leading-6 text-gray-300">{selected.source}</p>
        </div>
        <Link to={selected.href} className="btn-secondary w-full justify-center gap-1.5">
          <ExternalLink size={14} />
          {selected.action}
        </Link>
      </div>
    </section>
  )
}

function RuntimeCommandPreview({
  commandPreview,
  missingCredentialRefs,
  validation,
}: {
  commandPreview: { command: string; runnable: boolean; reason: string }
  missingCredentialRefs: string[]
  validation: ValidationResult | null
}) {
  const blocked = !commandPreview.runnable || missingCredentialRefs.length > 0 || validation?.valid === false
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <PlayCircle size={16} className="text-nutanix-cyan" />
        <h2 className="text-sm font-semibold text-gray-100">Runtime Command Preview</h2>
      </div>
      <pre className="overflow-auto rounded-md border border-border bg-surface-elevated p-3 font-mono text-xs leading-5 text-gray-200">
        {commandPreview.command || 'No runtime command detected yet.'}
      </pre>
      <div className={clsx(
        'mt-3 rounded-lg border px-3 py-2 text-sm',
        blocked ? 'border-red-900/50 bg-red-950/20 text-red-200' : 'border-emerald-700/30 bg-emerald-900/30 text-gray-300',
      )}>
        <div className="flex items-center gap-2">
          {blocked ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
          <span className="font-medium">{blocked ? 'Blocked before execution' : 'Ready for controlled execution review'}</span>
        </div>
        <p className="mt-1 text-xs opacity-85">
          {missingCredentialRefs.length > 0
            ? `Resolve missing credential refs: ${missingCredentialRefs.join(', ')}.`
            : commandPreview.reason}
        </p>
      </div>
    </section>
  )
}

function ValidationPanel({ validation }: { validation: ValidationResult }) {
  const errors = Array.isArray(validation.errors) ? validation.errors : []
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : []
  const suggestions = validation.valid && warnings.length === 0 ? ['Save this file after review, then run a workflow dry-run before execution.'] : []

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-nutanix-cyan" />
          <h2 className="text-sm font-semibold text-gray-100">Validation Results</h2>
        </div>
        <span className={validation.valid ? 'badge-green' : 'badge-red'}>{validation.valid ? 'Passed' : 'Needs attention'}</span>
      </div>
      <div className="space-y-2">
        <ValidationGroup tone="red" title="Blocking" items={errors} emptyText="No blocking validation errors" />
        <ValidationGroup tone="yellow" title="Warnings" items={warnings} emptyText="No warnings reported" />
        <ValidationGroup tone="blue" title="Suggestions" items={suggestions} emptyText="Validate and review before execution" />
      </div>
    </section>
  )
}

function ValidationGroup({
  title,
  items,
  emptyText,
  tone,
}: {
  title: string
  items: string[]
  emptyText: string
  tone: 'red' | 'yellow' | 'blue'
}) {
  const hasItems = items.length > 0
  return (
    <details open={hasItems} className={clsx(
      'rounded-lg border px-3 py-2',
      tone === 'red' && 'border-red-900/50 bg-red-950/20',
      tone === 'yellow' && 'border-yellow-900/40 bg-yellow-950/10',
      tone === 'blue' && 'border-blue-700/20 bg-blue-900/10',
    )}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-gray-100">
        <span>{title} ({items.length})</span>
      </summary>
      {hasItems ? (
        <ul className="mt-2 space-y-1 text-xs text-gray-300">
          {items.map(item => <li key={item} className="leading-5">{item}</li>)}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-500">{emptyText}</p>
      )}
    </details>
  )
}

function StatusIcon({ state }: { state: 'good' | 'warn' | 'bad' | 'unknown' }) {
  if (state === 'good') return <CheckCircle2 size={26} className="shrink-0 text-emerald-400" />
  if (state === 'warn') return <AlertTriangle size={26} className="shrink-0 text-yellow-300" />
  if (state === 'bad') return <XCircle size={26} className="shrink-0 text-red-300" />
  return <Circle size={26} className="shrink-0 text-gray-500" />
}

function lineNumbersFor(value: string): string {
  const count = Math.max(1, value.split('\n').length)
  return Array.from({ length: count }, (_, index) => String(index + 1)).join('\n')
}

function getYamlSyntaxState(value: string): { valid: boolean; error?: string } {
  if (!value.trim()) return { valid: false, error: 'No YAML content yet' }
  try {
    fromYaml(value)
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'YAML parse failed' }
  }
}

function extractGlobalCredentialRefs(content: string): string[] {
  try {
    const parsed = fromYaml(content) as Record<string, unknown>
    const vaults = parsed?.vaults as Record<string, unknown> | undefined
    const refs = new Set<string>()
    Object.values(vaults || {}).forEach(vault => {
      const credentials = (vault as Record<string, unknown> | undefined)?.credentials
      if (credentials && typeof credentials === 'object' && !Array.isArray(credentials)) {
        Object.keys(credentials).forEach(ref => refs.add(ref))
      }
    })
    return Array.from(refs).sort()
  } catch {
    return []
  }
}

function extractCredentialRefs(content: string): string[] {
  const refs = new Set<string>()
  const pattern = /^\s*([A-Za-z0-9_.-]*(?:credential|credential_ref|bmc_credential_ref|provider_credential_ref|api_credential_ref)[A-Za-z0-9_.-]*)\s*:\s*['"]?([^'"\s#{}[\]]+)/gim
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const value = match[2].trim()
    if (!value || value.startsWith('<') || value.includes(':') || value === 'true' || value === 'false') continue
    refs.add(value)
  }
  return Array.from(refs).sort()
}

function runtimeCommandFor(
  templateId: StudioTemplateId,
  activeTab: StudioKind,
  yamlContent: string,
  selectedScriptId: string,
  filename: string,
): { command: string; runnable: boolean; reason: string } {
  if (/native[-_]foundation|dell_idrac_redfish/i.test(yamlContent)) {
    return {
      command: 'native-foundation-uat-deploy --provider dell_idrac_redfish --phase full_deployment',
      runnable: true,
      reason: 'Native Foundation adapter handoff detected; validate credentials and gates before execution.',
    }
  }
  if (templateId === 'cluster-create' || /create_clusters:/i.test(yamlContent)) {
    return {
      command: 'python main.py --workflow cluster-create -f create_cluster.yml',
      runnable: true,
      reason: 'Cluster create workflow detected; validate against Global Config before execution.',
    }
  }
  if (activeTab === 'ztf2-iac') {
    return {
      command: 'ztf plan --input input.yml',
      runnable: false,
      reason: 'ZTF 2.x IaC remains preview-gated in this console.',
    }
  }
  if (activeTab === 'global-config') {
    return {
      command: 'Save to global.yml',
      runnable: false,
      reason: 'Global Config is consumed by workflows; it is not executed directly.',
    }
  }
  if (activeTab === 'workflow-config' && selectedScriptId && yamlContent.trim()) {
    return {
      command: `python main.py --script ${selectedScriptId} -f ${filename || `${selectedScriptId}.yaml`}`,
      runnable: true,
      reason: 'Generated script workflow config detected; validate and save before execution.',
    }
  }
  return {
    command: '',
    runnable: false,
    reason: 'Select a workflow template or generate workflow YAML to preview execution.',
  }
}

function selectedGuidance(
  yamlContent: string,
  activeTemplate: StudioTemplateId,
  missingCredentialRefs: string[],
): {
  field: string
  description: string
  expected: string
  example: string
  source: string
  action: string
  href: string
} {
  if (missingCredentialRefs.length > 0 || /bmc_credential_ref/i.test(yamlContent)) {
    return {
      field: 'bmc_credential_ref',
      description: 'Reference to the BMC credential used for out-of-band iDRAC management during node deployment and validation.',
      expected: 'A credential reference defined in Global Config > Credentials.',
      example: missingCredentialRefs[0] || 'dell-idrac-bmc',
      source: 'Global Config > Credentials',
      action: 'Open Global Config',
      href: '/global-config',
    }
  }
  if (activeTemplate === 'ztf2-iac') {
    return {
      field: 'domains',
      description: 'Top-level collection of ZTF 2.x IaC domains that group resources, data, and outputs.',
      expected: 'A map of domain names to resource declarations.',
      example: 'domains.lab.resources',
      source: 'ZTF 2.x IaC preview schema',
      action: 'Open ZTF 2.x IaC',
      href: '/ztf2-iac',
    }
  }
  if (activeTemplate === 'global-config') {
    return {
      field: 'vaults.local.credentials',
      description: 'Named credential references made available to workflow configs.',
      expected: 'A map of reference names to username and password entries.',
      example: 'dell-idrac-bmc',
      source: 'Global Config',
      action: 'Open Global Config',
      href: '/global-config',
    }
  }
  return {
    field: 'workflow config',
    description: 'Select a field in the YAML editor or choose a template to see targeted guidance.',
    expected: 'Valid ZTF YAML for the selected workflow family.',
    example: 'cluster_name: LAB_UAT',
    source: 'YAML Studio template library',
    action: 'Open Config Files',
    href: '/configs',
  }
}
