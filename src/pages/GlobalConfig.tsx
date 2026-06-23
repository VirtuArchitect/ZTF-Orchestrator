import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Eye, EyeOff, Download, Upload } from 'lucide-react'
import Layout from '../components/Layout'
import YamlPreview from '../components/YamlPreview'
import { buildGlobalYaml, fromYaml } from '../utils/yaml'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface Credential {
  ref: string
  username: string
  password: string
}

const DEFAULT_CREDS: Credential[] = [
  { ref: 'pc_user', username: 'admin', password: '' },
  { ref: 'pe_user', username: 'admin', password: '' },
  { ref: 'ncm_user', username: 'admin', password: '' },
  { ref: 'cvm_credential', username: 'nutanix', password: '' },
  { ref: 'admin_cred', username: 'admin', password: '' },
]

export default function GlobalConfig() {
  const [vaultType, setVaultType] = useState<'local' | 'cyberark'>('local')
  const [ipMethod, setIpMethod] = useState<'static' | 'infoblox'>('static')
  const [credentials, setCredentials] = useState<Credential[]>(DEFAULT_CREDS)
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeTab, setActiveTab] = useState<'credentials' | 'vault' | 'ipam' | 'preview'>('credentials')

  const [cyberark, setCyberark] = useState({ host: '', certFile: '', keyFile: '' })
  const [infoblox, setInfoblox] = useState({ host: '', username: '', password: '', dnsView: 'default', networkView: 'default' })

  useEffect(() => {
    apiFetch('/api/global-config').then(r => r.json()).then(data => {
      if (!data.content) return
      try {
        const parsed = fromYaml(data.content) as Record<string, unknown>
        if (!parsed || typeof parsed !== 'object') return

        if (parsed.vault_to_use === 'cyberark' || parsed.vault_to_use === 'local') {
          setVaultType(parsed.vault_to_use)
        }
        if (parsed.ip_allocation_method === 'infoblox' || parsed.ip_allocation_method === 'static') {
          setIpMethod(parsed.ip_allocation_method as 'static' | 'infoblox')
        }

        const vaults = parsed.vaults as Record<string, unknown> | undefined
        const localCreds = (vaults?.local as Record<string, unknown> | undefined)?.credentials
        if (localCreds && typeof localCreds === 'object') {
          const creds = Object.entries(localCreds as Record<string, Record<string, string>>).map(
            ([ref, val]) => ({ ref, username: val?.username ?? '', password: val?.password ?? '' })
          )
          if (creds.length > 0) setCredentials(creds)
        }

        const ca = (vaults?.cyberark as Record<string, string> | undefined)
        if (ca) {
          setCyberark({ host: ca.host ?? '', certFile: ca.cert_file ?? '', keyFile: ca.key_file ?? '' })
        }

        const ib = parsed.infoblox as Record<string, string> | undefined
        if (ib) {
          setInfoblox({
            host: ib.host ?? '',
            username: ib.username ?? '',
            password: ib.password ?? '',
            dnsView: ib.dns_view ?? 'default',
            networkView: ib.network_view ?? 'default',
          })
        }
      } catch { /* ignore malformed YAML */ }
    }).catch(() => {})
  }, [])

  const addCredential = () => {
    setCredentials(prev => [...prev, { ref: `cred_${Date.now()}`, username: '', password: '' }])
  }

  const removeCredential = (idx: number) => {
    setCredentials(prev => prev.filter((_, i) => i !== idx))
  }

  const updateCredential = (idx: number, field: keyof Credential, value: string) => {
    setCredentials(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const getYaml = () => buildGlobalYaml({
    vaultToUse: vaultType,
    ipAllocationMethod: ipMethod,
    credentials,
    ...(vaultType === 'cyberark' ? { cyberark } : {}),
    ...(ipMethod === 'infoblox' ? { infoblox } : {}),
  })

  const save = async () => {
    setSaving(true)
    setSaveError('')
    try {
      const resp = await apiFetch('/api/global-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: getYaml() }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || `Save failed with status ${resp.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaved(false)
      setSaveError(err instanceof Error ? err.message : 'Unable to save global configuration')
    } finally {
      setSaving(false)
    }
  }

  const download = () => {
    const blob = new Blob([getYaml()], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'global.yml'; a.click()
    URL.revokeObjectURL(url)
  }

  const TABS = [
    { id: 'credentials', label: 'Credentials' },
    { id: 'vault', label: 'Vault Settings' },
    { id: 'ipam', label: 'IPAM' },
    { id: 'preview', label: 'YAML Preview' },
  ] as const

  return (
    <Layout
      title="Global Configuration"
      subtitle="Configure credentials, vault, and IPAM settings (global.yml)"
      actions={
        <div className="flex gap-2">
          <button onClick={download} className="btn-secondary gap-1.5">
            <Download size={14} />
            Download
          </button>
          <button onClick={save} disabled={saving} className="btn-primary gap-1.5">
            <Save size={14} />
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save to ZTF'}
          </button>
        </div>
      }
    >
      {/* Tabs */}
      {saveError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {saveError}
        </div>
      )}

      <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-nutanix-blue text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Credentials Tab */}
      {activeTab === 'credentials' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-100">Credential Definitions</h3>
              <p className="text-xs text-gray-500 mt-0.5">Define named credentials referenced in workflow configs</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowPasswords(!showPasswords)}
                className="btn-ghost text-xs gap-1.5"
              >
                {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
                {showPasswords ? 'Hide' : 'Show'} Passwords
              </button>
              <button onClick={addCredential} className="btn-secondary text-xs gap-1.5">
                <Plus size={13} />
                Add Credential
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-gray-500 pb-3 pr-4 font-medium">Reference Key</th>
                  <th className="text-left text-xs text-gray-500 pb-3 pr-4 font-medium">Username</th>
                  <th className="text-left text-xs text-gray-500 pb-3 pr-4 font-medium">Password</th>
                  <th className="w-10 pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {credentials.map((cred, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 pr-4">
                      <input
                        className="input font-mono text-xs"
                        value={cred.ref}
                        onChange={e => updateCredential(idx, 'ref', e.target.value)}
                        placeholder="credential_ref"
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <input
                        className="input"
                        value={cred.username}
                        onChange={e => updateCredential(idx, 'username', e.target.value)}
                        placeholder="username"
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <input
                        className="input font-mono"
                        type={showPasswords ? 'text' : 'password'}
                        value={cred.password}
                        onChange={e => updateCredential(idx, 'password', e.target.value)}
                        placeholder="••••••••"
                      />
                    </td>
                    <td className="py-2.5">
                      <button onClick={() => removeCredential(idx)} className="btn-ghost p-1.5 text-red-400 hover:text-red-300">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
            <p className="text-xs text-blue-300">
              These reference keys (e.g., <code className="font-mono bg-blue-900/30 px-1 rounded">pc_user</code>) are used in workflow config files.
              The actual credentials are stored in <code className="font-mono bg-blue-900/30 px-1 rounded">global.yml</code>.
            </p>
          </div>
        </div>
      )}

      {/* Vault Settings Tab */}
      {activeTab === 'vault' && (
        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-4">Vault Configuration</h3>

          <div className="space-y-4">
            <div>
              <label className="label">Vault Type</label>
              <div className="flex gap-3">
                {(['local', 'cyberark'] as const).map(v => (
                  <label key={v} className={clsx(
                    'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all flex-1',
                    vaultType === v
                      ? 'border-nutanix-blue bg-nutanix-blue/10 text-gray-100'
                      : 'border-border bg-surface-elevated text-gray-400 hover:border-border-light'
                  )}>
                    <input
                      type="radio"
                      name="vaultType"
                      value={v}
                      checked={vaultType === v}
                      onChange={() => setVaultType(v)}
                      className="text-nutanix-blue"
                    />
                    <div>
                      <p className="font-medium capitalize">{v === 'cyberark' ? 'CyberArk' : 'Local'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v === 'local' ? 'Store credentials in global.yml' : 'Fetch credentials from CyberArk vault'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {vaultType === 'cyberark' && (
              <div className="form-section">
                <p className="form-section-title">CyberArk Settings</p>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="label">CyberArk Host</label>
                    <input className="input" value={cyberark.host} onChange={e => setCyberark(p => ({ ...p, host: e.target.value }))} placeholder="cyberark-host.domain.com" />
                  </div>
                  <div>
                    <label className="label">Certificate File Path</label>
                    <input className="input font-mono" value={cyberark.certFile} onChange={e => setCyberark(p => ({ ...p, certFile: e.target.value }))} placeholder="/path/to/cert.pem" />
                  </div>
                  <div>
                    <label className="label">Key File Path</label>
                    <input className="input font-mono" value={cyberark.keyFile} onChange={e => setCyberark(p => ({ ...p, keyFile: e.target.value }))} placeholder="/path/to/key.pem" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* IPAM Tab */}
      {activeTab === 'ipam' && (
        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-4">IP Allocation Method</h3>

          <div className="space-y-4">
            <div className="flex gap-3">
              {(['static', 'infoblox'] as const).map(v => (
                <label key={v} className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all flex-1',
                  ipMethod === v
                    ? 'border-nutanix-blue bg-nutanix-blue/10 text-gray-100'
                    : 'border-border bg-surface-elevated text-gray-400 hover:border-border-light'
                )}>
                  <input type="radio" name="ipMethod" value={v} checked={ipMethod === v} onChange={() => setIpMethod(v)} className="text-nutanix-blue" />
                  <div>
                    <p className="font-medium capitalize">{v === 'infoblox' ? 'Infoblox' : 'Static'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {v === 'static' ? 'Manually specify IP addresses in configs' : 'Use Infoblox IPAM for automatic IP allocation'}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {ipMethod === 'infoblox' && (
              <div className="form-section">
                <p className="form-section-title">Infoblox Settings</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Infoblox Host</label>
                    <input className="input" value={infoblox.host} onChange={e => setInfoblox(p => ({ ...p, host: e.target.value }))} placeholder="infoblox.domain.com" />
                  </div>
                  <div>
                    <label className="label">Username</label>
                    <input className="input" value={infoblox.username} onChange={e => setInfoblox(p => ({ ...p, username: e.target.value }))} placeholder="infoblox_user" />
                  </div>
                  <div>
                    <label className="label">Password</label>
                    <input className="input" type="password" value={infoblox.password} onChange={e => setInfoblox(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="label">DNS View</label>
                    <input className="input" value={infoblox.dnsView} onChange={e => setInfoblox(p => ({ ...p, dnsView: e.target.value }))} placeholder="default" />
                  </div>
                  <div>
                    <label className="label">Network View</label>
                    <input className="input" value={infoblox.networkView} onChange={e => setInfoblox(p => ({ ...p, networkView: e.target.value }))} placeholder="default" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* YAML Preview Tab */}
      {activeTab === 'preview' && (
        <YamlPreview content={getYaml()} filename="global.yml" />
      )}
    </Layout>
  )
}
