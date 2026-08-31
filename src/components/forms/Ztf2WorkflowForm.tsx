import { useEffect, useMemo, useState } from 'react'
import { Boxes, FileCode } from 'lucide-react'
import type { ConnectionProfile, WorkflowDef, Ztf2ScriptDef } from '../../types'
import { toYaml } from '../../utils/yaml'

export interface Ztf2WorkflowArtifacts {
  inputContent: string
  globalContent: string
  inputFile: string
  globalFile: string
  stateFile: string
}

interface Props {
  workflow: Pick<WorkflowDef | Ztf2ScriptDef, 'id' | 'ztf2Template'>
  onYamlChange: (yaml: string) => void
  onArtifactsChange: (artifacts: Ztf2WorkflowArtifacts) => void
  profile?: ConnectionProfile
  importedConfig?: unknown
}

interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'textarea' | 'select'
  options?: string[]
  help?: string
}

interface TemplateDef {
  title: string
  hint: string
  fields: FieldDef[]
  defaults: (profile?: ConnectionProfile) => Record<string, string>
  resourceBuilder: (values: Record<string, string>) => Record<string, unknown>
}

function csv(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

function splitPair(value: string, fallbackSecond = ''): [string, string] {
  const [first, ...rest] = value.split(':')
  return [(first || '').trim(), (rest.join(':') || fallbackSecond).trim()]
}

function keyed<T>(entries: Array<[string, T]>): Record<string, T> {
  return entries.reduce<Record<string, T>>((acc, [key, value]) => {
    if (key) acc[key] = value
    return acc
  }, {})
}

const TEMPLATE_DEFS: Record<string, TemplateDef> = {
  'prism-category': {
    title: 'Prism Central Categories',
    hint: 'One category per line as key: value1,value2,value3.',
    fields: [
      { key: 'categories', label: 'Categories', type: 'textarea', help: 'Example: Environment: Dev,Test,Prod' },
      { key: 'description', label: 'Description' },
    ],
    defaults: () => ({
      categories: 'Environment: Dev,Test\nApplication: Database,Web',
      description: 'Managed by ZTF-Orchestrator workflow',
    }),
    resourceBuilder: values => ({
      prism_central_category: keyed(lines(values.categories || '').map(row => {
        const [name, valueText] = splitPair(row, 'Dev,Test')
        return [name, {
          key: name,
          values: csv(valueText),
          description: values.description || 'Managed by ZTF-Orchestrator workflow',
        }]
      })),
    }),
  },
  'subnet-intent': {
    title: 'Subnet / VLAN Intents',
    hint: 'One subnet per line as name:vlan,network/prefix,gateway,pool-range.',
    fields: [
      { key: 'subnets', label: 'Subnets', type: 'textarea', help: 'Example: vlan0-managed:100,10.0.0.0/24,10.0.0.1,10.0.0.50-10.0.0.100' },
      { key: 'dhcpDomain', label: 'DHCP Domain' },
      { key: 'dhcpSearch', label: 'DHCP Search Domains' },
    ],
    defaults: profile => ({
      subnets: `${profile?.prismElement?.networkName || 'vlan0-managed'}:100,10.0.0.0/24,10.0.0.1,10.0.0.50-10.0.0.100`,
      dhcpDomain: profile?.directory?.domain || '',
      dhcpSearch: profile?.directory?.domain || '',
    }),
    resourceBuilder: values => ({
      prism_central_subnet: keyed(lines(values.subnets || '').map(row => {
        const [name, rest] = splitPair(row)
        const [vlan, cidr, gateway, pool] = csv(rest)
        const [networkIp, prefix = '24'] = String(cidr || '10.0.0.0/24').split('/')
        return [name, {
          name,
          vlan_id: Number(vlan || 0),
          network_ip: networkIp,
          network_prefix: Number(prefix || 24),
          default_gw_ip: gateway || '',
          dhcp_domain_name: values.dhcpDomain || '',
          dhcp_domain_search: csv(values.dhcpSearch || ''),
          ip_pools: pool ? [{ range: pool }] : [],
        }]
      })),
    }),
  },
  project: {
    title: 'Prism Central Project',
    hint: 'Create or update a project intent with optional cluster, subnet, and account references.',
    fields: [
      { key: 'projectName', label: 'Project Name' },
      { key: 'description', label: 'Description' },
      { key: 'clusterRefs', label: 'Cluster References' },
      { key: 'subnetRefs', label: 'Subnet References' },
      { key: 'accountRefs', label: 'Account References' },
    ],
    defaults: profile => ({
      projectName: profile?.ncm?.projectName || 'DEV_PROJECT',
      description: 'Managed by ZTF-Orchestrator workflow',
      clusterRefs: '',
      subnetRefs: profile?.prismElement?.networkName || '',
      accountRefs: profile?.ncm?.accountName || 'NTNX_LOCAL_AZ',
    }),
    resourceBuilder: values => ({
      prism_central_project: {
        [values.projectName || 'DEV_PROJECT']: {
          name: values.projectName || 'DEV_PROJECT',
          description: values.description || '',
          cluster_refs: csv(values.clusterRefs || ''),
          subnet_refs: csv(values.subnetRefs || ''),
          account_refs: csv(values.accountRefs || ''),
        },
      },
    }),
  },
  'image-registration': {
    title: 'VM Image Registration',
    hint: 'Register disk, ISO, or cloud-init images by URL.',
    fields: [
      { key: 'imageName', label: 'Image Name' },
      { key: 'imageType', label: 'Image Type', type: 'select', options: ['disk', 'iso', 'cloud-init'] },
      { key: 'sourceUrl', label: 'Source URL' },
      { key: 'checksum', label: 'Checksum' },
      { key: 'description', label: 'Description' },
    ],
    defaults: () => ({
      imageName: 'ubuntu-ztf-image',
      imageType: 'disk',
      sourceUrl: 'https://images.example.invalid/ubuntu.qcow2',
      checksum: '',
      description: 'Managed by ZTF-Orchestrator workflow',
    }),
    resourceBuilder: values => ({
      prism_central_image: {
        [values.imageName || 'vm-image']: {
          name: values.imageName || 'vm-image',
          type: values.imageType || 'disk',
          source_url: values.sourceUrl || '',
          checksum: values.checksum || '',
          description: values.description || '',
        },
      },
    }),
  },
  'vm-deployment': {
    title: 'Virtual Machine Deployment',
    hint: 'Create a VM intent from an image/template and target subnet.',
    fields: [
      { key: 'vmName', label: 'VM Name' },
      { key: 'projectRef', label: 'Project Reference' },
      { key: 'imageRef', label: 'Image Reference' },
      { key: 'subnetRef', label: 'Subnet Reference' },
      { key: 'cpuSockets', label: 'CPU Sockets', type: 'number' },
      { key: 'memoryGb', label: 'Memory GB', type: 'number' },
      { key: 'diskGb', label: 'Disk GB', type: 'number' },
      { key: 'categories', label: 'Categories' },
      { key: 'powerState', label: 'Power State', type: 'select', options: ['off', 'on'] },
    ],
    defaults: profile => ({
      vmName: 'ztf-demo-vm01',
      projectRef: profile?.ncm?.projectName || 'DEV_PROJECT',
      imageRef: 'ubuntu-ztf-image',
      subnetRef: profile?.prismElement?.networkName || 'vlan0-managed',
      cpuSockets: '2',
      memoryGb: '8',
      diskGb: '80',
      categories: 'Environment:Dev,Application:Web',
      powerState: 'off',
    }),
    resourceBuilder: values => ({
      prism_central_vm: {
        [values.vmName || 'ztf-demo-vm01']: {
          name: values.vmName || 'ztf-demo-vm01',
          project_ref: values.projectRef || '',
          image_ref: values.imageRef || '',
          nics: [{ subnet_ref: values.subnetRef || '' }],
          cpu_sockets: Number(values.cpuSockets || 1),
          memory_gb: Number(values.memoryGb || 4),
          disks: [{ size_gb: Number(values.diskGb || 40) }],
          categories: keyed(csv(values.categories || '').map(item => splitPair(item))),
          power_state: values.powerState || 'off',
        },
      },
    }),
  },
  'security-groups': {
    title: 'Address And Service Groups',
    hint: 'Build reusable security objects before Flow policy templates.',
    fields: [
      { key: 'addressGroups', label: 'Address Groups', type: 'textarea', help: 'One per line as name:cidr,cidr' },
      { key: 'serviceGroups', label: 'Service Groups', type: 'textarea', help: 'One per line as name:tcp/443,udp/53' },
    ],
    defaults: () => ({
      addressGroups: 'web-tier:10.10.10.0/24\napp-tier:10.10.20.0/24',
      serviceGroups: 'web-services:tcp/80,tcp/443\ndns-services:udp/53,tcp/53',
    }),
    resourceBuilder: values => ({
      prism_central_address_group: keyed(lines(values.addressGroups || '').map(row => {
        const [name, cidrs] = splitPair(row)
        return [name, { name, cidrs: csv(cidrs) }]
      })),
      prism_central_service_group: keyed(lines(values.serviceGroups || '').map(row => {
        const [name, services] = splitPair(row)
        return [name, { name, services: csv(services) }]
      })),
    }),
  },
  'protection-policy': {
    title: 'Protection Policy',
    hint: 'Create a protection policy intent with schedule and location references.',
    fields: [
      { key: 'policyName', label: 'Policy Name' },
      { key: 'sourceLocation', label: 'Source Location' },
      { key: 'targetLocation', label: 'Target Location' },
      { key: 'rpoMinutes', label: 'RPO Minutes', type: 'number' },
      { key: 'schedule', label: 'Schedule' },
      { key: 'protectedCategories', label: 'Protected Categories' },
    ],
    defaults: () => ({
      policyName: 'ztf-dev-protection',
      sourceLocation: 'primary',
      targetLocation: 'recovery',
      rpoMinutes: '60',
      schedule: 'hourly',
      protectedCategories: 'Environment:Dev',
    }),
    resourceBuilder: values => ({
      prism_central_protection_policy: {
        [values.policyName || 'ztf-protection-policy']: {
          name: values.policyName || 'ztf-protection-policy',
          source_location: values.sourceLocation || '',
          target_location: values.targetLocation || '',
          rpo_minutes: Number(values.rpoMinutes || 60),
          schedule: values.schedule || 'hourly',
          protected_categories: keyed(csv(values.protectedCategories || '').map(item => splitPair(item))),
        },
      },
    }),
  },
  'recovery-plan': {
    title: 'Recovery Plan',
    hint: 'Create a recovery plan intent linked to project, subnet, VM, and recovery location references.',
    fields: [
      { key: 'planName', label: 'Plan Name' },
      { key: 'projectRef', label: 'Project Reference' },
      { key: 'vmRefs', label: 'VM References' },
      { key: 'sourceSubnetRef', label: 'Source Subnet Reference' },
      { key: 'recoverySubnetRef', label: 'Recovery Subnet Reference' },
      { key: 'recoveryLocation', label: 'Recovery Location' },
      { key: 'bootOrder', label: 'Boot Order' },
    ],
    defaults: profile => ({
      planName: 'ztf-dev-recovery',
      projectRef: profile?.ncm?.projectName || 'DEV_PROJECT',
      vmRefs: 'ztf-demo-vm01',
      sourceSubnetRef: profile?.prismElement?.networkName || 'vlan0-managed',
      recoverySubnetRef: 'vlan0-recovery',
      recoveryLocation: 'recovery',
      bootOrder: 'ztf-demo-vm01',
    }),
    resourceBuilder: values => ({
      prism_central_recovery_plan: {
        [values.planName || 'ztf-recovery-plan']: {
          name: values.planName || 'ztf-recovery-plan',
          project_ref: values.projectRef || '',
          vm_refs: csv(values.vmRefs || ''),
          network_mappings: [{
            source_subnet_ref: values.sourceSubnetRef || '',
            recovery_subnet_ref: values.recoverySubnetRef || '',
          }],
          recovery_location: values.recoveryLocation || '',
          boot_order: csv(values.bootOrder || ''),
        },
      },
    }),
  },
}

function globalFromProfile(profile?: ConnectionProfile): string {
  return toYaml({
    vault_to_use: 'local',
    ip_allocation_method: profile?.ipam?.method || 'static',
    vaults: {
      local: {
        credentials: {
          [profile?.prismCentral?.credentialRef || 'pc_user']: {
            username: '',
            password: '',
          },
        },
      },
    },
  })
}

function buildInputYaml(workflow: Props['workflow'], domain: string, values: Record<string, string>): string {
  const template = TEMPLATE_DEFS[workflow.ztf2Template || 'prism-category'] || TEMPLATE_DEFS['prism-category']
  return toYaml({
    ztf_orchestrator: {
      runtime_mode: 'ztf2_iac',
      workflow_template: workflow.id,
      resource_template: workflow.ztf2Template || 'custom',
      source: 'workflow',
      schema_status: 'starter-template-pending-live-validation',
    },
    domains: {
      [domain || 'lab']: {
        resources: template.resourceBuilder(values),
        outputs: {},
      },
    },
  })
}

export default function Ztf2WorkflowForm({
  workflow,
  onYamlChange,
  onArtifactsChange,
  profile,
  importedConfig,
}: Props) {
  const template = TEMPLATE_DEFS[workflow.ztf2Template || 'prism-category'] || TEMPLATE_DEFS['prism-category']
  const defaultValues = useMemo(() => template.defaults(profile), [profile, template])
  const [domain, setDomain] = useState(profile?.defaults?.siteCode?.toLowerCase() || 'lab')
  const [values, setValues] = useState<Record<string, string>>(defaultValues)
  const [stateFile, setStateFile] = useState(`${workflow.id}-state.yml`)
  const [globalContent, setGlobalContent] = useState(globalFromProfile(profile))

  const inputContent = importedConfig ? toYaml(importedConfig) : buildInputYaml(workflow, domain, values)

  useEffect(() => {
    setValues(defaultValues)
    setStateFile(`${workflow.id}-state.yml`)
  }, [defaultValues, workflow.id])

  useEffect(() => {
    onYamlChange(inputContent)
    onArtifactsChange({
      inputContent,
      globalContent,
      inputFile: 'input.yml',
      globalFile: 'global.yml',
      stateFile: stateFile || `${workflow.id}-state.yml`,
    })
  }, [globalContent, inputContent, onArtifactsChange, onYamlChange, stateFile, workflow.id])

  const updateValue = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }))

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center">
            <Boxes size={16} className="text-nutanix-cyan" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">{template.title}</h3>
            <p className="text-xs text-gray-500">{template.hint}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label>
            <span className="label">Domain</span>
            <input className="input" value={domain} onChange={event => setDomain(event.target.value)} />
          </label>
          <label>
            <span className="label">State File</span>
            <input className="input font-mono" value={stateFile} onChange={event => setStateFile(event.target.value)} />
          </label>

          {template.fields.map(field => (
            <label key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : undefined}>
              <span className="label">{field.label}</span>
              {field.type === 'select' ? (
                <select className="input" value={values[field.key] || ''} onChange={event => updateValue(field.key, event.target.value)}>
                  {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  className="input font-mono text-xs resize-none w-full"
                  rows={5}
                  value={values[field.key] || ''}
                  onChange={event => updateValue(field.key, event.target.value)}
                  spellCheck={false}
                />
              ) : (
                <input
                  className="input"
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.key] || ''}
                  onChange={event => updateValue(field.key, event.target.value)}
                />
              )}
              {field.help && <span className="mt-1 block text-xs text-gray-500">{field.help}</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileCode size={16} className="text-nutanix-cyan" />
          <h3 className="font-semibold text-gray-100">global.yml</h3>
        </div>
        <textarea
          className="input font-mono text-xs resize-none w-full"
          rows={10}
          value={globalContent}
          onChange={event => setGlobalContent(event.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
        <p className="text-xs text-blue-300">
          Run Plan submits <code className="font-mono bg-blue-900/30 px-1 rounded">ztf plan</code> with generated
          <code className="font-mono bg-blue-900/30 px-1 rounded ml-1">input.yml</code> and
          <code className="font-mono bg-blue-900/30 px-1 rounded ml-1">global.yml</code>. Apply and destroy remain approval-bound after plan evidence review.
        </p>
      </div>
    </div>
  )
}
