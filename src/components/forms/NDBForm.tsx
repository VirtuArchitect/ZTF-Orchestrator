import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildNDBYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'

interface ComputeProfile { name: string; vcpus: number; cores: number; ram: number }
interface RegisteredCluster { clusterIp: string; credential: string; storageContainer: string; agentVmIp: string }

interface Props { onYamlChange: (yaml: string) => void }

export default function NDBForm({ onYamlChange }: Props) {
  const [clusterIp, setClusterIp] = useState('')
  const [peCred, setPeCred] = useState('pe_user')
  const [ndbCred, setNdbCred] = useState('admin_cred')
  const [enablePulse, setEnablePulse] = useState(true)

  // NDB VM
  const [enableVm, setEnableVm] = useState(true)
  const [imagePath, setImagePath] = useState('')
  const [container, setContainer] = useState('SelfServiceContainer')
  const [vmName, setVmName] = useState('NDB-VM-01')
  const [ram, setRam] = useState(32)
  const [vcpus, setVcpus] = useState(16)
  const [networkName, setNetworkName] = useState('')
  const [vmIp, setVmIp] = useState('')
  const [gateway, setGateway] = useState('')
  const [subnetMask, setSubnetMask] = useState('255.255.255.0')

  const [computeProfiles, setComputeProfiles] = useState<ComputeProfile[]>([{ name: 'ndb', vcpus: 16, cores: 1, ram: 16 }])
  const [regClusters, setRegClusters] = useState<RegisteredCluster[]>([{ clusterIp: '', credential: 'pe_user', storageContainer: 'SelfServiceContainer', agentVmIp: '' }])

  useEffect(() => {
    if (!clusterIp) return
    onYamlChange(buildNDBYaml({
      clusterIp, peCredential: peCred, ndbCredential: ndbCred, enablePulse,
      ...(enableVm && imagePath ? {
        ndbVm: { imagePath, container, vmName, ram, vcpus, networkName, vmIp, gateway, subnetMask }
      } : {}),
      computeProfiles: computeProfiles.filter(p => p.name),
      registeredClusters: regClusters.filter(c => c.clusterIp),
    }))
  }, [clusterIp, peCred, ndbCred, enablePulse, enableVm, imagePath, container, vmName, ram, vcpus, networkName, vmIp, gateway, subnetMask, computeProfiles, regClusters, onYamlChange])

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">NDB Deployment Target</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Cluster IP <span className="text-red-400">*</span></label>
            <input className="input" value={clusterIp} onChange={e => setClusterIp(e.target.value)} placeholder="10.0.0.100" /></div>
          <div className="flex items-center gap-3 pt-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enablePulse} onChange={e => setEnablePulse(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-300">Enable Pulse</span>
            </label>
          </div>
          <div><label className="label">PE Credential</label>
            <select className="input" value={peCred} onChange={e => setPeCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label">NDB Credential</label>
            <select className="input" value={ndbCred} onChange={e => setNdbCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
        </div>
      </div>

      <div className="form-section">
        <div className="flex items-center justify-between mb-3">
          <p className="form-section-title !mb-0">NDB VM Deployment</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enableVm} onChange={e => setEnableVm(e.target.checked)} className="rounded" />
            <span className="text-xs text-gray-400">Deploy NDB VM</span>
          </label>
        </div>
        {enableVm && (
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label text-xs">NDB Image Path (disk image)</label>
              <input className="input font-mono text-xs" value={imagePath} onChange={e => setImagePath(e.target.value)} placeholder="/path/to/ndb-2.6.1.qcow2" /></div>
            <div><label className="label text-xs">VM Name</label><input className="input text-xs py-1.5" value={vmName} onChange={e => setVmName(e.target.value)} /></div>
            <div><label className="label text-xs">Storage Container</label><input className="input text-xs py-1.5" value={container} onChange={e => setContainer(e.target.value)} /></div>
            <div><label className="label text-xs">RAM (GB)</label><input className="input text-xs py-1.5" type="number" value={ram} onChange={e => setRam(Number(e.target.value))} /></div>
            <div><label className="label text-xs">vCPUs</label><input className="input text-xs py-1.5" type="number" value={vcpus} onChange={e => setVcpus(Number(e.target.value))} /></div>
            <div><label className="label text-xs">Network Name</label><input className="input text-xs py-1.5" value={networkName} onChange={e => setNetworkName(e.target.value)} placeholder="vlan0-managed" /></div>
            <div><label className="label text-xs">VM IP</label><input className="input text-xs py-1.5" value={vmIp} onChange={e => setVmIp(e.target.value)} placeholder="10.0.0.70" /></div>
            <div><label className="label text-xs">Gateway</label><input className="input text-xs py-1.5" value={gateway} onChange={e => setGateway(e.target.value)} placeholder="10.0.0.1" /></div>
            <div><label className="label text-xs">Subnet Mask</label><input className="input text-xs py-1.5" value={subnetMask} onChange={e => setSubnetMask(e.target.value)} placeholder="255.255.255.0" /></div>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="flex items-center justify-between mb-3">
          <p className="form-section-title !mb-0">Compute Profiles</p>
          <button onClick={() => setComputeProfiles(p => [...p, { name: '', vcpus: 8, cores: 1, ram: 8 }])} className="btn-ghost text-xs gap-1 py-0.5"><Plus size={11} />Add</button>
        </div>
        {computeProfiles.map((p, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 mb-2 items-end">
            <div><label className="label text-xs">Profile Name</label><input className="input text-xs py-1.5" value={p.name} onChange={e => setComputeProfiles(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="ndb" /></div>
            <div><label className="label text-xs">vCPUs</label><input className="input text-xs py-1.5" type="number" value={p.vcpus} onChange={e => setComputeProfiles(prev => prev.map((x, j) => j === i ? { ...x, vcpus: Number(e.target.value) } : x))} /></div>
            <div><label className="label text-xs">RAM (GB)</label><input className="input text-xs py-1.5" type="number" value={p.ram} onChange={e => setComputeProfiles(prev => prev.map((x, j) => j === i ? { ...x, ram: Number(e.target.value) } : x))} /></div>
            {computeProfiles.length > 1 && <button onClick={() => setComputeProfiles(prev => prev.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>}
          </div>
        ))}
      </div>

      <div className="form-section">
        <div className="flex items-center justify-between mb-3">
          <p className="form-section-title !mb-0">Cluster Registrations</p>
          <button onClick={() => setRegClusters(p => [...p, { clusterIp: '', credential: 'pe_user', storageContainer: 'SelfServiceContainer', agentVmIp: '' }])} className="btn-ghost text-xs gap-1 py-0.5"><Plus size={11} />Add</button>
        </div>
        {regClusters.map((c, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 mb-2 items-end p-3 rounded-lg bg-gray-900/50 border border-border/50">
            <div><label className="label text-xs">Cluster IP</label><input className="input text-xs py-1.5" value={c.clusterIp} onChange={e => setRegClusters(prev => prev.map((x, j) => j === i ? { ...x, clusterIp: e.target.value } : x))} placeholder="10.0.0.100" /></div>
            <div><label className="label text-xs">PE Credential</label>
              <select className="input text-xs py-1.5" value={c.credential} onChange={e => setRegClusters(prev => prev.map((x, j) => j === i ? { ...x, credential: e.target.value } : x))}>
                {CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}
              </select></div>
            <div><label className="label text-xs">Storage Container</label><input className="input text-xs py-1.5" value={c.storageContainer} onChange={e => setRegClusters(prev => prev.map((x, j) => j === i ? { ...x, storageContainer: e.target.value } : x))} /></div>
            <div className="flex gap-2 items-end">
              <div className="flex-1"><label className="label text-xs">Agent VM IP</label><input className="input text-xs py-1.5" value={c.agentVmIp} onChange={e => setRegClusters(prev => prev.map((x, j) => j === i ? { ...x, agentVmIp: e.target.value } : x))} placeholder="10.0.0.80" /></div>
              {regClusters.length > 1 && <button onClick={() => setRegClusters(prev => prev.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
