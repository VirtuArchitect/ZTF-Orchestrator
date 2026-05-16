import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildPCDeployYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS, PC_VERSIONS } from '../../data'
import TagInput from './TagInput'

interface PCCluster {
  clusterIp: string; pcVmName: string; pcIp: string
  networkName: string; defaultGateway: string; subnetMask: string; vip: string
}

interface Props { onYamlChange: (yaml: string) => void }

export default function PCDeployForm({ onYamlChange }: Props) {
  const [peCred, setPeCred] = useState('pe_user')
  const [cvmCred, setCvmCred] = useState('cvm_credential')
  const [pcVersion, setPcVersion] = useState('pc.2024.3')
  const [fileUrl, setFileUrl] = useState('')
  const [metadataUrl, setMetadataUrl] = useState('')
  const [md5sum, setMd5sum] = useState('')
  const [vmSize, setVmSize] = useState('large')
  const [dnsServers, setDnsServers] = useState(['8.8.8.8'])
  const [ntpServers, setNtpServers] = useState(['0.us.pool.ntp.org'])
  const [container, setContainer] = useState('SelfServiceContainer')
  const [enableCmsp, setEnableCmsp] = useState(false)
  const [clusters, setClusters] = useState<PCCluster[]>([{ clusterIp: '', pcVmName: 'PC-VM-01', pcIp: '', networkName: '', defaultGateway: '', subnetMask: '255.255.255.0', vip: '' }])

  useEffect(() => {
    if (!fileUrl || !clusters.every(c => c.clusterIp && c.pcIp)) return
    onYamlChange(buildPCDeployYaml({
      peCredential: peCred, cvmCredential: cvmCred, pcVersion, fileUrl, metadataUrl, md5sum,
      vmSize, dnsServers, ntpServers, container, enableCmsp, clusters,
    }))
  }, [peCred, cvmCred, pcVersion, fileUrl, metadataUrl, md5sum, vmSize, dnsServers, ntpServers, container, enableCmsp, clusters, onYamlChange])

  const updCluster = (i: number, u: Partial<PCCluster>) =>
    setClusters(p => p.map((c, j) => j === i ? { ...c, ...u } : c))

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">Credentials</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">PE Credential</label>
            <select className="input" value={peCred} onChange={e => setPeCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label">CVM Credential</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Prism Central Configuration</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">PC Version</label>
            <select className="input" value={pcVersion} onChange={e => setPcVersion(e.target.value)}>
              {PC_VERSIONS.map(v => <option key={v}>{v}</option>)}
            </select></div>
          <div><label className="label">VM Size</label>
            <select className="input" value={vmSize} onChange={e => setVmSize(e.target.value)}>
              <option value="small">Small (4 vCPU, 16GB RAM)</option>
              <option value="large">Large (10 vCPU, 44GB RAM)</option>
              <option value="xlarge">X-Large (10 vCPU, 60GB RAM)</option>
            </select></div>
          <div className="col-span-2"><label className="label">PC File URL <span className="text-red-400">*</span></label>
            <input className="input font-mono text-xs" value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="http://server/pc.2024.3.tar" /></div>
          <div><label className="label">Metadata URL (optional)</label>
            <input className="input font-mono text-xs" value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)} placeholder="http://server/pc.2024.3.json" /></div>
          <div><label className="label">MD5 Checksum (optional)</label>
            <input className="input font-mono text-xs" value={md5sum} onChange={e => setMd5sum(e.target.value)} placeholder="a1b2c3d4..." /></div>
          <div><label className="label">Storage Container</label>
            <input className="input" value={container} onChange={e => setContainer(e.target.value)} placeholder="SelfServiceContainer" /></div>
          <div className="flex items-center gap-3 pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enableCmsp} onChange={e => setEnableCmsp(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-300">Enable CMSP (Microservices)</span>
            </label>
          </div>
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-gray-200">Target Clusters</h3>
        {clusters.map((cluster, i) => (
          <div key={i} className="card border-border/70">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-200 text-sm">{cluster.clusterIp || `Cluster ${i + 1}`}</h4>
              {clusters.length > 1 && <button onClick={() => setClusters(p => p.filter((_, j) => j !== i))} className="btn-ghost p-1 text-red-400"><Trash2 size={13} /></button>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label text-xs">Cluster IP <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={cluster.clusterIp} onChange={e => updCluster(i, { clusterIp: e.target.value })} placeholder="10.0.0.100" /></div>
              <div><label className="label text-xs">PC VM Name</label><input className="input text-xs py-1.5" value={cluster.pcVmName} onChange={e => updCluster(i, { pcVmName: e.target.value })} placeholder="PC-VM-01" /></div>
              <div><label className="label text-xs">PC IP <span className="text-red-400">*</span></label><input className="input text-xs py-1.5" value={cluster.pcIp} onChange={e => updCluster(i, { pcIp: e.target.value })} placeholder="10.0.0.51" /></div>
              <div><label className="label text-xs">Network Name</label><input className="input text-xs py-1.5" value={cluster.networkName} onChange={e => updCluster(i, { networkName: e.target.value })} placeholder="vlan0-managed" /></div>
              <div><label className="label text-xs">Default Gateway</label><input className="input text-xs py-1.5" value={cluster.defaultGateway} onChange={e => updCluster(i, { defaultGateway: e.target.value })} placeholder="10.0.0.1" /></div>
              <div><label className="label text-xs">Subnet Mask</label><input className="input text-xs py-1.5" value={cluster.subnetMask} onChange={e => updCluster(i, { subnetMask: e.target.value })} placeholder="255.255.255.0" /></div>
              <div><label className="label text-xs">VIP (optional)</label><input className="input text-xs py-1.5" value={cluster.vip} onChange={e => updCluster(i, { vip: e.target.value })} placeholder="10.0.0.52" /></div>
            </div>
          </div>
        ))}
        <button onClick={() => setClusters(p => [...p, { clusterIp: '', pcVmName: `PC-VM-0${p.length + 1}`, pcIp: '', networkName: '', defaultGateway: '', subnetMask: '255.255.255.0', vip: '' }])} className="btn-secondary w-full justify-center gap-2">
          <Plus size={14} />Add Cluster
        </button>
      </div>
    </div>
  )
}
