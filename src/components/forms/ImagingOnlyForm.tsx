import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildImagingOnlyYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'

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

interface Props { onYamlChange: (yaml: string) => void }

const defaultNode = (): Node => ({ cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 })

export default function ImagingOnlyForm({ onYamlChange }: Props) {
  const [pcCred, setPcCred] = useState('pc_user')
  const [cvmCred, setCvmCred] = useState('cvm_credential')
  const [pcIp, setPcIp] = useState('')
  const [dnsServers, setDnsServers] = useState(['8.8.8.8'])
  const [ntpServers, setNtpServers] = useState(['0.us.pool.ntp.org'])
  const [aosUrl, setAosUrl] = useState('')
  const [hypervisorType, setHypervisorType] = useState('kvm')
  const [hypervisorUrl, setHypervisorUrl] = useState('')
  const [batches, setBatches] = useState<Batch[]>([{ nodes: [defaultNode()] }])

  useEffect(() => {
    if (!pcIp || !aosUrl || !hypervisorUrl) return
    onYamlChange(buildImagingOnlyYaml({
      pcCredential: pcCred,
      cvmCredential: cvmCred,
      pcIp,
      dnsServers,
      ntpServers,
      aosUrl,
      hypervisorType,
      hypervisorUrl,
      batches,
    }))
  }, [pcCred, cvmCred, pcIp, dnsServers, ntpServers, aosUrl, hypervisorType, hypervisorUrl, batches, onYamlChange])

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
          <div><label className="label">PC Credential</label>
            <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>
              {CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}
            </select></div>
          <div><label className="label">CVM Credential</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>
              {CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}
            </select></div>
          <div className="col-span-2"><label className="label">Foundation Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.100" /></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Network</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} placeholder="8.8.8.8" /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Imaging Parameters</p>
        <div className="space-y-3">
          <div><label className="label">AOS Package URL <span className="text-red-400">*</span></label>
            <input className="input font-mono text-xs" value={aosUrl} onChange={e => setAosUrl(e.target.value)} placeholder="http://web-server/nutanix-aos-6.8-x86_64.tar.gz" /></div>
          <div><label className="label">Hypervisor Type</label>
            <select className="input" value={hypervisorType} onChange={e => setHypervisorType(e.target.value)}>
              <option value="kvm">AHV (KVM)</option>
              <option value="esx">VMware ESXi</option>
              <option value="hyperv">Hyper-V</option>
            </select></div>
          <div><label className="label">Hypervisor ISO URL <span className="text-red-400">*</span></label>
            <input className="input font-mono text-xs" value={hypervisorUrl} onChange={e => setHypervisorUrl(e.target.value)} placeholder="http://web-server/AHV-DVD-x86_64.iso" /></div>
        </div>
      </div>

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
