import { useEffect, useState } from 'react'
import { apiFetch } from '../../utils/api'
import { toYaml } from '../../utils/yaml'
import type { CredentialGroup } from '../../utils/credentialOrganization'
import { AHV_ACCOUNTS, validatePasswordSetup } from '../../utils/initialPasswordSetup'
import type { PasswordSetupConfig, HostTarget, CvmTarget } from '../../utils/initialPasswordSetup'
import InitialPasswordSetupRuns from '../InitialPasswordSetupRuns'

const cvm = (): CvmTarget => ({ address: '', ssh_host_key_sha256: '', current_credential_ref: '', replacement_credential_ref: '' })
const host = (): HostTarget => ({ address: '', ssh_host_key_sha256: '', access_credential_ref: '', accounts: AHV_ACCOUNTS.map(username => ({ username, current_credential_ref: '', replacement_credential_ref: '' })) })
type Catalogue = { groups: CredentialGroup[]; references: { name: string; groupId: string }[] }

export default function InitialPasswordSetupForm({ onYamlChange, importedConfig, liveEnabled = false, capabilityLoaded = false }: { liveEnabled?: boolean; capabilityLoaded?: boolean; onYamlChange: (yaml: string) => void; importedConfig?: unknown }) {
  const [config, setConfig] = useState<PasswordSetupConfig>({ cluster_name: '', host_key_evidence: '', cvms: [cvm()], hosts: [host()] })
  const [catalogue, setCatalogue] = useState<Catalogue>({ groups: [], references: [] })
  const [error, setError] = useState('')
  const [importError, setImportError] = useState('')
  const [loadedImport, setLoadedImport] = useState<unknown>()
  const [allRefs, setAllRefs] = useState(false)
  useEffect(() => {
    let cancelled = false
    void apiFetch('/api/yaml-studio/context').then(async response => {
      const data = await response.json()
      if (!response.ok || !Array.isArray(data.groups) || !Array.isArray(data.references)) throw new Error()
      if (!cancelled) setCatalogue({ groups: data.groups, references: data.references })
    }).catch(() => { if (!cancelled) setError('Credential reference catalogue unavailable. Reload to select references; imported references still require server validation.') })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    if (importedConfig === undefined) return
    if (validatePasswordSetup(importedConfig)) { setConfig(importedConfig); setImportError('') }
    else { setImportError('Invalid import: only the strict reference-only host/CVM schema is accepted. Import a corrected file to continue.'); onYamlChange('') }
    setLoadedImport(importedConfig)
  }, [importedConfig, onYamlChange])
  useEffect(() => {
    if (importError || (importedConfig !== undefined && loadedImport !== importedConfig)) return
    onYamlChange(validatePasswordSetup(config) ? toYaml(config) : '')
  }, [config, onYamlChange, importError, importedConfig, loadedImport])
  const patch = (values: Partial<PasswordSetupConfig>) => setConfig(previous => ({ ...previous, ...values }))
  const selectedGroup = catalogue.groups.find(g => g.kind === 'cluster' && g.name === config.cluster_name && g.datacenter === (config.datacenter || ''))
  const refs = catalogue.references.filter(r => allRefs || !selectedGroup || r.groupId === selectedGroup.id || catalogue.groups.some(g => g.id === r.groupId && g.kind === 'shared'))
  const reference = (label: string, value: string, onChange: (v: string) => void) => <label key={label} className="block text-sm">{label}<select aria-label={label} className="input w-full" value={value} onChange={e => onChange(e.target.value)}><option value="">Select credential reference</option>{value && !refs.some(r => r.name === value) && <option value={value}>{value} (imported / outside filter; server validation required)</option>}{refs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}</select></label>
  const field = (label: string, value: string, onChange: (v: string) => void) => <label className="block text-sm">{label}<input aria-label={label} maxLength={2048} className="input w-full" value={value} onChange={e => onChange(e.target.value)} /></label>
  const changeCvm = (index: number, values: Partial<CvmTarget>) => patch({ cvms: config.cvms.map((n, i) => i === index ? { ...n, ...values } : n) })
  const changeHost = (index: number, values: Partial<HostTarget>) => patch({ hosts: config.hosts.map((n, i) => i === index ? { ...n, ...values } : n) })
  return <div className="space-y-4">
    <div className="card space-y-3">
      <h3 className="font-semibold">Initial Host &amp; CVM Password Setup</h3>
      <p className="text-sm text-amber-300">Live writes default off pending lab validation. This UI does not establish tested hardware support. The server must check actual observed AOS ≥ 7.5.1.8 and AHV ≥ 11.0.1.3-23 versions before writes.</p>
      <p role="status" className="text-sm text-amber-300">{!capabilityLoaded ? 'Checking server live-write capability; writes disabled.' : liveEnabled ? 'Server live-write flag enabled. This is not hardware validation; approval and confirmation are still required.' : 'Server live-write flag off or unavailable. Execution and resume disabled; read-only checks remain available.'}</p>
      <p className="text-sm text-gray-400">AHV account selection applies to each listed host. root, admin and nutanix are selected by default; a selected account absent on a target must fail server preflight. Deselect accounts only after reviewing that host.</p>
      <p className="text-sm text-gray-400">No Prism Central or TLS prerequisite. SSH identity verification is mandatory: pin every node’s SHA256 host key from a trusted source and record that evidence. Use credential references only, never passwords. All CVMs must belong to one cluster and share current/replacement references for nutanix.</p>
      <p className="text-sm text-gray-400">Dry Run performs read-only checks. Execution requires approval for this exact YAML and typed confirmation. Partial changes require reconciliation; never assume a login succeeded from a selection in this form.</p>
      {error && <p role="alert">{error}</p>}{importError && <p role="alert" className="text-red-400">{importError}</p>}
      <label className="block text-sm">Datacenter group<select aria-label="Datacenter group" className="input w-full" value={config.datacenter || ''} onChange={e => patch({ datacenter: e.target.value || undefined, cluster_name: '' })}><option value="">Choose datacenter</option>{[...new Set(catalogue.groups.filter(g => g.kind === 'cluster').map(g => g.datacenter))].map(dc => <option key={dc}>{dc}</option>)}</select></label>
      <label className="block text-sm">Cluster group<select aria-label="Cluster group" className="input w-full" value={selectedGroup?.id || ''} onChange={e => { const g = catalogue.groups.find(g => g.id === e.target.value); if (g) patch({ cluster_name: g.name, datacenter: g.datacenter }) }}><option value="">Choose cluster group</option>{catalogue.groups.filter(g => g.kind === 'cluster' && g.datacenter === config.datacenter).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      {field('Cluster name', config.cluster_name, v => patch({ cluster_name: v }))}
      {field('Datacenter (optional)', config.datacenter || '', v => patch({ datacenter: v || undefined }))}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={allRefs} onChange={e => setAllRefs(e.target.checked)} />Show credential references from all groups</label>
      {field('Trusted host-key evidence', config.host_key_evidence, v => patch({ host_key_evidence: v }))}
      <div className="grid md:grid-cols-2 gap-3">{reference('Common CVM current reference', config.cvms[0].current_credential_ref, v => patch({ cvms: config.cvms.map(n => ({ ...n, current_credential_ref: v })) }))}{reference('Common CVM replacement reference', config.cvms[0].replacement_credential_ref, v => patch({ cvms: config.cvms.map(n => ({ ...n, replacement_credential_ref: v })) }))}</div>
    </div>
    {config.cvms.map((n, i) => <fieldset className="card space-y-3" key={i}><legend>CVM {i + 1} · nutanix</legend>{field(`CVM ${i + 1} address`, n.address, v => changeCvm(i, { address: v }))}{field(`CVM ${i + 1} SSH SHA256 pin`, n.ssh_host_key_sha256, v => changeCvm(i, { ssh_host_key_sha256: v }))}{config.cvms.length > 1 && <button className="btn-secondary" onClick={() => patch({ cvms: config.cvms.filter((_, j) => j !== i) })}>Remove CVM {i + 1}</button>}</fieldset>)}
    <button className="btn-secondary" disabled={config.cvms.length >= 64} onClick={() => patch({ cvms: [...config.cvms, { ...cvm(), current_credential_ref: config.cvms[0].current_credential_ref, replacement_credential_ref: config.cvms[0].replacement_credential_ref }] })}>Add CVM</button>
    {config.hosts.map((n, i) => <fieldset className="card space-y-3" key={i}><legend>AHV host {i + 1}</legend>{field(`Host ${i + 1} address`, n.address, v => changeHost(i, { address: v }))}{field(`Host ${i + 1} SSH SHA256 pin`, n.ssh_host_key_sha256, v => changeHost(i, { ssh_host_key_sha256: v }))}{reference(`Host ${i + 1} access reference`, n.access_credential_ref, v => changeHost(i, { access_credential_ref: v }))}
      {AHV_ACCOUNTS.map(username => { const account = n.accounts.find(a => a.username === username); return <div key={username} className="space-y-2 border-t border-border pt-3"><label className="flex gap-2"><input type="checkbox" aria-label={`Host ${i + 1} ${username} account`} checked={!!account} onChange={e => changeHost(i, { accounts: e.target.checked ? [...n.accounts, { username, current_credential_ref: '', replacement_credential_ref: '' }] : n.accounts.filter(a => a.username !== username) })} />{username}</label>{account && <div className="grid md:grid-cols-2 gap-3">{(['current', 'replacement'] as const).map(kind => reference(`Host ${i + 1} ${username} ${kind} reference`, account[`${kind}_credential_ref`], v => changeHost(i, { accounts: n.accounts.map(a => a.username === username ? { ...a, [`${kind}_credential_ref`]: v } : a) })))}</div>}</div> })}
      {config.hosts.length > 1 && <button className="btn-secondary" onClick={() => patch({ hosts: config.hosts.filter((_, j) => j !== i) })}>Remove host {i + 1}</button>}
    </fieldset>)}
    <button className="btn-secondary" disabled={config.hosts.length >= 64} onClick={() => patch({ hosts: [...config.hosts, host()] })}>Add AHV host</button>
    {!validatePasswordSetup(config) && <p role="status" className="text-amber-300 text-sm">Complete both CVM and host targets, trusted-key evidence, valid SHA256 pins, and distinct current/replacement references. Choose at least one account per host. Duplicate addresses are rejected.</p>}
    <InitialPasswordSetupRuns liveEnabled={liveEnabled} />
  </div>
}
