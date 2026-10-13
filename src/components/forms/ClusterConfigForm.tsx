import { useEffect, useId, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { buildClusterConfigYaml } from '../../utils/yaml'
import { validateClusterConfig } from '../../utils/clusterConfig'
import type { ConnectionProfile } from '../../types'

type Values = Record<string, any>
interface Target { ip: string; settings: Values }
interface Props { onYamlChange: (yaml: string) => void; profile?: ConnectionProfile; importedConfig?: unknown }
const object = (value: unknown): Values => value && typeof value === 'object' && !Array.isArray(value) ? value as Values : {}
const list = (value: unknown): Values[] => Array.isArray(value) ? value.map(object) : []
const csv = (value: string) => value.split(/[\n,]/).map(item => item.trim()).filter(Boolean)
const normalizePools = (value: string) => csv(value).map(range => range.replace(/\s*-\s*/, ' ')).join(', ')

function ListField({ label, value, onChange, normalize = (raw: string) => csv(raw).join(', ') }: {
  label: string; value: string; onChange: (value: string) => void; normalize?: (value: string) => string
}) {
  const [draft, setDraft] = useState(value)
  const emitted = useRef(value)
  useEffect(() => {
    if (value !== emitted.current) { setDraft(value); emitted.current = value }
  }, [value])
  return <Field label={label} value={draft} onChange={raw => {
    setDraft(raw); emitted.current = normalize(raw); onChange(raw)
  }} />
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; type?: string }) {
  return <label className="block min-w-0"><span className="label">{label}</span><input className="input w-full" type={type} value={value}
    autoComplete={type === 'password' ? 'new-password' : undefined} onChange={e => onChange(e.target.value)} /></label>
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>
}
function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const id = useId()
  return <div><label className="label" htmlFor={id}>{label}</label><select id={id} className="input w-full" value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></div>
}

export default function ClusterConfigForm({ onYamlChange, profile, importedConfig }: Props) {
  const defaultTarget = (): Target => ({ ip: profile?.prismElement.defaultClusterVip || '', settings: {
    name: '', pe_credential: profile?.prismElement.peCredentialRef || '', new_pe_admin_credential: '',
  } })
  const [targets, setTargets] = useState<Target[]>([defaultTarget()])
  const [topLevel, setTopLevel] = useState<Values>({})
  const [loadedImport, setLoadedImport] = useState<unknown>()
  useEffect(() => {
    if (importedConfig === undefined) return
    const { clusters, ...rest } = object(importedConfig)
    setTargets(Object.entries(object(clusters)).map(([ip, settings]) => ({ ip, settings: object(settings) })))
    setTopLevel(rest)
    setLoadedImport(importedConfig)
  }, [importedConfig])

  const errors = validateClusterConfig({ ...topLevel, clusters: Object.fromEntries(targets.map(t => [t.ip.trim(), t.settings])) })
  if (new Set(targets.map(t => t.ip.trim())).size !== targets.length) errors.push('Prism Element IPs must be unique.')
  const errorKey = errors.join('\n')
  useEffect(() => {
    if (loadedImport !== importedConfig) return
    onYamlChange(errorKey ? '' : buildClusterConfigYaml({ ...topLevel, clusters: Object.fromEntries(targets.map(t => [t.ip.trim(), t.settings])) }))
  }, [targets, topLevel, errorKey, loadedImport, importedConfig, onYamlChange])

  const patch = (i: number, values: Values) => setTargets(prev => prev.map((t, j) => j === i ? { ...t, settings: { ...t.settings, ...values } } : t))
  const optional = (i: number, key: string, enabled: boolean, value: unknown) => setTargets(prev => prev.map((t, j) => {
    if (i !== j) return t
    const settings = { ...t.settings }; if (enabled) settings[key] = value; else delete settings[key]
    return { ...t, settings }
  }))
  const patchItem = (i: number, key: string, j: number, values: Values) => patch(i, { [key]: list(targets[i].settings[key]).map((v, k) => j === k ? { ...v, ...values } : v) })
  const removeItem = (i: number, key: string, j: number) => patch(i, { [key]: list(targets[i].settings[key]).filter((_, k) => j !== k) })

  return <div className="space-y-5">
    <div className="form-section"><p className="form-section-title">Initial Admin Password</p>
      <Field label="Existing PE Admin Password Override" type="password" value={topLevel.default_pe_password || ''} onChange={value => setTopLevel(prev => {
        const next = { ...prev }; if (value) next.default_pe_password = value; else delete next.default_pe_password; return next
      })} /></div>
    {targets.map(({ ip, settings: c }, i) => <section key={i} className="form-section space-y-4" aria-label={`Cluster ${i + 1}`}>
      <div className="flex justify-between items-center"><h3 className="font-semibold">Cluster {i + 1}</h3><button className="btn-ghost" title="Remove cluster" onClick={() => setTargets(prev => prev.filter((_, j) => j !== i))}><Trash2 size={15} /></button></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Prism Element IP" value={ip} onChange={value => setTargets(prev => prev.map((t, j) => i === j ? { ...t, ip: value } : t))} />
        <Field label="Cluster Name" value={c.name || ''} onChange={value => patch(i, { name: value })} />
        <Field label="PE API Credential Ref" value={c.pe_credential || ''} onChange={value => patch(i, { pe_credential: value })} />
        <Field label="New PE Admin Credential Ref" value={c.new_pe_admin_credential || ''} onChange={value => patch(i, { new_pe_admin_credential: value, pe_credential: value })} />
        <ListField label="DNS Servers" value={(Array.isArray(c.name_servers_list) ? c.name_servers_list : []).join(', ')} onChange={value => patch(i, { name_servers_list: csv(value) })} />
        <ListField label="NTP Servers" value={(Array.isArray(c.ntp_servers_list) ? c.ntp_servers_list : []).join(', ')} onChange={value => patch(i, { ntp_servers_list: csv(value) })} />
        <Field label="Data Services IP" value={c.dsip || ''} onChange={value => optional(i, 'dsip', Boolean(value), value)} />
      </div>
      <Toggle label="Accept EULA" checked={Boolean(c.eula)} onChange={enabled => optional(i, 'eula', enabled, { username: '', company_name: '', job_title: '' })} />
      {c.eula && <div className="grid gap-3 md:grid-cols-3">{[['EULA Name', 'username'], ['Company Name', 'company_name'], ['Job Title', 'job_title']].map(([label, key]) => <Field key={key} label={label} value={c.eula[key] || ''} onChange={value => patch(i, { eula: { ...c.eula, [key]: value } })} />)}</div>}
      <Choice label="Pulse" value={c.enable_pulse === undefined ? 'Unchanged' : c.enable_pulse ? 'Enabled' : 'Disabled'} options={['Unchanged', 'Enabled', 'Disabled']} onChange={value => optional(i, 'enable_pulse', value !== 'Unchanged', value === 'Enabled')} />
      <Toggle label="Configure HA Reservation" checked={Boolean(c.ha_reservation)} onChange={enabled => optional(i, 'ha_reservation', enabled, { enable_failover: true, num_host_failure_to_tolerate: 1 })} />
      {c.ha_reservation && <div className="grid gap-3 md:grid-cols-2"><Toggle label="Enable Failover" checked={Boolean(c.ha_reservation.enable_failover)} onChange={value => patch(i, { ha_reservation: { ...c.ha_reservation, enable_failover: value } })} /><Field label="Host Failures To Tolerate" type="number" value={c.ha_reservation.num_host_failure_to_tolerate ?? 1} onChange={value => patch(i, { ha_reservation: { ...c.ha_reservation, num_host_failure_to_tolerate: Number(value) } })} /></div>}
      <Toggle label="Configure Active Directory" checked={Boolean(c.directory_services)} onChange={enabled => optional(i, 'directory_services', enabled, {
        directory_type: 'ACTIVE_DIRECTORY', ad_name: '', ad_domain: profile?.directory.domain || '', ad_directory_url: profile?.directory.ldapUrl || '', service_account_credential: profile?.directory.serviceAccountCredentialRef || '', role_mappings: [],
      })} />
      {c.directory_services && <div className="space-y-3"><div className="grid gap-3 md:grid-cols-2">{[['AD Name', 'ad_name'], ['AD Domain', 'ad_domain'], ['AD Directory URL', 'ad_directory_url'], ['Service Account Credential Ref', 'service_account_credential']].map(([label, key]) => <Field key={key} label={label} value={c.directory_services[key] || ''} onChange={value => patch(i, { directory_services: { ...c.directory_services, [key]: value } })} />)}</div>
        {list(c.directory_services.role_mappings).map((r, j) => {
          const update = (values: Values) => patch(i, { directory_services: { ...c.directory_services, role_mappings: list(c.directory_services.role_mappings).map((v, k) => j === k ? { ...v, ...values } : v) } })
          return <div key={j} className="grid gap-3 md:grid-cols-4">
            <Choice label="Role" value={r.role_type} options={['ROLE_CLUSTER_ADMIN', 'ROLE_USER_ADMIN', 'ROLE_BACKUP_ADMIN', 'ROLE_CLUSTER_VIEWER']} onChange={value => update({ role_type: value })} />
            <Choice label="Entity Type" value={r.entity_type} options={['GROUP', 'OU', 'USER']} onChange={value => update({ entity_type: value })} />
            <ListField label="Entity Values" value={(Array.isArray(r.values) ? r.values : []).join(', ')} onChange={value => update({ values: csv(value) })} />
            <button className="btn-ghost" title="Remove role mapping" onClick={() => patch(i, { directory_services: { ...c.directory_services, role_mappings: list(c.directory_services.role_mappings).filter((_, k) => j !== k) } })}><Trash2 size={15} /></button>
          </div>
        })}<button className="btn-secondary gap-1" onClick={() => patch(i, { directory_services: { ...c.directory_services, role_mappings: [...list(c.directory_services.role_mappings), { role_type: 'ROLE_CLUSTER_VIEWER', entity_type: 'GROUP', values: [] }] } })}><Plus size={14} />Add Role Mapping</button></div>}
      <h4 className="font-medium">Storage Containers</h4>
      {list(c.containers).map((v, j) => <div key={j} className="grid gap-3 md:grid-cols-3"><Field label="Container Name" value={v.name || ''} onChange={value => patchItem(i, 'containers', j, { name: value })} /><Choice label="Replication Factor" value={String(v.replication_factor ?? 2)} options={['1', '2', '3']} onChange={value => patchItem(i, 'containers', j, { replication_factor: Number(value) })} /><Toggle label="Compression" checked={Boolean(v.compression_enabled)} onChange={value => patchItem(i, 'containers', j, { compression_enabled: value })} /><Toggle label="On-disk Deduplication" checked={v.on_disk_dedup === 'ON'} onChange={value => patchItem(i, 'containers', j, { on_disk_dedup: value ? 'ON' : 'OFF' })} /><button className="btn-ghost" title="Remove container" onClick={() => removeItem(i, 'containers', j)}><Trash2 size={15} /></button></div>)}
      <button className="btn-secondary gap-1" onClick={() => patch(i, { containers: [...list(c.containers), { name: '', replication_factor: 2, compression_enabled: true, on_disk_dedup: 'OFF' }] })}><Plus size={14} />Add Container</button>
      <h4 className="font-medium">Networks / VLANs</h4>
      {list(c.networks).map((v, j) => {
        const updateIp = (values: Values) => patchItem(i, 'networks', j, { ip_config: { ...object(v.ip_config), ...values } })
        return <div key={j} className="grid gap-3 md:grid-cols-3">
          <Field label="Network Name" value={v.name || ''} onChange={value => patchItem(i, 'networks', j, { name: value })} />
          <Field label="VLAN ID" type="number" value={v.vlan_id ?? 0} onChange={value => patchItem(i, 'networks', j, { vlan_id: Number(value) })} />
          <Field label="Network IP" value={v.ip_config?.network_ip || ''} onChange={value => updateIp({ network_ip: value })} />
          <Field label="Prefix Length" type="number" value={v.ip_config?.network_prefix ?? 24} onChange={value => updateIp({ network_prefix: Number(value) })} />
          <Field label="Gateway" value={v.ip_config?.default_gateway_ip || ''} onChange={value => updateIp({ default_gateway_ip: value })} />
          <ListField label="IP Pools" value={list(v.ip_config?.pool_list).map(pool => pool.range).join(', ')} normalize={normalizePools} onChange={value => updateIp({ pool_list: csv(value).map(range => ({ range: range.replace(/\s*-\s*/, ' ') })) })} />
          <button className="btn-ghost" title="Remove network" onClick={() => removeItem(i, 'networks', j)}><Trash2 size={15} /></button>
        </div>
      })}<button className="btn-secondary gap-1" onClick={() => patch(i, { networks: [...list(c.networks), { name: '', subnet_type: 'VLAN', vlan_id: 0, ip_config: {} }] })}><Plus size={14} />Add Network</button>
    </section>)}
    <button className="btn-secondary gap-1" onClick={() => setTargets(prev => [...prev, defaultTarget()])}><Plus size={14} />Add Cluster</button>
    {errors.length > 0 && <div role="alert" className="text-sm text-red-400">{errors.map(error => <p key={error}>{error}</p>)}</div>}
  </div>
}
