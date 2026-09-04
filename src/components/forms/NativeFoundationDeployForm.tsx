import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ChevronDown, ChevronUp, FolderOpen, KeyRound, Plus, Trash2, Server, ShieldCheck, HardDrive, Network, CheckCircle } from 'lucide-react'
import { buildNativeFoundationDeployYaml } from '../../utils/yaml'
import type { ConnectionProfile } from '../../types'
import { CREDENTIAL_KEYS, TIMEZONES } from '../../data'
import TagInput from './TagInput'

interface Node {
  nodeSerial: string
  role: string
  hardwareModel: string
  bmcAddress: string
  bmcCredentialRef: string
  bmcUsername: string
  bmcPassword: string
  hostIp: string
  cvmIp: string
  hostname: string
  bootMode: string
  cvmRamGb: number
}

interface Props {
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
}

const IMAGE_FILE_ACCEPT = '.iso,.img,.qcow2,.tar,.tar.gz,.tgz,.zip,application/x-iso9660-image,application/gzip,application/zip'
const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : fallback
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function selectedFileSource(file: File): string {
  const localFile = file as File & { path?: string }
  return localFile.path || file.webkitRelativePath || file.name
}

function defaultNode(index: number): Node {
  return {
    nodeSerial: '',
    role: 'hci',
    hardwareModel: 'Dell XC770 Core',
    bmcAddress: '',
    bmcCredentialRef: 'dell-idrac-bmc',
    bmcUsername: '',
    bmcPassword: '',
    hostIp: '',
    cvmIp: '',
    hostname: '',
    bootMode: 'uefi',
    cvmRamGb: 12,
  }
}

function initialState(profile?: ConnectionProfile, importedConfig?: unknown) {
  const profileDns = csv(profile?.defaults.dnsServers)
  const profileNtp = csv(profile?.defaults.ntpServers)
  const defaults = {
    executionScope: 'controlled_uat',
    engineMode: 'controlled_uat',
    foundationTarget: 'embedded_foundation',
    compatibilityBaseline: 'foundation_5_11',
    foundationVersion: '5.11',
    runnerIdentityRef: 'private-identities/native-foundation-runner',
    artifactPolicy: 'operator_supplied',
    imageRepositoryEndpoint: profile?.foundationCentral.endpoint || '',
    imageRepositoryCredentialRef: profile?.foundationCentral.credentialRef || 'image-repository',
    imageRepositoryVerifyTls: true,
    maxParallelSites: 1,
    maxParallelClustersPerSite: 1,
    requireApprovalBinding: true,
    requireValidationEvidence: true,
    failClosedUnsupportedFcaDellHci: true,
    failurePolicy: 'stop_site',
    evidenceTargetRef: 'private-evidence/native-foundation-uat',
    redactSecrets: true,
    prismElementCredentialRef: profile?.prismElement.peCredentialRef || 'pe_user',
    prismValidationTimeoutMinutes: 60,
    requireClusterHealth: true,
    siteName: '',
    hardwareProvider: 'dell_idrac_redfish',
    providerCredentialRef: 'dell-idrac-provider',
    bmcCredentialRef: 'dell-idrac-bmc',
    bmcUsername: 'root',
    bmcPassword: '',
    concurrencyLimit: 1,
    deploymentTimezone: 'UTC',
    deploymentDays: ['Sat', 'Sun'],
    deploymentStart: '00:00',
    deploymentEnd: '06:00',
    bmcSubnet: '',
    bmcGateway: '',
    hostSubnet: '',
    hostGateway: '',
    cvmSubnet: '',
    cvmGateway: '',
    managementVlanId: 120,
    dnsServers: profileDns,
    ntpServers: profileNtp,
    clusterName: '',
    deploymentType: 'hci',
    hypervisor: 'ahv',
    clusterVip: '',
    redundancyFactor: 2,
    clusterTimezone: 'UTC',
    aosImageSource: profile?.foundationCentral.aosUrl || '',
    aosImageVersion: '',
    aosImageSha256: '',
    hypervisorImageSource: profile?.foundationCentral.hypervisorUrl || '',
    hypervisorImageVersion: '',
    hypervisorImageSha256: '',
    clusterExpanded: true,
    nodesExpanded: true,
    nodes: [defaultNode(1), defaultNode(2), defaultNode(3)],
  }

  const root = asRecord(importedConfig)
  if (!Object.keys(root).length) return defaults

  const metadata = asRecord(root.ztf_orchestrator)
  const engine = asRecord(root.foundation_engine)
  const imageRepository = asRecord(engine.image_repository)
  const policy = asRecord(engine.policy)
  const retention = asRecord(engine.evidence_retention)
  const peValidation = asRecord(engine.prism_element_validation)
  const site = Array.isArray(root.sites) ? asRecord(root.sites[0]) : {}
  const window = asRecord(site.deployment_window)
  const network = asRecord(site.network_profile)
  const cluster = Array.isArray(site.clusters) ? asRecord(site.clusters[0]) : {}
  const aosImage = asRecord(cluster.aos_image)
  const hypervisorImage = asRecord(cluster.hypervisor_image)
  const nodes = Array.isArray(cluster.nodes)
    ? cluster.nodes.map((item, index): Node => {
        const node = asRecord(item)
        return {
          nodeSerial: asString(node.node_serial),
          role: asString(node.role, 'hci'),
          hardwareModel: asString(node.hardware_model, 'Dell XC770 Core'),
          bmcAddress: asString(node.bmc_address),
          bmcCredentialRef: asString(node.bmc_credential_ref, asString(site.bmc_credential_ref, defaults.bmcCredentialRef)),
          bmcUsername: asString(node.bmc_username),
          bmcPassword: asString(node.bmc_password),
          hostIp: asString(node.host_ip),
          cvmIp: asString(node.cvm_ip),
          hostname: asString(node.hypervisor_hostname),
          bootMode: asString(node.boot_mode, 'uefi'),
          cvmRamGb: asNumber(node.cvm_ram_gb, 12),
        }
      })
    : defaults.nodes

  return {
    ...defaults,
    executionScope: asString(metadata.execution_scope, defaults.executionScope),
    engineMode: asString(engine.mode, defaults.engineMode),
    foundationTarget: asString(engine.target, defaults.foundationTarget),
    compatibilityBaseline: asString(engine.compatibility_baseline, defaults.compatibilityBaseline),
    foundationVersion: asString(engine.foundation_version, defaults.foundationVersion),
    runnerIdentityRef: asString(engine.runner_identity_ref, defaults.runnerIdentityRef),
    artifactPolicy: asString(engine.artifact_policy, defaults.artifactPolicy),
    imageRepositoryEndpoint: asString(imageRepository.endpoint, defaults.imageRepositoryEndpoint),
    imageRepositoryCredentialRef: asString(imageRepository.credential_ref, defaults.imageRepositoryCredentialRef),
    imageRepositoryVerifyTls: imageRepository.verify_tls === undefined ? defaults.imageRepositoryVerifyTls : Boolean(imageRepository.verify_tls),
    maxParallelSites: asNumber(policy.max_parallel_sites, defaults.maxParallelSites),
    maxParallelClustersPerSite: asNumber(policy.max_parallel_clusters_per_site, defaults.maxParallelClustersPerSite),
    requireApprovalBinding: policy.require_approval_binding === undefined ? defaults.requireApprovalBinding : Boolean(policy.require_approval_binding),
    requireValidationEvidence: policy.require_validation_evidence === undefined ? defaults.requireValidationEvidence : Boolean(policy.require_validation_evidence),
    failClosedUnsupportedFcaDellHci: policy.fail_closed_unsupported_fca_dell_hci === undefined ? defaults.failClosedUnsupportedFcaDellHci : Boolean(policy.fail_closed_unsupported_fca_dell_hci),
    failurePolicy: asString(policy.failure_policy, defaults.failurePolicy),
    evidenceTargetRef: asString(retention.target_ref, defaults.evidenceTargetRef),
    redactSecrets: retention.redact_secrets === undefined ? defaults.redactSecrets : Boolean(retention.redact_secrets),
    prismElementCredentialRef: asString(peValidation.credential_ref, defaults.prismElementCredentialRef),
    prismValidationTimeoutMinutes: asNumber(peValidation.timeout_minutes, defaults.prismValidationTimeoutMinutes),
    requireClusterHealth: peValidation.require_cluster_health === undefined ? defaults.requireClusterHealth : Boolean(peValidation.require_cluster_health),
    siteName: asString(site.site_name, defaults.siteName),
    hardwareProvider: asString(site.hardware_provider, defaults.hardwareProvider),
    providerCredentialRef: asString(site.provider_credential_ref, defaults.providerCredentialRef),
    bmcCredentialRef: asString(site.bmc_credential_ref, defaults.bmcCredentialRef),
    bmcUsername: asString(asRecord(site.bmc_credential).username, defaults.bmcUsername),
    bmcPassword: asString(asRecord(site.bmc_credential).password, defaults.bmcPassword),
    concurrencyLimit: asNumber(site.concurrency_limit, defaults.concurrencyLimit),
    deploymentTimezone: asString(window.timezone, defaults.deploymentTimezone),
    deploymentDays: asStringArray(window.days, defaults.deploymentDays),
    deploymentStart: asString(window.start, defaults.deploymentStart),
    deploymentEnd: asString(window.end, defaults.deploymentEnd),
    bmcSubnet: asString(network.bmc_subnet, defaults.bmcSubnet),
    bmcGateway: asString(network.bmc_gateway, defaults.bmcGateway),
    hostSubnet: asString(network.host_subnet, defaults.hostSubnet),
    hostGateway: asString(network.host_gateway, defaults.hostGateway),
    cvmSubnet: asString(network.cvm_subnet, defaults.cvmSubnet),
    cvmGateway: asString(network.cvm_gateway, defaults.cvmGateway),
    managementVlanId: asNumber(network.management_vlan_id, defaults.managementVlanId),
    dnsServers: asStringArray(network.dns_servers, defaults.dnsServers),
    ntpServers: asStringArray(network.ntp_servers, defaults.ntpServers),
    clusterName: asString(cluster.cluster_name, defaults.clusterName),
    deploymentType: asString(cluster.deployment_type, defaults.deploymentType),
    hypervisor: asString(cluster.hypervisor, defaults.hypervisor),
    clusterVip: asString(cluster.cluster_vip, defaults.clusterVip),
    redundancyFactor: asNumber(cluster.redundancy_factor, defaults.redundancyFactor),
    clusterTimezone: asString(cluster.timezone, defaults.clusterTimezone),
    aosImageSource: asString(aosImage.source, defaults.aosImageSource),
    aosImageVersion: asString(aosImage.version, defaults.aosImageVersion),
    aosImageSha256: asString(aosImage.sha256, defaults.aosImageSha256),
    hypervisorImageSource: asString(hypervisorImage.source, defaults.hypervisorImageSource),
    hypervisorImageVersion: asString(hypervisorImage.version, defaults.hypervisorImageVersion),
    hypervisorImageSha256: asString(hypervisorImage.sha256, defaults.hypervisorImageSha256),
    nodes: nodes.length ? nodes : defaults.nodes,
  }
}

export default function NativeFoundationDeployForm({ onYamlChange, profile, importedConfig }: Props) {
  const initial = () => initialState(profile, importedConfig)
  const [state, setState] = useState(() => initial())
  const aosImageInputRef = useRef<HTMLInputElement>(null)
  const ahvImageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (importedConfig) setState(initialState(profile, importedConfig))
  }, [importedConfig, profile])

  useEffect(() => {
    onYamlChange(buildNativeFoundationDeployYaml({
      executionScope: state.executionScope,
      engineMode: state.engineMode,
      foundationTarget: state.foundationTarget,
      compatibilityBaseline: state.compatibilityBaseline,
      foundationVersion: state.foundationVersion,
      runnerIdentityRef: state.runnerIdentityRef,
      artifactPolicy: state.artifactPolicy,
      imageRepository: {
        endpoint: state.imageRepositoryEndpoint,
        credentialRef: state.imageRepositoryCredentialRef,
        verifyTls: state.imageRepositoryVerifyTls,
      },
      policy: {
        maxParallelSites: state.maxParallelSites,
        maxParallelClustersPerSite: state.maxParallelClustersPerSite,
        requireApprovalBinding: state.requireApprovalBinding,
        requireValidationEvidence: state.requireValidationEvidence,
        failClosedUnsupportedFcaDellHci: state.failClosedUnsupportedFcaDellHci,
        failurePolicy: state.failurePolicy,
      },
      evidenceRetention: {
        targetRef: state.evidenceTargetRef,
        redactSecrets: state.redactSecrets,
      },
      prismElementValidation: {
        credentialRef: state.prismElementCredentialRef,
        timeoutMinutes: state.prismValidationTimeoutMinutes,
        requireClusterHealth: state.requireClusterHealth,
      },
      sites: [{
        siteName: state.siteName,
        hardwareProvider: state.hardwareProvider,
        providerCredentialRef: state.providerCredentialRef,
        bmcCredentialRef: state.bmcCredentialRef,
        bmcCredential: {
          username: state.bmcUsername,
          password: state.bmcPassword,
        },
        concurrencyLimit: state.concurrencyLimit,
        deploymentWindow: {
          timezone: state.deploymentTimezone,
          days: state.deploymentDays,
          start: state.deploymentStart,
          end: state.deploymentEnd,
        },
        networkProfile: {
          bmcSubnet: state.bmcSubnet,
          bmcGateway: state.bmcGateway,
          hostSubnet: state.hostSubnet,
          hostGateway: state.hostGateway,
          cvmSubnet: state.cvmSubnet,
          cvmGateway: state.cvmGateway,
          managementVlanId: state.managementVlanId,
          dnsServers: state.dnsServers,
          ntpServers: state.ntpServers,
        },
        clusters: [{
          clusterName: state.clusterName,
          deploymentType: state.deploymentType,
          hypervisor: state.hypervisor,
          clusterVip: state.clusterVip,
          redundancyFactor: state.redundancyFactor,
          timezone: state.clusterTimezone,
          aosImage: {
            source: state.aosImageSource,
            version: state.aosImageVersion,
            sha256: state.aosImageSha256,
          },
          hypervisorImage: {
            source: state.hypervisorImageSource,
            version: state.hypervisorImageVersion,
            sha256: state.hypervisorImageSha256,
          },
          nodes: state.nodes,
        }],
      }],
    }))
  }, [onYamlChange, state])

  const update = (updates: Partial<typeof state>) => setState(current => ({ ...current, ...updates }))
  const updateNode = (index: number, updates: Partial<Node>) => {
    update({ nodes: state.nodes.map((node, idx) => idx === index ? { ...node, ...updates } : node) })
  }
  const addNode = () => update({ nodes: [...state.nodes, defaultNode(state.nodes.length + 1)] })
  const removeNode = (index: number) => update({ nodes: state.nodes.filter((_, idx) => idx !== index) })
  const credentialOptions = Array.from(new Set([...CREDENTIAL_KEYS, state.providerCredentialRef, state.bmcCredentialRef, state.imageRepositoryCredentialRef, state.prismElementCredentialRef].filter(Boolean)))
  const handleImageBrowse = (kind: 'aos' | 'ahv') => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const source = selectedFileSource(file)
    if (kind === 'aos') {
      update({ aosImageSource: source })
    } else {
      update({ hypervisorImageSource: source })
    }
  }

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title"><Server size={14} /> Deployment Entry</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Foundation Target</label>
            <select className="input" value={state.foundationTarget} onChange={e => update({ foundationTarget: e.target.value })}>
              <option value="embedded_foundation">Embedded Native Foundation</option>
            </select>
          </div>
          <div>
            <label className="label">Foundation Version</label>
            <input className="input" value={state.foundationVersion} onChange={e => update({ foundationVersion: e.target.value })} placeholder="5.11" />
          </div>
          <div>
            <label className="label">Execution Mode</label>
            <select className="input" value={state.engineMode} onChange={e => update({ engineMode: e.target.value, executionScope: e.target.value === 'controlled_uat' ? 'controlled_uat' : 'planning_only' })}>
              <option value="controlled_uat">Controlled UAT deployment</option>
              <option value="planning_only">Planning only</option>
            </select>
          </div>
          <div>
            <label className="label">Compatibility Baseline</label>
            <select className="input" value={state.compatibilityBaseline} onChange={e => update({ compatibilityBaseline: e.target.value })}>
              <option value="foundation_5_11">Foundation 5.11</option>
            </select>
          </div>
          <div>
            <label className="label">Hardware Provider</label>
            <select className="input" value={state.hardwareProvider} onChange={e => update({ hardwareProvider: e.target.value })}>
              <option value="dell_idrac_redfish">Dell iDRAC Redfish</option>
            </select>
          </div>
          <div>
            <label className="label">Runner Identity Ref <span className="text-red-400">*</span></label>
            <input className="input" value={state.runnerIdentityRef} onChange={e => update({ runnerIdentityRef: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title"><KeyRound size={14} /> Dell iDRAC Credentials</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Provider Credential Ref</label>
            <select className="input" value={state.providerCredentialRef} onChange={e => update({ providerCredentialRef: e.target.value })}>
              {credentialOptions.map(key => <option key={key} value={key}>{key}</option>)}
            </select>
          </div>
          <div>
            <label className="label">iDRAC Credential Ref</label>
            <select className="input" value={state.bmcCredentialRef} onChange={e => update({ bmcCredentialRef: e.target.value })}>
              {credentialOptions.map(key => <option key={key} value={key}>{key}</option>)}
            </select>
          </div>
          <div>
            <label className="label">iDRAC Username</label>
            <input className="input" value={state.bmcUsername} onChange={e => update({ bmcUsername: e.target.value })} placeholder="root" autoComplete="off" />
          </div>
          <div>
            <label className="label">iDRAC Password</label>
            <input className="input" type="password" value={state.bmcPassword} onChange={e => update({ bmcPassword: e.target.value })} placeholder="Enter iDRAC password" autoComplete="new-password" />
          </div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title"><HardDrive size={14} /> Foundation Images</p>
        <input ref={aosImageInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleImageBrowse('aos')} />
        <input ref={ahvImageInputRef} type="file" accept={IMAGE_FILE_ACCEPT} className="hidden" onChange={handleImageBrowse('ahv')} />
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label">Repository Endpoint <span className="text-red-400">*</span></label><input className="input" value={state.imageRepositoryEndpoint} onChange={e => update({ imageRepositoryEndpoint: e.target.value })} /></div>
          <div><label className="label">Repository Credential Ref</label><select className="input" value={state.imageRepositoryCredentialRef} onChange={e => update({ imageRepositoryCredentialRef: e.target.value })}>{credentialOptions.map(key => <option key={key} value={key}>{key}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.imageRepositoryVerifyTls} onChange={e => update({ imageRepositoryVerifyTls: e.target.checked })} /> Verify repository TLS</label>
          <div>
            <label className="label">AOS Image Source <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" value={state.aosImageSource} onChange={e => update({ aosImageSource: e.target.value })} />
              <button type="button" className="btn-secondary shrink-0 gap-1.5 px-3" onClick={() => aosImageInputRef.current?.click()} title="Browse for AOS image">
                <FolderOpen size={14} />
                Browse
              </button>
            </div>
          </div>
          <div><label className="label">AOS Version <span className="text-red-400">*</span></label><input className="input" value={state.aosImageVersion} onChange={e => update({ aosImageVersion: e.target.value })} /></div>
          <div><label className="label">AOS SHA256 <span className="text-red-400">*</span></label><input className="input font-mono text-xs" value={state.aosImageSha256} onChange={e => update({ aosImageSha256: e.target.value })} /></div>
          <div>
            <label className="label">AHV Image Source <span className="text-red-400">*</span></label>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" value={state.hypervisorImageSource} onChange={e => update({ hypervisorImageSource: e.target.value })} />
              <button type="button" className="btn-secondary shrink-0 gap-1.5 px-3" onClick={() => ahvImageInputRef.current?.click()} title="Browse for AHV image">
                <FolderOpen size={14} />
                Browse
              </button>
            </div>
          </div>
          <div><label className="label">AHV Version <span className="text-red-400">*</span></label><input className="input" value={state.hypervisorImageVersion} onChange={e => update({ hypervisorImageVersion: e.target.value })} /></div>
          <div><label className="label">AHV SHA256 <span className="text-red-400">*</span></label><input className="input font-mono text-xs" value={state.hypervisorImageSha256} onChange={e => update({ hypervisorImageSha256: e.target.value })} /></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title"><Network size={14} /> Site And Network</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label">Site Name <span className="text-red-400">*</span></label><input className="input" value={state.siteName} onChange={e => update({ siteName: e.target.value })} /></div>
          <div><label className="label">Concurrency Limit</label><input type="number" min={1} className="input" value={state.concurrencyLimit} onChange={e => update({ concurrencyLimit: Number(e.target.value) || 1 })} /></div>
          <div><label className="label">Deployment Timezone</label><input className="input" value={state.deploymentTimezone} onChange={e => update({ deploymentTimezone: e.target.value })} /></div>
          <div><label className="label">Window Start</label><input className="input" value={state.deploymentStart} onChange={e => update({ deploymentStart: e.target.value })} /></div>
          <div><label className="label">Window End</label><input className="input" value={state.deploymentEnd} onChange={e => update({ deploymentEnd: e.target.value })} /></div>
          <div><label className="label">Management VLAN ID</label><input type="number" min={0} className="input" value={state.managementVlanId} onChange={e => update({ managementVlanId: Number(e.target.value) || 0 })} /></div>
          <div><label className="label">BMC Subnet <span className="text-red-400">*</span></label><input className="input" value={state.bmcSubnet} onChange={e => update({ bmcSubnet: e.target.value })} /></div>
          <div><label className="label">BMC Gateway <span className="text-red-400">*</span></label><input className="input" value={state.bmcGateway} onChange={e => update({ bmcGateway: e.target.value })} /></div>
          <div><label className="label">Host Subnet <span className="text-red-400">*</span></label><input className="input" value={state.hostSubnet} onChange={e => update({ hostSubnet: e.target.value })} /></div>
          <div><label className="label">Host Gateway <span className="text-red-400">*</span></label><input className="input" value={state.hostGateway} onChange={e => update({ hostGateway: e.target.value })} /></div>
          <div><label className="label">CVM Subnet <span className="text-red-400">*</span></label><input className="input" value={state.cvmSubnet} onChange={e => update({ cvmSubnet: e.target.value })} /></div>
          <div><label className="label">CVM Gateway <span className="text-red-400">*</span></label><input className="input" value={state.cvmGateway} onChange={e => update({ cvmGateway: e.target.value })} /></div>
          <div className="col-span-3"><label className="label">Deployment Days</label><TagInput values={state.deploymentDays} onChange={values => update({ deploymentDays: values })} placeholder="Sat" /></div>
          <div className="col-span-3"><label className="label">DNS Servers</label><TagInput values={state.dnsServers} onChange={values => update({ dnsServers: values })} placeholder="192.0.2.53" /></div>
          <div className="col-span-3"><label className="label">NTP Servers</label><TagInput values={state.ntpServers} onChange={values => update({ ntpServers: values })} placeholder="192.0.2.123" /></div>
        </div>
      </div>

      <div className="form-section">
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => update({ clusterExpanded: !state.clusterExpanded })} className="btn-ghost p-1">
            {state.clusterExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <p className="form-section-title mb-0"><Server size={14} /> AHV HCI Cluster</p>
          <span className="text-sm font-medium text-gray-300">{state.clusterName || 'New cluster'}</span>
          <span className="badge badge-gray text-xs">{state.nodes.length} nodes</span>
        </div>
        {state.clusterExpanded && (
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label">Cluster Name <span className="text-red-400">*</span></label><input className="input" value={state.clusterName} onChange={e => update({ clusterName: e.target.value })} placeholder="dell-xc770-ahv-hci" /></div>
            <div><label className="label">Cluster VIP <span className="text-red-400">*</span></label><input className="input" value={state.clusterVip} onChange={e => update({ clusterVip: e.target.value })} placeholder="10.0.0.10" /></div>
            <div><label className="label">Deployment Type</label><select className="input" value={state.deploymentType} onChange={e => update({ deploymentType: e.target.value })}><option value="hci">HCI</option></select></div>
            <div><label className="label">Hypervisor</label><select className="input" value={state.hypervisor} onChange={e => update({ hypervisor: e.target.value })}><option value="ahv">AHV</option></select></div>
            <div><label className="label">Redundancy Factor</label><select className="input" value={state.redundancyFactor} onChange={e => update({ redundancyFactor: Number(e.target.value) })}><option value={2}>RF-2 (3 nodes minimum)</option><option value={3}>RF-3 (5 nodes minimum)</option></select></div>
            <div><label className="label">Cluster Timezone</label><select className="input" value={state.clusterTimezone} onChange={e => update({ clusterTimezone: e.target.value })}>{TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}</select></div>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => update({ nodesExpanded: !state.nodesExpanded })} className="btn-ghost p-1">
              {state.nodesExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <p className="form-section-title mb-0"><Server size={14} /> Dell Nodes</p>
          </div>
          <button type="button" className="btn-secondary gap-1.5" onClick={addNode}><Plus size={14} /> Add Node</button>
        </div>
        {state.nodesExpanded && (
          <div className="mt-4 space-y-3">
            {state.nodes.map((node, index) => (
              <div key={index} className="rounded-lg border border-gray-700/60 bg-gray-950/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-gray-200">Node {index + 1}</span>
                    <span className="ml-2 text-xs text-gray-500">{node.hostname || node.nodeSerial || 'Dell XC node'}</span>
                  </div>
                  {state.nodes.length > 1 && (
                    <button type="button" className="btn-ghost p-1.5 text-red-400 hover:text-red-300" onClick={() => removeNode(index)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div><label className="label text-xs">Node Serial <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.nodeSerial} onChange={e => updateNode(index, { nodeSerial: e.target.value })} placeholder="2Z3P..." /></div>
                  <div><label className="label text-xs">Hardware Model <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.hardwareModel} onChange={e => updateNode(index, { hardwareModel: e.target.value })} placeholder="Dell XC770 Core" /></div>
                  <div><label className="label text-xs">Role</label><select className="input text-xs py-1.5" value={node.role} onChange={e => updateNode(index, { role: e.target.value })}><option value="hci">HCI</option></select></div>
                  <div><label className="label text-xs">iDRAC IP <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.bmcAddress} onChange={e => updateNode(index, { bmcAddress: e.target.value })} placeholder="10.0.0.13" /></div>
                  <div><label className="label text-xs">Host IP <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.hostIp} onChange={e => updateNode(index, { hostIp: e.target.value })} placeholder="10.0.0.12" /></div>
                  <div><label className="label text-xs">CVM IP <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.cvmIp} onChange={e => updateNode(index, { cvmIp: e.target.value })} placeholder="10.0.0.11" /></div>
                  <div><label className="label text-xs">Hostname <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.hostname} onChange={e => updateNode(index, { hostname: e.target.value })} placeholder="ahv-01" /></div>
                  <div><label className="label text-xs">Boot Mode</label><select className="input text-xs py-1.5" value={node.bootMode} onChange={e => updateNode(index, { bootMode: e.target.value })}><option value="uefi">UEFI</option><option value="bios">BIOS</option></select></div>
                  <div><label className="label text-xs">CVM RAM GB</label><input type="number" min={12} className="input text-xs py-1.5" value={node.cvmRamGb} onChange={e => updateNode(index, { cvmRamGb: Number(e.target.value) || 12 })} /></div>
                  <div><label className="label text-xs">iDRAC Credential Ref <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={node.bmcCredentialRef} onChange={e => updateNode(index, { bmcCredentialRef: e.target.value })} placeholder={state.bmcCredentialRef} /></div>
                  <div><label className="label text-xs">iDRAC Username Override</label><input className="input text-xs py-1.5" value={node.bmcUsername} onChange={e => updateNode(index, { bmcUsername: e.target.value })} placeholder={state.bmcUsername || 'use site credential'} autoComplete="off" /></div>
                  <div><label className="label text-xs">iDRAC Password Override</label><input className="input text-xs py-1.5" type="password" value={node.bmcPassword} onChange={e => updateNode(index, { bmcPassword: e.target.value })} placeholder="use site credential" autoComplete="new-password" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="form-section">
        <p className="form-section-title"><ShieldCheck size={14} /> Execution Policy</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label">Max Parallel Sites</label><input type="number" min={1} className="input" value={state.maxParallelSites} onChange={e => update({ maxParallelSites: Number(e.target.value) || 1 })} /></div>
          <div><label className="label">Max Clusters Per Site</label><input type="number" min={1} className="input" value={state.maxParallelClustersPerSite} onChange={e => update({ maxParallelClustersPerSite: Number(e.target.value) || 1 })} /></div>
          <div><label className="label">Failure Policy</label><select className="input" value={state.failurePolicy} onChange={e => update({ failurePolicy: e.target.value })}><option value="stop_site">Stop site</option><option value="stop_all">Stop all</option></select></div>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.requireApprovalBinding} onChange={e => update({ requireApprovalBinding: e.target.checked })} /> Require approval binding</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.requireValidationEvidence} onChange={e => update({ requireValidationEvidence: e.target.checked })} /> Require validation evidence</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.failClosedUnsupportedFcaDellHci} onChange={e => update({ failClosedUnsupportedFcaDellHci: e.target.checked })} /> Fail closed on FCA Dell HCI</label>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title"><CheckCircle size={14} /> Prism Element Validation And Evidence</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="label">PE Credential Ref</label><select className="input" value={state.prismElementCredentialRef} onChange={e => update({ prismElementCredentialRef: e.target.value })}>{credentialOptions.map(key => <option key={key} value={key}>{key}</option>)}</select></div>
          <div><label className="label">Validation Timeout Minutes</label><input type="number" min={1} className="input" value={state.prismValidationTimeoutMinutes} onChange={e => update({ prismValidationTimeoutMinutes: Number(e.target.value) || 60 })} /></div>
          <div><label className="label">Evidence Target Ref</label><input className="input" value={state.evidenceTargetRef} onChange={e => update({ evidenceTargetRef: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.requireClusterHealth} onChange={e => update({ requireClusterHealth: e.target.checked })} /> Require cluster health</label>
          <label className="flex items-center gap-2 text-sm text-gray-300"><input type="checkbox" checked={state.redactSecrets} onChange={e => update({ redactSecrets: e.target.checked })} /> Redact secrets</label>
        </div>
      </div>
    </div>
  )
}
