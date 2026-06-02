import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Bell, Copy, Database, FolderOpen, Globe2, HardDrive, Network,
  Plus, Save, Server, ShieldCheck, Trash2, RefreshCw,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import { toYaml } from '../utils/yaml'
import type { ConnectionProfile, Settings as AppSettings } from '../types'
import clsx from 'clsx'

const ENVIRONMENTS: ConnectionProfile['environment'][] = ['lab', 'preprod', 'production', 'customer', 'other']

interface PlatformHealth {
  status: string
  storage: 'file' | 'postgres' | string
  dataDir?: string
  database?: {
    configured: boolean
    location: string
  }
  retention?: {
    auditDays: number
    executionDays: number
  }
  ztf_installed?: boolean
  version?: string
}

function newProfile(seed?: Partial<ConnectionProfile>): ConnectionProfile {
  const id = seed?.id || `profile-${Date.now()}`
  return {
    id,
    name: seed?.name || 'New Profile',
    description: seed?.description || '',
    environment: seed?.environment || 'lab',
    prismCentral: {
      endpoint: '',
      credentialRef: 'pc_user',
      remoteCredentialRef: 'remote_pc_credentials',
      defaultPcVersion: '',
      enableObjects: false,
      enableNke: false,
      enableFlow: false,
      enableNetworkController: false,
      ...seed?.prismCentral,
    },
    foundationCentral: {
      endpoint: '',
      credentialRef: 'pc_user',
      apiKeyRef: '',
      aosUrl: '',
      hypervisorType: 'kvm',
      hypervisorUrl: '',
      foundationVersion: '',
      ...seed?.foundationCentral,
    },
    prismElement: {
      defaultClusterVip: '',
      peCredentialRef: 'pe_user',
      cvmCredentialRef: 'cvm_credential',
      storageContainer: '',
      networkName: '',
      ...seed?.prismElement,
    },
    ncm: {
      endpoint: '',
      credentialRef: 'ncm_user',
      projectName: '',
      accountName: 'NTNX_LOCAL_AZ',
      ...seed?.ncm,
    },
    directory: {
      domain: '',
      ldapUrl: '',
      serviceAccountCredentialRef: 'service_account_credential',
      defaultGroups: '',
      ...seed?.directory,
    },
    ipam: {
      method: 'static',
      infobloxHost: '',
      credentialRef: 'infoblox_user',
      dnsView: 'default',
      networkView: 'default',
      ...seed?.ipam,
    },
    defaults: {
      dnsServers: '',
      ntpServers: '',
      timezone: 'UTC',
      siteCode: '',
      ...seed?.defaults,
    },
  }
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const profiles = settings.connectionProfiles?.length
    ? settings.connectionProfiles.map(profile => newProfile(profile))
    : [newProfile({ id: 'default', name: 'Default' })]
  const activeProfileId = profiles.some(p => p.id === settings.activeProfileId)
    ? settings.activeProfileId
    : profiles[0].id
  return {
    ...settings,
    activeProfileId,
    connectionProfiles: profiles,
  }
}

function csv(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function profileYaml(profile: ConnectionProfile): string {
  return toYaml({
    profile: {
      name: profile.name,
      environment: profile.environment,
      description: profile.description || undefined,
    },
    ztf_connection_defaults: {
      prism_central: {
        pc_ip: profile.prismCentral.endpoint,
        pc_credential: profile.prismCentral.credentialRef,
        remote_pc_credential: profile.prismCentral.remoteCredentialRef,
        pc_version: profile.prismCentral.defaultPcVersion || undefined,
        enable_objects: profile.prismCentral.enableObjects,
        enable_nke: profile.prismCentral.enableNke,
        enable_microsegmentation: profile.prismCentral.enableFlow,
        enable_network_controller: profile.prismCentral.enableNetworkController,
      },
      foundation_central: {
        endpoint: profile.foundationCentral.endpoint,
        credential: profile.foundationCentral.credentialRef,
        api_key_ref: profile.foundationCentral.apiKeyRef || undefined,
        foundation_version: profile.foundationCentral.foundationVersion || undefined,
        imaging_parameters: {
          aos_url: profile.foundationCentral.aosUrl,
          hypervisor_type: profile.foundationCentral.hypervisorType,
          hypervisor_url: profile.foundationCentral.hypervisorUrl,
        },
      },
      prism_element: {
        cluster_vip: profile.prismElement.defaultClusterVip,
        pe_credential: profile.prismElement.peCredentialRef,
        cvm_credential: profile.prismElement.cvmCredentialRef,
        container_name: profile.prismElement.storageContainer,
        network_name: profile.prismElement.networkName,
      },
      ncm: {
        ncm_vm_ip: profile.ncm.endpoint,
        ncm_credential: profile.ncm.credentialRef,
        project_name: profile.ncm.projectName || undefined,
        account_name: profile.ncm.accountName || undefined,
      },
      directory_services: {
        ad_domain: profile.directory.domain,
        ad_directory_url: profile.directory.ldapUrl,
        service_account_credential: profile.directory.serviceAccountCredentialRef,
        default_groups: csv(profile.directory.defaultGroups),
      },
      ipam: {
        method: profile.ipam.method,
        infoblox_host: profile.ipam.infobloxHost || undefined,
        credential: profile.ipam.credentialRef || undefined,
        dns_view: profile.ipam.dnsView,
        network_view: profile.ipam.networkView,
      },
      defaults: {
        name_servers_list: csv(profile.defaults.dnsServers),
        ntp_servers_list: csv(profile.defaults.ntpServers),
        timezone: profile.defaults.timezone,
        site_code: profile.defaults.siteCode || undefined,
      },
    },
  })
}

function Field({
  label, value, onChange, disabled, placeholder, mono = false, type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className={clsx('input', mono && 'font-mono')}
        value={value}
        type={type}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  )
}

function ReadOnlyField({
  label, value, mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className={clsx(
        'min-h-[42px] rounded-md border border-border bg-gray-950/70 px-3 py-2 text-sm text-gray-300 flex items-center break-all',
        mono && 'font-mono text-xs'
      )}>
        {value || 'not configured'}
      </div>
    </div>
  )
}

function Toggle({
  label, checked, onChange, disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={clsx(
      'flex items-center justify-between gap-3 rounded-lg border border-border bg-gray-900/40 px-3 py-2 text-sm',
      disabled ? 'opacity-60' : 'cursor-pointer'
    )}>
      <span className="text-gray-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 accent-nutanix-blue"
      />
    </label>
  )
}

function Section({
  title, subtitle, icon: Icon, children,
}: {
  title: string
  subtitle: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center">
          <Icon size={16} className="text-nutanix-cyan" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-100">{title}</h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { settings, setSettings, user } = useStore()
  const [form, setForm] = useState<AppSettings>(() => normalizeSettings(settings))
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'runtime' | 'storage' | 'connections' | 'notifications' | 'about'>('runtime')
  const [copied, setCopied] = useState(false)
  const [health, setHealth] = useState<PlatformHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/settings').then(r => r.json()).then(data => {
      const normalized = normalizeSettings({ ...settings, ...data })
      setForm(normalized)
      setSettings(normalized)
    }).catch(() => {})
  }, [setSettings])

  const loadHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await fetch('/health')
      if (response.ok) setHealth(await response.json())
    } finally {
      setHealthLoading(false)
    }
  }

  useEffect(() => { loadHealth() }, [])

  const isAdmin = user?.role === 'admin'
  const profiles = form.connectionProfiles
  const activeProfile = profiles.find(p => p.id === form.activeProfileId) || profiles[0]

  const updateProfile = (profile: ConnectionProfile) => {
    setForm(prev => ({
      ...prev,
      connectionProfiles: prev.connectionProfiles.map(item => item.id === profile.id ? profile : item),
    }))
  }

  const patchProfile = <K extends keyof ConnectionProfile>(
    key: K,
    value: ConnectionProfile[K],
  ) => updateProfile({ ...activeProfile, [key]: value })

  const patchNested = <
    K extends keyof ConnectionProfile,
    F extends keyof ConnectionProfile[K]
  >(section: K, field: F, value: ConnectionProfile[K][F]) => {
    updateProfile({
      ...activeProfile,
      [section]: {
        ...(activeProfile[section] as object),
        [field]: value,
      },
    } as ConnectionProfile)
  }

  const addProfile = () => {
    const profile = newProfile({ name: `Profile ${profiles.length + 1}` })
    setForm(prev => ({
      ...prev,
      activeProfileId: profile.id,
      connectionProfiles: [...prev.connectionProfiles, profile],
    }))
  }

  const duplicateProfile = () => {
    const profile = newProfile({
      ...activeProfile,
      id: `profile-${Date.now()}`,
      name: `${activeProfile.name} Copy`,
    })
    setForm(prev => ({
      ...prev,
      activeProfileId: profile.id,
      connectionProfiles: [...prev.connectionProfiles, profile],
    }))
  }

  const deleteProfile = () => {
    if (profiles.length <= 1) return
    if (!confirm(`Delete connection profile "${activeProfile.name}"?`)) return
    const nextProfiles = profiles.filter(p => p.id !== activeProfile.id)
    setForm(prev => ({
      ...prev,
      activeProfileId: nextProfiles[0].id,
      connectionProfiles: nextProfiles,
    }))
  }

  const save = async () => {
    setSaving(true)
    const normalized = normalizeSettings(form)
    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(normalized),
      })
      setSettings(normalized)
      setForm(normalized)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const copyYaml = async () => {
    await navigator.clipboard.writeText(profileYaml(activeProfile))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const tabs = [
    { id: 'runtime', label: 'Runtime' },
    { id: 'storage', label: 'Storage' },
    { id: 'connections', label: 'Connection Profiles' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'about', label: 'About' },
  ] as const

  return (
    <Layout
      title="Settings"
      subtitle="Configure runtime, connection profiles, and platform options"
      actions={isAdmin ? (
        <button onClick={save} disabled={saving} className="btn-primary gap-1.5">
          <Save size={14} />
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
      ) : undefined}
    >
      <div className="max-w-6xl space-y-6">
        {!isAdmin && (
          <div className="card border-amber-700/30 bg-amber-900/5 text-sm text-amber-400">
            Settings are read-only for your role. Contact an administrator to make changes.
          </div>
        )}

        <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border w-fit">
          {tabs.map(tab => (
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

        {activeTab === 'runtime' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Framework Location" subtitle="Where ZTF runs from" icon={FolderOpen}>
              <div className="space-y-4">
                <Field label="ZTF Installation Path" value={form.ztfPath} disabled={!isAdmin} mono
                  placeholder="/home/user/zerotouch-framework"
                  onChange={value => setForm(p => ({ ...p, ztfPath: value }))} />
                <Field label="Python Executable" value={form.pythonPath} disabled={!isAdmin} mono
                  placeholder="python3"
                  onChange={value => setForm(p => ({ ...p, pythonPath: value }))} />
                <Field label="Config Files Directory" value={form.configDir} disabled={!isAdmin} mono
                  placeholder="~/.ztf-ui/configs"
                  onChange={value => setForm(p => ({ ...p, configDir: value }))} />
              </div>
            </Section>

            <Section title="Repository" subtitle="Framework source used by setup" icon={Globe2}>
              <Field label="ZTF Repository URL" value={form.repoUrl} disabled={!isAdmin} mono
                placeholder="https://github.com/nutanixdev/zerotouch-framework.git"
                onChange={value => setForm(p => ({ ...p, repoUrl: value }))} />
              <p className="text-xs text-gray-500 mt-3">
                Used during Setup & Install. Use the official ZTF repository or an approved internal mirror.
              </p>
            </Section>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Section title="Storage Backend" subtitle="Current persistence mode and state location" icon={Database}>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ReadOnlyField label="Backend" value={health?.storage || 'loading'} />
                  <ReadOnlyField label="Status" value={health?.status || 'unknown'} />
                  <ReadOnlyField label="Data Directory" value={health?.dataDir || ''} mono />
                  <ReadOnlyField
                    label="Database Location"
                    value={health?.database?.location || (health?.storage === 'postgres' ? 'configured' : 'not used')}
                    mono
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={loadHealth} disabled={healthLoading} className="btn-secondary gap-1.5">
                    <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                  <span className="text-xs text-gray-500">
                    Database credentials are intentionally hidden.
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Retention" subtitle="Operational history retention settings" icon={HardDrive}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReadOnlyField label="Audit Retention" value={`${health?.retention?.auditDays ?? 90} days`} />
                <ReadOnlyField label="Execution Retention" value={`${health?.retention?.executionDays ?? 180} days`} />
                <ReadOnlyField label="ZTF Installed" value={health?.ztf_installed ? 'yes' : 'no'} />
                <ReadOnlyField label="Version" value={health?.version || '1.2.6'} />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Change storage and retention values with environment variables, then restart the service.
              </p>
            </Section>
          </div>
        )}

        {activeTab === 'connections' && activeProfile && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_170px] gap-4 flex-1">
                  <div>
                    <label className="label">Active Profile</label>
                    <select
                      className="input"
                      value={form.activeProfileId}
                      disabled={!isAdmin}
                      onChange={e => setForm(p => ({ ...p, activeProfileId: e.target.value }))}
                    >
                      {profiles.map(profile => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <Field label="Profile Name" value={activeProfile.name} disabled={!isAdmin}
                    onChange={value => patchProfile('name', value)} />
                  <div>
                    <label className="label">Environment</label>
                    <select
                      className="input capitalize"
                      value={activeProfile.environment}
                      disabled={!isAdmin}
                      onChange={e => patchProfile('environment', e.target.value as ConnectionProfile['environment'])}
                    >
                      {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <Field label="Description" value={activeProfile.description || ''} disabled={!isAdmin}
                      placeholder="Production EU sites, lab pod, customer environment..."
                      onChange={value => patchProfile('description', value)} />
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button onClick={addProfile} className="btn-secondary gap-1.5"><Plus size={14} /> Add</button>
                    <button onClick={duplicateProfile} className="btn-secondary gap-1.5"><Copy size={14} /> Duplicate</button>
                    <button onClick={deleteProfile} disabled={profiles.length <= 1} className="btn-danger gap-1.5"><Trash2 size={14} /> Delete</button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Section title="Prism Central" subtitle="PC endpoint and service defaults" icon={Server}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="PC VIP / FQDN" value={activeProfile.prismCentral.endpoint} disabled={!isAdmin} mono
                    placeholder="10.10.1.10 or pc.example.com"
                    onChange={value => patchNested('prismCentral', 'endpoint', value)} />
                  <Field label="PC Credential Ref" value={activeProfile.prismCentral.credentialRef} disabled={!isAdmin} mono
                    placeholder="pc_user"
                    onChange={value => patchNested('prismCentral', 'credentialRef', value)} />
                  <Field label="Remote PC Credential Ref" value={activeProfile.prismCentral.remoteCredentialRef} disabled={!isAdmin} mono
                    placeholder="remote_pc_credentials"
                    onChange={value => patchNested('prismCentral', 'remoteCredentialRef', value)} />
                  <Field label="Default PC Version" value={activeProfile.prismCentral.defaultPcVersion} disabled={!isAdmin} mono
                    placeholder="pc.2024.1"
                    onChange={value => patchNested('prismCentral', 'defaultPcVersion', value)} />
                  <Toggle label="Objects" checked={activeProfile.prismCentral.enableObjects} disabled={!isAdmin}
                    onChange={value => patchNested('prismCentral', 'enableObjects', value)} />
                  <Toggle label="NKE" checked={activeProfile.prismCentral.enableNke} disabled={!isAdmin}
                    onChange={value => patchNested('prismCentral', 'enableNke', value)} />
                  <Toggle label="Flow / Microsegmentation" checked={activeProfile.prismCentral.enableFlow} disabled={!isAdmin}
                    onChange={value => patchNested('prismCentral', 'enableFlow', value)} />
                  <Toggle label="Network Controller" checked={activeProfile.prismCentral.enableNetworkController} disabled={!isAdmin}
                    onChange={value => patchNested('prismCentral', 'enableNetworkController', value)} />
                </div>
              </Section>

              <Section title="Foundation Central" subtitle="Imaging and Day-0 deployment defaults" icon={Network}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="FC / PC Endpoint" value={activeProfile.foundationCentral.endpoint} disabled={!isAdmin} mono
                    placeholder="Foundation Central endpoint"
                    onChange={value => patchNested('foundationCentral', 'endpoint', value)} />
                  <Field label="Credential Ref" value={activeProfile.foundationCentral.credentialRef} disabled={!isAdmin} mono
                    placeholder="pc_user"
                    onChange={value => patchNested('foundationCentral', 'credentialRef', value)} />
                  <Field label="API Key Ref" value={activeProfile.foundationCentral.apiKeyRef} disabled={!isAdmin} mono
                    placeholder="foundation_api_key"
                    onChange={value => patchNested('foundationCentral', 'apiKeyRef', value)} />
                  <Field label="Foundation Version" value={activeProfile.foundationCentral.foundationVersion} disabled={!isAdmin} mono
                    placeholder="5.6.0.1"
                    onChange={value => patchNested('foundationCentral', 'foundationVersion', value)} />
                  <Field label="AOS URL" value={activeProfile.foundationCentral.aosUrl} disabled={!isAdmin} mono
                    placeholder="https://repo/aos.tar.gz"
                    onChange={value => patchNested('foundationCentral', 'aosUrl', value)} />
                  <Field label="Hypervisor URL" value={activeProfile.foundationCentral.hypervisorUrl} disabled={!isAdmin} mono
                    placeholder="https://repo/ahv.iso"
                    onChange={value => patchNested('foundationCentral', 'hypervisorUrl', value)} />
                  <div>
                    <label className="label">Hypervisor Type</label>
                    <select
                      className="input"
                      value={activeProfile.foundationCentral.hypervisorType}
                      disabled={!isAdmin}
                      onChange={e => patchNested('foundationCentral', 'hypervisorType', e.target.value as 'kvm' | 'esx' | 'hyperv')}
                    >
                      <option value="kvm">AHV / KVM</option>
                      <option value="esx">ESXi</option>
                      <option value="hyperv">Hyper-V</option>
                    </select>
                  </div>
                </div>
              </Section>

              <Section title="Prism Element / CVM" subtitle="Cluster and PC deployment defaults" icon={HardDrive}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Default Cluster VIP" value={activeProfile.prismElement.defaultClusterVip} disabled={!isAdmin} mono
                    placeholder="10.10.2.10"
                    onChange={value => patchNested('prismElement', 'defaultClusterVip', value)} />
                  <Field label="PE Credential Ref" value={activeProfile.prismElement.peCredentialRef} disabled={!isAdmin} mono
                    placeholder="pe_user"
                    onChange={value => patchNested('prismElement', 'peCredentialRef', value)} />
                  <Field label="CVM Credential Ref" value={activeProfile.prismElement.cvmCredentialRef} disabled={!isAdmin} mono
                    placeholder="cvm_credential"
                    onChange={value => patchNested('prismElement', 'cvmCredentialRef', value)} />
                  <Field label="Storage Container" value={activeProfile.prismElement.storageContainer} disabled={!isAdmin}
                    placeholder="SelfServiceContainer"
                    onChange={value => patchNested('prismElement', 'storageContainer', value)} />
                  <Field label="Network Name" value={activeProfile.prismElement.networkName} disabled={!isAdmin}
                    placeholder="MGMTVLAN0"
                    onChange={value => patchNested('prismElement', 'networkName', value)} />
                </div>
              </Section>

              <Section title="NCM / Calm" subtitle="NCM Self-Service workload defaults" icon={Database}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="NCM Endpoint" value={activeProfile.ncm.endpoint} disabled={!isAdmin} mono
                    placeholder="NCM / PC endpoint"
                    onChange={value => patchNested('ncm', 'endpoint', value)} />
                  <Field label="NCM Credential Ref" value={activeProfile.ncm.credentialRef} disabled={!isAdmin} mono
                    placeholder="ncm_user"
                    onChange={value => patchNested('ncm', 'credentialRef', value)} />
                  <Field label="Default Project" value={activeProfile.ncm.projectName} disabled={!isAdmin}
                    placeholder="Default"
                    onChange={value => patchNested('ncm', 'projectName', value)} />
                  <Field label="Default Account" value={activeProfile.ncm.accountName} disabled={!isAdmin}
                    placeholder="NTNX_LOCAL_AZ"
                    onChange={value => patchNested('ncm', 'accountName', value)} />
                </div>
              </Section>

              <Section title="Directory / Identity" subtitle="AD, LDAP, and role mapping defaults" icon={ShieldCheck}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Domain" value={activeProfile.directory.domain} disabled={!isAdmin}
                    placeholder="corp.example.com"
                    onChange={value => patchNested('directory', 'domain', value)} />
                  <Field label="LDAP URL" value={activeProfile.directory.ldapUrl} disabled={!isAdmin} mono
                    placeholder="ldap://10.1.4.111:389"
                    onChange={value => patchNested('directory', 'ldapUrl', value)} />
                  <Field label="Service Account Ref" value={activeProfile.directory.serviceAccountCredentialRef} disabled={!isAdmin} mono
                    placeholder="service_account_credential"
                    onChange={value => patchNested('directory', 'serviceAccountCredentialRef', value)} />
                  <Field label="Default Groups" value={activeProfile.directory.defaultGroups} disabled={!isAdmin}
                    placeholder="Group A, Group B"
                    onChange={value => patchNested('directory', 'defaultGroups', value)} />
                </div>
              </Section>

              <Section title="IPAM and Defaults" subtitle="IP allocation, DNS, NTP, and site defaults" icon={Globe2}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">IPAM Method</label>
                    <select
                      className="input"
                      value={activeProfile.ipam.method}
                      disabled={!isAdmin}
                      onChange={e => patchNested('ipam', 'method', e.target.value as 'static' | 'infoblox')}
                    >
                      <option value="static">Static</option>
                      <option value="infoblox">Infoblox</option>
                    </select>
                  </div>
                  <Field label="Infoblox Host" value={activeProfile.ipam.infobloxHost} disabled={!isAdmin} mono
                    placeholder="infoblox.example.com"
                    onChange={value => patchNested('ipam', 'infobloxHost', value)} />
                  <Field label="IPAM Credential Ref" value={activeProfile.ipam.credentialRef} disabled={!isAdmin} mono
                    placeholder="infoblox_user"
                    onChange={value => patchNested('ipam', 'credentialRef', value)} />
                  <Field label="DNS View" value={activeProfile.ipam.dnsView} disabled={!isAdmin}
                    placeholder="default"
                    onChange={value => patchNested('ipam', 'dnsView', value)} />
                  <Field label="Network View" value={activeProfile.ipam.networkView} disabled={!isAdmin}
                    placeholder="default"
                    onChange={value => patchNested('ipam', 'networkView', value)} />
                  <Field label="DNS Servers" value={activeProfile.defaults.dnsServers} disabled={!isAdmin}
                    placeholder="10.1.1.10, 10.1.1.11"
                    onChange={value => patchNested('defaults', 'dnsServers', value)} />
                  <Field label="NTP Servers" value={activeProfile.defaults.ntpServers} disabled={!isAdmin}
                    placeholder="0.pool.ntp.org, 1.pool.ntp.org"
                    onChange={value => patchNested('defaults', 'ntpServers', value)} />
                  <Field label="Timezone" value={activeProfile.defaults.timezone} disabled={!isAdmin}
                    placeholder="UTC"
                    onChange={value => patchNested('defaults', 'timezone', value)} />
                  <Field label="Site Code" value={activeProfile.defaults.siteCode} disabled={!isAdmin}
                    placeholder="emea-01"
                    onChange={value => patchNested('defaults', 'siteCode', value)} />
                </div>
              </Section>
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-100">Generated ZTF Defaults Preview</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Reference values that workflow forms can use when generating YAML.</p>
                </div>
                <button onClick={copyYaml} className="btn-secondary text-xs gap-1.5">
                  <Copy size={13} />
                  {copied ? 'Copied' : 'Copy YAML'}
                </button>
              </div>
              <pre className="bg-gray-950 border border-border rounded-lg p-4 overflow-x-auto text-xs text-gray-300 font-mono max-h-96">
                {profileYaml(activeProfile)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <Section title="Notifications" subtitle="Outbound completion webhooks" icon={Bell}>
            <Field label="Webhook URL" value={form.webhookUrl ?? ''} disabled={!isAdmin} mono
              placeholder="https://hooks.slack.com/services/..."
              onChange={value => setForm(p => ({ ...p, webhookUrl: value }))} />
            <p className="text-xs text-gray-500 mt-3">
              Receives a POST summary when workflows, scripts, schedules, pipelines, approvals, or parallel runs complete.
            </p>
          </Section>
        )}

        {activeTab === 'about' && (
          <div className="card bg-nutanix-blue/5 border-nutanix-blue/20">
            <h3 className="font-semibold text-gray-100 mb-2">About ZeroTouch Enterprise Orchestrator</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              ZeroTouch Enterprise Orchestrator is an open-source operational interface for the{' '}
              <a
                href="https://github.com/nutanixdev/zerotouch-framework"
                target="_blank"
                rel="noopener noreferrer"
                className="text-nutanix-cyan hover:underline"
              >
                Nutanix ZeroTouch Framework
              </a>.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div>UI Version: <span className="text-gray-300">1.2.6</span></div>
              <div>ZTF Supported: <span className="text-gray-300">AOS 6.5+, PC 2022.6+</span></div>
              <div>Maintainer: <span className="text-gray-300">John Goulden</span></div>
              <div>Project: <span className="text-gray-300">ZTF-Orchestrator</span></div>
              <div>Signed in as: <span className="text-gray-300">{user?.username}</span></div>
              <div>Role: <span className="text-gray-300">{user?.role}</span></div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
