import { useEffect, useState } from 'react'
import { apiFetch } from '../utils/api'

type Profile = { id: string; name: string; role: 'viewer' | 'operator'; capabilities: string[] }
type Selection = { profileId: string; clusterIds: string[]; datacenterIds: string[] }
type Document = { version: number; revision: number; profiles: Profile[]; assignments: Record<string, Selection> }
type Cluster = { id: string; name: string; datacenter: string; datacenterId: string; executionReady: boolean }
type Catalogue = { document: Document; clusters: Cluster[]; catalogueFingerprint: string }
type Review = { fingerprint: string; accounts: { accountId: string; username: string; clusterCount: number; capabilities: string[]; inheritedDatacenters: number; legacyRestored: boolean }[] }
type Account = { id: string; username: string; role: string }
const LABELS: Record<string, string> = {
  'clusters.view': 'View assigned clusters and status', 'history.view': 'View sanitised execution and recovery history',
  'pipeline.execute': 'Run authorised pipelines', 'requests.create': 'Request deployment, recovery or change',
  'drafts.create': 'Create non-executable action-plan drafts', 'jobs.cancel_own': 'Request cancellation of own run',
}
const toggle = (values: string[], id: string, on: boolean) => on ? [...new Set([...values, id])] : values.filter(v => v !== id)

export default function BulkAccess({ users, onSaved }: { users: Account[]; onSaved: () => Promise<void> }) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null)
  const [document, setDocument] = useState<Document | null>(null)
  const [profileId, setProfileId] = useState('viewer')
  const [accounts, setAccounts] = useState<string[]>([])
  const [clusters, setClusters] = useState<string[]>([])
  const [datacenters, setDatacenters] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function call(method = 'GET', suffix = '', body?: unknown) {
    const response = await apiFetch('/api/access/admin/bulk' + suffix, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'Access operation failed')
    return value
  }
  async function load() { const value: Catalogue = await call(); setCatalogue(value); setDocument(value.document); setProfileId(current => value.document.profiles.some(p => p.id === current) ? current : value.document.profiles[0].id); setDirty(false); setReview(null) }
  useEffect(() => { void load().catch(e => setError(e.message)) }, [])
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)); setReview(null) }
    finally { setBusy(false) }
  }
  function edit(next: Document) { setDocument(next); setDirty(true); setReview(null); setMessage('') }
  const profile = document?.profiles.find(p => p.id === profileId)
  const eligible = users.filter(u => u.role === profile?.role)
  const visibleUsers = eligible.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase()))
  const dcs = [...new Map(catalogue?.clusters.map(c => [c.datacenterId, c.datacenter]) || []).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const count = catalogue?.clusters.filter(c => clusters.includes(c.id) || datacenters.includes(c.datacenterId)).length || 0
  return <section className="card space-y-5" aria-label="Bulk access management">
    <div><h2 className="text-xl font-semibold">Permission profiles and cluster access</h2><p className="text-sm text-gray-400 mt-2">Choose a reusable profile, select accounts and check the datacentres or clusters they can manage. No PE endpoints, UUIDs or passwords are needed here. Existing workflow approvals still apply.</p></div>
    {error && <p role="alert" className="text-red-500">{error}</p>}
    {message && <p role="status" className="text-nutanix-teal">{message}</p>}
    {!catalogue && !error && <p role="status">Loading permission profiles and cluster catalogue…</p>}
    {document && catalogue && profile && <>
      <div className="grid lg:grid-cols-2 gap-6">
        <fieldset className="border border-border rounded-lg p-4 space-y-3"><legend className="font-semibold px-2">1. Permission profile</legend>
          <label className="block text-sm">Permission profile<select aria-label="Permission profile" className="input mt-1" value={profileId} onChange={e => { setProfileId(e.target.value); setAccounts([]) }}>{document.profiles.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
          <label className="block text-sm">Profile name<input className="input mt-1" maxLength={120} value={profile.name} onChange={e => edit({ ...document, profiles: document.profiles.map(p => p.id === profileId ? { ...p, name: e.target.value } : p) })} /></label>
          <p className="text-sm text-gray-400">{profile.role === 'viewer' ? 'Viewer profiles are always read-only.' : 'Operator profiles grant only the checked capabilities.'} Editing a profile updates every account using it.</p>
          {Object.entries(LABELS).map(([id, label]) => <label key={id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={profile.capabilities.includes(id)} disabled={id === 'clusters.view' || (profile.role === 'viewer' && !id.endsWith('.view'))} onChange={e => edit({ ...document, profiles: document.profiles.map(p => p.id === profileId ? { ...p, capabilities: toggle(p.capabilities, id, e.target.checked) } : p) })} />{label}</label>)}
          <button className="btn-secondary" disabled={document.profiles.length >= 100} onClick={() => { const id = crypto.randomUUID(); edit({ ...document, profiles: [...document.profiles, { ...profile, id, name: profile.name + ' copy' }] }); setProfileId(id); setAccounts([]) }}>Duplicate profile</button>
          <p className="text-xs text-gray-400">Credential management, access administration, self-approval and unrestricted execution are not delegated by these profiles.</p>
        </fieldset>
        <fieldset className="border border-border rounded-lg p-4 space-y-3"><legend className="font-semibold px-2">2. Accounts</legend>
          <label className="block text-sm">Search accounts<input className="input mt-1" value={userSearch} onChange={e => setUserSearch(e.target.value)} /></label>
          <button className="btn-secondary" disabled={!visibleUsers.length} onClick={() => setAccounts([...new Set([...accounts, ...visibleUsers.map(u => u.id)])])}>Select matching {profile.role} accounts</button>
          <div className="max-h-64 overflow-y-auto space-y-2">{visibleUsers.map(u => <div key={u.id} className="flex items-center justify-between gap-2"><label className="flex gap-2 text-sm"><input type="checkbox" checked={accounts.includes(u.id)} onChange={e => setAccounts(toggle(accounts, u.id, e.target.checked))} />{u.username} · {u.role}</label>{document.assignments[u.id] && <button className="btn-secondary text-xs" onClick={() => { const a = document.assignments[u.id]; setProfileId(a.profileId); setAccounts([u.id]); setClusters(a.clusterIds); setDatacenters(a.datacenterIds) }}>Load assignment for {u.username}</button>}</div>)}</div>
          {!visibleUsers.length && <p className="text-sm text-gray-400">No matching {profile.role} accounts. Create accounts in Users & Roles.</p>}
          <p className="text-sm">{accounts.length} accounts selected. Account roles are retained.</p>
        </fieldset>
      </div>
      <fieldset className="border border-border rounded-lg p-4 space-y-4"><legend className="font-semibold px-2">3. Datacentres and clusters</legend>
        <label className="block text-sm">Search datacentres or clusters<input className="input mt-1" placeholder="Find a datacentre or cluster" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-3"><button className="btn-secondary" onClick={() => { setClusters([]); setDatacenters([]) }}>Clear cluster selection</button><span>{count} clusters selected</span></div>
        {!catalogue.clusters.length && <p className="text-sm text-gray-400">No clusters recorded. Add cluster groups in Global Config or use existing reviewed target scopes. Saving grouping alone grants no access.</p>}
        <div className="grid xl:grid-cols-2 gap-4">{dcs.map(([id, name]) => {
          const all = catalogue.clusters.filter(c => c.datacenterId === id)
          const visible = all.filter(c => (c.name + ' ' + name).toLowerCase().includes(search.toLowerCase()))
          if (!visible.length) return null
          const inherited = datacenters.includes(id)
          return <div className="border border-border rounded-lg p-4 space-y-3" key={id}>
            <h3 className="font-semibold">{name || 'No datacentre'} · {all.length} clusters</h3>
            <button className="btn-secondary" onClick={() => setClusters([...new Set([...clusters, ...all.map(c => c.id)])])}>Select all existing clusters in {name}</button>
            <label className="flex items-start gap-2 text-sm text-amber-500"><input type="checkbox" checked={inherited} onChange={e => setDatacenters(toggle(datacenters, id, e.target.checked))} />Entire {name}, including future clusters</label>
            <div className="max-h-64 overflow-y-auto space-y-2">{visible.map(c => <label className="flex items-start gap-2 text-sm" key={c.id}><input type="checkbox" disabled={inherited} checked={inherited || clusters.includes(c.id)} onChange={e => setClusters(toggle(clusters, c.id, e.target.checked))} /><span>{c.name}{!c.executionReady && <span className="block text-xs text-gray-400">Visibility available · execution identity needs setup</span>}</span></label>)}</div>
          </div>
        })}</div>
        <p className="text-sm text-gray-400">Existing-cluster selections stay fixed. Future-cluster inheritance is explicit and audited. Missing technical identity blocks delegated execution, not access assignment.</p>
      </fieldset>
      <div className="flex flex-wrap gap-3 items-center"><button className="btn-secondary" disabled={!accounts.length || busy} onClick={() => {
        const assignments = { ...document.assignments }
        accounts.forEach(id => { assignments[id] = { profileId, clusterIds: clusters, datacenterIds: datacenters } })
        edit({ ...document, assignments }); setMessage(`Draft updated for ${accounts.length} accounts. Review and save to apply.`)
      }}>Apply selection to draft</button><span className="text-sm text-gray-400">Replaces access selections for the selected accounts. Use an empty cluster selection to revoke their access.</span></div>
      <div className="flex gap-3"><button className="btn-primary" disabled={!dirty || busy} onClick={() => void action(async () => { setReview(await call('POST', '/preview', { document, catalogueFingerprint: catalogue.catalogueFingerprint })) })}>Review access changes</button><button className="btn-secondary" disabled={busy} onClick={() => void action(load)}>Reload saved access</button></div>
      {review && <div className="border border-nutanix-cyan rounded-lg p-4 space-y-3"><h3 className="font-semibold">Review effective access</h3><p className="text-sm text-gray-400">These are the resulting assignments. Existing workflow approvals and reviewed execution requirements are retained.</p><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th className="p-2">Account</th><th className="p-2">Clusters</th><th className="p-2">Future-cluster datacentres</th><th className="p-2">Permissions</th></tr></thead><tbody>{review.accounts.map(a => <tr key={a.accountId} className="border-t border-border"><td className="p-2">{a.username}{a.legacyRestored && <span className="block text-amber-500">Prior legacy assignment restored</span>}</td><td className="p-2">{a.clusterCount}</td><td className="p-2">{a.inheritedDatacenters}</td><td className="p-2">{a.capabilities.map(c => LABELS[c] || c).join(', ') || 'Read-only legacy access'}</td></tr>)}</tbody></table></div>
        <button className="btn-primary" disabled={busy} onClick={() => void action(async () => { await call('PUT', '', { document, catalogueFingerprint: catalogue.catalogueFingerprint, fingerprint: review.fingerprint }); await load(); await onSaved(); setMessage('Permission profiles and bulk access saved. Existing workflow approvals and recovery work retained.') })}>Save reviewed access</button>
      </div>}
    </>}
  </section>
}
