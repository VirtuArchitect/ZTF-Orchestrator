export type PeTlsPolicy = { pe_verify_tls: boolean; pe_tls_bypass_reason: string }
export const deploymentPeTls: PeTlsPolicy = {
  pe_verify_tls: false, pe_tls_bypass_reason: 'Initial cluster deployment or disaster recovery configuration',
}
export default function PeTlsOptions({ value, onChange, disabled = false }: {
  value: PeTlsPolicy; onChange: (value: PeTlsPolicy) => void; disabled?: boolean
}) {
  return <fieldset className="space-y-3" disabled={disabled}>
    <legend className="font-semibold">PE HTTPS connection</legend>
    <label className="flex gap-2"><input type="checkbox" checked={value.pe_verify_tls}
      onChange={e => onChange({ pe_verify_tls: e.target.checked,
        pe_tls_bypass_reason: e.target.checked ? '' : deploymentPeTls.pe_tls_bypass_reason })} />Verify PE TLS certificate (optional)</label>
    {!value.pe_verify_tls && <>
      <p className="text-sm text-amber-600">HTTPS stays encrypted; the PE certificate identity is not authenticated. This per-operation exception is recorded. Approvals, target identity and SSH checks still apply. Prism Central trust is unchanged.</p>
      <label className="block">PE TLS bypass reason<input className="input mt-1" maxLength={200}
        value={value.pe_tls_bypass_reason} onChange={e => onChange({ ...value, pe_tls_bypass_reason: e.target.value })} /></label>
    </>}
  </fieldset>
}
