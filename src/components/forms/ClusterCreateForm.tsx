import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Server } from 'lucide-react'
import { buildClusterCreateYaml } from '../../utils/yaml'
import { TIMEZONES, CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'
import type { ConnectionProfile } from '../../types'

interface Node {
  nodeSerial: string
  cvmIp: string
  hostIp: string
  ipmiIp: string
  hostname: string
  cvmRamGb: number
}

interface Cluster {
  name: string
  clusterVip: string
  redundancyFactor: 2 | 3
  timezone: string
  nodes: Node[]
  expanded: boolean
}

interface Props {
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
  forcedFoundationCentralTarget?: 'integrated_pc_fc' | 'standalone_fca'
}

const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []

const defaultNode = (): Node => ({ nodeSerial: '', cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 })
const defaultCluster = (): Cluster => ({
  name: '',
  clusterVip: '',
  redundancyFactor: 2,
  timezone: 'America/Los_Angeles',
  nodes: [defaultNode()],
  expanded: true,
})

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

function asRedundancyFactor(value: unknown): 2 | 3 {
  return asNumber(value, 2) === 3 ? 3 : 2
}

function initialState(
  profile?: ConnectionProfile,
  importedConfig?: unknown,
  forcedFoundationCentralTarget?: 'integrated_pc_fc' | 'standalone_fca',
) {
  const profileDns = csv(profile?.defaults.dnsServers)
  const profileNtp = csv(profile?.defaults.ntpServers)
  const defaults = {
    fcTarget: (forcedFoundationCentralTarget || 'integrated_pc_fc') as 'integrated_pc_fc' | 'standalone_fca',
    pcCred: profile?.foundationCentral.credentialRef || profile?.prismCentral.credentialRef || 'foundation_central',
    cvmCred: profile?.prismElement.cvmCredentialRef || 'cvm_credential',
    pcIp: profile?.foundationCentral.endpoint || profile?.prismCentral.endpoint || '',
    fcaApiVersion: 'v4.2.a2',
    hardwareProviderExtId: '',
    hardwareProviderName: '',
    connectionExtId: '',
    aosImageExtId: '',
    hypervisorImageExtId: '',
    dnsServers: profileDns.length ? profileDns : ['8.8.8.8'],
    ntpServers: profileNtp.length ? profileNtp : ['0.us.pool.ntp.org'],
    clusters: [defaultCluster()],
  }

  const root = asRecord(importedConfig)
  if (!Object.keys(root).length) return defaults

  const metadata = asRecord(root.ztf_orchestrator)
  const network = asRecord(root.common_network_settings)
  const importedClusters = Array.isArray(root.create_clusters)
    ? root.create_clusters.map((item): Cluster => {
        const cluster = asRecord(item)
        const nodes = Array.isArray(cluster.nodes_list)
          ? cluster.nodes_list.map((nodeItem): Node => {
              const node = asRecord(nodeItem)
              return {
                nodeSerial: asString(node.node_serial),
                cvmIp: asString(node.cvm_ip),
                hostIp: asString(node.host_ip),
                ipmiIp: asString(node.ipmi_ip),
                hostname: asString(node.hypervisor_hostname),
                cvmRamGb: asNumber(node.cvm_ram_gb, 12),
              }
            })
          : [defaultNode()]

        return {
          name: asString(cluster.cluster_name),
          clusterVip: asString(cluster.cluster_vip),
          redundancyFactor: asRedundancyFactor(cluster.redundancy_factor),
          timezone: asString(cluster.timezone, 'UTC'),
          nodes: nodes.length ? nodes : [defaultNode()],
          expanded: true,
        }
      })
    : defaults.clusters

  return {
    fcTarget: forcedFoundationCentralTarget || (metadata.foundation_central_target === 'standalone_fca' ? 'standalone_fca' as const : defaults.fcTarget),
    pcCred: asString(root.fca_credential, asString(root.pc_credential, defaults.pcCred)),
    cvmCred: asString(root.cvm_credential, defaults.cvmCred),
    pcIp: asString(root.fca_ip, asString(root.pc_ip, defaults.pcIp)),
    fcaApiVersion: asString(root.fca_api_version, defaults.fcaApiVersion),
    hardwareProviderExtId: asString(root.hardware_provider_ext_id, defaults.hardwareProviderExtId),
    hardwareProviderName: asString(root.hardware_provider_name, defaults.hardwareProviderName),
    connectionExtId: asString(root.connection_ext_id, defaults.connectionExtId),
    aosImageExtId: asString(root.aos_image_ext_id, defaults.aosImageExtId),
    hypervisorImageExtId: asString(root.hypervisor_image_ext_id, defaults.hypervisorImageExtId),
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
  const [fcTarget, setFcTarget] = useState<'integrated_pc_fc' | 'standalone_fca'>(() => initial().fcTarget)
  const [pcCred, setPcCred] = useState(() => initial().pcCred)
  const [cvmCred, setCvmCred] = useState(() => initial().cvmCred)
  const [pcIp, setPcIp] = useState(() => initial().pcIp)
  const [fcaApiVersion, setFcaApiVersion] = useState(() => initial().fcaApiVersion)
  const [hardwareProviderExtId, setHardwareProviderExtId] = useState(() => initial().hardwareProviderExtId)
  const [hardwareProviderName, setHardwareProviderName] = useState(() => initial().hardwareProviderName)
  const [connectionExtId, setConnectionExtId] = useState(() => initial().connectionExtId)
  const [aosImageExtId, setAosImageExtId] = useState(() => initial().aosImageExtId)
  const [hypervisorImageExtId, setHypervisorImageExtId] = useState(() => initial().hypervisorImageExtId)
  const [dnsServers, setDnsServers] = useState<string[]>(() => initial().dnsServers)
  const [ntpServers, setNtpServers] = useState<string[]>(() => initial().ntpServers)
  const [clusters, setClusters] = useState<Cluster[]>(() => initial().clusters)
  const credentialOptions = Array.from(new Set([...CREDENTIAL_KEYS, pcCred, cvmCred].filter(Boolean)))

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
      dnsServers,
      ntpServers,
      clusters: clusters.map(c => ({
        name: c.name,
        clusterVip: c.clusterVip,
        redundancyFactor: c.redundancyFactor,
        timezone: c.timezone,
        nodes: c.nodes,
      })),
    })
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
    hypervisorImageExtId,
    ntpServers,
    onYamlChange,
    pcCred,
    pcIp,
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

  return (
    <div className="space-y-5">
      {/* Global Settings */}
      <div className="form-section">
        <p className="form-section-title"><Server size={14} /> Global Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Foundation Central Target</label>
            <select
              className="input"
              value={fcTarget}
              onChange={e => setFcTarget(e.target.value as 'integrated_pc_fc' | 'standalone_fca')}
              disabled={Boolean(forcedFoundationCentralTarget)}
            >
              <option value="integrated_pc_fc">Integrated Prism Central Foundation Central</option>
              <option value="standalone_fca">Standalone Foundation Central Appliance</option>
            </select>
          </div>
          <div>
            <label className="label">Foundation Central Credential Reference</label>
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
          <div className="col-span-2">
            <label className="label">Foundation Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.100" />
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
                      <div key={ni} className="grid grid-cols-7 gap-2 p-3 rounded-lg bg-gray-900/80 border border-border/50 items-end">
                        <div>
                          <label className="label text-xs">Node Serial</label>
                          <input className="input text-xs py-1.5" value={node.nodeSerial} onChange={e => updateNode(ci, ni, { nodeSerial: e.target.value })} placeholder="2Z3P..." />
                        </div>
                        <div>
                          <label className="label text-xs">CVM IP</label>
                          <input className="input text-xs py-1.5" value={node.cvmIp} onChange={e => updateNode(ci, ni, { cvmIp: e.target.value })} placeholder="10.0.0.11" />
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
                          <label className="label text-xs">Hostname</label>
                          <input className="input text-xs py-1.5" value={node.hostname} onChange={e => updateNode(ci, ni, { hostname: e.target.value })} placeholder="ahv-01" />
                        </div>
                        <div>
                          <label className="label text-xs">CVM RAM (GB)</label>
                          <input className="input text-xs py-1.5" type="number" value={node.cvmRamGb} onChange={e => updateNode(ci, ni, { cvmRamGb: Number(e.target.value) })} min={12} />
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
