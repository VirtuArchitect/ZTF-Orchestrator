import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Eye, EyeOff, Download, KeyRound, Network, ShieldCheck } from 'lucide-react'
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

type VaultType =
  | 'local'
  | 'environment'
  | 'hashicorp_vault'
  | 'cyberark'
  | 'azure_key_vault'
  | 'aws_secrets_manager'
  | 'delinea'
  | 'beyondtrust'
  | 'custom_api'

type IpamMethod =
  | 'static'
  | 'csv'
  | 'netbox'
  | 'nautobot'
  | 'phpipam'
  | 'infoblox'
  | 'bluecat'
  | 'efficientip'
  | 'microsoft_ipam'
  | 'custom_api'

interface ProviderOption<T extends string> {
  id: T
  label: string
  description: string
  status: 'Built-in' | 'Configured' | 'Adapter Target' | 'Custom'
}

interface ProviderFieldLabels {
  title: string
  endpoint: string
  credentialRef: string
  namespace: string
  endpointPlaceholder: string
  credentialPlaceholder: string
  namespacePlaceholder: string
}

interface IpamFieldLabels {
  title: string
  endpoint: string
  credentialRef: string
  networkView: string
  dnsView: string
  endpointPlaceholder: string
  credentialPlaceholder: string
  networkViewPlaceholder: string
  dnsViewPlaceholder: string
}

const DEFAULT_CREDS: Credential[] = [
  { ref: 'pc_user', username: 'admin', password: '' },
  { ref: 'foundation_central', username: 'admin', password: '' },
  { ref: 'pe_user', username: 'admin', password: '' },
  { ref: 'ncm_user', username: 'admin', password: '' },
  { ref: 'cvm_credential', username: 'nutanix', password: '' },
  { ref: 'admin_cred', username: 'admin', password: '' },
]

const VAULT_OPTIONS: ProviderOption<VaultType>[] = [
  { id: 'local', label: 'Local', description: 'Store credentials in global.yml for lab and isolated use.', status: 'Built-in' },
  { id: 'environment', label: 'Environment', description: 'Resolve credentials from appliance or container environment variables.', status: 'Built-in' },
  { id: 'hashicorp_vault', label: 'HashiCorp Vault', description: 'Configuration target for Vault-backed credential retrieval.', status: 'Adapter Target' },
  { id: 'cyberark', label: 'CyberArk', description: 'Configured CyberArk credential source using host and certificate material.', status: 'Configured' },
  { id: 'azure_key_vault', label: 'Azure Key Vault', description: 'Configuration target for Microsoft cloud secret management.', status: 'Adapter Target' },
  { id: 'aws_secrets_manager', label: 'AWS Secrets Manager', description: 'Configuration target for AWS-hosted or hybrid secret retrieval.', status: 'Adapter Target' },
  { id: 'delinea', label: 'Delinea', description: 'Configuration target for Delinea Secret Server or PAM-backed retrieval.', status: 'Adapter Target' },
  { id: 'beyondtrust', label: 'BeyondTrust', description: 'Configuration target for BeyondTrust Password Safe or PAM handoff.', status: 'Adapter Target' },
  { id: 'custom_api', label: 'Custom API', description: 'Configuration target for a site-specific vault adapter.', status: 'Custom' },
]

const IPAM_OPTIONS: ProviderOption<IpamMethod>[] = [
  { id: 'static', label: 'Static', description: 'Manually specify IP addresses in workflow configuration.', status: 'Built-in' },
  { id: 'csv', label: 'CSV / Reservation File', description: 'Use an operator-supplied reservation file for offline or UAT runs.', status: 'Built-in' },
  { id: 'netbox', label: 'NetBox', description: 'Configuration target for DCIM/IPAM prefixes, addresses, and sites.', status: 'Adapter Target' },
  { id: 'nautobot', label: 'Nautobot', description: 'Configuration target for automation-focused DCIM/IPAM data.', status: 'Adapter Target' },
  { id: 'phpipam', label: 'phpIPAM', description: 'Configuration target for lightweight open-source IPAM data.', status: 'Adapter Target' },
  { id: 'infoblox', label: 'Infoblox', description: 'Configured enterprise DDI/IPAM allocation source.', status: 'Configured' },
  { id: 'bluecat', label: 'BlueCat', description: 'Configuration target for enterprise DDI/IPAM address allocation.', status: 'Adapter Target' },
  { id: 'efficientip', label: 'EfficientIP', description: 'Configuration target for SOLIDserver DDI/IPAM allocation.', status: 'Adapter Target' },
  { id: 'microsoft_ipam', label: 'Microsoft DHCP/IPAM', description: 'Configuration target for Windows-aligned address management.', status: 'Adapter Target' },
  { id: 'custom_api', label: 'Custom API', description: 'Configuration target for a site-specific IPAM adapter.', status: 'Custom' },
]

const VAULT_FIELD_LABELS: Record<Exclude<VaultType, 'local' | 'environment' | 'cyberark'>, ProviderFieldLabels> = {
  hashicorp_vault: {
    title: 'HashiCorp Vault Config Target',
    endpoint: 'Vault Address',
    credentialRef: 'Token / AppRole Credential Ref',
    namespace: 'Namespace / Mount Prefix',
    endpointPlaceholder: 'https://vault.example.com',
    credentialPlaceholder: 'vault_approle',
    namespacePlaceholder: 'admin/kv/platform',
  },
  azure_key_vault: {
    title: 'Azure Key Vault Config Target',
    endpoint: 'Vault URI',
    credentialRef: 'Client Credential Ref',
    namespace: 'Tenant ID / Secret Prefix',
    endpointPlaceholder: 'https://ztf-kv.vault.azure.net',
    credentialPlaceholder: 'azure_key_vault_client',
    namespacePlaceholder: 'tenant-id/platform',
  },
  aws_secrets_manager: {
    title: 'AWS Secrets Manager Config Target',
    endpoint: 'Region / Endpoint URL',
    credentialRef: 'Role / Credential Ref',
    namespace: 'Secret Path Prefix',
    endpointPlaceholder: 'eu-central-1',
    credentialPlaceholder: 'aws_secrets_role',
    namespacePlaceholder: 'ztf/platform/',
  },
  delinea: {
    title: 'Delinea Config Target',
    endpoint: 'Secret Server URL',
    credentialRef: 'Credential Ref',
    namespace: 'Folder / Secret Path',
    endpointPlaceholder: 'https://delinea.example.com/SecretServer',
    credentialPlaceholder: 'delinea_provider',
    namespacePlaceholder: 'Infrastructure/ZTF',
  },
  beyondtrust: {
    title: 'BeyondTrust Config Target',
    endpoint: 'API Base URL',
    credentialRef: 'Credential Ref',
    namespace: 'Managed Account Scope',
    endpointPlaceholder: 'https://passwordsafe.example.com/BeyondTrust/api/public/v3',
    credentialPlaceholder: 'beyondtrust_provider',
    namespacePlaceholder: 'ZTF managed accounts',
  },
  custom_api: {
    title: 'Custom Vault API Config Target',
    endpoint: 'Base URL',
    credentialRef: 'Credential Ref',
    namespace: 'Path / Scope',
    endpointPlaceholder: 'https://vault-api.example.com',
    credentialPlaceholder: 'custom_vault_provider',
    namespacePlaceholder: 'ztf/platform',
  },
}

const IPAM_FIELD_LABELS: Record<Exclude<IpamMethod, 'static' | 'csv' | 'infoblox'>, IpamFieldLabels> = {
  netbox: {
    title: 'NetBox Config Target',
    endpoint: 'NetBox URL',
    credentialRef: 'API Token Credential Ref',
    networkView: 'Tenant / VRF',
    dnsView: 'Role / Address Scope',
    endpointPlaceholder: 'https://netbox.example.com',
    credentialPlaceholder: 'netbox_api_token',
    networkViewPlaceholder: 'tenant-a / vrf-prod',
    dnsViewPlaceholder: 'ztf-addresses',
  },
  nautobot: {
    title: 'Nautobot Config Target',
    endpoint: 'Nautobot URL',
    credentialRef: 'API Token Credential Ref',
    networkView: 'Tenant / Namespace',
    dnsView: 'Role / Address Scope',
    endpointPlaceholder: 'https://nautobot.example.com',
    credentialPlaceholder: 'nautobot_api_token',
    networkViewPlaceholder: 'tenant-a',
    dnsViewPlaceholder: 'ztf-addresses',
  },
  phpipam: {
    title: 'phpIPAM Config Target',
    endpoint: 'phpIPAM URL',
    credentialRef: 'App / Credential Ref',
    networkView: 'Section / Customer',
    dnsView: 'Subnet Group / Scope',
    endpointPlaceholder: 'https://phpipam.example.com',
    credentialPlaceholder: 'phpipam_app',
    networkViewPlaceholder: 'Datacenter',
    dnsViewPlaceholder: 'UAT',
  },
  bluecat: {
    title: 'BlueCat Config Target',
    endpoint: 'BAM URL',
    credentialRef: 'Credential Ref',
    networkView: 'Configuration / View',
    dnsView: 'DNS View / Scope',
    endpointPlaceholder: 'https://bluecat.example.com',
    credentialPlaceholder: 'bluecat_provider',
    networkViewPlaceholder: 'Production',
    dnsViewPlaceholder: 'default',
  },
  efficientip: {
    title: 'EfficientIP Config Target',
    endpoint: 'SOLIDserver URL',
    credentialRef: 'Credential Ref',
    networkView: 'Space / View',
    dnsView: 'DNS Space / Scope',
    endpointPlaceholder: 'https://solidserver.example.com',
    credentialPlaceholder: 'efficientip_provider',
    networkViewPlaceholder: 'default',
    dnsViewPlaceholder: 'default',
  },
  microsoft_ipam: {
    title: 'Microsoft DHCP/IPAM Config Target',
    endpoint: 'Server / FQDN',
    credentialRef: 'Credential Ref',
    networkView: 'DHCP Scope / Policy',
    dnsView: 'DNS Zone / Scope',
    endpointPlaceholder: 'ipam01.example.com',
    credentialPlaceholder: 'microsoft_ipam_provider',
    networkViewPlaceholder: '10.20.30.0/24',
    dnsViewPlaceholder: 'example.com',
  },
  custom_api: {
    title: 'Custom IPAM API Config Target',
    endpoint: 'Base URL',
    credentialRef: 'Credential Ref',
    networkView: 'Path / Tenant',
    dnsView: 'Scope / View',
    endpointPlaceholder: 'https://ipam-api.example.com',
    credentialPlaceholder: 'custom_ipam_provider',
    networkViewPlaceholder: 'tenant-a',
    dnsViewPlaceholder: 'default',
  },
}

const isVaultType = (value: unknown): value is VaultType =>
  typeof value === 'string' && VAULT_OPTIONS.some(option => option.id === value)

const isIpamMethod = (value: unknown): value is IpamMethod =>
  typeof value === 'string' && IPAM_OPTIONS.some(option => option.id === value)

function ProviderCard<T extends string>({
  option,
  selected,
  name,
  onSelect,
}: {
  option: ProviderOption<T>
  selected: boolean
  name: string
  onSelect: (id: T) => void
}) {
  const statusTone = option.status === 'Built-in'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
    : option.status === 'Configured'
      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
    : option.status === 'Custom'
      ? 'border-amber-300 bg-amber-50 text-amber-700'
      : 'border-blue-300 bg-blue-50 text-blue-700'

  return (
    <label className={clsx(
      'flex min-h-[118px] cursor-pointer gap-3 rounded-lg border p-4 transition-all',
      selected
        ? 'border-nutanix-blue bg-nutanix-blue/10 shadow-sm'
        : 'border-border bg-surface-elevated hover:border-border-light'
    )}>
      <input
        type="radio"
        name={name}
        value={option.id}
        checked={selected}
        onChange={() => onSelect(option.id)}
        className="mt-1 text-nutanix-blue"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-gray-100">{option.label}</p>
          <span className={clsx('rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', statusTone)}>
            {option.status}
          </span>
        </div>
        <p className="mt-1 text-sm leading-5 text-gray-500">{option.description}</p>
      </div>
    </label>
  )
}

export default function GlobalConfig() {
  const [vaultType, setVaultType] = useState<VaultType>('local')
  const [ipMethod, setIpMethod] = useState<IpamMethod>('static')
  const [credentials, setCredentials] = useState<Credential[]>(DEFAULT_CREDS)
  const [showPasswords, setShowPasswords] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [activeTab, setActiveTab] = useState<'credentials' | 'vault' | 'ipam' | 'preview'>('credentials')

  const [cyberark, setCyberark] = useState({ host: '', certFile: '', keyFile: '' })
  const [vaultProvider, setVaultProvider] = useState({ endpoint: '', credentialRef: '', namespace: '' })
  const [infoblox, setInfoblox] = useState({ host: '', username: '', password: '', dnsView: 'default', networkView: 'default' })
  const [ipamProvider, setIpamProvider] = useState({ endpoint: '', credentialRef: '', networkView: '', dnsView: '' })
  const vaultFieldLabels = vaultType !== 'local' && vaultType !== 'environment' && vaultType !== 'cyberark'
    ? VAULT_FIELD_LABELS[vaultType]
    : null
  const ipamFieldLabels = ipMethod !== 'static' && ipMethod !== 'csv' && ipMethod !== 'infoblox'
    ? IPAM_FIELD_LABELS[ipMethod]
    : null

  useEffect(() => {
    apiFetch('/api/global-config').then(r => r.json()).then(data => {
      if (!data.content) return
      try {
        const parsed = fromYaml(data.content) as Record<string, unknown>
        if (!parsed || typeof parsed !== 'object') return

        if (isVaultType(parsed.vault_to_use)) {
          setVaultType(parsed.vault_to_use)
        }
        if (isIpamMethod(parsed.ip_allocation_method)) {
          setIpMethod(parsed.ip_allocation_method)
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

        const selectedVault = typeof parsed.vault_to_use === 'string' ? vaults?.[parsed.vault_to_use] as Record<string, string> | undefined : undefined
        if (selectedVault && parsed.vault_to_use !== 'local' && parsed.vault_to_use !== 'cyberark') {
          setVaultProvider({
            endpoint: selectedVault.endpoint ?? selectedVault.host ?? '',
            credentialRef: selectedVault.credential_ref ?? selectedVault.credential ?? '',
            namespace: selectedVault.namespace ?? selectedVault.path_prefix ?? '',
          })
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

        const parsedIpam = parsed.ipam as Record<string, string> | undefined
        if (parsedIpam && parsedIpam.method !== 'static' && parsedIpam.method !== 'infoblox') {
          setIpamProvider({
            endpoint: parsedIpam.endpoint ?? parsedIpam.host ?? '',
            credentialRef: parsedIpam.credential_ref ?? parsedIpam.credential ?? '',
            networkView: parsedIpam.network_view ?? '',
            dnsView: parsedIpam.dns_view ?? '',
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
    ...(vaultType !== 'local' && vaultType !== 'cyberark' ? { vaultProvider } : {}),
    ...(ipMethod === 'infoblox' ? { infoblox } : {}),
    ...(ipMethod !== 'static' && ipMethod !== 'infoblox' ? { ipamProvider } : {}),
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
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-nutanix-blue">
              <KeyRound size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Vault Configuration</h3>
              <p className="mt-1 text-sm text-gray-500">Select how workflow credentials are resolved at execution time.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label">Vault Type</label>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {VAULT_OPTIONS.map(option => (
                  <ProviderCard
                    key={option.id}
                    option={option}
                    selected={vaultType === option.id}
                    name="vaultType"
                    onSelect={setVaultType}
                  />
                ))}
              </div>
            </div>

            {vaultType === 'local' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Local storage is practical for labs and isolated UAT. Use an external provider for production credential custody.
              </div>
            )}

            {vaultType === 'environment' && (
              <div className="form-section">
                <p className="form-section-title">Environment Resolution</p>
                <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-gray-500">
                  Credentials are resolved from runtime environment variables by reference key. Store only references in workflow YAML.
                </div>
              </div>
            )}

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

            {vaultType !== 'local' && vaultType !== 'environment' && vaultType !== 'cyberark' && (
              <div className="form-section">
                <p className="form-section-title">{vaultFieldLabels?.title}</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div>
                    <label className="label">{vaultFieldLabels?.endpoint}</label>
                    <input
                      className="input font-mono"
                      value={vaultProvider.endpoint}
                      onChange={event => setVaultProvider(prev => ({ ...prev, endpoint: event.target.value }))}
                      placeholder={vaultFieldLabels?.endpointPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="label">{vaultFieldLabels?.credentialRef}</label>
                    <input
                      className="input font-mono"
                      value={vaultProvider.credentialRef}
                      onChange={event => setVaultProvider(prev => ({ ...prev, credentialRef: event.target.value }))}
                      placeholder={vaultFieldLabels?.credentialPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="label">{vaultFieldLabels?.namespace}</label>
                    <input
                      className="input font-mono"
                      value={vaultProvider.namespace}
                      onChange={event => setVaultProvider(prev => ({ ...prev, namespace: event.target.value }))}
                      placeholder={vaultFieldLabels?.namespacePlaceholder}
                    />
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
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-nutanix-blue">
              <Network size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">IP Allocation Method</h3>
              <p className="mt-1 text-sm text-gray-500">Choose the source of truth for addresses used in generated workflow configurations.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="label">IPAM Provider</label>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {IPAM_OPTIONS.map(option => (
                  <ProviderCard
                    key={option.id}
                    option={option}
                    selected={ipMethod === option.id}
                    name="ipMethod"
                    onSelect={setIpMethod}
                  />
                ))}
              </div>
            </div>

            {(ipMethod === 'static' || ipMethod === 'csv') && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {ipMethod === 'static'
                  ? 'Static allocation keeps IP ownership in workflow inputs and is the safest default for controlled UAT.'
                  : 'CSV reservations are operator supplied and suitable for offline or air-gapped planning workflows.'}
              </div>
            )}

            {ipMethod !== 'static' && ipMethod !== 'csv' && (
              <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-gray-500">
                <div className="flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-nutanix-blue" />
                  <span>Use a read-only credential first. Enable mutating address allocation only after the provider adapter is validated in UAT.</span>
                </div>
              </div>
            )}

            {ipMethod === 'csv' && (
              <div className="form-section">
                <p className="form-section-title">Reservation File</p>
                <div>
                  <label className="label">CSV Path / Reference</label>
                  <input
                    className="input font-mono"
                    value={ipamProvider.endpoint}
                    onChange={event => setIpamProvider(prev => ({ ...prev, endpoint: event.target.value }))}
                    placeholder="/var/lib/ztf-orchestrator/ipam/reservations.csv"
                  />
                </div>
              </div>
            )}

            {ipMethod !== 'static' && ipMethod !== 'csv' && ipMethod !== 'infoblox' && (
              <div className="form-section">
                <p className="form-section-title">{ipamFieldLabels?.title}</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="label">{ipamFieldLabels?.endpoint}</label>
                    <input
                      className="input font-mono"
                      value={ipamProvider.endpoint}
                      onChange={event => setIpamProvider(prev => ({ ...prev, endpoint: event.target.value }))}
                      placeholder={ipamFieldLabels?.endpointPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="label">{ipamFieldLabels?.credentialRef}</label>
                    <input
                      className="input font-mono"
                      value={ipamProvider.credentialRef}
                      onChange={event => setIpamProvider(prev => ({ ...prev, credentialRef: event.target.value }))}
                      placeholder={ipamFieldLabels?.credentialPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="label">{ipamFieldLabels?.networkView}</label>
                    <input
                      className="input"
                      value={ipamProvider.networkView}
                      onChange={event => setIpamProvider(prev => ({ ...prev, networkView: event.target.value }))}
                      placeholder={ipamFieldLabels?.networkViewPlaceholder}
                    />
                  </div>
                  <div>
                    <label className="label">{ipamFieldLabels?.dnsView}</label>
                    <input
                      className="input"
                      value={ipamProvider.dnsView}
                      onChange={event => setIpamProvider(prev => ({ ...prev, dnsView: event.target.value }))}
                      placeholder={ipamFieldLabels?.dnsViewPlaceholder}
                    />
                  </div>
                </div>
              </div>
            )}

            {ipMethod === 'infoblox' && (
              <div className="form-section">
                <p className="form-section-title">Infoblox Settings</p>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="lg:col-span-2">
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
