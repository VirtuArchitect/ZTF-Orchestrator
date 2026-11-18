export type ClusterConnection = {
  pc_endpoint: string; pc_credential: string; pe_endpoint: string; pe_credential: string; cluster_uuid: string
  mode?: 'pe-direct' | 'pc'; verify_tls?: boolean; tls_bypass_reason?: string
  cvm_credential?: string; cvm_host_keys?: string | Record<string, string>
}

export const initialPeConnection: ClusterConnection = {
  mode: 'pe-direct', pe_endpoint: '', pe_credential: '', cluster_uuid: '', pc_endpoint: '', pc_credential: '',
  verify_tls: true, tls_bypass_reason: '', cvm_credential: '', cvm_host_keys: '',
}

export function connectionPayload(value: ClusterConnection, cvm = false): object {
  const common = { pe_endpoint: value.pe_endpoint, pe_credential: value.pe_credential, cluster_uuid: value.cluster_uuid }
  if (value.mode !== 'pe-direct') return { ...common, pc_endpoint: value.pc_endpoint, pc_credential: value.pc_credential }
  return { ...common, mode: 'pe-direct', verify_tls: value.verify_tls !== false, tls_bypass_reason: value.tls_bypass_reason || '',
    ...(cvm ? { cvm_credential: value.cvm_credential || '', cvm_host_keys: typeof value.cvm_host_keys === 'string'
      ? JSON.parse(value.cvm_host_keys || '{}') : value.cvm_host_keys || {} } : {}) }
}

export function connectionReady(value: ClusterConnection, cvm = false): boolean {
  if (![value.pe_endpoint, value.pe_credential, value.cluster_uuid].every(v => v.trim())) return false
  if (value.mode !== 'pe-direct') return Boolean(value.pc_endpoint.trim() && value.pc_credential.trim())
  if (value.verify_tls === false && !value.tls_bypass_reason?.trim()) return false
  try {
    connectionPayload(value, cvm)
    if (cvm && !value.cvm_credential?.trim()) return false
    const pins = typeof value.cvm_host_keys === 'string' ? JSON.parse(value.cvm_host_keys || '{}') : value.cvm_host_keys
    return !cvm || Boolean(pins && typeof pins === 'object' && !Array.isArray(pins) && Object.keys(pins).length >= 3)
  } catch { return false }
}

export function transportSummary(content: string | undefined, value: ClusterConnection): string {
  let selected = value
  try { selected = JSON.parse(content || '{}').intent?.connection || value } catch { /* Display the current draft. */ }
  return selected.mode === 'pe-direct'
    ? `PE direct · ${selected.verify_tls === false ? 'TLS verification bypassed for this run · ' + selected.tls_bypass_reason : 'TLS certificate verified'}`
    : 'Prism Central managed · trusted PC and PE HTTPS'
}

export default function PeDirectConnection({ value, onChange, disabled, cvm = false }: {
  value: ClusterConnection; onChange: (patch: Partial<ClusterConnection>) => void; disabled: boolean; cvm?: boolean
}) {
  const direct = value.mode === 'pe-direct'
  const fields: [keyof ClusterConnection, string][] = [
    ...(!direct ? [['pc_endpoint', 'Prism Central HTTPS endpoint'], ['pc_credential', 'PC credential reference']] as [keyof ClusterConnection, string][] : []),
    ['pe_endpoint', 'Prism Element HTTPS endpoint'], ['pe_credential', 'PE credential reference'], ['cluster_uuid', 'Expected cluster UUID'],
  ]
  return <fieldset className="space-y-4 md:col-span-2" disabled={disabled}>
    <legend className="font-semibold">Cluster connection</legend>
    <label className="block">Connection mode<select className="input mt-1" value={value.mode || 'pc'}
      onChange={e => onChange({ mode: e.target.value as ClusterConnection['mode'], verify_tls: true, tls_bypass_reason: '' })}>
      <option value="pe-direct">PE direct — no Prism Central</option><option value="pc">Prism Central managed</option>
    </select></label>
    <div className="grid gap-4 md:grid-cols-2">{fields.map(([key, label]) => <label className="block" key={key}>{label}
      <input className="input mt-1" autoComplete="off" value={String(value[key] || '')} onChange={e => onChange({ [key]: e.target.value })} />
    </label>)}</div>
    {direct && <>
      <label className="flex items-start gap-2"><input type="checkbox" checked={value.verify_tls !== false}
        onChange={e => onChange({ verify_tls: e.target.checked, tls_bypass_reason: '' })} />Verify PE TLS certificate</label>
      {value.verify_tls === false && <>
        <p role="alert" className="text-sm text-amber-600">HTTPS remains encrypted, but the PE server identity is not authenticated. This exception is audited and included in the exact approval for this run.</p>
        <label className="block">TLS bypass reason<input className="input mt-1" maxLength={200} value={value.tls_bypass_reason || ''}
          placeholder="Change ticket or deployment reason — no passwords" onChange={e => onChange({ tls_bypass_reason: e.target.value })} /></label>
      </>}
      {cvm && <>
        <p className="text-sm">Cluster-local uplink changes use manage_ovs over pinned CVM SSH, one host at a time. vs1 maps to OVS bridge br1. Existing CVM-to-AHV SSH trust is also required.</p>
        <label className="block">CVM credential reference<input className="input mt-1" autoComplete="off" value={value.cvm_credential || ''}
          onChange={e => onChange({ cvm_credential: e.target.value })} /></label>
        <label className="block">CVM SSH host keys by IP as JSON<textarea className="input mt-1 w-full font-mono" rows={4}
          placeholder={'{"192.0.2.21":"SHA256:verifiedFingerprint"}'} value={typeof value.cvm_host_keys === 'string'
            ? value.cvm_host_keys : JSON.stringify(value.cvm_host_keys || {}, null, 2)}
          onChange={e => onChange({ cvm_host_keys: e.target.value })} /></label>
        <p className="text-xs">Use independently verified fingerprints for all CVMs. The HTTPS exception does not bypass SSH host-key checks.</p>
      </>}
    </>}
  </fieldset>
}
