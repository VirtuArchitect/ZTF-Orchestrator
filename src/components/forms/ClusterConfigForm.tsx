import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildClusterConfigYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'

interface Container { name: string; replicationFactor: number; compression: boolean; dedup: boolean }
interface Network { name: string; vlanId: number; networkIp: string; prefix: number; gateway: string; ipPools: string[] }
interface RoleMapping { role: string; entityType: string; values: string }

interface Props { onYamlChange: (yaml: string) => void }

const AD_ROLES = ['ROLE_CLUSTER_ADMIN', 'ROLE_USER_ADMIN', 'ROLE_BACKUP_ADMIN', 'ROLE_READONLY', 'ROLE_CLUSTER_VIEWER']

export default function ClusterConfigForm({ onYamlChange }: Props) {
  const [peCred, setPeCred] = useState('pe_user')
  const [clusterIps, setClusterIps] = useState([''])
  const [dnsServers, setDnsServers] = useState(['8.8.8.8'])
  const [ntpServers, setNtpServers] = useState(['0.us.pool.ntp.org'])

  // EULA
  const [eulaUser, setEulaUser] = useState('admin')
  const [eulaCompany, setEulaCompany] = useState('')
  const [eulaJob, setEulaJob] = useState('')
  const [enableEula, setEnableEula] = useState(true)
  const [enablePulse, setEnablePulse] = useState(true)
  const [haReservation, setHaReservation] = useState(true)

  // AD
  const [enableAD, setEnableAD] = useState(false)
  const [adIp, setAdIp] = useState('')
  const [adName, setAdName] = useState('')
  const [adDomain, setAdDomain] = useState('')
  const [adSvcUser, setAdSvcUser] = useState('')
  const [adSvcPass, setAdSvcPass] = useState('')
  const [adRoles, setAdRoles] = useState<RoleMapping[]>([{ role: 'ROLE_CLUSTER_ADMIN', entityType: 'GROUP', values: '' }])

  // Storage
  const [containers, setContainers] = useState<Container[]>([{ name: 'default-container', replicationFactor: 2, compression: true, dedup: false }])

  // Networks
  const [networks, setNetworks] = useState<Network[]>([{ name: 'vlan0', vlanId: 0, networkIp: '', prefix: 24, gateway: '', ipPools: [] }])

  useEffect(() => {
    const validClusters = clusterIps.filter(ip => ip.trim())
    if (!validClusters.length) return
    onYamlChange(buildClusterConfigYaml({
      peCredential: peCred,
      dnsServers, ntpServers,
      ...(enableEula ? { eulaUsername: eulaUser, eulaCompany, eulaJobTitle: eulaJob } : {}),
      ...(enablePulse !== undefined ? { enablePulse } : {}),
      haReservation,
      ...(enableAD && adIp ? {
        adServerIp: adIp, adName, adDomain, adServiceUser: adSvcUser, adServicePassword: adSvcPass,
        adRoleMappings: adRoles.filter(r => r.values).map(r => ({ role: r.role, entityType: r.entityType, values: r.values.split(',').map(v => v.trim()) })),
      } : {}),
      containers: containers.filter(c => c.name),
      networks: networks.filter(n => n.name),
      clusters: validClusters,
    }))
  }, [peCred, clusterIps, dnsServers, ntpServers, enableEula, eulaUser, eulaCompany, eulaJob, enablePulse, haReservation, enableAD, adIp, adName, adDomain, adSvcUser, adSvcPass, adRoles, containers, networks, onYamlChange])

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">Target Clusters</p>
        <div className="space-y-2">
          {clusterIps.map((ip, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1" value={ip} onChange={e => setClusterIps(p => p.map((v, j) => j === i ? e.target.value : v))} placeholder="10.0.0.100" />
              {clusterIps.length > 1 && <button onClick={() => setClusterIps(p => p.filter((_, j) => j !== i))} className="btn-ghost p-2 text-red-400"><Trash2 size={13} /></button>}
            </div>
          ))}
          <button onClick={() => setClusterIps(p => [...p, ''])} className="btn-secondary text-xs gap-1 py-1.5"><Plus size={12} />Add Cluster</button>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Credentials & Network</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">PE Credential</label>
            <select className="input" value={peCred} onChange={e => setPeCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
          <div />
          <div><label className="label">DNS Servers</label><TagInput values={dnsServers} onChange={setDnsServers} /></div>
          <div><label className="label">NTP Servers</label><TagInput values={ntpServers} onChange={setNtpServers} placeholder="0.us.pool.ntp.org" /></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">EULA & Pulse</p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={enableEula} onChange={e => setEnableEula(e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-300">Accept EULA</span>
          </label>
          {enableEula && (
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label text-xs">Admin Username</label><input className="input text-xs py-1.5" value={eulaUser} onChange={e => setEulaUser(e.target.value)} /></div>
              <div><label className="label text-xs">Company Name</label><input className="input text-xs py-1.5" value={eulaCompany} onChange={e => setEulaCompany(e.target.value)} /></div>
              <div><label className="label text-xs">Job Title</label><input className="input text-xs py-1.5" value={eulaJob} onChange={e => setEulaJob(e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={enablePulse} onChange={e => setEnablePulse(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-300">Enable Pulse</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={haReservation} onChange={e => setHaReservation(e.target.checked)} className="rounded" />
              <span className="text-sm text-gray-300">HA Reservation</span>
            </label>
          </div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">Active Directory</p>
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input type="checkbox" checked={enableAD} onChange={e => setEnableAD(e.target.checked)} className="rounded" />
          <span className="text-sm text-gray-300">Configure Active Directory</span>
        </label>
        {enableAD && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label text-xs">AD Server IP</label><input className="input text-xs py-1.5" value={adIp} onChange={e => setAdIp(e.target.value)} placeholder="10.0.0.200" /></div>
              <div><label className="label text-xs">AD Name</label><input className="input text-xs py-1.5" value={adName} onChange={e => setAdName(e.target.value)} placeholder="CORP-AD" /></div>
              <div><label className="label text-xs">AD Domain</label><input className="input text-xs py-1.5" value={adDomain} onChange={e => setAdDomain(e.target.value)} placeholder="corp.domain.com" /></div>
              <div><label className="label text-xs">Service Account User</label><input className="input text-xs py-1.5" value={adSvcUser} onChange={e => setAdSvcUser(e.target.value)} placeholder="svc-nutanix" /></div>
              <div><label className="label text-xs">Service Account Password</label><input className="input text-xs py-1.5" type="password" value={adSvcPass} onChange={e => setAdSvcPass(e.target.value)} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0 text-xs">Role Mappings</label>
                <button onClick={() => setAdRoles(p => [...p, { role: 'ROLE_READONLY', entityType: 'GROUP', values: '' }])} className="btn-ghost text-xs gap-1 py-0.5"><Plus size={11} />Add</button>
              </div>
              {adRoles.map((r, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end">
                  <select className="input text-xs py-1.5" value={r.role} onChange={e => setAdRoles(p => p.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                    {AD_ROLES.map(role => <option key={role}>{role}</option>)}
                  </select>
                  <select className="input text-xs py-1.5" value={r.entityType} onChange={e => setAdRoles(p => p.map((x, j) => j === i ? { ...x, entityType: e.target.value } : x))}>
                    <option>GROUP</option><option>USER</option>
                  </select>
                  <input className="input text-xs py-1.5 col-span-1" value={r.values} onChange={e => setAdRoles(p => p.map((x, j) => j === i ? { ...x, values: e.target.value } : x))} placeholder="Group Name (comma-sep)" />
                  {adRoles.length > 1 && <button onClick={() => setAdRoles(p => p.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400"><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="form-section">
        <p className="form-section-title">Storage Containers</p>
        {containers.map((c, i) => (
          <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end">
            <div><label className="label text-xs">Container Name</label><input className="input text-xs py-1.5" value={c.name} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="default-container" /></div>
            <div><label className="label text-xs">RF</label>
              <select className="input text-xs py-1.5" value={c.replicationFactor} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, replicationFactor: Number(e.target.value) } : x))}>
                <option value={2}>RF-2</option><option value={3}>RF-3</option>
              </select></div>
            <div className="flex gap-3 items-center pt-4">
              <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={c.compression} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, compression: e.target.checked } : x))} />Compress
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={c.dedup} onChange={e => setContainers(p => p.map((x, j) => j === i ? { ...x, dedup: e.target.checked } : x))} />Dedup
              </label>
            </div>
            {containers.length > 1 && <button onClick={() => setContainers(p => p.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400 self-end"><Trash2 size={12} /></button>}
          </div>
        ))}
        <button onClick={() => setContainers(p => [...p, { name: '', replicationFactor: 2, compression: true, dedup: false }])} className="btn-secondary text-xs gap-1 py-1.5 mt-1"><Plus size={12} />Add Container</button>
      </div>

      <div className="form-section">
        <p className="form-section-title">Networks / VLANs</p>
        {networks.map((n, i) => (
          <div key={i} className="p-3 rounded-lg bg-gray-900/50 border border-border/50 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label text-xs">Network Name</label><input className="input text-xs py-1.5" value={n.name} onChange={e => setNetworks(p => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="vlan-100" /></div>
              <div><label className="label text-xs">VLAN ID</label><input className="input text-xs py-1.5" type="number" value={n.vlanId} onChange={e => setNetworks(p => p.map((x, j) => j === i ? { ...x, vlanId: Number(e.target.value) } : x))} /></div>
              <div><label className="label text-xs">Network IP</label><input className="input text-xs py-1.5" value={n.networkIp} onChange={e => setNetworks(p => p.map((x, j) => j === i ? { ...x, networkIp: e.target.value } : x))} placeholder="10.0.1.0" /></div>
              <div><label className="label text-xs">Prefix Length</label><input className="input text-xs py-1.5" type="number" value={n.prefix} onChange={e => setNetworks(p => p.map((x, j) => j === i ? { ...x, prefix: Number(e.target.value) } : x))} /></div>
              <div><label className="label text-xs">Gateway</label><input className="input text-xs py-1.5" value={n.gateway} onChange={e => setNetworks(p => p.map((x, j) => j === i ? { ...x, gateway: e.target.value } : x))} placeholder="10.0.1.1" /></div>
            </div>
            <div><label className="label text-xs">IP Pools (format: 10.0.1.10-10.0.1.50)</label>
              <TagInput values={n.ipPools} onChange={pools => setNetworks(p => p.map((x, j) => j === i ? { ...x, ipPools: pools } : x))} placeholder="10.0.1.10-10.0.1.50" />
            </div>
            {networks.length > 1 && <button onClick={() => setNetworks(p => p.filter((_, j) => j !== i))} className="btn-ghost p-1 text-red-400 text-xs gap-1 flex items-center"><Trash2 size={11} />Remove</button>}
          </div>
        ))}
        <button onClick={() => setNetworks(p => [...p, { name: '', vlanId: 0, networkIp: '', prefix: 24, gateway: '', ipPools: [] }])} className="btn-secondary text-xs gap-1 py-1.5 mt-1"><Plus size={12} />Add Network</button>
      </div>
    </div>
  )
}
