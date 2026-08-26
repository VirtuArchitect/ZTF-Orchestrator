import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { buildSiteDeployYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'
import type { ConnectionProfile } from '../../types'

interface Node {
  nodeSerial: string; cvmIp: string; hostIp: string; ipmiIp: string; hostname: string; cvmVlanId: string; cvmRamGb: number
}
interface Cluster {
  clusterName: string; clusterVip: string; redundancyFactor: 2 | 3; clusterSize: number; cvmRam: number; nodes: Node[]
}
interface Site {
  siteName: string; useExistingNetwork: boolean; reImage: boolean
  hostSubnet: string; hostGateway: string; ipmiSubnet: string; ipmiGateway: string; domain: string
  clusters: Cluster[]; expanded: boolean
}

interface Props {
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
  standaloneFca?: boolean
}

const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []

const defaultNode = (): Node => ({ nodeSerial: '', cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmVlanId: '', cvmRamGb: 12 })
const defaultCluster = (): Cluster => ({ clusterName: '', clusterVip: '', redundancyFactor: 2, clusterSize: 3, cvmRam: 12, nodes: [defaultNode()] })
const defaultSite = (): Site => ({
  siteName: '', useExistingNetwork: false, reImage: true,
  hostSubnet: '', hostGateway: '', ipmiSubnet: '', ipmiGateway: '', domain: '',
  clusters: [defaultCluster()], expanded: true,
})

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

function asRedundancyFactor(value: unknown): 2 | 3 {
  return asNumber(value, 2) === 3 ? 3 : 2
}

function initialState(profile?: ConnectionProfile, importedConfig?: unknown) {
  const profileDns = csv(profile?.defaults.dnsServers)
  const profileNtp = csv(profile?.defaults.ntpServers)
  const defaults = {
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
    aosUrl: profile?.foundationCentral.aosUrl || '',
    hypervisorType: profile?.foundationCentral.hypervisorType || 'kvm',
    hypervisorUrl: profile?.foundationCentral.hypervisorUrl || '',
    sites: [defaultSite()],
  }

  const root = asRecord(importedConfig)
  if (!Object.keys(root).length) return defaults
  const network = asRecord(root.common_network_settings)
  const imaging = asRecord(root.imaging_parameters)
  const sites = Array.isArray(root.sites)
    ? root.sites.map((item): Site => {
        const site = asRecord(item)
        const siteNetwork = asRecord(site.network)
        const clusters = Array.isArray(site.clusters)
          ? site.clusters.map((clusterItem): Cluster => {
              const cluster = asRecord(clusterItem)
              const nodeSource = Array.isArray(cluster.node_details) ? cluster.node_details : []
              const nodes = nodeSource.map((nodeItem): Node => {
                const node = asRecord(nodeItem)
                return {
                  nodeSerial: asString(node.node_serial),
                  cvmIp: asString(node.cvm_ip),
                  hostIp: asString(node.host_ip),
                  ipmiIp: asString(node.ipmi_ip),
                  hostname: asString(node.hypervisor_hostname),
                  cvmVlanId: node.cvm_vlan_id === undefined ? '' : String(node.cvm_vlan_id),
                  cvmRamGb: asNumber(node.cvm_ram_gb, asNumber(cluster.cvm_ram, 12)),
                }
              })
              return {
                clusterName: asString(cluster.cluster_name),
                clusterVip: asString(cluster.cluster_vip),
                redundancyFactor: asRedundancyFactor(cluster.redundancy_factor),
                clusterSize: asNumber(cluster.cluster_size, 3),
                cvmRam: asNumber(cluster.cvm_ram, 12),
                nodes: nodes.length ? nodes : [defaultNode()],
              }
            })
          : [defaultCluster()]

        return {
          siteName: asString(site.site_name),
          useExistingNetwork: Boolean(site.use_existing_network_settings),
          reImage: site['re-image'] === undefined ? true : Boolean(site['re-image']),
          hostSubnet: asString(siteNetwork.host_subnet),
          hostGateway: asString(siteNetwork.host_gateway),
          ipmiSubnet: asString(siteNetwork.ipmi_subnet),
          ipmiGateway: asString(siteNetwork.ipmi_gateway),
          domain: asString(siteNetwork.domain),
          clusters: clusters.length ? clusters : [defaultCluster()],
          expanded: true,
        }
      })
    : defaults.sites

  return {
    pcCred: asString(root.fca_credential, asString(root.pc_credential, defaults.pcCred)),
    cvmCred: asString(root.cvm_credential, defaults.cvmCred),
    pcIp: asString(root.fca_ip, asString(root.pc_ip, defaults.pcIp)),
    fcaApiVersion: asString(root.fca_api_version, defaults.fcaApiVersion),
    hardwareProviderExtId: asString(root.hardware_provider_ext_id, defaults.hardwareProviderExtId),
    hardwareProviderName: asString(root.hardware_provider_name, defaults.hardwareProviderName),
    connectionExtId: asString(root.connection_ext_id, defaults.connectionExtId),
    aosImageExtId: asString(root.aos_image_ext_id, defaults.aosImageExtId),
    hypervisorImageExtId: asString(root.hypervisor_image_ext_id, defaults.hypervisorImageExtId),
    dnsServers: asStringArray(network.dns_servers, asStringArray(root.name_servers_list, defaults.dnsServers)),
    ntpServers: asStringArray(network.ntp_servers, asStringArray(root.ntp_servers_list, defaults.ntpServers)),
    aosUrl: asString(imaging.aos_url, defaults.aosUrl),
    hypervisorType: asString(imaging.hypervisor_type, defaults.hypervisorType),
    hypervisorUrl: asString(imaging.hypervisor_url, defaults.hypervisorUrl),
    sites: sites.length ? sites : defaults.sites,
  }
}

export default function SiteDeployForm({ onYamlChange, profile, importedConfig, standaloneFca = false }: Props) {
  const initial = () => initialState(profile, importedConfig)
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
  const [aosUrl, setAosUrl] = useState(() => initial().aosUrl)
  const [hypervisorType, setHypervisorType] = useState(() => initial().hypervisorType)
  const [hypervisorUrl, setHypervisorUrl] = useState(() => initial().hypervisorUrl)
  const [sites, setSites] = useState<Site[]>(() => initial().sites)
  const credentialOptions = Array.from(new Set([...CREDENTIAL_KEYS, pcCred, cvmCred].filter(Boolean)))

  useEffect(() => {
    if (!importedConfig) return
    const next = initialState(profile, importedConfig)
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
    setAosUrl(next.aosUrl)
    setHypervisorType(next.hypervisorType)
    setHypervisorUrl(next.hypervisorUrl)
    setSites(next.sites)
  }, [importedConfig, profile])

  useEffect(() => {
    if (!pcIp || (!standaloneFca && (!aosUrl || !hypervisorUrl))) return
    onYamlChange(buildSiteDeployYaml({
      foundationCentralTarget: standaloneFca ? 'standalone_fca' : 'integrated_pc_fc',
      pcCredential: pcCred, cvmCredential: cvmCred, pcIp,
      fcaApiVersion, hardwareProviderExtId, hardwareProviderName,
      connectionExtId, aosImageExtId, hypervisorImageExtId,
      dnsServers, ntpServers, aosUrl, hypervisorType, hypervisorUrl,
      sites: sites.map(s => ({
        siteName: s.siteName, useExistingNetwork: s.useExistingNetwork, reImage: s.reImage,
        hostSubnet: s.hostSubnet, hostGateway: s.hostGateway,
        ...(s.ipmiSubnet ? { ipmiSubnet: s.ipmiSubnet } : {}),
        ...(s.ipmiGateway ? { ipmiGateway: s.ipmiGateway } : {}),
        ...(s.domain ? { domain: s.domain } : {}),
        clusters: s.clusters.map(c => ({
          clusterName: c.clusterName, clusterVip: c.clusterVip,
          redundancyFactor: c.redundancyFactor, clusterSize: c.clusterSize, cvmRam: c.cvmRam,
          nodes: c.nodes.map(n => ({
            ...(n.nodeSerial ? { nodeSerial: n.nodeSerial } : {}),
            cvmIp: n.cvmIp, hostIp: n.hostIp,
            ...(n.ipmiIp ? { ipmiIp: n.ipmiIp } : {}),
            ...(n.hostname ? { hostname: n.hostname } : {}),
            ...(n.cvmVlanId ? { cvmVlanId: Number(n.cvmVlanId) } : {}),
            ...(n.cvmRamGb ? { cvmRamGb: n.cvmRamGb } : {}),
          })),
        })),
      })),
    }))
  }, [aosImageExtId, aosUrl, connectionExtId, cvmCred, dnsServers, fcaApiVersion, hardwareProviderExtId, hardwareProviderName, hypervisorImageExtId, hypervisorType, hypervisorUrl, ntpServers, onYamlChange, pcCred, pcIp, standaloneFca, sites])

  const updSite = (i: number, u: Partial<Site>) => setSites(p => p.map((s, j) => j === i ? { ...s, ...u } : s))
  const updCluster = (si: number, ci: number, u: Partial<Cluster>) =>
    setSites(p => p.map((s, i) => i === si ? { ...s, clusters: s.clusters.map((c, j) => j === ci ? { ...c, ...u } : c) } : s))
  const addNode = (si: number, ci: number) =>
    setSites(p => p.map((s, i) => i === si ? { ...s, clusters: s.clusters.map((c, j) => j === ci ? { ...c, nodes: [...c.nodes, defaultNode()] } : c) } : s))
  const removeNode = (si: number, ci: number, ni: number) =>
    setSites(p => p.map((s, i) => i === si ? { ...s, clusters: s.clusters.map((c, j) => j === ci ? { ...c, nodes: c.nodes.filter((_, k) => k !== ni) } : c) } : s))
  const updNode = (si: number, ci: number, ni: number, u: Partial<Node>) =>
    setSites(p => p.map((s, i) => i === si ? {
      ...s, clusters: s.clusters.map((c, j) => j === ci ? { ...c, nodes: c.nodes.map((n, k) => k === ni ? { ...n, ...u } : n) } : c)
    } : s))

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">Global Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Foundation Central Credential</label>
            <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>{credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
          <div><label className="label">CVM Credential</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>{credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}</select></div>
          <div className="col-span-2"><label className="label">Foundation Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.50" /></div>
          {standaloneFca && (
            <>
              <div><label className="label">Lifecycle API Version</label>
                <input className="input" value={fcaApiVersion} onChange={e => setFcaApiVersion(e.target.value)} placeholder="v4.2.a2" /></div>
              <div><label className="label">Hardware Provider Ext ID</label>
                <input className="input" value={hardwareProviderExtId} onChange={e => setHardwareProviderExtId(e.target.value)} placeholder="optional provider extId" /></div>
              <div><label className="label">Hardware Provider Name</label>
                <input className="input" value={hardwareProviderName} onChange={e => setHardwareProviderName(e.target.value)} placeholder="optional provider name" /></div>
              <div><label className="label">Connection Ext ID</label>
                <input className="input" value={connectionExtId} onChange={e => setConnectionExtId(e.target.value)} placeholder="optional connection extId" /></div>
              <div><label className="label">AOS Image Ext ID</label>
                <input className="input" value={aosImageExtId} onChange={e => setAosImageExtId(e.target.value)} placeholder="optional image extId" /></div>
              <div><label className="label">Hypervisor Image Ext ID</label>
                <input className="input" value={hypervisorImageExtId} onChange={e => setHypervisorImageExtId(e.target.value)} placeholder="optional image extId" /></div>
            </>
          )}
        </div>
      </div>

      {!standaloneFca && <div className="form-section">
        <p className="form-section-title">Network & Imaging</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
          <div className="col-span-2"><label className="label">AOS Package URL</label>
            <input className="input font-mono text-xs" value={aosUrl} onChange={e => setAosUrl(e.target.value)} placeholder="http://server/nutanix-aos.tar.gz" /></div>
          <div><label className="label">Hypervisor Type</label>
            <select className="input" value={hypervisorType} onChange={e => setHypervisorType(e.target.value as 'kvm' | 'esx' | 'hyperv')}>
              <option value="kvm">AHV (KVM)</option><option value="esx">ESXi</option><option value="hyperv">Hyper-V</option>
            </select></div>
          <div><label className="label">Hypervisor ISO URL</label>
            <input className="input font-mono text-xs" value={hypervisorUrl} onChange={e => setHypervisorUrl(e.target.value)} placeholder="http://server/AHV.iso" /></div>
        </div>
      </div>}

      {standaloneFca && <div className="form-section">
        <p className="form-section-title">Network</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
        </div>
      </div>}

      {/* Sites */}
      {sites.map((site, si) => (
        <div key={si} className="card border-border/70">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => updSite(si, { expanded: !site.expanded })} className="btn-ghost p-1">
              {site.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <h4 className="font-semibold text-gray-200 flex-1">{site.siteName || `Site ${si + 1}`}</h4>
            {sites.length > 1 && <button onClick={() => setSites(p => p.filter((_, i) => i !== si))} className="btn-ghost p-1 text-red-400"><Trash2 size={14} /></button>}
          </div>

          {site.expanded && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="label">Site Name</label>
                  <input className="input" value={site.siteName} onChange={e => updSite(si, { siteName: e.target.value })} placeholder="site-01" /></div>
                <div><label className="label">Host Subnet (CIDR)</label>
                  <input className="input" value={site.hostSubnet} onChange={e => updSite(si, { hostSubnet: e.target.value })} placeholder="10.10.10.0/24" /></div>
                <div><label className="label">Host Gateway</label>
                  <input className="input" value={site.hostGateway} onChange={e => updSite(si, { hostGateway: e.target.value })} placeholder="10.10.10.1" /></div>
                <div><label className="label">IPMI Subnet (optional)</label>
                  <input className="input" value={site.ipmiSubnet} onChange={e => updSite(si, { ipmiSubnet: e.target.value })} placeholder="11.11.11.0/24" /></div>
                <div><label className="label">IPMI Gateway (optional)</label>
                  <input className="input" value={site.ipmiGateway} onChange={e => updSite(si, { ipmiGateway: e.target.value })} placeholder="11.11.11.1" /></div>
                <div><label className="label">Domain (optional)</label>
                  <input className="input" value={site.domain} onChange={e => updSite(si, { domain: e.target.value })} placeholder="site01.domain.com" /></div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={site.reImage} onChange={e => updSite(si, { reImage: e.target.checked })} className="rounded" />
                    <span className="text-sm text-gray-300">Re-image nodes</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={site.useExistingNetwork} onChange={e => updSite(si, { useExistingNetwork: e.target.checked })} className="rounded" />
                    <span className="text-sm text-gray-300">Use existing network</span>
                  </label>
                </div>
              </div>

              {/* Clusters within site */}
              {site.clusters.map((cluster, ci) => (
                <div key={ci} className="p-4 rounded-lg bg-gray-900/60 border border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-gray-300">{cluster.clusterName || `Cluster ${ci + 1}`}</h5>
                    <div className="flex gap-2">
                      <button onClick={() => addNode(si, ci)} className="btn-ghost text-xs gap-1 py-0.5"><Plus size={11} />Node</button>
                      {site.clusters.length > 1 && <button onClick={() => setSites(p => p.map((s, i) => i === si ? { ...s, clusters: s.clusters.filter((_, j) => j !== ci) } : s))} className="btn-ghost p-1 text-red-400"><Trash2 size={12} /></button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="label text-xs">Cluster Name</label><input className="input text-xs py-1.5" value={cluster.clusterName} onChange={e => updCluster(si, ci, { clusterName: e.target.value })} placeholder="site01-cluster-01" /></div>
                    <div><label className="label text-xs">Cluster VIP</label><input className="input text-xs py-1.5" value={cluster.clusterVip} onChange={e => updCluster(si, ci, { clusterVip: e.target.value })} placeholder="10.0.0.10" /></div>
                    <div><label className="label text-xs">RF</label>
                      <select className="input text-xs py-1.5" value={cluster.redundancyFactor} onChange={e => updCluster(si, ci, { redundancyFactor: Number(e.target.value) as 2 | 3 })}>
                        <option value={2}>RF-2</option><option value={3}>RF-3</option>
                      </select></div>
                  </div>
                  {cluster.nodes.map((n, ni) => (
                    <div key={ni} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 p-2 rounded bg-gray-950/50 items-end text-xs">
                      <div><label className="label text-xs">Serial (opt.)</label><input className="input text-xs py-1" value={n.nodeSerial} onChange={e => updNode(si, ci, ni, { nodeSerial: e.target.value })} placeholder="2Z3P..." /></div>
                      <div><label className="label text-xs">CVM IP</label><input className="input text-xs py-1" value={n.cvmIp} onChange={e => updNode(si, ci, ni, { cvmIp: e.target.value })} placeholder="10.0.0.11" /></div>
                      <div><label className="label text-xs">Host IP</label><input className="input text-xs py-1" value={n.hostIp} onChange={e => updNode(si, ci, ni, { hostIp: e.target.value })} placeholder="10.0.0.12" /></div>
                      <div><label className="label text-xs">IPMI IP</label><input className="input text-xs py-1" value={n.ipmiIp} onChange={e => updNode(si, ci, ni, { ipmiIp: e.target.value })} placeholder="10.0.0.13" /></div>
                      <div><label className="label text-xs">Hostname</label><input className="input text-xs py-1" value={n.hostname} onChange={e => updNode(si, ci, ni, { hostname: e.target.value })} placeholder="ahv-01" /></div>
                      <div><label className="label text-xs">CVM RAM (GB)</label><input className="input text-xs py-1" type="number" min={12} value={n.cvmRamGb} onChange={e => updNode(si, ci, ni, { cvmRamGb: Number(e.target.value) })} /></div>
                      <div className="flex justify-end items-end">{cluster.nodes.length > 1 && <button onClick={() => removeNode(si, ci, ni)} className="btn-ghost p-1 text-red-400"><Trash2 size={11} /></button>}</div>
                    </div>
                  ))}
                </div>
              ))}
              <button onClick={() => setSites(p => p.map((s, i) => i === si ? { ...s, clusters: [...s.clusters, defaultCluster()] } : s))} className="btn-secondary text-xs gap-1 py-1.5 w-full justify-center">
                <Plus size={12} />Add Cluster
              </button>
            </div>
          )}
        </div>
      ))}
      <button onClick={() => setSites(p => [...p, defaultSite()])} className="btn-secondary w-full justify-center gap-2">
        <Plus size={14} />Add Site
      </button>
    </div>
  )
}
