import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Server, RefreshCw, Upload, ShieldCheck } from 'lucide-react'
import { buildClusterCreateYaml } from '../../utils/yaml'
import { TIMEZONES, CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'
import type { ConnectionProfile } from '../../types'
import { apiFetch, authHeaders } from '../../utils/api'

interface Node {
  blockSerial: string
  nodeSerial: string
  nodePosition: string
  nodeRole: 'hyperconverged' | 'storage-only' | 'compute-only'
  ipmiCredentialRef: string
  cvmIp: string
  hostIp: string
  ipmiIp: string
  ipmiMac: string
  ipmiConfigureNow: boolean
  hostname: string
  cvmRamGb: number
}

interface Cluster {
  name: string
  clusterVip: string
  redundancyFactor: 2 | 3
  timezone: string
  hostGateway: string
  hostNetmask: string
  hostVlanId: string
  cvmGateway: string
  cvmNetmask: string
  cvmVlanId: string
  ipmiGateway: string
  ipmiNetmask: string
  ipmiVlanId: string
  noIpmiSubnet: boolean
  skipClusterCreation: boolean
  lockdownMode: boolean
  restrictedShellMode: boolean
  sshUsingPassword: boolean
  externalAccessKeys: string[]
  nodes: Node[]
  expanded: boolean
}

interface Props {
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
  forcedFoundationCentralTarget?: FoundationTarget
}

const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []
type FoundationTarget = 'integrated_pc_fc' | 'standalone_fca' | 'foundation_vm'

const defaultNode = (): Node => ({
  blockSerial: '', nodeSerial: '', nodePosition: 'A', nodeRole: 'hyperconverged',
  ipmiCredentialRef: 'dell-idrac-bmc', cvmIp: '', hostIp: '', ipmiIp: '',
  ipmiMac: '', ipmiConfigureNow: false, hostname: '', cvmRamGb: 20,
})
const defaultCluster = (): Cluster => ({
  name: '',
  clusterVip: '',
  redundancyFactor: 2,
  timezone: 'America/Los_Angeles',
  hostGateway: '',
  hostNetmask: '',
  hostVlanId: '',
  cvmGateway: '',
  cvmNetmask: '',
  cvmVlanId: '',
  ipmiGateway: '',
  ipmiNetmask: '',
  ipmiVlanId: '',
  noIpmiSubnet: false,
  skipClusterCreation: false,
  lockdownMode: false,
  restrictedShellMode: false,
  sshUsingPassword: true,
  externalAccessKeys: [],
  nodes: [defaultNode()],
  expanded: true,
})

const HARDWARE_PLATFORMS = [
  ['auto', 'Autodetect'],
  ['nutanix_nx', 'Nutanix'],
  ['dell_xc', 'Dell'],
  ['lenovo_hx', 'Lenovo'],
  ['ibm_powerpc', 'IBM'],
  ['cisco_ucs', 'Cisco (install via UCS Manager)'],
  ['cisco_standalone', 'Cisco (install without UCS Manager)'],
  ['hpe_proliant', 'HPE'],
  ['hitachi', 'Hitachi'],
  ['inspur', 'Inspur'],
  ['intel', 'Intel'],
  ['nec', 'NEC'],
  ['fujitsu', 'Fujitsu'],
  ['other', 'Other'],
] as const

const LAG_TYPES = [
  ['none', 'No LAG'],
  ['static', 'Static LAG'],
  ['dynamic', 'Dynamic LAG (LACP)'],
] as const

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : fallback
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function asOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asRedundancyFactor(value: unknown): 2 | 3 {
  return asNumber(value, 2) === 3 ? 3 : 2
}

function initialState(
  profile?: ConnectionProfile,
  importedConfig?: unknown,
  forcedFoundationCentralTarget?: FoundationTarget,
) {
  const profileDns = csv(profile?.defaults.dnsServers)
  const profileNtp = csv(profile?.defaults.ntpServers)
  const defaults = {
    fcTarget: (forcedFoundationCentralTarget || 'integrated_pc_fc') as FoundationTarget,
    pcCred: profile?.foundationCentral.credentialRef || profile?.prismCentral.credentialRef || 'foundation_central',
    cvmCred: profile?.prismElement.cvmCredentialRef || 'cvm_credential',
    pcIp: profile?.foundationCentral.endpoint || profile?.prismCentral.endpoint || '',
    fcaApiVersion: 'v4.2.a2',
    hardwareProviderExtId: '',
    hardwareProviderName: '',
    connectionExtId: '',
    aosImageExtId: '',
    hypervisorImageExtId: '',
    hardwarePlatform: 'auto',
    rdmaPassthrough: false,
    lagType: 'none',
    lacpRate: 'fast',
    skipNetworkCheck: false,
    installerIp: '',
    installerNetmask: '',
    installerGateway: '',
    aosPackage: '',
    hypervisorType: 'AHV',
    hypervisorIso: '',
    phoenixIso: '',
    hypervisorCred: profile?.prismElement.cvmCredentialRef || 'default_admin',
    clusterCred: profile?.prismElement.cvmCredentialRef || 'default_admin',
    dnsServers: profileDns.length ? profileDns : ['8.8.8.8'],
    ntpServers: profileNtp.length ? profileNtp : ['0.us.pool.ntp.org'],
    clusters: [defaultCluster()],
  }

  const root = asRecord(importedConfig)
  if (!Object.keys(root).length) return defaults

  const metadata = asRecord(root.ztf_orchestrator)
  const network = asRecord(root.common_network_settings)
  const foundationVmOptions = asRecord(root.foundation_vm_options)
  const imageSettings = asRecord(root.aos_hypervisor_images)
  const importedClusters = Array.isArray(root.create_clusters)
    ? root.create_clusters.map((item): Cluster => {
        const cluster = asRecord(item)
        const nodes = Array.isArray(cluster.nodes_list)
          ? cluster.nodes_list.map((nodeItem): Node => {
              const node = asRecord(nodeItem)
              return {
                blockSerial: asString(node.block_serial),
                nodeSerial: asString(node.node_serial),
                nodePosition: asString(node.node_position, 'A'),
                nodeRole: (['storage-only', 'compute-only'].includes(asString(node.node_role)) ? asString(node.node_role) : 'hyperconverged') as Node['nodeRole'],
                ipmiCredentialRef: asString(node.ipmi_credential_ref, 'dell-idrac-bmc'),
                cvmIp: asString(node.cvm_ip),
                hostIp: asString(node.host_ip),
                ipmiIp: asString(node.ipmi_ip),
                ipmiMac: asString(node.ipmi_mac),
                ipmiConfigureNow: Boolean(node.ipmi_configure_now),
                hostname: asString(node.hypervisor_hostname),
                cvmRamGb: asNumber(node.cvm_ram_gb, 20),
              }
            })
          : [defaultNode()]

        return {
          name: asString(cluster.cluster_name),
          clusterVip: asString(cluster.cluster_vip),
          redundancyFactor: asRedundancyFactor(cluster.redundancy_factor),
          timezone: asString(cluster.timezone, 'UTC'),
          hostGateway: asString(cluster.host_gateway),
          hostNetmask: asString(cluster.host_netmask),
          hostVlanId: cluster.host_vlan_id === undefined ? '' : String(cluster.host_vlan_id),
          cvmGateway: asString(cluster.cvm_gateway),
          cvmNetmask: asString(cluster.cvm_netmask),
          cvmVlanId: cluster.cvm_vlan_id === undefined ? '' : String(cluster.cvm_vlan_id),
          ipmiGateway: asString(cluster.ipmi_gateway),
          ipmiNetmask: asString(cluster.ipmi_netmask),
          ipmiVlanId: cluster.ipmi_vlan_id === undefined ? '' : String(cluster.ipmi_vlan_id),
          noIpmiSubnet: Boolean(cluster.no_ipmi_subnet),
          skipClusterCreation: Boolean(cluster.skip_cluster_creation),
          lockdownMode: Boolean(cluster.lockdown_mode),
          restrictedShellMode: Boolean(cluster.restricted_shell_mode),
          sshUsingPassword: cluster.ssh_using_password !== false,
          externalAccessKeys: asStringArray(cluster.external_access_keys, []),
          nodes: nodes.length ? nodes : [defaultNode()],
          expanded: true,
        }
      })
    : defaults.clusters

  const importedTarget = metadata.foundation_target === 'foundation_vm'
    ? 'foundation_vm'
    : metadata.foundation_central_target === 'standalone_fca'
      ? 'standalone_fca'
      : defaults.fcTarget

  return {
    fcTarget: forcedFoundationCentralTarget || importedTarget,
    pcCred: asString(root.foundation_vm_credential, asString(root.fca_credential, asString(root.pc_credential, defaults.pcCred))),
    cvmCred: asString(root.cvm_credential, defaults.cvmCred),
    pcIp: asString(root.foundation_vm_ip, asString(root.fca_ip, asString(root.pc_ip, defaults.pcIp))),
    fcaApiVersion: asString(root.fca_api_version, defaults.fcaApiVersion),
    hardwareProviderExtId: asString(root.hardware_provider_ext_id, defaults.hardwareProviderExtId),
    hardwareProviderName: asString(root.hardware_provider_name, defaults.hardwareProviderName),
    connectionExtId: asString(root.connection_ext_id, defaults.connectionExtId),
    aosImageExtId: asString(root.aos_image_ext_id, defaults.aosImageExtId),
    hypervisorImageExtId: asString(root.hypervisor_image_ext_id, defaults.hypervisorImageExtId),
    hardwarePlatform: asString(foundationVmOptions.hardware_platform, defaults.hardwarePlatform),
    rdmaPassthrough: Boolean(foundationVmOptions.rdma_passthrough),
    lagType: asString(foundationVmOptions.lag_type, defaults.lagType),
    lacpRate: asString(foundationVmOptions.lacp_rate, defaults.lacpRate),
    skipNetworkCheck: Boolean(foundationVmOptions.skip_network_check),
    installerIp: asString(foundationVmOptions.installer_ip, defaults.installerIp),
    installerNetmask: asString(foundationVmOptions.installer_netmask, defaults.installerNetmask),
    installerGateway: asString(foundationVmOptions.installer_gateway, defaults.installerGateway),
    aosPackage: asString(imageSettings.aos_package, defaults.aosPackage),
    hypervisorType: asString(imageSettings.hypervisor_type, defaults.hypervisorType),
    hypervisorIso: asString(imageSettings.hypervisor_iso, defaults.hypervisorIso),
    phoenixIso: asString(imageSettings.phoenix_iso, defaults.phoenixIso),
    hypervisorCred: asString(root.hypervisor_credential, defaults.hypervisorCred),
    clusterCred: asString(root.cluster_credential, defaults.clusterCred),
    dnsServers: asStringArray(network.dns_servers, defaults.dnsServers),
    ntpServers: asStringArray(network.ntp_servers, defaults.ntpServers),
    clusters: importedClusters.length ? importedClusters : defaults.clusters,
  }
}

export default function ClusterCreateForm({
  onYamlChange,
  profile,
  importedConfig,
  forcedFoundationCentralTarget,
}: Props) {
  const initial = () => initialState(profile, importedConfig, forcedFoundationCentralTarget)
  const [fcTarget, setFcTarget] = useState<FoundationTarget>(() => initial().fcTarget)
  const [pcCred, setPcCred] = useState(() => initial().pcCred)
  const [cvmCred, setCvmCred] = useState(() => initial().cvmCred)
  const [pcIp, setPcIp] = useState(() => initial().pcIp)
  const [fcaApiVersion, setFcaApiVersion] = useState(() => initial().fcaApiVersion)
  const [hardwareProviderExtId, setHardwareProviderExtId] = useState(() => initial().hardwareProviderExtId)
  const [hardwareProviderName, setHardwareProviderName] = useState(() => initial().hardwareProviderName)
  const [connectionExtId, setConnectionExtId] = useState(() => initial().connectionExtId)
  const [aosImageExtId, setAosImageExtId] = useState(() => initial().aosImageExtId)
  const [hypervisorImageExtId, setHypervisorImageExtId] = useState(() => initial().hypervisorImageExtId)
  const [hardwarePlatform, setHardwarePlatform] = useState(() => initial().hardwarePlatform)
  const [rdmaPassthrough, setRdmaPassthrough] = useState(() => initial().rdmaPassthrough)
  const [lagType, setLagType] = useState(() => initial().lagType)
  const [lacpRate, setLacpRate] = useState(() => initial().lacpRate)
  const [skipNetworkCheck, setSkipNetworkCheck] = useState(() => initial().skipNetworkCheck)
  const [installerIp, setInstallerIp] = useState(() => initial().installerIp)
  const [installerNetmask, setInstallerNetmask] = useState(() => initial().installerNetmask)
  const [installerGateway, setInstallerGateway] = useState(() => initial().installerGateway)
  const [aosPackage, setAosPackage] = useState(() => initial().aosPackage)
  const [hypervisorType, setHypervisorType] = useState(() => initial().hypervisorType)
  const [hypervisorIso, setHypervisorIso] = useState(() => initial().hypervisorIso)
  const [phoenixIso, setPhoenixIso] = useState(() => initial().phoenixIso)
  const [hypervisorCred, setHypervisorCred] = useState(() => initial().hypervisorCred)
  const [clusterCred, setClusterCred] = useState(() => initial().clusterCred)
  const [dnsServers, setDnsServers] = useState<string[]>(() => initial().dnsServers)
  const [ntpServers, setNtpServers] = useState<string[]>(() => initial().ntpServers)
  const [clusters, setClusters] = useState<Cluster[]>(() => initial().clusters)
  const [latestYaml, setLatestYaml] = useState('')
  const [operationMessage, setOperationMessage] = useState('')
  const [operationBusy, setOperationBusy] = useState('')
  const [imageType, setImageType] = useState<'nos' | 'hypervisor' | 'phoenix'>('nos')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const credentialOptions = Array.from(new Set([
    ...CREDENTIAL_KEYS, pcCred, cvmCred, hypervisorCred, clusterCred,
    ...clusters.flatMap(cluster => cluster.nodes.map(node => node.ipmiCredentialRef)),
  ].filter(Boolean)))

  useEffect(() => {
    if (!importedConfig) return
    const next = initialState(profile, importedConfig, forcedFoundationCentralTarget)
    setFcTarget(next.fcTarget)
    setPcCred(next.pcCred)
    setCvmCred(next.cvmCred)
    setPcIp(next.pcIp)
    setFcaApiVersion(next.fcaApiVersion)
    setHardwareProviderExtId(next.hardwareProviderExtId)
    setHardwareProviderName(next.hardwareProviderName)
    setConnectionExtId(next.connectionExtId)
    setAosImageExtId(next.aosImageExtId)
    setHypervisorImageExtId(next.hypervisorImageExtId)
    setHardwarePlatform(next.hardwarePlatform)
    setRdmaPassthrough(next.rdmaPassthrough)
    setLagType(next.lagType)
    setLacpRate(next.lacpRate)
    setSkipNetworkCheck(next.skipNetworkCheck)
    setInstallerIp(next.installerIp)
    setInstallerNetmask(next.installerNetmask)
    setInstallerGateway(next.installerGateway)
    setAosPackage(next.aosPackage)
    setHypervisorType(next.hypervisorType)
    setHypervisorIso(next.hypervisorIso)
    setPhoenixIso(next.phoenixIso)
    setHypervisorCred(next.hypervisorCred)
    setClusterCred(next.clusterCred)
    setDnsServers(next.dnsServers)
    setNtpServers(next.ntpServers)
    setClusters(next.clusters)
  }, [forcedFoundationCentralTarget, importedConfig, profile])

  useEffect(() => {
    if (!pcIp) return
    const yaml = buildClusterCreateYaml({
      foundationCentralTarget: fcTarget,
      pcCredential: pcCred,
      cvmCredential: cvmCred,
      pcIp,
      fcaApiVersion,
      hardwareProviderExtId,
      hardwareProviderName,
      connectionExtId,
      aosImageExtId,
      hypervisorImageExtId,
      hardwarePlatform,
      rdmaPassthrough,
      lagType,
      lacpRate,
      skipNetworkCheck,
      installerIp,
      installerNetmask,
      installerGateway,
      aosPackage,
      hypervisorType,
      hypervisorIso,
      phoenixIso,
      hypervisorCredential: hypervisorCred,
      clusterCredential: clusterCred,
      dnsServers,
      ntpServers,
      clusters: clusters.map(c => ({
        name: c.name,
        clusterVip: c.clusterVip,
        redundancyFactor: c.redundancyFactor,
        timezone: c.timezone,
        hostGateway: c.hostGateway,
        hostNetmask: c.hostNetmask,
        hostVlanId: asOptionalNumber(c.hostVlanId),
        cvmGateway: c.cvmGateway,
        cvmNetmask: c.cvmNetmask,
        cvmVlanId: asOptionalNumber(c.cvmVlanId),
        ipmiGateway: c.ipmiGateway,
        ipmiNetmask: c.ipmiNetmask,
        ipmiVlanId: asOptionalNumber(c.ipmiVlanId),
        noIpmiSubnet: c.noIpmiSubnet,
        skipClusterCreation: c.skipClusterCreation,
        lockdownMode: c.lockdownMode,
        restrictedShellMode: c.restrictedShellMode,
        sshUsingPassword: c.sshUsingPassword,
        externalAccessKeys: c.externalAccessKeys,
        nodes: c.nodes,
      })),
    })
    setLatestYaml(yaml)
    onYamlChange(yaml)
  }, [
    aosImageExtId,
    connectionExtId,
    cvmCred,
    dnsServers,
    fcTarget,
    fcaApiVersion,
    hardwareProviderExtId,
    hardwareProviderName,
    hardwarePlatform,
    hypervisorImageExtId,
    hypervisorIso,
    hypervisorCred,
    clusterCred,
    phoenixIso,
    hypervisorType,
    installerGateway,
    installerIp,
    installerNetmask,
    lagType,
    lacpRate,
    skipNetworkCheck,
    ntpServers,
    onYamlChange,
    pcCred,
    pcIp,
    rdmaPassthrough,
    aosPackage,
    clusters,
  ])

  const addCluster = () => setClusters(p => [...p, defaultCluster()])
  const removeCluster = (i: number) => setClusters(p => p.filter((_, idx) => idx !== i))
  const updateCluster = (i: number, updates: Partial<Cluster>) =>
    setClusters(p => p.map((c, idx) => idx === i ? { ...c, ...updates } : c))
  const addNode = (ci: number) =>
    setClusters(p => p.map((c, i) => i === ci ? { ...c, nodes: [...c.nodes, defaultNode()] } : c))
  const removeNode = (ci: number, ni: number) =>
    setClusters(p => p.map((c, i) => i === ci ? { ...c, nodes: c.nodes.filter((_, j) => j !== ni) } : c))
  const updateNode = (ci: number, ni: number, updates: Partial<Node>) =>
    setClusters(p => p.map((c, i) => i === ci
      ? { ...c, nodes: c.nodes.map((n, j) => j === ni ? { ...n, ...updates } : n) }
      : c
    ))

  const runFoundationOperation = async (operation: 'validate' | 'images' | 'ipmi-test' | 'progress') => {
    setOperationBusy(operation)
    setOperationMessage('')
    try {
      const resp = await apiFetch(`/api/foundation-vm/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configContent: latestYaml }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || (Array.isArray(data.errors) ? data.errors.join('; ') : 'Foundation operation failed'))
      if (operation === 'images') {
        const aos = Array.isArray(data.inventory?.aos) ? data.inventory.aos.length : 0
        const hypervisors = data.inventory?.hypervisors && typeof data.inventory.hypervisors === 'object'
          ? Object.values(data.inventory.hypervisors as Record<string, unknown[]>).reduce((count, items) => count + (Array.isArray(items) ? items.length : 0), 0)
          : 0
        setOperationMessage(`Image inventory refreshed: ${aos} AOS packages, ${hypervisors} hypervisor images.`)
      } else if (operation === 'ipmi-test') {
        setOperationMessage(`IPMI credential test: ${data.passed} passed, ${data.failed} failed.`)
      } else if (operation === 'progress') {
        setOperationMessage(`Foundation status: ${data.detail || data.phase} (${data.percent || 0}%).`)
      } else {
        setOperationMessage(`Validation passed. Native payload SHA-256: ${data.payloadSha256}`)
      }
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : 'Foundation operation failed')
    } finally {
      setOperationBusy('')
    }
  }

  const uploadFoundationImage = async () => {
    if (!imageFile) return
    setOperationBusy('upload')
    setOperationMessage('')
    try {
      const form = new FormData()
      form.append('file', imageFile)
      form.append('installerType', imageType)
      form.append('configContent', latestYaml)
      const resp = await fetch('/api/foundation-vm/images/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || 'Foundation image upload failed')
      setOperationMessage(`Uploaded ${data.filename}; SHA-256 ${data.sha256}.`)
      setImageFile(null)
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : 'Foundation image upload failed')
    } finally {
      setOperationBusy('')
    }
  }
  const targetLabel = fcTarget === 'foundation_vm'
    ? 'Foundation VM'
    : fcTarget === 'standalone_fca'
      ? 'Standalone Foundation Central Appliance'
      : 'Foundation Central'

  return (
    <div className="space-y-5">
      {/* Global Settings */}
      <div className="form-section">
        <p className="form-section-title"><Server size={14} /> Global Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Foundation Target</label>
            <select
              className="input"
              value={fcTarget}
              onChange={e => setFcTarget(e.target.value as FoundationTarget)}
              disabled={Boolean(forcedFoundationCentralTarget)}
            >
              <option value="integrated_pc_fc">Integrated Prism Central Foundation Central</option>
              <option value="standalone_fca">Standalone Foundation Central Appliance</option>
              <option value="foundation_vm">Classic Foundation VM</option>
            </select>
          </div>
          {fcTarget !== 'foundation_vm' && (
            <>
              <div>
                <label className="label">{targetLabel} Credential Reference</label>
                <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>
                  {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="label">CVM Credential Reference</label>
                <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>
                  {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </>
          )}
          {fcTarget === 'foundation_vm' && (
            <>
              <div>
                <label className="label">Hypervisor Credential Reference</label>
                <select className="input" value={hypervisorCred} onChange={e => setHypervisorCred(e.target.value)}>
                  {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Cluster Security Credential Reference</label>
                <select className="input" value={clusterCred} onChange={e => setClusterCred(e.target.value)}>
                  {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="col-span-2">
            <label className="label">{targetLabel} IP / FQDN <span className="text-red-400">*</span></label>
            <input
              className="input"
              value={pcIp}
              onChange={e => setPcIp(e.target.value)}
              placeholder={fcTarget === 'foundation_vm' ? '192.0.2.10 or http://192.0.2.10:8000' : '10.0.0.100'}
            />
          </div>
          {fcTarget === 'standalone_fca' && (
            <>
              <div>
                <label className="label">Lifecycle API Version</label>
                <input className="input" value={fcaApiVersion} onChange={e => setFcaApiVersion(e.target.value)} placeholder="v4.2.a2" />
              </div>
              <div>
                <label className="label">Hardware Provider Ext ID</label>
                <input className="input" value={hardwareProviderExtId} onChange={e => setHardwareProviderExtId(e.target.value)} placeholder="optional provider extId" />
              </div>
              <div>
                <label className="label">Hardware Provider Name</label>
                <input className="input" value={hardwareProviderName} onChange={e => setHardwareProviderName(e.target.value)} placeholder="optional provider name" />
              </div>
              <div>
                <label className="label">Connection Ext ID</label>
                <input className="input" value={connectionExtId} onChange={e => setConnectionExtId(e.target.value)} placeholder="optional connection extId" />
              </div>
              <div>
                <label className="label">AOS Image Ext ID</label>
                <input className="input" value={aosImageExtId} onChange={e => setAosImageExtId(e.target.value)} placeholder="optional image extId" />
              </div>
              <div>
                <label className="label">Hypervisor Image Ext ID</label>
                <input className="input" value={hypervisorImageExtId} onChange={e => setHypervisorImageExtId(e.target.value)} placeholder="optional image extId" />
              </div>
            </>
          )}
        </div>
      </div>

      {fcTarget === 'foundation_vm' && (
        <div className="form-section">
          <p className="form-section-title">Foundation VM Start Options</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Hardware Platform</label>
              <select className="input" value={hardwarePlatform} onChange={e => setHardwarePlatform(e.target.value)}>
                {HARDWARE_PLATFORMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Host/CVM LAG Mode</label>
              <select className="input" value={lagType} onChange={e => setLagType(e.target.value)}>
                {LAG_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <label className="label flex items-center gap-3 rounded-lg border border-border/70 bg-gray-900/60 px-3 py-2 mt-6">
              <input
                type="checkbox"
                checked={rdmaPassthrough}
                onChange={e => setRdmaPassthrough(e.target.checked)}
              />
              RDMA passthrough
            </label>
            {lagType === 'dynamic' && (
              <div>
                <label className="label">LACP Rate</label>
                <select className="input" value={lacpRate} onChange={e => setLacpRate(e.target.value)}>
                  <option value="fast">Fast</option>
                  <option value="slow">Slow</option>
                </select>
              </div>
            )}
            <label className="label flex items-center gap-3 rounded-lg border border-border/70 bg-gray-900/60 px-3 py-2 mt-6">
              <input type="checkbox" checked={skipNetworkCheck} onChange={e => setSkipNetworkCheck(e.target.checked)} />
              Skip routed-network validation
            </label>
            <div>
              <label className="label">Installer IP</label>
              <input className="input" value={installerIp} onChange={e => setInstallerIp(e.target.value)} placeholder="optional review value" />
            </div>
            <div>
              <label className="label">Installer Netmask</label>
              <input className="input" value={installerNetmask} onChange={e => setInstallerNetmask(e.target.value)} placeholder="255.255.255.0" />
            </div>
            <div>
              <label className="label">Installer Gateway</label>
              <input className="input" value={installerGateway} onChange={e => setInstallerGateway(e.target.value)} placeholder="192.0.2.1" />
            </div>
          </div>
        </div>
      )}

      {fcTarget === 'foundation_vm' && (
        <div className="form-section">
          <p className="form-section-title">AOS / Hypervisor</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">AOS Package</label>
              <input className="input" value={aosPackage} onChange={e => setAosPackage(e.target.value)} placeholder="AOS package name or path" />
            </div>
            <div>
              <label className="label">Hypervisor</label>
              <select className="input" value={hypervisorType} onChange={e => setHypervisorType(e.target.value)}>
                <option value="AHV">AHV</option>
                <option value="ESXi">ESXi</option>
                <option value="Hyper-V">Hyper-V</option>
              </select>
            </div>
            <div>
              <label className="label">Hypervisor ISO</label>
              <input className="input" value={hypervisorIso} onChange={e => setHypervisorIso(e.target.value)} placeholder="AHV ISO name or path" />
            </div>
            <div>
              <label className="label">Phoenix ISO (optional)</label>
              <input className="input" value={phoenixIso} onChange={e => setPhoenixIso(e.target.value)} placeholder="Phoenix ISO name" />
            </div>
          </div>
          <div className="mt-4 border-t border-border/60 pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => runFoundationOperation('images')} disabled={Boolean(operationBusy)} className="btn-secondary gap-1.5">
                <RefreshCw size={14} className={operationBusy === 'images' ? 'animate-spin' : ''} /> Refresh inventory
              </button>
              <button type="button" onClick={() => runFoundationOperation('validate')} disabled={Boolean(operationBusy)} className="btn-secondary gap-1.5">
                <ShieldCheck size={14} /> Validate native payload
              </button>
              <button type="button" onClick={() => runFoundationOperation('ipmi-test')} disabled={Boolean(operationBusy)} className="btn-secondary gap-1.5">
                <ShieldCheck size={14} /> Test IPMI credentials
              </button>
              <button type="button" onClick={() => runFoundationOperation('progress')} disabled={Boolean(operationBusy)} className="btn-secondary gap-1.5">
                <RefreshCw size={14} /> Check progress
              </button>
            </div>
            <div className="grid grid-cols-[10rem_minmax(0,1fr)_auto] gap-2 items-end">
              <div>
                <label className="label">Image type</label>
                <select className="input" value={imageType} onChange={e => setImageType(e.target.value as typeof imageType)}>
                  <option value="nos">AOS package</option>
                  <option value="hypervisor">Hypervisor ISO</option>
                  <option value="phoenix">Phoenix ISO</option>
                </select>
              </div>
              <div>
                <label className="label">Controlled image staging</label>
                <input className="input" type="file" onChange={e => setImageFile(e.target.files?.[0] || null)} />
              </div>
              <button type="button" onClick={uploadFoundationImage} disabled={!imageFile || Boolean(operationBusy)} className="btn-primary gap-1.5">
                <Upload size={14} /> Upload
              </button>
            </div>
            {operationMessage && <p className="text-xs text-gray-400 break-words">{operationMessage}</p>}
          </div>
        </div>
      )}

      {/* Network */}
      <div className="form-section">
        <p className="form-section-title">Network Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">DNS Servers</label>
            <TagInput values={dnsServers} onChange={setDnsServers} placeholder="8.8.8.8" />
          </div>
          <div>
            <label className="label">NTP Servers</label>
            <TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" />
          </div>
        </div>
      </div>

      {/* Clusters */}
      <div className="space-y-4">
        {clusters.map((cluster, ci) => (
          <div key={ci} className="card border-border/70">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => updateCluster(ci, { expanded: !cluster.expanded })}
                className="btn-ghost p-1"
              >
                {cluster.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              <h4 className="font-semibold text-gray-200 flex-1">
                {cluster.name || `Cluster ${ci + 1}`}
              </h4>
              <span className="badge badge-gray text-xs">{cluster.nodes.length} nodes</span>
              {clusters.length > 1 && (
                <button onClick={() => removeCluster(ci)} className="btn-ghost p-1 text-red-400 hover:text-red-300">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {cluster.expanded && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Cluster Name</label>
                    <input className="input" value={cluster.name} onChange={e => updateCluster(ci, { name: e.target.value })} placeholder="my-cluster-01" />
                  </div>
                  <div>
                    <label className="label">Cluster VIP</label>
                    <input className="input" value={cluster.clusterVip} onChange={e => updateCluster(ci, { clusterVip: e.target.value })} placeholder="10.0.0.10" />
                  </div>
                  <div>
                    <label className="label">Redundancy Factor</label>
                    <select className="input" value={cluster.redundancyFactor} onChange={e => updateCluster(ci, { redundancyFactor: Number(e.target.value) as 2 | 3 })}>
                      <option value={2}>RF-2 (3 nodes minimum)</option>
                      <option value={3}>RF-3 (5 nodes minimum)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Timezone</label>
                    <select className="input" value={cluster.timezone} onChange={e => updateCluster(ci, { timezone: e.target.value })}>
                      {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>

                {(fcTarget === 'standalone_fca' || fcTarget === 'foundation_vm') && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">CVM Gateway <span className="text-red-400">*</span></label>
                      <input className="input" value={cluster.cvmGateway} onChange={e => updateCluster(ci, { cvmGateway: e.target.value })} placeholder="10.0.0.1" />
                    </div>
                    <div>
                      <label className="label">CVM Netmask</label>
                      <input className="input" value={cluster.cvmNetmask} onChange={e => updateCluster(ci, { cvmNetmask: e.target.value })} placeholder="255.255.255.0" />
                    </div>
                    <div>
                      <label className="label">CVM VLAN ID</label>
                      <input className="input" type="number" min={1} max={4094} value={cluster.cvmVlanId} onChange={e => updateCluster(ci, { cvmVlanId: e.target.value })} placeholder="optional" />
                    </div>
                    <div>
                      <label className="label">Host Gateway</label>
                      <input className="input" value={cluster.hostGateway} onChange={e => updateCluster(ci, { hostGateway: e.target.value })} placeholder="defaults to CVM gateway" />
                    </div>
                    <div>
                      <label className="label">Host Netmask</label>
                      <input className="input" value={cluster.hostNetmask} onChange={e => updateCluster(ci, { hostNetmask: e.target.value })} placeholder="defaults to CVM netmask" />
                    </div>
                    <div>
                      <label className="label">Host VLAN ID</label>
                      <input className="input" type="number" min={1} max={4094} value={cluster.hostVlanId} onChange={e => updateCluster(ci, { hostVlanId: e.target.value })} placeholder="defaults to CVM VLAN" />
                    </div>
                    <div>
                      <label className="label">IPMI Gateway</label>
                      <input className="input" value={cluster.ipmiGateway} onChange={e => updateCluster(ci, { ipmiGateway: e.target.value })} placeholder="10.0.0.1" disabled={cluster.noIpmiSubnet} />
                    </div>
                    <div>
                      <label className="label">IPMI Netmask</label>
                      <input className="input" value={cluster.ipmiNetmask} onChange={e => updateCluster(ci, { ipmiNetmask: e.target.value })} placeholder="255.255.255.0" disabled={cluster.noIpmiSubnet} />
                    </div>
                    <div>
                      <label className="label">IPMI VLAN ID</label>
                      <input className="input" type="number" min={1} max={4094} value={cluster.ipmiVlanId} onChange={e => updateCluster(ci, { ipmiVlanId: e.target.value })} placeholder="optional" disabled={cluster.noIpmiSubnet} />
                    </div>
                    {fcTarget === 'foundation_vm' && (
                      <>
                        <label className="label flex items-center gap-3 rounded-lg border border-border/70 bg-gray-900/60 px-3 py-2">
                          <input type="checkbox" checked={cluster.noIpmiSubnet} onChange={e => updateCluster(ci, { noIpmiSubnet: e.target.checked })} />
                          IPMI has no subnet
                        </label>
                        <label className="label flex items-center gap-3 rounded-lg border border-border/70 bg-gray-900/60 px-3 py-2">
                          <input type="checkbox" checked={cluster.skipClusterCreation} onChange={e => updateCluster(ci, { skipClusterCreation: e.target.checked })} />
                          Skip cluster formation
                        </label>
                      </>
                    )}
                  </div>
                )}

                {fcTarget === 'foundation_vm' && (
                  <div className="grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
                    <label className="label flex items-center gap-3">
                      <input type="checkbox" checked={cluster.lockdownMode} onChange={e => updateCluster(ci, { lockdownMode: e.target.checked })} />
                      Lockdown mode
                    </label>
                    <label className="label flex items-center gap-3">
                      <input type="checkbox" checked={cluster.restrictedShellMode} onChange={e => updateCluster(ci, { restrictedShellMode: e.target.checked })} />
                      Restricted shell
                    </label>
                    <label className="label flex items-center gap-3">
                      <input type="checkbox" checked={cluster.sshUsingPassword} onChange={e => updateCluster(ci, { sshUsingPassword: e.target.checked })} />
                      SSH password access
                    </label>
                    <div className="col-span-3">
                      <label className="label">External SSH public keys</label>
                      <TagInput values={cluster.externalAccessKeys} onChange={values => updateCluster(ci, { externalAccessKeys: values })} placeholder="ssh-ed25519 AAAA..." />
                    </div>
                  </div>
                )}

                {/* Nodes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Nodes</label>
                    <button onClick={() => addNode(ci)} className="btn-ghost text-xs gap-1 py-1">
                      <Plus size={12} />Add Node
                    </button>
                  </div>
                  <div className="space-y-2">
                    {cluster.nodes.map((node, ni) => (
                      <div key={ni} className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-gray-900/80 border border-border/50 items-end">
                        {fcTarget === 'foundation_vm' && (
                          <>
                            <div>
                              <label className="label text-xs">Block Serial</label>
                              <input className="input text-xs py-1.5" value={node.blockSerial} onChange={e => updateNode(ci, ni, { blockSerial: e.target.value })} placeholder="optional chassis serial" />
                            </div>
                            <div>
                              <label className="label text-xs">Node Position</label>
                              <select className="input text-xs py-1.5" value={node.nodePosition} onChange={e => updateNode(ci, ni, { nodePosition: e.target.value })}>
                                {['A', 'B', 'C', 'D'].map(position => <option key={position} value={position}>{position}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="label text-xs">Node Role</label>
                              <select className="input text-xs py-1.5" value={node.nodeRole} onChange={e => updateNode(ci, ni, { nodeRole: e.target.value as Node['nodeRole'] })}>
                                <option value="hyperconverged">Hyperconverged</option>
                                <option value="storage-only">Storage-only</option>
                                <option value="compute-only">Compute-only</option>
                              </select>
                            </div>
                            <div>
                              <label className="label text-xs">IPMI Credential Reference</label>
                              <select className="input text-xs py-1.5" value={node.ipmiCredentialRef} onChange={e => updateNode(ci, ni, { ipmiCredentialRef: e.target.value })}>
                                {credentialOptions.map(key => <option key={key} value={key}>{key}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                        <div>
                          <label className="label text-xs">Node Serial</label>
                          <input className="input text-xs py-1.5" value={node.nodeSerial} onChange={e => updateNode(ci, ni, { nodeSerial: e.target.value })} placeholder="2Z3P..." />
                        </div>
                        <div>
                          <label className="label text-xs">CVM IP</label>
                          <input className="input text-xs py-1.5" value={node.cvmIp} onChange={e => updateNode(ci, ni, { cvmIp: e.target.value })} placeholder="10.0.0.11" disabled={node.nodeRole === 'compute-only'} />
                        </div>
                        <div>
                          <label className="label text-xs">Host IP</label>
                          <input className="input text-xs py-1.5" value={node.hostIp} onChange={e => updateNode(ci, ni, { hostIp: e.target.value })} placeholder="10.0.0.12" />
                        </div>
                        <div>
                          <label className="label text-xs">IPMI IP</label>
                          <input className="input text-xs py-1.5" value={node.ipmiIp} onChange={e => updateNode(ci, ni, { ipmiIp: e.target.value })} placeholder="10.0.0.13" />
                        </div>
                        <div>
                          <label className="label text-xs">IPMI MAC</label>
                          <input className="input text-xs py-1.5" value={node.ipmiMac} onChange={e => updateNode(ci, ni, { ipmiMac: e.target.value })} placeholder={node.ipmiConfigureNow ? 'required' : 'optional'} />
                        </div>
                        {fcTarget === 'foundation_vm' && (
                          <label className="label text-xs flex items-center gap-2 rounded-md border border-border/70 px-3 py-2">
                            <input type="checkbox" checked={node.ipmiConfigureNow} onChange={e => updateNode(ci, ni, { ipmiConfigureNow: e.target.checked })} />
                            Configure IPMI network
                          </label>
                        )}
                        <div>
                          <label className="label text-xs">Hostname</label>
                          <input className="input text-xs py-1.5" value={node.hostname} onChange={e => updateNode(ci, ni, { hostname: e.target.value })} placeholder="ahv-01" />
                        </div>
                        <div>
                          <label className="label text-xs">CVM RAM (GB)</label>
                          <input className="input text-xs py-1.5" type="number" value={node.cvmRamGb} onChange={e => updateNode(ci, ni, { cvmRamGb: Number(e.target.value) })} min={20} disabled={node.nodeRole === 'compute-only'} />
                        </div>
                        <div className="flex justify-end">
                          {cluster.nodes.length > 1 && (
                            <button onClick={() => removeNode(ci, ni)} className="btn-ghost p-1.5 text-red-400 hover:text-red-300">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <button onClick={addCluster} className="btn-secondary w-full justify-center gap-2">
          <Plus size={14} />
          Add Cluster
        </button>
      </div>
    </div>
  )
}
