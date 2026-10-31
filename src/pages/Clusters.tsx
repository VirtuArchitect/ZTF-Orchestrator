import { useState } from 'react'
import { Building2, RefreshCw, Server } from 'lucide-react'
import Layout from '../components/Layout'
import { useRecoverySummary } from '../components/OperationsOverview'
import { Link } from '../router'

export default function Clusters() {
  const { data, error } = useRecoverySummary()
  const [search, setSearch] = useState('')
  const [datacenter, setDatacenter] = useState('')
  const profiles = data?.profiles.filter(profile => (!datacenter || profile.datacenterId === datacenter) && profile.name.toLowerCase().includes(search.toLowerCase())) || []
  return <Layout title="Clusters" subtitle="Saved recovery cluster profiles by datacenter">
    <div className="space-y-5">
      <div className="card flex gap-3 items-start"><Server size={22} className="text-nutanix-cyan shrink-0" /><p className="text-sm text-gray-400">This view lists saved recovery profiles, not discovered live clusters or verified health. Create and review profiles in Disaster Recovery. Other deployment and configuration files remain in <Link to="/configs" className="text-nutanix-cyan">Config Files</Link>.</p></div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-gray-400 flex-1 min-w-[180px]">Search profiles<input className="input mt-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cluster profile name" /></label>
        <label className="text-sm text-gray-400 min-w-[180px]">Datacenter<select className="input mt-2" value={datacenter} onChange={e => setDatacenter(e.target.value)}><option value="">All datacenters</option>{data?.datacenters.map(dc => <option key={dc.id} value={dc.id}>{dc.name}</option>)}</select></label>
      </div>
      {error && <p role="status" className="text-sm text-yellow-400">{error}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm text-left"><thead><tr className="border-b border-border text-gray-400">{['Profile', 'Datacenter', 'Baseline review', 'Latest recorded run', 'Action'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">
          {profiles.map(profile => {
            const dc = data?.datacenters.find(item => item.id === profile.datacenterId)
            const run = [...(data?.runs || [])].filter(item => item.profileId === profile.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]
            return <tr key={profile.id}><td className="p-3 font-medium text-gray-200">{profile.name}</td><td className="p-3 text-gray-400">{dc?.name || 'Not recorded'}</td><td className="p-3"><span className={profile.reviewed && !profile.drifted ? 'text-nutanix-teal' : 'text-yellow-400'}>{profile.drifted ? 'Changed · Review required' : profile.reviewed ? 'Reviewed' : 'Needs review'}</span></td><td className="p-3 text-gray-400">{run ? run.status.replace(/_/g, ' ') : 'No run recorded'}</td><td className="p-3"><Link to="/recovery" className="text-nutanix-cyan whitespace-nowrap">Open Disaster Recovery</Link></td></tr>
          })}
        </tbody></table>
        {!data && !error && <p className="p-6 text-gray-400"><RefreshCw size={16} className="inline animate-spin mr-2" />Loading recorded profiles…</p>}
        {data && !profiles.length && <div className="p-6 text-gray-400"><Building2 size={24} className="mb-3" /><p>No saved profiles match this view.</p><Link to="/recovery" className="inline-block text-nutanix-cyan mt-3">Prepare a recovery profile</Link></div>}
      </div>
      <div className="flex flex-wrap gap-3"><Link to="/start/deploy" className="btn-secondary">Deploy a Cluster</Link><Link to="/start/configure" className="btn-secondary">Configure an Existing Cluster</Link><Link to="/recovery" className="btn-primary">Manage Recovery Profiles</Link></div>
    </div>
  </Layout>
}
