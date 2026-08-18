import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildImagingOnlyYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'
import type { ConnectionProfile } from '../../types'

interface Node {
  cvmIp: string
  hostIp: string
  ipmiIp: string
  hostname: string
  cvmRamGb: number
}

interface Batch {
  nodes: Node[]
}

interface Props {
  onYamlChange: (yaml: string) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
  standaloneFca?: boolean
}

const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []

const defaultNode = (): Node => ({ cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 })

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

function initialState(profile?: ConnectionProfile, importedConfig?: unknown) {
  const profileDns = csv(profile?.defaults.dnsServers)
  const profileNtp = csv(profile?.defaults.ntpServers)
  const defaults = {
    pcCred: profile?.foundationCentral.credentialRef || profile?.prismCentral.credentialRef || 'foundation_central',
    cvmCred: profile?.prismElement.cvmCredentialRef || 'cvm_credential',
    pcIp: profile?.foundationCentral.endpoint || profile?.prismCentral.endpoint || '',
    fcaApiVersion: 'v4.3',
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
    batches: [{ nodes: [defaultNode()] }] as Batch[],
  }

  const root = asRecord(importedConfig)
  if (!Object.keys(root).length) return defaults
  const network = asRecord(root.common_network_settings)
  const batches = Array.isArray(root.imaging_batches)
    ? root.imaging_batches.map((item): Batch => {
        const batch = asRecord(item)
        const nodes = Array.isArray(batch.nodes)
          ? batch.nodes.map((nodeItem): Node => {
              const node = asRecord(nodeItem)
              return {
                cvmIp: asString(node.cvm_ip),
                hostIp: asString(node.host_ip),
                ipmiIp: asString(node.ipmi_ip),
                hostname: asString(node.hypervisor_hostname),
                cvmRamGb: asNumber(node.cvm_ram_gb, 12),
              }
            })
          : [defaultNode()]
        return { nodes: nodes.length ? nodes : [defaultNode()] }
      })
    : defaults.batches

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
    aosUrl: asString(root.aos_url, defaults.aosUrl),
    hypervisorType: asString(root.hypervisor_type, defaults.hypervisorType),
    hypervisorUrl: asString(root.hypervisor_url, defaults.hypervisorUrl),
    batches: batches.length ? batches : defaults.batches,
  }
}

export default function ImagingOnlyForm({ onYamlChange, profile, importedConfig, standaloneFca = false }: Props) {
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
  const [batches, setBatches] = useState<Batch[]>(() => initial().batches)
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
    setBatches(next.batches)
  }, [importedConfig, profile])

  useEffect(() => {
    if (!pcIp || (!standaloneFca && (!aosUrl || !hypervisorUrl))) return
    onYamlChange(buildImagingOnlyYaml({
      foundationCentralTarget: standaloneFca ? 'standalone_fca' : 'integrated_pc_fc',
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
      aosUrl,
      hypervisorType,
      hypervisorUrl,
      batches,
    }))
  }, [aosImageExtId, aosUrl, connectionExtId, cvmCred, dnsServers, fcaApiVersion, hardwareProviderExtId, hardwareProviderName, hypervisorImageExtId, hypervisorType, hypervisorUrl, ntpServers, onYamlChange, pcCred, pcIp, standaloneFca, batches])

  const addNode = (bi: number) =>
    setBatches(p => p.map((b, i) => i === bi ? { ...b, nodes: [...b.nodes, defaultNode()] } : b))
  const removeNode = (bi: number, ni: number) =>
    setBatches(p => p.map((b, i) => i === bi ? { ...b, nodes: b.nodes.filter((_, j) => j !== ni) } : b))
  const updateNode = (bi: number, ni: number, upd: Partial<Node>) =>
    setBatches(p => p.map((b, i) => i === bi ? { ...b, nodes: b.nodes.map((n, j) => j === ni ? { ...n, ...upd } : n) } : b))

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">Credentials & Foundation</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Foundation Central Credential</label>
            <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>
              {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select></div>
          <div><label className="label">CVM Credential</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>
              {credentialOptions.map(k => <option key={k} value={k}>{k}</option>)}
            </select></div>
          <div className="col-span-2"><label className="label">Foundation Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.100" /></div>
          {standaloneFca && (
            <>
              <div><label className="label">Lifecycle API Version</label>
                <input className="input" value={fcaApiVersion} onChange={e => setFcaApiVersion(e.target.value)} placeholder="v4.3" /></div>
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

      <div className="form-section">
        <p className="form-section-title">Network</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} placeholder="8.8.8.8" /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
        </div>
      </div>

      {!standaloneFca && <div className="form-section">
        <p className="form-section-title">Imaging Parameters</p>
        <div className="space-y-3">
          <div><label className="label">AOS Package URL <span className="text-red-400">*</span></label>
            <input className="input font-mono text-xs" value={aosUrl} onChange={e => setAosUrl(e.target.value)} placeholder="http://web-server/nutanix-aos-6.8-x86_64.tar.gz" /></div>
          <div><label className="label">Hypervisor Type</label>
            <select className="input" value={hypervisorType} onChange={e => setHypervisorType(e.target.value as 'kvm' | 'esx' | 'hyperv')}>
              <option value="kvm">AHV (KVM)</option>
              <option value="esx">VMware ESXi</option>
              <option value="hyperv">Hyper-V</option>
            </select></div>
          <div><label className="label">Hypervisor ISO URL <span className="text-red-400">*</span></label>
            <input className="input font-mono text-xs" value={hypervisorUrl} onChange={e => setHypervisorUrl(e.target.value)} placeholder="http://web-server/AHV-DVD-x86_64.iso" /></div>
        </div>
      </div>}

      <div className="space-y-4">
        {batches.map((batch, bi) => (
          <div key={bi} className="card border-border/70">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-200">Imaging Batch {bi + 1}</h4>
              <div className="flex gap-2">
                <button onClick={() => addNode(bi)} className="btn-ghost text-xs gap-1 py-1"><Plus size={12} />Add Node</button>
                {batches.length > 1 && <button onClick={() => setBatches(p => p.filter((_, i) => i !== bi))} className="btn-ghost p-1 text-red-400"><Trash2 size={13} /></button>}
              </div>
            </div>
            <div className="space-y-2">
              {batch.nodes.map((node, ni) => (
                <div key={ni} className="grid grid-cols-6 gap-2 p-3 rounded-lg bg-gray-900/80 border border-border/50 items-end">
                  <div><label className="label text-xs">CVM IP</label><input className="input text-xs py-1.5" value={node.cvmIp} onChange={e => updateNode(bi, ni, { cvmIp: e.target.value })} placeholder="10.0.0.11" /></div>
                  <div><label className="label text-xs">Host IP</label><input className="input text-xs py-1.5" value={node.hostIp} onChange={e => updateNode(bi, ni, { hostIp: e.target.value })} placeholder="10.0.0.12" /></div>
                  <div><label className="label text-xs">IPMI IP</label><input className="input text-xs py-1.5" value={node.ipmiIp} onChange={e => updateNode(bi, ni, { ipmiIp: e.target.value })} placeholder="10.0.0.13" /></div>
                  <div><label className="label text-xs">Hostname</label><input className="input text-xs py-1.5" value={node.hostname} onChange={e => updateNode(bi, ni, { hostname: e.target.value })} placeholder="ahv-01" /></div>
                  <div><label className="label text-xs">CVM RAM (GB)</label><input className="input text-xs py-1.5" type="number" value={node.cvmRamGb} onChange={e => updateNode(bi, ni, { cvmRamGb: Number(e.target.value) })} min={12} /></div>
                  <div className="flex justify-end">{batch.nodes.length > 1 && <button onClick={() => removeNode(bi, ni)} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setBatches(p => [...p, { nodes: [defaultNode()] }])} className="btn-secondary w-full justify-center gap-2">
          <Plus size={14} />Add Imaging Batch
        </button>
      </div>
    </div>
  )
}
