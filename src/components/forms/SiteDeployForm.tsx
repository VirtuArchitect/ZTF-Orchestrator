import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { buildSiteDeployYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'

interface Node {
  nodeSerial: string; cvmIp: string; hostIp: string; ipmiIp: string; hostname: string; cvmVlanId: string
}
interface Cluster {
  clusterName: string; clusterVip: string; redundancyFactor: 2 | 3; clusterSize: number; cvmRam: number; nodes: Node[]
}
interface Site {
  siteName: string; useExistingNetwork: boolean; reImage: boolean
  hostSubnet: string; hostGateway: string; ipmiSubnet: string; ipmiGateway: string; domain: string
  clusters: Cluster[]; expanded: boolean
}

interface Props { onYamlChange: (yaml: string) => void }

const defaultNode = (): Node => ({ nodeSerial: '', cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmVlanId: '' })
const defaultCluster = (): Cluster => ({ clusterName: '', clusterVip: '', redundancyFactor: 2, clusterSize: 3, cvmRam: 12, nodes: [defaultNode()] })
const defaultSite = (): Site => ({
  siteName: '', useExistingNetwork: false, reImage: true,
  hostSubnet: '', hostGateway: '', ipmiSubnet: '', ipmiGateway: '', domain: '',
  clusters: [defaultCluster()], expanded: true,
})

export default function SiteDeployForm({ onYamlChange }: Props) {
  const [pcCred, setPcCred] = useState('pc_user')
  const [cvmCred, setCvmCred] = useState('cvm_credential')
  const [pcIp, setPcIp] = useState('')
  const [dnsServers, setDnsServers] = useState(['8.8.8.8'])
  const [ntpServers, setNtpServers] = useState(['0.us.pool.ntp.org'])
  const [aosUrl, setAosUrl] = useState('')
  const [hypervisorType, setHypervisorType] = useState('kvm')
  const [hypervisorUrl, setHypervisorUrl] = useState('')
  const [sites, setSites] = useState<Site[]>([defaultSite()])

  useEffect(() => {
    if (!pcIp || !aosUrl || !hypervisorUrl) return
    onYamlChange(buildSiteDeployYaml({
      pcCredential: pcCred, cvmCredential: cvmCred, pcIp,
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
          })),
        })),
      })),
    }))
  }, [pcCred, cvmCred, pcIp, dnsServers, ntpServers, aosUrl, hypervisorType, hypervisorUrl, sites, onYamlChange])

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
          <div><label className="label">PC Credential</label>
            <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label">CVM Credential</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
          <div className="col-span-2"><label className="label">Prism Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.50" /></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Network & Imaging</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
          <div className="col-span-2"><label className="label">AOS Package URL</label>
            <input className="input font-mono text-xs" value={aosUrl} onChange={e => setAosUrl(e.target.value)} placeholder="http://server/nutanix-aos.tar.gz" /></div>
          <div><label className="label">Hypervisor Type</label>
            <select className="input" value={hypervisorType} onChange={e => setHypervisorType(e.target.value)}>
              <option value="kvm">AHV (KVM)</option><option value="esx">ESXi</option><option value="hyperv">Hyper-V</option>
            </select></div>
          <div><label className="label">Hypervisor ISO URL</label>
            <input className="input font-mono text-xs" value={hypervisorUrl} onChange={e => setHypervisorUrl(e.target.value)} placeholder="http://server/AHV.iso" /></div>
        </div>
      </div>

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
                    <div key={ni} className="grid grid-cols-5 gap-2 p-2 rounded bg-gray-950/50 items-end text-xs">
                      <div><label className="label text-xs">Serial (opt.)</label><input className="input text-xs py-1" value={n.nodeSerial} onChange={e => updNode(si, ci, ni, { nodeSerial: e.target.value })} placeholder="2Z3P..." /></div>
                      <div><label className="label text-xs">CVM IP</label><input className="input text-xs py-1" value={n.cvmIp} onChange={e => updNode(si, ci, ni, { cvmIp: e.target.value })} placeholder="10.0.0.11" /></div>
                      <div><label className="label text-xs">Host IP</label><input className="input text-xs py-1" value={n.hostIp} onChange={e => updNode(si, ci, ni, { hostIp: e.target.value })} placeholder="10.0.0.12" /></div>
                      <div><label className="label text-xs">Hostname</label><input className="input text-xs py-1" value={n.hostname} onChange={e => updNode(si, ci, ni, { hostname: e.target.value })} placeholder="ahv-01" /></div>
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
