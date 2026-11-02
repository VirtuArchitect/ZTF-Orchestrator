import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'
import type { CredentialGroup } from '../utils/credentialOrganization'

export const CONFIG_PURPOSES = ['', 'Deployment', 'Post-configuration', 'Monitoring', 'Recovery', 'Shared template']
export interface ConfigOrganization {
  version: 1; revision: number; groups: CredentialGroup[]
  assignments: Record<string, { groupId: string; purpose: string }>
}
export function useConfigOrganization() {
  const [organization, setOrganization] = useState<ConfigOrganization>({ version: 1, revision: 0, groups: [], assignments: {} })
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const reload = async () => {
    try {
      const response = await apiFetch('/api/config-organization')
      if (!response.ok) throw new Error('Config grouping is unavailable. Files remain accessible; grouping changes are disabled.')
      const value = await response.json()
      if (value.version !== 1 || !Number.isInteger(value.revision) || !Array.isArray(value.groups) || !value.assignments || typeof value.assignments !== 'object' || Array.isArray(value.assignments)) throw new Error('Invalid config grouping response.')
      setOrganization(value); setReady(true); setError('')
    } catch (failure) { setReady(false); setError(failure instanceof Error ? failure.message : 'Unable to load config groups.') }
  }
  useEffect(() => { void reload() }, [])
  const assign = async (name: string, groupId: string, purpose: string) => {
    if (!ready) throw new Error('Reload config grouping before saving labels.')
    const response = await apiFetch('/api/config-organization', { method: 'PUT', body: JSON.stringify({ version: 1, revision: organization.revision, assignments: { ...organization.assignments, [name]: { groupId, purpose } } }) })
    if (!response.ok) { const value = await response.json(); throw new Error(value.error || 'Unable to save config labels.') }
    setOrganization(await response.json())
  }
  return { organization, error, ready, reload, assign }
}
export function configMatches(name: string, organization: ConfigOrganization, scope: string, search = '', purpose = '') {
  const assignment = organization.assignments[name]
  const group = organization.groups.find(item => item.id === assignment?.groupId)
  const inScope = scope === 'all' || (scope === 'ungrouped' ? !group : scope.startsWith('dc:') ? group?.datacenter === scope.slice(3) || group?.kind === 'shared' : group?.id === scope || (group?.kind === 'shared' && organization.groups.some(item => item.id === scope && item.kind === 'cluster')))
  return inScope && (!purpose || assignment?.purpose === purpose) && `${name} ${group?.name || ''} ${group?.datacenter || ''} ${assignment?.purpose || ''}`.toLowerCase().includes(search.toLowerCase())
}
export default function ConfigScope({ organization, scope, onChange }: { organization: ConfigOrganization; scope: string; onChange: (value: string) => void }) {
  const datacenters = [...new Set(organization.groups.filter(group => group.kind === 'cluster').map(group => group.datacenter))].sort()
  const button = (value: string, label: string, indent = false) => <button key={value} type="button" aria-pressed={scope === value} className={`block w-full text-left rounded px-3 py-1.5 text-sm ${indent ? 'pl-6' : ''} ${scope === value ? 'bg-nutanix-blue/20 font-semibold' : 'hover:bg-surface-elevated'}`} onClick={() => onChange(value)}>{label}</button>
  return <div aria-label="Configuration scope" className="space-y-1">
    {button('all', 'All files')}{button('ungrouped', 'Ungrouped')}
    {datacenters.map(dc => <div key={dc}>{button(`dc:${dc}`, dc)}{organization.groups.filter(group => group.kind === 'cluster' && group.datacenter === dc).map(group => button(group.id, group.name, true))}</div>)}
    {organization.groups.filter(group => group.kind === 'shared').map(group => button(group.id, `Shared / ${group.name}`))}
    <p className="text-xs text-gray-500 px-3">Cluster filters include shared files. Manage groups in Global Config.</p>
  </div>
}
export function ScopedConfigPicker({ files, value, onChange }: { files: { name: string }[]; value: string; onChange: (name: string) => void }) {
  const { organization, error } = useConfigOrganization()
  const [scope, setScope] = useState('all')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const visible = files.filter(file => configMatches(file.name, organization, showAll ? 'all' : scope, search))
  return <div className="min-w-0 flex-1 space-y-2">
    <details><summary className="text-sm cursor-pointer">Filter config files by datacenter / cluster</summary><ConfigScope organization={organization} scope={scope} onChange={setScope} /><label className="text-sm flex gap-2"><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />Show all files</label></details>
    {error && <p className="text-xs text-amber-600" role="status">{error}</p>}
    <input aria-label="Search configuration files" className="input w-full" placeholder="Search filename, cluster or purpose" value={search} onChange={event => setSearch(event.target.value)} />
    <select aria-label="Configuration file" value={value} onChange={event => onChange(event.target.value)} className="input w-full">
      <option value="">— no config file —</option>
      {value && !visible.some(file => file.name === value) && <option value={value}>{value} (current selection; outside filter or unavailable)</option>}
      {visible.map(file => <option key={file.name} value={file.name}>{file.name}</option>)}
    </select>
  </div>
}
