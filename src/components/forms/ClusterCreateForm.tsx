import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Server } from 'lucide-react'
import { buildClusterCreateYaml } from '../../utils/yaml'
import { TIMEZONES, CREDENTIAL_KEYS } from '../../data'
import TagInput from './TagInput'
import type { ConnectionProfile } from '../../types'

interface Node {
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
}

const csv = (value?: string) => value?.split(',').map(item => item.trim()).filter(Boolean) || []

const defaultNode = (): Node => ({ cvmIp: '', hostIp: '', ipmiIp: '', hostname: '', cvmRamGb: 12 })
const defaultCluster = (): Cluster => ({
  name: '',
  clusterVip: '',
  redundancyFactor: 2,
  timezone: 'America/Los_Angeles',
  nodes: [defaultNode()],
  expanded: true,
})

export default function ClusterCreateForm({ onYamlChange, profile }: Props) {
  const [pcCred, setPcCred] = useState(profile?.foundationCentral.credentialRef || profile?.prismCentral.credentialRef || 'pc_user')
  const [cvmCred, setCvmCred] = useState(profile?.prismElement.cvmCredentialRef || 'cvm_credential')
  const [pcIp, setPcIp] = useState(profile?.foundationCentral.endpoint || profile?.prismCentral.endpoint || '')
  const [dnsServers, setDnsServers] = useState(csv(profile?.defaults.dnsServers).length ? csv(profile?.defaults.dnsServers) : ['8.8.8.8'])
  const [ntpServers, setNtpServers] = useState(csv(profile?.defaults.ntpServers).length ? csv(profile?.defaults.ntpServers) : ['0.us.pool.ntp.org'])
  const [clusters, setClusters] = useState<Cluster[]>([defaultCluster()])

  useEffect(() => {
    if (!pcIp) return
    const yaml = buildClusterCreateYaml({
      pcCredential: pcCred,
      cvmCredential: cvmCred,
      pcIp,
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
  }, [pcCred, cvmCred, pcIp, dnsServers, ntpServers, clusters, onYamlChange])

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
          <div>
            <label className="label">PC Credential Reference</label>
            <select className="input" value={pcCred} onChange={e => setPcCred(e.target.value)}>
              {CREDENTIAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label">CVM Credential Reference</label>
            <select className="input" value={cvmCred} onChange={e => setCvmCred(e.target.value)}>
              {CREDENTIAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Foundation Central IP <span className="text-red-400">*</span></label>
            <input className="input" value={pcIp} onChange={e => setPcIp(e.target.value)} placeholder="10.0.0.100" />
          </div>
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
                      <div key={ni} className="grid grid-cols-6 gap-2 p-3 rounded-lg bg-gray-900/80 border border-border/50 items-end">
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
