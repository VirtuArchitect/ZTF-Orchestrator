import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildCalmWorkloadsYaml } from '../../utils/yaml'
import { CREDENTIAL_KEYS } from '../../data'
import type { ConnectionProfile } from '../../types'

interface Blueprint { dslFile: string; name: string; appName: string; runtimeVars: string }
interface Project { projectName: string; clusterName: string; subnetName: string; imageName: string; accountName: string }

interface Props { onYamlChange: (yaml: string) => void; profile?: ConnectionProfile }

export default function CalmWorkloadsForm({ onYamlChange, profile }: Props) {
  const [ncmIp, setNcmIp] = useState(profile?.ncm.endpoint || profile?.prismCentral.endpoint || '')
  const [ncmCred, setNcmCred] = useState(profile?.ncm.credentialRef || 'ncm_user')
  const [blueprints, setBlueprints] = useState<Blueprint[]>([{ dslFile: 'calm-dsl-bps/blueprints/LAMP/LAMP.py', name: 'LAMP-dsl', appName: 'LAMP-app', runtimeVars: '' }])
  const [projects, setProjects] = useState<Project[]>([{ projectName: profile?.ncm.projectName || '', clusterName: '', subnetName: profile?.prismElement.networkName || '', imageName: '', accountName: profile?.ncm.accountName || 'NTNX_LOCAL_AZ' }])

  useEffect(() => {
    if (!ncmIp) return
    onYamlChange(buildCalmWorkloadsYaml({ ncmVmIp: ncmIp, ncmCredential: ncmCred, blueprints, projects }))
  }, [ncmIp, ncmCred, blueprints, projects, onYamlChange])

  const updBp = (i: number, u: Partial<Blueprint>) => setBlueprints(p => p.map((x, j) => j === i ? { ...x, ...u } : x))
  const updPj = (i: number, u: Partial<Project>) => setProjects(p => p.map((x, j) => j === i ? { ...x, ...u } : x))

  return (
    <div className="space-y-5">
      <div className="form-section">
        <p className="form-section-title">NCM Settings</p>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">NCM VM IP <span className="text-red-400">*</span></label>
            <input className="input" value={ncmIp} onChange={e => setNcmIp(e.target.value)} placeholder="10.0.0.60" /></div>
          <div><label className="label">NCM Credential</label>
            <select className="input" value={ncmCred} onChange={e => setNcmCred(e.target.value)}>{CREDENTIAL_KEYS.map(k => <option key={k}>{k}</option>)}</select></div>
        </div>
      </div>

      <div className="form-section">
        <p className="form-section-title">DSL Blueprints</p>
        {blueprints.map((bp, i) => (
          <div key={i} className="grid grid-cols-4 gap-3 mb-3 p-3 rounded-lg bg-gray-900/50 border border-border/50 items-end">
            <div className="col-span-4"><label className="label text-xs">DSL File Path</label>
              <input className="input text-xs py-1.5 font-mono" value={bp.dslFile} onChange={e => updBp(i, { dslFile: e.target.value })} placeholder="calm-dsl-bps/blueprints/LAMP/LAMP.py" /></div>
            <div><label className="label text-xs">Blueprint Name</label><input className="input text-xs py-1.5" value={bp.name} onChange={e => updBp(i, { name: e.target.value })} placeholder="LAMP-dsl" /></div>
            <div><label className="label text-xs">App Name</label><input className="input text-xs py-1.5" value={bp.appName} onChange={e => updBp(i, { appName: e.target.value })} placeholder="LAMP-app" /></div>
            <div><label className="label text-xs">Runtime Vars</label><input className="input text-xs py-1.5" value={bp.runtimeVars} onChange={e => updBp(i, { runtimeVars: e.target.value })} placeholder="key=value,..." /></div>
            {blueprints.length > 1 && <button onClick={() => setBlueprints(p => p.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>}
          </div>
        ))}
        <button onClick={() => setBlueprints(p => [...p, { dslFile: '', name: '', appName: '', runtimeVars: '' }])} className="btn-secondary text-xs gap-1 py-1.5"><Plus size={12} />Add Blueprint</button>
      </div>

      <div className="form-section">
        <p className="form-section-title">Target Projects</p>
        {projects.map((p, i) => (
          <div key={i} className="grid grid-cols-3 gap-3 mb-3 p-3 rounded-lg bg-gray-900/50 border border-border/50 items-end">
            <div><label className="label text-xs">Project Name</label><input className="input text-xs py-1.5" value={p.projectName} onChange={e => updPj(i, { projectName: e.target.value })} placeholder="project-cluster-1" /></div>
            <div><label className="label text-xs">Cluster Name</label><input className="input text-xs py-1.5" value={p.clusterName} onChange={e => updPj(i, { clusterName: e.target.value })} placeholder="cluster1" /></div>
            <div><label className="label text-xs">Subnet Name</label><input className="input text-xs py-1.5" value={p.subnetName} onChange={e => updPj(i, { subnetName: e.target.value })} placeholder="vlan0-managed" /></div>
            <div><label className="label text-xs">Image Name</label><input className="input text-xs py-1.5" value={p.imageName} onChange={e => updPj(i, { imageName: e.target.value })} placeholder="CentOS-7" /></div>
            <div><label className="label text-xs">Account Name</label><input className="input text-xs py-1.5" value={p.accountName} onChange={e => updPj(i, { accountName: e.target.value })} placeholder="NTNX_LOCAL_AZ" /></div>
            {projects.length > 1 && <button onClick={() => setProjects(prev => prev.filter((_, j) => j !== i))} className="btn-ghost p-1.5 text-red-400"><Trash2 size={13} /></button>}
          </div>
        ))}
        <button onClick={() => setProjects(p => [...p, { projectName: '', clusterName: '', subnetName: '', imageName: '', accountName: 'NTNX_LOCAL_AZ' }])} className="btn-secondary text-xs gap-1 py-1.5"><Plus size={12} />Add Project</button>
      </div>
    </div>
  )
}
