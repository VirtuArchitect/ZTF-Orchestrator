import { useEffect, useState } from 'react'
import { toYaml } from '../../utils/yaml'

export default function CredentialRotationForm({ onYamlChange, importedConfig }: { onYamlChange: (yaml: string) => void; importedConfig?: unknown }) {
  const [cvms, setCvms] = useState('')
  const [idracs, setIdracs] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loadedImport, setLoadedImport] = useState<unknown>()
  const [importError, setImportError] = useState('')
  useEffect(() => {
    if (importedConfig === undefined) return
    try {
      const config = importedConfig as Record<string, unknown>
      const allowed = ['aos_version', 'cvms', 'idracs', 'idrac_followup_acknowledged']
      if (!config || Object.keys(config).some(key => !allowed.includes(key)) || config.aos_version !== '7.5.1.8'
        || typeof config.idrac_followup_acknowledged !== 'boolean') throw new Error()
      const lines = (value: unknown, ssh: boolean) => {
        if (!Array.isArray(value)) throw new Error()
        const fields = ['address', 'current_credential_ref', 'replacement_credential_ref', ...(ssh ? ['ssh_host_key_sha256'] : [])]
        return value.map(node => {
          if (!node || typeof node !== 'object' || Object.keys(node).some(key => !fields.includes(key))
            || fields.some(key => typeof node[key] !== 'string' || /[,\r\n]/.test(node[key]))) throw new Error()
          return fields.map(key => node[key]).join(', ')
        }).join('\n')
      }
      const nextCvms = lines(config.cvms, true)
      const nextIdracs = lines(config.idracs, false)
      setCvms(nextCvms)
      setIdracs(nextIdracs)
      setAcknowledged(config.idrac_followup_acknowledged)
      setImportError('')
    } catch {
      setImportError('Import must use the documented reference-only AOS 7.5.1.8 schema. Correct the file and import again.')
      onYamlChange('')
    }
    setLoadedImport(importedConfig)
  }, [importedConfig, onYamlChange])
  useEffect(() => {
    if (importError || (importedConfig !== undefined && loadedImport !== importedConfig)) return
    const nodes = (value: string, ssh: boolean) => value.split(/\r?\n/).filter(line => line.trim()).map(line => {
      const [address, current, replacement, fingerprint] = line.split(',').map(part => part.trim())
      return { address, current_credential_ref: current || '', replacement_credential_ref: replacement || '',
        ...(ssh ? { ssh_host_key_sha256: fingerprint || '' } : {}) }
    })
    onYamlChange(toYaml({ aos_version: '7.5.1.8', cvms: nodes(cvms, true), idracs: nodes(idracs, false),
      idrac_followup_acknowledged: acknowledged }))
  }, [cvms, idracs, acknowledged, onYamlChange, importedConfig, loadedImport, importError])
  return <div className="space-y-4">
    {importError && <p role="alert" className="card text-red-400">{importError}</p>}
    <div className="card space-y-3">
      <h3 className="font-semibold">CVM &amp; Dell iDRAC Password Rotation</h3>
      <p className="text-sm text-gray-400">Controlled UAT for AOS 7.5.1.8 and Dell iDRAC. Create separate current and replacement credential references in Global Config. Enter references here; keep passwords out of this configuration.</p>
      <p className="text-sm text-gray-400">Dry Run authenticates and checks every target without changing passwords. Run Workflow requires an administrator, an approval for this exact YAML, and typed confirmation.</p>
      <label className="label" htmlFor="rotation-cvms">CVMs — all CVMs in one cluster</label>
      <p className="text-xs text-gray-400" id="rotation-cvm-help">One per line: IP address, current reference, replacement reference, verified SHA256 SSH host-key fingerprint. All CVMs must use the same references and the nutanix username. The password changes once, followed by login verification on every CVM.</p>
      <textarea id="rotation-cvms" aria-describedby="rotation-cvm-help" className="input font-mono text-xs w-full" rows={5} value={cvms} onChange={e => setCvms(e.target.value)} placeholder="192.0.2.10, cvm_current, cvm_replacement, SHA256:..." spellCheck={false} />
      <label className="label" htmlFor="rotation-idracs">Dell iDRAC controllers</label>
      <p className="text-xs text-gray-400" id="rotation-idrac-help">One per line: IP address, current reference, replacement reference. The username must stay the same. Trusted HTTPS certificates are required. The workflow discovers the account ID and verifies each replacement login.</p>
      <textarea id="rotation-idracs" aria-describedby="rotation-idrac-help" className="input font-mono text-xs w-full" rows={5} value={idracs} onChange={e => setIdracs(e.target.value)} placeholder="192.0.2.20, idrac_current, idrac_replacement" spellCheck={false} />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I will synchronize Nutanix host IPMI credentials using the supported AOS procedure and update external consumers after rotation. This workflow changes iDRAC credentials only; cluster IPMI metadata requires manual follow-up.</label>
    </div>
    <div className="card text-sm text-amber-300">The workflow stops on failure and reports verified and uncertain targets. Password changes are never automatically retried or rolled back. Keep both credential references until recovery and consumer updates are complete. Successful password verification still requires the documented follow-up.</div>
  </div>
}
