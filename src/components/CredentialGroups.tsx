import { useState } from 'react'
import { Building2, FolderKey, Plus, Search, Trash2, Pencil, Eye, EyeOff } from 'lucide-react'
import type { Credential } from '../types'
import type { CredentialGroup, CredentialOrganization } from '../utils/credentialOrganization'

interface Props {
  credentials: Credential[]
  organization: CredentialOrganization
  onOrganization: (value: CredentialOrganization) => void
  onCredential: (index: number, field: keyof Credential, value: string) => void
  onAddCredential: (groupId?: string) => void
  onRemoveCredential: (index: number) => void
  onSave: () => void
  canEdit: boolean
  dirty: boolean
  saving: boolean
  error: string
}

export default function CredentialGroups(props: Props) {
  const { credentials, organization: org, canEdit } = props
  const [selection, setSelection] = useState('all')
  const [search, setSearch] = useState('')
  const [treeSearch, setTreeSearch] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [editing, setEditing] = useState<CredentialGroup | null>(null)
  const [groupError, setGroupError] = useState('')
  const selected = org.groups.find(group => `group:${group.id}` === selection)
  const count = (id: string) => credentials.filter(credential => org.assignments[credential.ref]?.groupId === id).length
  const datacenters = [...new Set(org.groups.filter(group => group.kind === 'cluster').map(group => group.datacenter))].sort()
  const visibleGroups = org.groups.filter(group => `${group.name} ${group.datacenter}`.toLowerCase().includes(treeSearch.toLowerCase()))
  const sharedIds = new Set(org.groups.filter(group => group.kind === 'shared').map(group => group.id))
  const filtered = credentials.map((credential, index) => ({ credential, index })).filter(({ credential }) => {
    const assignment = org.assignments[credential.ref]
    const group = org.groups.find(item => item.id === assignment?.groupId)
    const scope = selection === 'all' || (selection === 'ungrouped' ? !group : selection === 'shared' ? sharedIds.has(group?.id || '') : selected?.id === group?.id)
    return scope && `${credential.ref} ${credential.username} ${assignment?.purpose || ''}`.toLowerCase().includes(search.toLowerCase())
  })
  const title = selected?.name || ({ all: 'All credentials', shared: 'Shared Services', ungrouped: 'Ungrouped credentials' }[selection]) || 'All credentials'

  function edit(group?: CredentialGroup) {
    setGroupError('')
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    setEditing(group ? { ...group } : { id: `group_${Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('')}`, kind: 'cluster', datacenter: selected?.datacenter || '', name: '' })
  }
  function applyGroup() {
    if (!editing) return
    const dc = editing.datacenter.trim()
    const group = { ...editing, name: editing.name.trim(), datacenter: editing.kind === 'shared' ? '' : datacenters.find(value => value.toLowerCase() === dc.toLowerCase()) || dc }
    if (!group.name || (group.kind === 'cluster' && !group.datacenter)) { setGroupError('Enter a group name and, for a cluster, a datacenter.'); return }
    if (org.groups.some(item => item.id !== group.id && item.kind === group.kind && item.datacenter.toLowerCase() === group.datacenter.toLowerCase() && item.name.toLowerCase() === group.name.toLowerCase())) { setGroupError('This group already exists in the selected datacenter.'); return }
    props.onOrganization({ ...org, groups: [...org.groups.filter(item => item.id !== group.id), group] })
    setSelection(`group:${group.id}`)
    setEditing(null)
  }
  function removeGroup() {
    if (!selected || !confirm(`Remove group "${selected.name}"? Its credentials will become ungrouped; no credential or password will be deleted.`)) return
    const assignments = Object.fromEntries(Object.entries(org.assignments).map(([ref, assignment]) => [ref, assignment.groupId === selected.id ? { ...assignment, groupId: '' } : assignment]))
    props.onOrganization({ ...org, groups: org.groups.filter(group => group.id !== selected.id), assignments })
    setSelection('ungrouped')
  }
  const assign = (ref: string, field: 'groupId' | 'purpose', value: string) => props.onOrganization({ ...org, assignments: { ...org.assignments, [ref]: { ...(org.assignments[ref] || { groupId: '', purpose: '' }), [field]: value } } })
  const groupButton = (value: string, label: string, total: number) => <button key={value} onClick={() => setSelection(value)} aria-pressed={selection === value} className={`w-full rounded-lg px-3 py-2 text-left text-sm flex justify-between gap-2 ${selection === value ? 'bg-nutanix-blue text-white' : 'text-gray-300 hover:bg-surface'}`}><span>{label}</span><span>{total}</span></button>
  const validRefs = credentials.every(credential => credential.ref.trim()) && new Set(credentials.map(credential => credential.ref)).size === credentials.length
  const orphanCount = Object.keys(org.assignments).filter(ref => !credentials.some(credential => credential.ref === ref)).length

  return <section aria-label="Cluster credential management" className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{[['Datacenters', datacenters.length], ['Cluster groups', org.groups.filter(group => group.kind === 'cluster').length], ['Credential references', credentials.length]].map(([label, value]) => <div key={label} className="card flex justify-between gap-3"><span className="text-gray-400">{label}</span><strong>{value}</strong></div>)}</div>
    <p className="text-sm text-gray-400">Organise local credential definitions without changing their reference keys. External vault settings and credentials are retained. Workflows still select explicit references; groups do not change target credentials or access permissions.</p>
    {props.error && <p role="alert" className="text-sm text-red-500">{props.error}</p>}
    {editing && <section className="card space-y-3" role="region" aria-label="Group editor"><h3 className="font-semibold">{org.groups.some(group => group.id === editing.id) ? 'Edit credential group' : 'Add credential group'}</h3><div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">Group type<select aria-label="Group type" className="input mt-1" value={editing.kind} onChange={event => setEditing({ ...editing, kind: event.target.value as CredentialGroup['kind'] })}><option value="cluster">Cluster</option><option value="shared">Shared service</option></select></label><label className="text-sm">Datacenter<input className="input mt-1" maxLength={120} list="credential-datacenters" disabled={editing.kind === 'shared'} value={editing.datacenter} onChange={event => setEditing({ ...editing, datacenter: event.target.value })} placeholder="DC1" /><datalist id="credential-datacenters">{datacenters.map(dc => <option key={dc} value={dc} />)}</datalist></label><label className="text-sm">Group name<input className="input mt-1" maxLength={120} value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder={editing.kind === 'shared' ? 'Prism Central' : 'AHV-Cluster-01'} /></label></div>{groupError && <p role="alert" className="text-red-500 text-sm">{groupError}</p>}<div className="flex gap-2"><button className="btn-primary" onClick={applyGroup}>Apply group</button><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel group edit</button></div><p className="text-xs text-gray-500">Apply updates this draft. Save grouping to persist it; no infrastructure action is executed.</p></section>}
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-4">
      <aside className="card space-y-3" aria-label="Credential groups">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-sm">Credential groups</h3><button className="btn-ghost text-xs whitespace-nowrap" disabled={!canEdit} onClick={() => edit()}><Plus size={13} />Add group</button></div>
        <label className="sr-only" htmlFor="credential-group-search">Find a cluster or group</label><input id="credential-group-search" className="input" placeholder="Find a cluster…" value={treeSearch} onChange={event => setTreeSearch(event.target.value)} />
        {groupButton('all', 'All credentials', credentials.length)}
        {datacenters.map(dc => <div key={dc}><h4 className="flex gap-2 items-center font-semibold text-sm mt-3 mb-1"><Building2 size={15} />{dc}</h4><div className="pl-3 space-y-1">{visibleGroups.filter(group => group.kind === 'cluster' && group.datacenter === dc).map(group => groupButton(`group:${group.id}`, group.name, count(group.id)))}</div></div>)}
        {groupButton('shared', 'Shared Services', credentials.filter(credential => sharedIds.has(org.assignments[credential.ref]?.groupId)).length)}
        <div className="pl-3">{visibleGroups.filter(group => group.kind === 'shared').map(group => groupButton(`group:${group.id}`, group.name, count(group.id)))}</div>
        {groupButton('ungrouped', 'Ungrouped', credentials.filter(credential => !org.assignments[credential.ref]?.groupId).length)}
        <p className="text-xs text-gray-500 border-t border-border pt-3">Save grouping stores labels only. Save to ZTF stores credential and provider settings.</p>
        <button className="btn-secondary w-full" disabled={!canEdit || !props.dirty || props.saving || !validRefs} onClick={props.onSave}>{props.saving ? 'Saving grouping…' : 'Save grouping'}</button>
        <p role="status" className="text-xs text-gray-500">{props.dirty ? 'Unsaved grouping changes' : 'Grouping saved'}{!canEdit && ' · Administrator access required'}</p>
      </aside>
      <div className="card min-w-0 space-y-4">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-gray-500">{selected?.kind === 'cluster' ? selected.datacenter : 'Global Configuration'}</p><h3 className="text-lg font-semibold flex items-center gap-2"><FolderKey size={19} />{title}</h3></div><div className="flex gap-2 flex-wrap">{selected && <><button className="btn-secondary text-xs" disabled={!canEdit} onClick={() => edit(selected)}><Pencil size={13} />Edit group</button><button className="btn-ghost text-xs" disabled={!canEdit} onClick={removeGroup}>Remove group</button></>}<button className="btn-secondary text-xs" onClick={() => setShowPasswords(!showPasswords)}>{showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}{showPasswords ? 'Hide' : 'Show'} Passwords</button><button className="btn-primary text-xs" disabled={!canEdit} onClick={() => props.onAddCredential(selected?.id)}><Plus size={13} />Add Credential</button></div></div>
        <label className="flex items-center gap-2"><Search size={15} /><span className="sr-only">Search credentials</span><input className="input" placeholder="Search references, usernames or purpose…" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border">{['Reference Key', 'Username', 'Password', 'Group / Purpose', ''].map(label => <th key={label} className="text-left text-xs text-gray-500 pb-3 pr-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{filtered.map(({ credential, index }) => <tr key={index}>
          <td className="py-3 pr-3"><input aria-label={`Reference ${index + 1}`} className="input min-w-40 font-mono text-xs" value={credential.ref} disabled={!canEdit} onChange={event => props.onCredential(index, 'ref', event.target.value)} /></td>
          <td className="py-3 pr-3"><input aria-label={`Username for ${credential.ref}`} className="input min-w-28" value={credential.username} disabled={!canEdit} onChange={event => props.onCredential(index, 'username', event.target.value)} /></td>
          <td className="py-3 pr-3"><input aria-label={`Password for ${credential.ref}`} autoComplete="new-password" className="input min-w-28" type={showPasswords ? 'text' : 'password'} value={credential.password} disabled={!canEdit} onChange={event => props.onCredential(index, 'password', event.target.value)} /></td>
          <td className="py-3 pr-3 space-y-2"><select aria-label={`Group for ${credential.ref}`} className="input min-w-44" value={org.assignments[credential.ref]?.groupId || ''} disabled={!canEdit} onChange={event => assign(credential.ref, 'groupId', event.target.value)}><option value="">Ungrouped</option>{org.groups.map(group => <option key={group.id} value={group.id}>{group.kind === 'cluster' ? `${group.datacenter} / ` : 'Shared / '}{group.name}</option>)}</select><input aria-label={`Purpose for ${credential.ref}`} className="input text-xs" placeholder="Purpose (optional)" maxLength={120} value={org.assignments[credential.ref]?.purpose || ''} disabled={!canEdit} onChange={event => assign(credential.ref, 'purpose', event.target.value)} /></td>
          <td><button aria-label={`Remove credential ${credential.ref}`} className="btn-ghost text-red-500" disabled={!canEdit} onClick={() => props.onRemoveCredential(index)}><Trash2 size={14} /></button></td>
        </tr>)}</tbody></table></div>
        {!filtered.length && <p className="text-sm text-gray-500">No credentials in this view. Assign existing references from All credentials, or add a new definition.</p>}
        {!!orphanCount && <p className="text-xs text-amber-500">{orphanCount} labelled references are not present in local definitions. Their labels are retained; verify external vault or missing references independently.</p>}
        <p className="text-xs text-blue-400">Moving or removing a group never renames a reference or deletes a credential. Existing references remain flat in global.yml.</p>
      </div>
    </div>

  </section>
}
