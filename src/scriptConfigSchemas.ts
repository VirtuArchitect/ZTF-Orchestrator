import type { ScriptConfigField, ScriptConfigSchema } from './types'
import { SCRIPTS } from './data'
import { toYaml } from './utils/yaml'

type Values = Record<string, string | number | boolean>

export const DESTRUCTIVE_SCRIPT_IDS = new Set([
  'ChangeDefaultAdminPasswordPc',
  'ChangeDefaultAdminPasswordPe',
  'DeleteAdServerPc',
  'DeleteAdServerPe',
  'DeleteSubnetsPe',
  'DeleteSubnetsPc',
  'DeleteVPC',
  'DisableNetworkController',
  'DeleteContainerPe',
  'DeleteNameServersPc',
  'DeleteNameServersPe',
  'DeleteNtpServersPc',
  'DeleteNtpServersPe',
  'DeleteObjectStore',
  'DeleteRoleMappingPc',
  'DeleteRoleMappingPe',
  'DeleteVmPe',
  'DeleteVmPc',
  'PowerTransitionVmPe',
  'PowerOnVmPc',
  'PcImageDelete',
  'PcOVADelete',
  'DeleteNetworkSecurityPolicy',
  'DeleteAddressGroups',
  'DeleteServiceGroups',
  'DeleteCategoryPc',
  'DisableMicrosegmentation',
  'DeleteProtectionPolicy',
  'DeleteRecoveryPlan',
  'DisconnectAz',
  'UpdateDsip',
  'UpdateCvmFoundation',
])

const text = (values: Values, key: string) => String(values[key] ?? '').trim()
const integer = (values: Values, key: string) => {
  const value = Number(values[key] ?? 0)
  return Number.isFinite(value) ? value : 0
}
const bool = (values: Values, key: string) => Boolean(values[key])
const list = (values: Values, key: string) =>
  text(values, key)
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)

const pairs = (values: Values, key: string) =>
  list(values, key).reduce<Record<string, string>>((acc, item) => {
    const match = item.match(/^([^:=]+)\s*[:=]\s*(.+)$/)
    if (match) acc[match[1].trim()] = match[2].trim()
    return acc
  }, {})

const pcBase = (values: Values) => ({
  pc_ip: text(values, 'pc_ip'),
  pc_credential: text(values, 'pc_credential'),
})

const commonPeFields: ScriptConfigField[] = [
  { key: 'cluster_ip', label: 'Prism Element IP', type: 'text', required: true, placeholder: '10.4.72.10' },
  { key: 'pe_credential', label: 'PE Credential Ref', type: 'text', required: true, defaultValue: 'pe_user' },
]

const clusterNameField: ScriptConfigField = {
  key: 'cluster_name',
  label: 'Cluster Name',
  type: 'text',
  required: true,
  placeholder: 'cluster-01',
}

const commonPeClusterFields: ScriptConfigField[] = [
  ...commonPeFields,
  clusterNameField,
]

const commonPcFields: ScriptConfigField[] = [
  { key: 'pc_ip', label: 'Prism Central IP', type: 'text', required: true, placeholder: '10.4.72.20' },
  { key: 'pc_credential', label: 'PC Credential Ref', type: 'text', required: true, defaultValue: 'pc_user' },
]

const directoryFields: ScriptConfigField[] = [
  { key: 'ad_name', label: 'Directory Name', type: 'text', required: true, placeholder: 'corp-ad' },
  { key: 'ad_domain', label: 'AD Domain', type: 'text', required: true, placeholder: 'corp.example.com' },
  { key: 'ad_directory_url', label: 'LDAP URL', type: 'text', required: true, placeholder: 'ldap://10.4.72.30:389' },
  {
    key: 'service_account_credential',
    label: 'Service Account Credential Ref',
    type: 'text',
    required: true,
    defaultValue: 'service_account_credential',
  },
  {
    key: 'role_type',
    label: 'Role Mapping',
    type: 'select',
    defaultValue: 'ROLE_USER_ADMIN',
    options: ['ROLE_CLUSTER_ADMIN', 'ROLE_USER_ADMIN', 'ROLE_CLUSTER_VIEWER', 'ROLE_BACKUP_ADMIN'],
  },
  { key: 'entity_type', label: 'Entity Type', type: 'select', defaultValue: 'GROUP', options: ['GROUP', 'OU', 'USER'] },
  { key: 'entity_values', label: 'Entity Values', type: 'list', placeholder: 'Domain Admins\nZTF Operators' },
]

const dnsNtpFields: ScriptConfigField[] = [
  { key: 'dns_servers', label: 'DNS Servers', type: 'list', placeholder: '10.4.72.11\n10.4.72.12' },
  { key: 'ntp_servers', label: 'NTP Servers', type: 'list', placeholder: '0.pool.ntp.org\n1.pool.ntp.org' },
]

const resourceNameField = (label = 'Resource Names'): ScriptConfigField => ({
  key: 'resource_names',
  label,
  type: 'list',
  required: true,
  placeholder: 'resource-01',
})

const extraPairsField: ScriptConfigField = {
  key: 'extra_pairs',
  label: 'Additional Key/Value Pairs',
  type: 'list',
  placeholder: 'description: Created by ZTF-Orchestrator\nowner: operations',
  help: 'Optional simple key/value lines are added to the generated object.',
}

function roleMappings(values: Values) {
  const entityValues = list(values, 'entity_values')
  if (!entityValues.length) return undefined
  return [{
    role_type: text(values, 'role_type') || 'ROLE_USER_ADMIN',
    entity_type: text(values, 'entity_type') || 'GROUP',
    values: entityValues,
  }]
}

function peCluster(values: Values, body: Record<string, unknown>) {
  return {
    clusters: {
      [text(values, 'cluster_ip')]: {
        ...(text(values, 'cluster_name') ? { name: text(values, 'cluster_name') } : {}),
        pe_credential: text(values, 'pe_credential'),
        ...body,
      },
    },
  }
}

const EXACT_SCRIPT_CONFIG_SCHEMAS: Record<string, ScriptConfigSchema> = {
  AddAdServerPe: {
    scriptId: 'AddAdServerPe',
    title: 'Add AD Server (PE)',
    description: 'Creates Prism Element Active Directory configuration and optional role mapping YAML.',
    fields: [...commonPeClusterFields, ...directoryFields],
    build: values => toYaml(peCluster(values, {
      directory_services: {
        directory_type: 'ACTIVE_DIRECTORY',
        ad_name: text(values, 'ad_name'),
        ad_domain: text(values, 'ad_domain'),
        ad_directory_url: text(values, 'ad_directory_url'),
        service_account_credential: text(values, 'service_account_credential'),
        ...(roleMappings(values) ? { role_mappings: roleMappings(values) } : {}),
      },
    })),
  },
  AddAdServerPc: {
    scriptId: 'AddAdServerPc',
    title: 'Add AD Server (PC)',
    description: 'Creates Prism Central Active Directory configuration and optional role mapping YAML.',
    fields: [...commonPcFields, ...directoryFields],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      pc_directory_services: {
        directory_type: 'ACTIVE_DIRECTORY',
        ad_name: text(values, 'ad_name'),
        ad_domain: text(values, 'ad_domain'),
        ad_directory_url: text(values, 'ad_directory_url'),
        service_account_credential: text(values, 'service_account_credential'),
        ...(roleMappings(values) ? { role_mappings: roleMappings(values) } : {}),
      },
    }),
  },
  AddNameServersPe: {
    scriptId: 'AddNameServersPe',
    title: 'Add DNS Servers (PE)',
    description: 'Creates Prism Element DNS server YAML for one cluster.',
    fields: [...commonPeClusterFields, { key: 'dns_servers', label: 'DNS Servers', type: 'list', required: true, placeholder: '10.4.72.11\n10.4.72.12' }],
    build: values => toYaml(peCluster(values, { name_servers_list: list(values, 'dns_servers') })),
  },
  AddNtpServersPe: {
    scriptId: 'AddNtpServersPe',
    title: 'Add NTP Servers (PE)',
    description: 'Creates Prism Element NTP server YAML for one cluster.',
    fields: [...commonPeClusterFields, { key: 'ntp_servers', label: 'NTP Servers', type: 'list', required: true, placeholder: '0.pool.ntp.org\n1.pool.ntp.org' }],
    build: values => toYaml(peCluster(values, { ntp_servers_list: list(values, 'ntp_servers') })),
  },
  AddNameServersPc: {
    scriptId: 'AddNameServersPc',
    title: 'Add DNS Servers (PC)',
    description: 'Creates Prism Central DNS server YAML.',
    fields: [...commonPcFields, { key: 'dns_servers', label: 'DNS Servers', type: 'list', required: true, placeholder: '10.4.72.11\n10.4.72.12' }],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      pc_name_servers_list: list(values, 'dns_servers'),
    }),
  },
  AddNtpServersPc: {
    scriptId: 'AddNtpServersPc',
    title: 'Add NTP Servers (PC)',
    description: 'Creates Prism Central NTP server YAML.',
    fields: [...commonPcFields, { key: 'ntp_servers', label: 'NTP Servers', type: 'list', required: true, placeholder: '0.pool.ntp.org\n1.pool.ntp.org' }],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      pc_ntp_servers_list: list(values, 'ntp_servers'),
    }),
  },
  CreateSubnetPe: {
    scriptId: 'CreateSubnetPe',
    title: 'Create Subnet (PE)',
    description: 'Creates Prism Element AHV VLAN subnet YAML for one cluster.',
    fields: [
      ...commonPeClusterFields,
      { key: 'subnet_name', label: 'Subnet Name', type: 'text', required: true, placeholder: 'vlan-110' },
      { key: 'vlan_id', label: 'VLAN ID', type: 'number', required: true, defaultValue: 110 },
      { key: 'network_ip', label: 'Network IP', type: 'text', placeholder: '10.10.110.0' },
      { key: 'network_prefix', label: 'Prefix', type: 'number', defaultValue: 24 },
      { key: 'default_gateway_ip', label: 'Gateway', type: 'text', placeholder: '10.10.110.1' },
      { key: 'pool_range', label: 'IP Pool Range', type: 'text', placeholder: '10.10.110.50 10.10.110.100' },
      { key: 'dhcp_dns_servers', label: 'DHCP DNS Servers', type: 'list', placeholder: '10.4.72.11\n10.4.72.12' },
      { key: 'dhcp_domain', label: 'DHCP Domain', type: 'text', placeholder: 'corp.example.com' },
    ],
    build: values => toYaml(peCluster(values, {
      networks: [{
        name: text(values, 'subnet_name'),
        subnet_type: 'VLAN',
        vlan_id: integer(values, 'vlan_id'),
        ip_config: {
          ...(text(values, 'network_ip') ? { network_ip: text(values, 'network_ip') } : {}),
          ...(integer(values, 'network_prefix') ? { network_prefix: integer(values, 'network_prefix') } : {}),
          ...(text(values, 'default_gateway_ip') ? { default_gateway_ip: text(values, 'default_gateway_ip') } : {}),
          ...(text(values, 'pool_range') ? { pool_list: [{ range: text(values, 'pool_range') }] } : {}),
          ...(list(values, 'dhcp_dns_servers').length || text(values, 'dhcp_domain') ? {
            dhcp_options: {
              ...(list(values, 'dhcp_dns_servers').length ? { domain_name_server_list: list(values, 'dhcp_dns_servers') } : {}),
              ...(text(values, 'dhcp_domain') ? { domain_search_list: [text(values, 'dhcp_domain')], domain_name: text(values, 'dhcp_domain') } : {}),
            },
          } : {}),
        },
      }],
    })),
  },
  CreateContainerPe: {
    scriptId: 'CreateContainerPe',
    title: 'Create Storage Container (PE)',
    description: 'Creates Prism Element storage container YAML.',
    fields: [
      ...commonPeClusterFields,
      { key: 'container_name', label: 'Container Name', type: 'text', required: true, placeholder: 'SelfServiceContainer' },
      {
        key: 'replication_factor',
        label: 'Replication Factor',
        type: 'number',
        defaultValue: 1,
        help: 'Use 1 for one-node labs; use the replication factor required by the target cluster policy in production.',
      },
      { key: 'advertised_capacity_gb', label: 'Advertised Capacity GB', type: 'number', defaultValue: 1024 },
      { key: 'reserved_gb', label: 'Reserved GB', type: 'number', defaultValue: 0 },
      { key: 'compression_enabled', label: 'Compression', type: 'boolean', defaultValue: true },
      { key: 'erasure_code', label: 'Erasure Code', type: 'select', defaultValue: 'OFF', options: ['OFF', 'ON'] },
      { key: 'on_disk_dedup', label: 'On-Disk Dedup', type: 'select', defaultValue: 'OFF', options: ['OFF', 'ON'] },
    ],
    build: values => toYaml(peCluster(values, {
      containers: [{
        name: text(values, 'container_name'),
        replication_factor: integer(values, 'replication_factor') || 1,
        advertisedCapacity_in_gb: integer(values, 'advertised_capacity_gb'),
        reserved_in_gb: integer(values, 'reserved_gb'),
        compression_enabled: bool(values, 'compression_enabled'),
        compression_delay_in_secs: 0,
        erasure_code: text(values, 'erasure_code') || 'OFF',
        on_disk_dedup: text(values, 'on_disk_dedup') || 'OFF',
        nfsWhitelistAddress: [],
      }],
    })),
  },
  CreateVmPe: {
    scriptId: 'CreateVmPe',
    title: 'Create VM (PE)',
    description: 'Creates Prism Element VM YAML for one VM on one cluster.',
    fields: [
      ...commonPeClusterFields,
      { key: 'vm_name', label: 'VM Name', type: 'text', required: true, placeholder: 'app-01' },
      { key: 'image_name', label: 'Boot Image Name', type: 'text', required: true, placeholder: 'rhel-9-template' },
      { key: 'network_name', label: 'Network Name', type: 'text', required: true, placeholder: 'vlan-110' },
      { key: 'static_ip', label: 'Static IP', type: 'text', placeholder: '10.10.110.51' },
      { key: 'memory_mb', label: 'Memory MB', type: 'number', defaultValue: 4096 },
      { key: 'num_vcpus', label: 'vCPUs', type: 'number', defaultValue: 2 },
      { key: 'num_vcpus_per_socket', label: 'vCPUs per Socket', type: 'number', defaultValue: 1 },
      { key: 'container_name', label: 'Storage Container', type: 'text', defaultValue: 'SelfServiceContainer' },
    ],
    build: values => toYaml(peCluster(values, {
      vms: [{
        name: text(values, 'vm_name'),
        hypervisor_type: 'AHV',
        timezone: 'UTC',
        memory_mb: integer(values, 'memory_mb') || 4096,
        num_vcpus: integer(values, 'num_vcpus') || 2,
        num_cores_per_vcpu: integer(values, 'num_vcpus_per_socket') || 1,
        boot_type: 'LEGACY',
        boot_disk: {
          is_cdrom: false,
          is_empty: false,
          device_bus: 'SATA',
          vm_disk_clone: { image: text(values, 'image_name') },
        },
        vm_disks: [{
          is_cdrom: false,
          is_empty: false,
          device_bus: 'SCSI',
          vm_disk_create: {
            size_mib: 8192,
            storage_container: text(values, 'container_name') || 'SelfServiceContainer',
          },
        }],
        vm_nics: [{
          network: text(values, 'network_name'),
          ...(text(values, 'static_ip') ? { static_ip: text(values, 'static_ip') } : {}),
        }],
      }],
    })),
  },
  CreateVmsPc: {
    scriptId: 'CreateVmsPc',
    title: 'Create VMs (PC)',
    description: 'Creates Prism Central VM YAML for one VM on one cluster.',
    fields: [
      ...commonPcFields,
      { key: 'cluster_ip', label: 'Target Cluster IP', type: 'text', required: true, placeholder: '10.4.72.10' },
      { key: 'cluster_name', label: 'Cluster Name', type: 'text', placeholder: 'cluster-01' },
      { key: 'vm_name', label: 'VM Name', type: 'text', required: true, placeholder: 'app-01' },
      { key: 'image_names', label: 'Image Names', type: 'list', required: true, placeholder: 'rhel-9-template' },
      { key: 'network_name', label: 'Network Name', type: 'text', required: true, placeholder: 'vlan-110' },
      { key: 'static_ips', label: 'Static IPs', type: 'list', placeholder: '10.10.110.51' },
      { key: 'memory_mb', label: 'Memory MB', type: 'number', defaultValue: 4096 },
      { key: 'num_vcpus', label: 'vCPUs', type: 'number', defaultValue: 2 },
      { key: 'num_vcpus_per_socket', label: 'vCPUs per Socket', type: 'number', defaultValue: 1 },
      { key: 'power_state', label: 'Power State', type: 'select', defaultValue: 'ON', options: ['ON', 'OFF'] },
    ],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      clusters: {
        [text(values, 'cluster_ip')]: {
          ...(text(values, 'cluster_name') ? { name: text(values, 'cluster_name') } : {}),
          vms: [{
            name: text(values, 'vm_name'),
            num_vcpus: integer(values, 'num_vcpus') || 2,
            num_vcpus_per_socket: integer(values, 'num_vcpus_per_socket') || 1,
            memory_mb: integer(values, 'memory_mb') || 4096,
            include_cdrom: false,
            power_state: text(values, 'power_state') || 'ON',
            image_list: list(values, 'image_names'),
            hardware_clock_timezone: 'UTC',
            network: text(values, 'network_name'),
            ...(list(values, 'static_ips').length ? {
              ip_endpoint_list: list(values, 'static_ips').map(ip => ({ ip })),
            } : {}),
            boot_type: 'LEGACY',
          }],
        },
      },
    }),
  },
  DeployPC: {
    scriptId: 'DeployPC',
    title: 'Deploy Prism Central',
    description: 'Creates Prism Central deployment YAML for one PE cluster.',
    fields: [
      ...commonPeClusterFields,
      { key: 'cvm_credential', label: 'CVM Credential Ref', type: 'text', required: true, defaultValue: 'cvm_credential' },
      { key: 'pc_vm_name_prefix', label: 'PC VM Prefix', type: 'text', required: true, defaultValue: 'MGMT-PC' },
      { key: 'num_pc_vms', label: 'PC VM Count', type: 'select', defaultValue: '1', options: ['1', '3'] },
      { key: 'pc_size', label: 'PC Size', type: 'select', defaultValue: 'large', options: ['small', 'large', 'xlarge'] },
      { key: 'pc_vip', label: 'PC VIP', type: 'text', required: true, placeholder: '10.4.72.20' },
      { key: 'ip_list', label: 'PC VM IPs', type: 'list', required: true, placeholder: '10.4.72.21\n10.4.72.22\n10.4.72.23' },
      { key: 'network_name', label: 'Network Name', type: 'text', required: true, placeholder: 'MGMTVLAN0' },
      { key: 'container_name', label: 'Container', type: 'text', required: true, defaultValue: 'SelfServiceContainer' },
      { key: 'default_gateway', label: 'Gateway', type: 'text', required: true, placeholder: '10.4.72.1' },
      { key: 'subnet_mask', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0' },
      { key: 'dns_servers', label: 'DNS Servers', type: 'list', placeholder: '10.4.72.11\n10.4.72.12' },
      { key: 'ntp_servers', label: 'NTP Servers', type: 'list', placeholder: '0.pool.ntp.org\n1.pool.ntp.org' },
      { key: 'pc_version', label: 'PC Version', type: 'text', required: true, placeholder: 'pc.2024.3' },
      { key: 'file_url', label: 'PC Tar URL', type: 'text', required: true, placeholder: 'https://repo.local/pc.tar' },
      { key: 'metadata_file_url', label: 'Metadata URL', type: 'text', required: true, placeholder: 'https://repo.local/metadata.json' },
      { key: 'delete_existing_software', label: 'Delete Existing Software', type: 'boolean', defaultValue: false },
    ],
    build: values => toYaml(peCluster(values, {
      cvm_credential: text(values, 'cvm_credential'),
      deploy_pc_config: {
        file_url: text(values, 'file_url'),
        metadata_file_url: text(values, 'metadata_file_url'),
        pc_version: text(values, 'pc_version'),
        pc_vm_name_prefix: text(values, 'pc_vm_name_prefix') || 'MGMT-PC',
        num_pc_vms: Number(text(values, 'num_pc_vms') || 1),
        pc_size: text(values, 'pc_size') || 'large',
        pc_vip: text(values, 'pc_vip'),
        ip_list: list(values, 'ip_list'),
        ntp_server_list: list(values, 'ntp_servers'),
        dns_server_ip_list: list(values, 'dns_servers'),
        container_name: text(values, 'container_name'),
        network_name: text(values, 'network_name'),
        default_gateway: text(values, 'default_gateway'),
        subnet_mask: text(values, 'subnet_mask'),
        delete_existing_software: bool(values, 'delete_existing_software'),
      },
    })),
  },
  RegisterToPc: {
    scriptId: 'RegisterToPc',
    title: 'Register PE to PC',
    description: 'Creates Prism Element registration YAML for one cluster.',
    fields: [...commonPcFields, ...commonPeClusterFields],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      clusters: {
        [text(values, 'cluster_ip')]: {
          name: text(values, 'cluster_name'),
          pe_credential: text(values, 'pe_credential'),
        },
      },
    }),
  },
}

const pcVpcsSchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central VPC YAML.',
  fields: [
    ...commonPcFields,
    { key: 'vpc_names', label: 'VPC Names', type: 'list', required: true, placeholder: 'vpc-prod\nvpc-dr' },
    { key: 'vpc_type', label: 'VPC Type', type: 'select', defaultValue: 'REGULAR', options: ['REGULAR', 'TRANSIT'] },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Operations VPC' },
    { key: 'routable_ips', label: 'Routable IP CIDRs', type: 'list', placeholder: '10.10.0.0/16' },
    { key: 'dns', label: 'DNS CIDRs', type: 'list', placeholder: '10.4.72.0/24' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    vpcs: list(values, 'vpc_names').map(name => ({
      name,
      ...(scriptId !== 'DeleteVPC' ? {
        type: text(values, 'vpc_type') || 'REGULAR',
        ...(text(values, 'description') ? { description: text(values, 'description') } : {}),
        ...(list(values, 'routable_ips').length ? { routable_ips: list(values, 'routable_ips') } : {}),
        ...(list(values, 'dns').length ? { dns: list(values, 'dns') } : {}),
      } : {}),
    })),
  }),
})

const pcImageSchema = (scriptId: string, title: string, section: 'images' | 'ovas'): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates Prism Central ${section === 'images' ? 'image' : 'OVA'} YAML.`,
  fields: [
    ...commonPcFields,
    { key: 'artifact_name', label: section === 'images' ? 'Image Name' : 'OVA Name', type: 'text', required: true, placeholder: section === 'images' ? 'rhel-9-template' : 'app.ova' },
    { key: 'url', label: 'Source URL', type: 'text', placeholder: 'http://repo.local/image.qcow2' },
    { key: 'image_type', label: 'Image Type', type: 'select', defaultValue: 'DISK_IMAGE', options: ['DISK_IMAGE', 'ISO_IMAGE'] },
    { key: 'cluster_names', label: 'Cluster Names', type: 'list', placeholder: 'cluster-01\ncluster-02' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    [section]: [{
      name: text(values, 'artifact_name'),
      ...(scriptId.endsWith('Upload') ? {
        url: text(values, 'url'),
        ...(section === 'images' ? { image_type: text(values, 'image_type') || 'DISK_IMAGE' } : {}),
        ...(list(values, 'cluster_names').length ? { cluster_name_list: list(values, 'cluster_names') } : {}),
      } : {}),
    }],
  }),
})

const pcNamesSchema = (scriptId: string, title: string, section: string, label: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates Prism Central ${label.toLowerCase()} YAML.`,
  fields: [...commonPcFields, resourceNameField(label), extraPairsField],
  build: values => toYaml({
    ...pcBase(values),
    [section]: list(values, 'resource_names').map(name => ({ name, ...pairs(values, 'extra_pairs') })),
  }),
})

const pcCategorySchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central category YAML.',
  fields: [
    ...commonPcFields,
    { key: 'category_name', label: 'Category Name', type: 'text', required: true, placeholder: 'AppType' },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Application type' },
    { key: 'values', label: 'Values', type: 'list', required: scriptId === 'CreateCategoryPc', placeholder: 'CalmAppliance\nDatabase' },
    { key: 'delete_only_values', label: 'Delete Only Values', type: 'boolean', defaultValue: false },
  ],
  build: values => toYaml({
    ...pcBase(values),
    categories: [{
      name: text(values, 'category_name'),
      ...(text(values, 'description') ? { description: text(values, 'description') } : {}),
      ...(list(values, 'values').length ? { values: list(values, 'values') } : {}),
      ...(scriptId === 'DeleteCategoryPc' ? { delete_only_values: bool(values, 'delete_only_values') } : {}),
    }],
  }),
})

const peDeleteSchema = (scriptId: string, title: string, section: string, label: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates Prism Element ${label.toLowerCase()} delete YAML for one cluster.`,
  fields: [...commonPeClusterFields, resourceNameField(label)],
  build: values => toYaml(peCluster(values, {
    [section]: list(values, 'resource_names').map(name => ({ name })),
  })),
})

const peSubnetDeleteSchema: ScriptConfigSchema = {
  scriptId: 'DeleteSubnetsPe',
  title: 'Delete Subnets (PE)',
  description: 'Generates Prism Element subnet delete YAML for one cluster.',
  fields: [
    ...commonPeClusterFields,
    { key: 'subnet_name', label: 'Subnet Name', type: 'text', required: true, placeholder: 'vlan-110' },
    { key: 'vlan_id', label: 'VLAN ID', type: 'number', required: true, defaultValue: 110 },
  ],
  build: values => toYaml(peCluster(values, {
    networks: [{
      name: text(values, 'subnet_name'),
      vlan_id: integer(values, 'vlan_id'),
    }],
  })),
}

const peContainerDeleteSchema: ScriptConfigSchema = {
  scriptId: 'DeleteContainerPe',
  title: 'Delete Storage Container (PE)',
  description: 'Generates Prism Element storage container delete YAML for one cluster.',
  fields: [
    ...commonPeClusterFields,
    { key: 'container_name', label: 'Container Name', type: 'text', required: true, placeholder: 'SelfServiceContainer' },
    {
      key: 'replication_factor',
      label: 'Replication Factor',
      type: 'number',
      required: true,
      defaultValue: 1,
      help: 'ZTF validates this field before deleting by name. Match the target container/cluster replication factor.',
    },
  ],
  build: values => toYaml(peCluster(values, {
    containers: [{
      name: text(values, 'container_name'),
      replication_factor: integer(values, 'replication_factor') || 1,
    }],
  })),
}

const pcVmActionSchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central VM action YAML.',
  fields: [
    ...commonPcFields,
    { key: 'vm_names', label: 'VM Names', type: 'list', required: true, placeholder: 'app-01\napp-02' },
    { key: 'cluster_name', label: 'Cluster Name', type: 'text', required: true, placeholder: 'cluster-01' },
    ...(scriptId === 'PowerOnVmPc' ? [{ key: 'power_state', label: 'Power State', type: 'select', defaultValue: 'ON', options: ['ON'] } as ScriptConfigField] : []),
  ],
  build: values => toYaml({
    ...pcBase(values),
    vms: list(values, 'vm_names').map(name => ({
      name,
      cluster_name: text(values, 'cluster_name'),
      ...(scriptId === 'PowerOnVmPc' ? { power_state: text(values, 'power_state') || 'ON' } : {}),
    })),
  }),
})

const pePowerSchema: ScriptConfigSchema = {
  scriptId: 'PowerTransitionVmPe',
  title: 'Power Transition VM (PE)',
  description: 'Generates Prism Element VM power transition YAML for one cluster.',
  fields: [
    ...commonPeClusterFields,
    { key: 'vm_names', label: 'VM Names', type: 'list', required: true, placeholder: 'app-01\napp-02' },
    { key: 'transition', label: 'Power Transition', type: 'select', defaultValue: 'ON', options: ['ON', 'OFF', 'POWERCYCLE', 'RESET', 'PAUSE', 'RESUME'] },
  ],
  build: values => toYaml(peCluster(values, {
    vms: list(values, 'vm_names').map(name => ({
      name,
      transition: text(values, 'transition') || 'ON',
    })),
  })),
}

const pcToggleSchema = (scriptId: string, title: string, key: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates Prism Central ${title.toLowerCase()} YAML.`,
  fields: [
    ...commonPcFields,
    { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: !scriptId.startsWith('Disable') },
  ],
  build: values => toYaml({
    ...pcBase(values),
    [key]: bool(values, 'enabled'),
  }),
})

const roleMappingSchema = (scriptId: string, title: string, scope: 'pe' | 'pc'): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates ${scope === 'pe' ? 'Prism Element' : 'Prism Central'} AD role mapping YAML.`,
  fields: [
    ...(scope === 'pe' ? commonPeClusterFields : commonPcFields),
    ...directoryFields,
  ],
  build: values => {
    const directory = {
      directory_type: 'ACTIVE_DIRECTORY',
      ad_name: text(values, 'ad_name'),
      ad_domain: text(values, 'ad_domain'),
      ad_directory_url: text(values, 'ad_directory_url'),
      service_account_credential: text(values, 'service_account_credential'),
      role_mappings: roleMappings(values),
    }
    return toYaml(scope === 'pe'
      ? peCluster(values, { directory_services: directory })
      : { ...pcBase(values), pc_directory_services: directory })
  },
})

const localUsersSchema: ScriptConfigSchema = {
  scriptId: 'AddLocalUsers',
  title: 'Add Local Users (PC)',
  description: 'Generates Prism Central local user YAML.',
  fields: [
    ...commonPcFields,
    { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'ops.user' },
    { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'Ops' },
    { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'User' },
    { key: 'email', label: 'Email', type: 'text', placeholder: 'ops.user@example.com' },
    { key: 'password', label: 'Password', type: 'text', required: true, placeholder: 'Initial password' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    local_users: [{
      username: text(values, 'username'),
      password: text(values, 'password'),
      ...(text(values, 'first_name') ? { first_name: text(values, 'first_name') } : {}),
      ...(text(values, 'last_name') ? { last_name: text(values, 'last_name') } : {}),
      ...(text(values, 'email') ? { email: text(values, 'email') } : {}),
    }],
  }),
}

const importUsersSchema: ScriptConfigSchema = {
  scriptId: 'ImportUsers',
  title: 'Import Users (PC)',
  description: 'Generates Prism Central LDAP/SAML user import YAML.',
  fields: [
    ...commonPcFields,
    { key: 'usernames', label: 'Usernames', type: 'list', required: true, placeholder: 'jane@example.com\njohn@example.com' },
    { key: 'user_type', label: 'User Type', type: 'select', defaultValue: 'LDAP', options: ['LDAP', 'SAML', 'LOCAL'] },
    { key: 'idp', label: 'IDP Name', type: 'text', placeholder: 'corp-ad' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    users: list(values, 'usernames').map(username => ({
      username,
      user_type: text(values, 'user_type') || 'LDAP',
      ...(text(values, 'idp') ? { idp: text(values, 'idp') } : {}),
    })),
  }),
}

const samlIdpSchema: ScriptConfigSchema = {
  scriptId: 'CreateIdp',
  title: 'Create SAML IDP (PC)',
  description: 'Generates Prism Central SAML IDP YAML.',
  fields: [
    ...commonPcFields,
    { key: 'name', label: 'IDP Name', type: 'text', required: true, placeholder: 'Okta' },
    { key: 'metadata_url', label: 'Metadata URL', type: 'text', placeholder: 'https://idp.example.com/metadata' },
    { key: 'metadata_path', label: 'Metadata Path', type: 'text', placeholder: 'config/idp.xml' },
    { key: 'username_attr', label: 'Username Attribute', type: 'text', placeholder: 'username' },
    { key: 'email_attr', label: 'Email Attribute', type: 'text', placeholder: 'email' },
    { key: 'groups_attr', label: 'Groups Attribute', type: 'text', placeholder: 'groups' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    saml_idp_configs: [{
      name: text(values, 'name'),
      ...(text(values, 'metadata_url') ? { metadata_url: text(values, 'metadata_url') } : {}),
      ...(text(values, 'metadata_path') ? { metadata_path: text(values, 'metadata_path') } : {}),
      ...(text(values, 'username_attr') ? { username_attr: text(values, 'username_attr') } : {}),
      ...(text(values, 'email_attr') ? { email_attr: text(values, 'email_attr') } : {}),
      ...(text(values, 'groups_attr') ? { groups_attr: text(values, 'groups_attr') } : {}),
    }],
  }),
}

const pcDirectoryObjectsSchema: ScriptConfigSchema = {
  scriptId: 'AddDirectoryServices',
  title: 'Add Directory Services (PC)',
  description: 'Generates Prism Central Objects directory service YAML.',
  fields: [
    ...commonPcFields,
    ...directoryFields.filter(field => !['role_type', 'entity_type', 'entity_values'].includes(field.key)),
    { key: 'ad_users', label: 'AD Users', type: 'list', placeholder: 'jane@example.com\njohn@example.com' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    objects: {
      directory_services: [{
        ad_name: text(values, 'ad_name'),
        ad_domain: text(values, 'ad_domain'),
        ad_directory_url: text(values, 'ad_directory_url'),
        service_account_credential: text(values, 'service_account_credential'),
        ...(list(values, 'ad_users').length ? { ad_users: list(values, 'ad_users') } : {}),
      }],
    },
  }),
}

const objectStoreSchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central Objects object store and bucket YAML.',
  fields: [
    ...commonPcFields,
    { key: 'objectstore_name', label: 'Object Store Name', type: 'text', required: true, placeholder: 'objectstore01' },
    { key: 'domain', label: 'Domain', type: 'text', placeholder: 'objects.example.com' },
    { key: 'cluster', label: 'Cluster Name', type: 'text', placeholder: 'cluster-01' },
    { key: 'storage_network', label: 'Storage Network', type: 'text', placeholder: 'storage-vlan' },
    { key: 'public_network', label: 'Public Network', type: 'text', placeholder: 'public-vlan' },
    { key: 'static_ips', label: 'Static IPs', type: 'list', placeholder: '10.10.10.21\n10.10.10.22\n10.10.10.23\n10.10.10.24' },
    { key: 'num_worker_nodes', label: 'Worker Nodes', type: 'number', defaultValue: 1 },
    { key: 'bucket_names', label: 'Bucket Names', type: 'list', placeholder: 'bucket1\nbucket2' },
    { key: 'user_access_list', label: 'Bucket User Access List', type: 'list', placeholder: 'jane@example.com\njohn@example.com' },
  ],
  build: values => {
    const store: Record<string, unknown> = { name: text(values, 'objectstore_name') }
    if (!scriptId.startsWith('Delete')) {
      Object.assign(store, {
        domain: text(values, 'domain'),
        cluster: text(values, 'cluster'),
        storage_network: text(values, 'storage_network'),
        public_network: text(values, 'public_network'),
        static_ip_list: list(values, 'static_ips'),
        num_worker_nodes: integer(values, 'num_worker_nodes') || 1,
      })
      const bucketNames = list(values, 'bucket_names')
      if (bucketNames.length || scriptId === 'CreateBucket' || scriptId === 'ShareBucket') {
        store.buckets = bucketNames.map(name => ({
          name,
          ...(list(values, 'user_access_list').length ? { user_access_list: list(values, 'user_access_list') } : {}),
        }))
      }
    }
    return toYaml({ ...pcBase(values), objects: { objectstores: [store] } })
  },
})

const securityPolicySchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central Flow security policy YAML.',
  fields: [
    ...commonPcFields,
    { key: 'policy_names', label: 'Policy Names', type: 'list', required: true, placeholder: 'Example-AZ01-Calm' },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Example Security Policy' },
    { key: 'policy_mode', label: 'Policy Mode', type: 'select', defaultValue: 'MONITOR', options: ['MONITOR', 'APPLY'] },
    { key: 'target_category_key', label: 'Target Category Key', type: 'text', placeholder: 'AppType' },
    { key: 'target_category_value', label: 'Target Category Value', type: 'text', placeholder: 'CalmAppliance' },
    { key: 'allow_ipv6_traffic', label: 'Allow IPv6 Traffic', type: 'boolean', defaultValue: true },
    { key: 'hitlog', label: 'Hit Log', type: 'boolean', defaultValue: true },
  ],
  build: values => toYaml({
    ...pcBase(values),
    security_policies: list(values, 'policy_names').map(name => ({
      name,
      ...(scriptId.startsWith('Create') ? {
        ...(text(values, 'description') ? { description: text(values, 'description') } : {}),
        allow_ipv6_traffic: bool(values, 'allow_ipv6_traffic'),
        hitlog: bool(values, 'hitlog'),
        app_rule: {
          policy_mode: text(values, 'policy_mode') || 'MONITOR',
          target_group: {
            categories: {
              [text(values, 'target_category_key') || 'AppType']: text(values, 'target_category_value') || 'CalmAppliance',
            },
          },
          inbounds: [],
          outbounds: [],
        },
      } : {}),
    })),
  }),
})

const protectionPolicySchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central protection policy YAML.',
  fields: [
    ...commonPcFields,
    { key: 'rule_name', label: 'Protection Rule Name', type: 'text', required: true, placeholder: 'AZ01-AZ02-Calm' },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Example protection rule' },
    { key: 'category_key', label: 'Protected Category Key', type: 'text', placeholder: 'AppType' },
    { key: 'category_values', label: 'Protected Category Values', type: 'list', placeholder: 'CalmAppliance' },
    { key: 'source_az', label: 'Source Availability Zone', type: 'text', placeholder: '10.4.72.20' },
    { key: 'source_clusters', label: 'Source Clusters', type: 'list', placeholder: 'cluster-01' },
    { key: 'destination_az', label: 'Destination Availability Zone', type: 'text', placeholder: '10.4.80.20' },
    { key: 'destination_cluster', label: 'Destination Cluster', type: 'text', placeholder: 'cluster-dr' },
    { key: 'protection_type', label: 'Protection Type', type: 'select', defaultValue: 'ASYNC', options: ['ASYNC', 'SYNC'] },
    { key: 'rpo', label: 'RPO', type: 'number', defaultValue: 1 },
    { key: 'rpo_unit', label: 'RPO Unit', type: 'select', defaultValue: 'HOUR', options: ['MINUTE', 'HOUR', 'DAY', 'WEEK'] },
  ],
  build: values => toYaml({
    ...pcBase(values),
    protection_rules: [{
      name: text(values, 'rule_name'),
      ...(scriptId.startsWith('Create') ? {
        desc: text(values, 'description'),
        protected_categories: {
          [text(values, 'category_key') || 'AppType']: list(values, 'category_values'),
        },
        schedules: [{
          source: { availability_zone: text(values, 'source_az'), clusters: list(values, 'source_clusters') },
          destination: { availability_zone: text(values, 'destination_az'), cluster: text(values, 'destination_cluster') },
          protection_type: text(values, 'protection_type') || 'ASYNC',
          rpo: integer(values, 'rpo') || 1,
          rpo_unit: text(values, 'rpo_unit') || 'HOUR',
          snapshot_type: 'CRASH_CONSISTENT',
          local_retention_policy: { num_snapshots: 1 },
          remote_retention_policy: { num_snapshots: 1 },
        }],
      } : {}),
    }],
  }),
})

const recoveryPlanSchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central recovery plan YAML.',
  fields: [
    ...commonPcFields,
    { key: 'plan_names', label: 'Recovery Plan Names', type: 'list', required: true, placeholder: 'AZ01-RP-Calm' },
    { key: 'description', label: 'Description', type: 'text', placeholder: 'Example recovery plan' },
    { key: 'primary_az', label: 'Primary Availability Zone', type: 'text', placeholder: '10.4.72.20' },
    { key: 'recovery_az', label: 'Recovery Availability Zone', type: 'text', placeholder: '10.4.80.20' },
    { key: 'category_key', label: 'Stage Category Key', type: 'text', placeholder: 'AppType' },
    { key: 'category_value', label: 'Stage Category Value', type: 'text', placeholder: 'CalmAppliance' },
    { key: 'network_type', label: 'Network Type', type: 'select', defaultValue: 'NON_STRETCH', options: ['NON_STRETCH', 'STRETCH'] },
  ],
  build: values => toYaml({
    ...pcBase(values),
    recovery_plans: list(values, 'plan_names').map(name => ({
      name,
      ...(scriptId.startsWith('Create') ? {
        desc: text(values, 'description'),
        primary_location: { availability_zone: text(values, 'primary_az') },
        recovery_location: { availability_zone: text(values, 'recovery_az') },
        stages: [{ categories: [{ key: text(values, 'category_key') || 'AppType', value: text(values, 'category_value') || 'CalmAppliance' }] }],
        network_type: text(values, 'network_type') || 'NON_STRETCH',
      } : {}),
    })),
  }),
})

const remoteAzSchema = (scriptId: string, title: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: 'Generates Prism Central remote availability zone YAML.',
  fields: [
    ...commonPcFields,
    { key: 'remote_pc_ips', label: 'Remote PC IPs', type: 'list', required: true, placeholder: '10.4.80.20' },
    { key: 'remote_pc_credential', label: 'Remote PC Credential Ref', type: 'text', defaultValue: 'remote_pc_credentials' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    remote_azs: scriptId === 'DisconnectAz'
      ? list(values, 'remote_pc_ips')
      : Object.fromEntries(list(values, 'remote_pc_ips').map(ip => [ip, { pc_credential: text(values, 'remote_pc_credential') }])),
  }),
})

const initialPcSchema = (scriptId: string, title: string, scope: 'pc' | 'pe'): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates ${scope === 'pc' ? 'Prism Central' : 'Prism Element'} EULA/Pulse YAML.`,
  fields: [
    ...(scope === 'pc' ? commonPcFields : commonPeClusterFields),
    { key: 'username', label: 'EULA Username', type: 'text', required: true, placeholder: 'Nutanix' },
    { key: 'company_name', label: 'Company Name', type: 'text', required: true, placeholder: 'Company' },
    { key: 'job_title', label: 'Job Title', type: 'text', placeholder: 'Engineer' },
    { key: 'enable_pulse', label: 'Enable Pulse', type: 'boolean', defaultValue: true },
  ],
  build: values => {
    const body = {
      eula: { username: text(values, 'username'), company_name: text(values, 'company_name'), job_title: text(values, 'job_title') },
      enable_pulse: bool(values, 'enable_pulse'),
    }
    return toYaml(scope === 'pc' ? { ...pcBase(values), ...body } : peCluster(values, body))
  },
})

const haSchema = (scriptId: string, title: string, key: string): ScriptConfigSchema => ({
  scriptId,
  title,
  description: `Generates Prism Element ${title.toLowerCase()} YAML.`,
  fields: [
    ...commonPeClusterFields,
    { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true },
    ...(key === 'ha_reservation' ? [{ key: 'host_failures', label: 'Host Failures To Tolerate', type: 'number', defaultValue: 1 } as ScriptConfigField] : []),
  ],
  build: values => toYaml(peCluster(values, {
    [key]: key === 'ha_reservation'
      ? { enable_failover: bool(values, 'enabled'), num_host_failure_to_tolerate: integer(values, 'host_failures') || 1 }
      : bool(values, 'enabled'),
  })),
})

const updateDsipSchema: ScriptConfigSchema = {
  scriptId: 'UpdateDsip',
  title: 'Update DSIP (PE)',
  description: 'Generates Prism Element DSIP update YAML.',
  fields: [
    ...commonPeClusterFields,
    { key: 'dsip', label: 'DSIP', type: 'text', required: true, placeholder: 'get-ip-from-ipam or 10.4.72.30' },
    { key: 'ipam_subnet', label: 'IPAM Subnet', type: 'text', placeholder: '10.10.10.0/24' },
    { key: 'ipam_domain', label: 'IPAM Domain', type: 'text', placeholder: 'example.com' },
  ],
  build: values => toYaml({
    ...(text(values, 'ipam_subnet') || text(values, 'ipam_domain') ? {
      ipam_network: {
        ...(text(values, 'ipam_subnet') ? { subnet: text(values, 'ipam_subnet') } : {}),
        ...(text(values, 'ipam_domain') ? { domain: text(values, 'ipam_domain') } : {}),
      },
    } : {}),
    ...peCluster(values, { dsip: text(values, 'dsip') }),
  }),
}

const nkeSchema: ScriptConfigSchema = {
  scriptId: 'CreateKarbonClusterPc',
  title: 'Create NKE Cluster (PC)',
  description: 'Generates Nutanix Kubernetes Engine cluster YAML.',
  fields: [
    ...commonPcFields,
    { key: 'cluster_name', label: 'Target PE Cluster Name', type: 'text', required: true, placeholder: 'cluster-01' },
    { key: 'nke_name', label: 'NKE Cluster Name', type: 'text', required: true, placeholder: 'nke-dev-01' },
    { key: 'cluster_type', label: 'Cluster Type', type: 'select', defaultValue: 'DEV', options: ['DEV', 'PROD'] },
    { key: 'k8s_version', label: 'Kubernetes Version', type: 'text', defaultValue: '1.24.7-0' },
    { key: 'host_os', label: 'Host OS', type: 'text', defaultValue: 'ntnx-1.4' },
    { key: 'node_subnet', label: 'Node Subnet', type: 'text', required: true, placeholder: 'vlan110' },
    { key: 'network_provider', label: 'Network Provider', type: 'select', defaultValue: 'Calico', options: ['Calico', 'Flannel'] },
    { key: 'storage_container', label: 'Storage Container', type: 'text', required: true, placeholder: 'SelfServiceContainer' },
    { key: 'pe_credential', label: 'PE Credential Ref', type: 'text', defaultValue: 'pe_user' },
  ],
  build: values => toYaml({
    ...pcBase(values),
    nke_clusters: [{
      cluster: { name: text(values, 'cluster_name') },
      name: text(values, 'nke_name'),
      cluster_type: text(values, 'cluster_type') || 'DEV',
      k8s_version: text(values, 'k8s_version') || '1.24.7-0',
      host_os: text(values, 'host_os') || 'ntnx-1.4',
      node_subnet: { name: text(values, 'node_subnet') },
      cni: {
        node_cidr_mask_size: 24,
        service_ipv4_cidr: '172.19.0.0/16',
        pod_ipv4_cidr: '172.20.0.0/16',
        network_provider: text(values, 'network_provider') || 'Calico',
      },
      custom_node_configs: {
        etcd: { num_instances: 1, cpu: 4, memory_gb: 8, disk_gb: 40 },
        masters: { num_instances: 1, cpu: 2, memory_gb: 4, disk_gb: 120 },
        workers: { num_instances: 1, cpu: 8, memory_gb: 8, disk_gb: 120 },
      },
      storage_class: {
        pe_credential: text(values, 'pe_credential') || 'pe_user',
        default_storage_class: true,
        name: 'default-storageclass',
        reclaim_policy: 'Retain',
        storage_container: text(values, 'storage_container'),
        file_system: 'ext4',
        flash_mode: false,
      },
    }],
  }),
}

const ndbConfigSchema: ScriptConfigSchema = {
  scriptId: 'NdbConfig',
  title: 'Configure NDB',
  description: 'Generates Nutanix Database Service configuration YAML.',
  fields: [
    { key: 'cluster_ip', label: 'Deployment Cluster IP', type: 'text', required: true, placeholder: '10.4.72.10' },
    { key: 'pe_credential', label: 'PE Credential Ref', type: 'text', required: true, defaultValue: 'pe_user' },
    { key: 'ndb_credential', label: 'NDB Credential Ref', type: 'text', required: true, defaultValue: 'ndb_user' },
    { key: 'ndb_vm_name', label: 'NDB VM Name', type: 'text', required: true, defaultValue: 'ndb' },
    { key: 'image_name', label: 'NDB Image Name', type: 'text', placeholder: 'ndb-2.6.1' },
    { key: 'image_url', label: 'NDB Image URL', type: 'text', placeholder: 'https://repo.local/ndb.qcow2' },
    { key: 'network_name', label: 'VM Network', type: 'text', placeholder: 'vlan0-managed' },
    { key: 'static_ip', label: 'NDB VM IP', type: 'text', placeholder: '10.4.72.60' },
    { key: 'enable_pulse', label: 'Enable Pulse', type: 'boolean', defaultValue: true },
  ],
  build: values => toYaml({
    ndb: {
      deployment_cluster: {
        cluster_ip: text(values, 'cluster_ip'),
        pe_credential: text(values, 'pe_credential'),
        ndb_vm_name: text(values, 'ndb_vm_name'),
        ...(text(values, 'image_name') && text(values, 'image_url') ? {
          images: [{ name: text(values, 'image_name'), url: text(values, 'image_url'), image_type: 'DISK_IMAGE', container_name: 'SelfServiceContainer' }],
        } : {}),
        ...(text(values, 'network_name') ? {
          ndb_vm_config: {
            hypervisor_type: 'AHV',
            timezone: 'UTC',
            memory_mb: 32768,
            num_vcpus: 16,
            num_cores_per_vcpu: 1,
            boot_type: 'LEGACY',
            boot_disk: { is_cdrom: false, is_empty: false, device_bus: 'SCSI', vm_disk_clone: { image: text(values, 'image_name') } },
            vm_nics: [{ network: text(values, 'network_name'), ...(text(values, 'static_ip') ? { static_ip: text(values, 'static_ip') } : {}) }],
          },
        } : {}),
      },
      ndb_credential: text(values, 'ndb_credential'),
      enable_pulse: bool(values, 'enable_pulse'),
    },
  }),
}

const registerNdbSchema: ScriptConfigSchema = {
  scriptId: 'RegisterInitClusterNdb',
  title: 'Register NDB Cluster',
  description: 'Generates NDB initial cluster registration YAML.',
  fields: [
    { key: 'ndb_ip', label: 'NDB IP', type: 'text', required: true, placeholder: '10.4.72.60' },
    { key: 'ndb_session', label: 'NDB Session Ref', type: 'text', required: true, placeholder: 'ndb_session' },
    { key: 'cluster_name', label: 'Cluster Name', type: 'text', required: true, placeholder: 'cluster-01' },
    { key: 'cluster_ip', label: 'Cluster IP', type: 'text', required: true, placeholder: '10.4.72.10' },
    { key: 'pe_credential', label: 'PE Credential Ref', type: 'text', required: true, defaultValue: 'pe_user' },
  ],
  build: values => toYaml({
    ndb_ip: text(values, 'ndb_ip'),
    ndb_session: text(values, 'ndb_session'),
    register_clusters: [{ name: text(values, 'cluster_name'), cluster_ip: text(values, 'cluster_ip'), pe_credential: text(values, 'pe_credential') }],
  }),
}

const uploadImagePeSchema: ScriptConfigSchema = {
  scriptId: 'UploadImagePe',
  title: 'Upload Image (PE)',
  description: 'Generates Prism Element image upload YAML.',
  fields: [
    ...commonPeClusterFields,
    { key: 'image_name', label: 'Image Name', type: 'text', required: true, placeholder: 'rhel-9-template' },
    { key: 'url', label: 'Image URL', type: 'text', required: true, placeholder: 'https://repo.local/image.qcow2' },
    { key: 'image_type', label: 'Image Type', type: 'select', defaultValue: 'DISK_IMAGE', options: ['DISK_IMAGE', 'ISO_IMAGE'] },
    { key: 'container_name', label: 'Container Name', type: 'text', placeholder: 'SelfServiceContainer' },
  ],
  build: values => toYaml(peCluster(values, {
    images: [{
      name: text(values, 'image_name'),
      url: text(values, 'url'),
      image_type: text(values, 'image_type') || 'DISK_IMAGE',
      ...(text(values, 'container_name') ? { container_name: text(values, 'container_name') } : {}),
    }],
  })),
}

const updateCvmFoundationSchema: ScriptConfigSchema = {
  scriptId: 'UpdateCvmFoundation',
  title: 'Update CVM Foundation',
  description: 'Generates CVM Foundation update YAML.',
  fields: [
    { key: 'cvm_ips', label: 'CVM IPs', type: 'list', required: true, placeholder: '10.4.72.11\n10.4.72.12' },
    { key: 'cvm_credential', label: 'CVM Credential Ref', type: 'text', required: true, defaultValue: 'cvm_credential' },
    { key: 'foundation_build_url', label: 'Foundation Build URL', type: 'text', required: true, placeholder: 'https://repo.local/foundation.tar.gz' },
    { key: 'foundation_version', label: 'Foundation Version', type: 'text', required: true, placeholder: '5.x' },
    { key: 'nameserver', label: 'Nameserver', type: 'text', placeholder: '10.4.72.11' },
    { key: 'downgrade', label: 'Downgrade', type: 'boolean', defaultValue: false },
  ],
  build: values => toYaml({
    cvms: Object.fromEntries(list(values, 'cvm_ips').map(ip => [ip, {
      cvm_credential: text(values, 'cvm_credential'),
      foundation_build_url: text(values, 'foundation_build_url'),
      foundation_version: text(values, 'foundation_version'),
      ...(text(values, 'nameserver') ? { nameserver: text(values, 'nameserver') } : {}),
      ...(bool(values, 'downgrade') ? { downgrade: true } : {}),
    }])),
  }),
}

const FIELD_GUIDED_SCRIPT_CONFIG_SCHEMAS: Record<string, ScriptConfigSchema> = {
  CreateRoleMappingPe: roleMappingSchema('CreateRoleMappingPe', 'Create Role Mapping (PE)', 'pe'),
  CreateRoleMappingPc: roleMappingSchema('CreateRoleMappingPc', 'Create Role Mapping (PC)', 'pc'),
  CreateIdp: samlIdpSchema,
  AddLocalUsers: localUsersSchema,
  ImportUsers: importUsersSchema,
  AddDirectoryServices: pcDirectoryObjectsSchema,
  CreateSubnetsPc: {
    scriptId: 'CreateSubnetsPc',
    title: 'Create Subnets (PC)',
    description: 'Generates Prism Central subnet YAML using the ZTF subnet example shape.',
    fields: [
      ...commonPcFields,
      ...commonPeFields,
      { key: 'cluster_name', label: 'Cluster Name', type: 'text', placeholder: 'cluster-01' },
      { key: 'subnet_name', label: 'Subnet Name', type: 'text', required: true, placeholder: 'vlan-110' },
      { key: 'vlan_id', label: 'VLAN ID', type: 'number', required: true, defaultValue: 110 },
      { key: 'network_ip', label: 'Network IP', type: 'text', placeholder: '10.10.110.0' },
      { key: 'network_prefix', label: 'Prefix', type: 'number', defaultValue: 24 },
      { key: 'default_gateway_ip', label: 'Gateway', type: 'text', placeholder: '10.10.110.1' },
      { key: 'pool_range', label: 'IP Pool Range', type: 'text', placeholder: '10.10.110.50 10.10.110.100' },
      { key: 'dhcp_dns_servers', label: 'DHCP DNS Servers', type: 'list', placeholder: '10.4.72.11\n10.4.72.12' },
      { key: 'dhcp_domain', label: 'DHCP Domain', type: 'text', placeholder: 'corp.example.com' },
    ],
    build: values => toYaml({
      ...pcBase(values),
      clusters: {
        [text(values, 'cluster_ip')]: {
          ...(text(values, 'cluster_name') ? { name: text(values, 'cluster_name') } : {}),
          pe_credential: text(values, 'pe_credential'),
          networks: [{
            name: text(values, 'subnet_name'),
            subnet_type: 'VLAN',
            vlan_id: integer(values, 'vlan_id'),
            ip_config: {
              ...(text(values, 'network_ip') ? { network_ip: text(values, 'network_ip') } : {}),
              ...(integer(values, 'network_prefix') ? { network_prefix: integer(values, 'network_prefix') } : {}),
              ...(text(values, 'default_gateway_ip') ? { default_gateway_ip: text(values, 'default_gateway_ip') } : {}),
              ...(text(values, 'pool_range') ? { pool_list: [{ range: text(values, 'pool_range') }] } : {}),
              ...(list(values, 'dhcp_dns_servers').length || text(values, 'dhcp_domain') ? {
                dhcp_options: {
                  ...(list(values, 'dhcp_dns_servers').length ? { domain_name_server_list: list(values, 'dhcp_dns_servers') } : {}),
                  ...(text(values, 'dhcp_domain') ? { domain_search_list: [text(values, 'dhcp_domain')], domain_name: text(values, 'dhcp_domain') } : {}),
                },
              } : {}),
            },
          }],
        },
      },
    }),
  },
  DeleteSubnetsPe: peSubnetDeleteSchema,
  DeleteSubnetsPc: {
    scriptId: 'DeleteSubnetsPc',
    title: 'Delete Subnets (PC)',
    description: 'Generates Prism Central subnet delete YAML for one cluster.',
    fields: [...commonPcFields, ...commonPeFields, { key: 'subnet_names', label: 'Subnet Names', type: 'list', required: true, placeholder: 'vlan-110' }],
    build: values => toYaml({
      ...pcBase(values),
      clusters: {
        [text(values, 'cluster_ip')]: {
          pe_credential: text(values, 'pe_credential'),
          networks: list(values, 'subnet_names').map(name => ({ name })),
        },
      },
    }),
  },
  CreateVPC: pcVpcsSchema('CreateVPC', 'Create VPC (PC)'),
  UpdateVPC: pcVpcsSchema('UpdateVPC', 'Update VPC (PC)'),
  DeleteVPC: pcVpcsSchema('DeleteVPC', 'Delete VPC (PC)'),
  DeleteContainerPe: peContainerDeleteSchema,
  DeleteVmPe: peDeleteSchema('DeleteVmPe', 'Delete VM (PE)', 'vms', 'VM Names'),
  DeleteVmPc: pcVmActionSchema('DeleteVmPc', 'Delete VM (PC)'),
  PowerOnVmPc: pcVmActionSchema('PowerOnVmPc', 'Power On VM (PC)'),
  PowerTransitionVmPe: pePowerSchema,
  PcImageUpload: pcImageSchema('PcImageUpload', 'Upload Image (PC)', 'images'),
  PcImageDelete: pcImageSchema('PcImageDelete', 'Delete Image (PC)', 'images'),
  PcOVAUpload: pcImageSchema('PcOVAUpload', 'Upload OVA (PC)', 'ovas'),
  PcOVADelete: pcImageSchema('PcOVADelete', 'Delete OVA (PC)', 'ovas'),
  CreateCategoryPc: pcCategorySchema('CreateCategoryPc', 'Create Category (PC)'),
  DeleteCategoryPc: pcCategorySchema('DeleteCategoryPc', 'Delete Category (PC)'),
  CreateAddressGroups: pcNamesSchema('CreateAddressGroups', 'Create Address Groups (PC)', 'address_groups', 'Address Group Names'),
  DeleteAddressGroups: pcNamesSchema('DeleteAddressGroups', 'Delete Address Groups (PC)', 'address_groups', 'Address Group Names'),
  CreateServiceGroups: pcNamesSchema('CreateServiceGroups', 'Create Service Groups (PC)', 'service_groups', 'Service Group Names'),
  DeleteServiceGroups: pcNamesSchema('DeleteServiceGroups', 'Delete Service Groups (PC)', 'service_groups', 'Service Group Names'),
  AddUserGroups: pcNamesSchema('AddUserGroups', 'Add User Groups (PC)', 'user_groups', 'User Group Names'),
  AddRoles: pcNamesSchema('AddRoles', 'Add Roles (PC)', 'roles', 'Role Names'),
  EnableNetworkController: pcToggleSchema('EnableNetworkController', 'Enable Network Controller (PC)', 'enable_network_controller'),
  DisableNetworkController: pcToggleSchema('DisableNetworkController', 'Disable Network Controller (PC)', 'enable_network_controller'),
  CreateObjectStore: objectStoreSchema('CreateObjectStore', 'Create Object Store (PC)'),
  DeleteObjectStore: objectStoreSchema('DeleteObjectStore', 'Delete Object Store (PC)'),
  CreateBucket: objectStoreSchema('CreateBucket', 'Create Bucket (PC)'),
  ShareBucket: objectStoreSchema('ShareBucket', 'Share Bucket (PC)'),
  UploadImagePe: uploadImagePeSchema,
  CreateNetworkSecurityPolicy: securityPolicySchema('CreateNetworkSecurityPolicy', 'Create Security Policy (PC)'),
  DeleteNetworkSecurityPolicy: securityPolicySchema('DeleteNetworkSecurityPolicy', 'Delete Security Policy (PC)'),
  CreateKarbonClusterPc: nkeSchema,
  EnableNke: pcToggleSchema('EnableNke', 'Enable NKE (PC)', 'enable_nke'),
  NdbConfig: ndbConfigSchema,
  RegisterInitClusterNdb: registerNdbSchema,
  EnableMicrosegmentation: pcToggleSchema('EnableMicrosegmentation', 'Enable Microsegmentation (PC)', 'enable_microsegmentation'),
  DisableMicrosegmentation: pcToggleSchema('DisableMicrosegmentation', 'Disable Microsegmentation (PC)', 'enable_microsegmentation'),
  EnableObjects: pcToggleSchema('EnableObjects', 'Enable Objects (PC)', 'enable_objects'),
  EnableDR: pcToggleSchema('EnableDR', 'Enable DR (PC)', 'enable_dr'),
  CreateProtectionPolicy: protectionPolicySchema('CreateProtectionPolicy', 'Create Protection Policy (PC)'),
  DeleteProtectionPolicy: protectionPolicySchema('DeleteProtectionPolicy', 'Delete Protection Policy (PC)'),
  CreateRecoveryPlan: recoveryPlanSchema('CreateRecoveryPlan', 'Create Recovery Plan (PC)'),
  DeleteRecoveryPlan: recoveryPlanSchema('DeleteRecoveryPlan', 'Delete Recovery Plan (PC)'),
  ConnectToAz: remoteAzSchema('ConnectToAz', 'Connect Availability Zone (PC)'),
  DisconnectAz: remoteAzSchema('DisconnectAz', 'Disconnect Availability Zone (PC)'),
  EnableFC: pcToggleSchema('EnableFC', 'Enable Foundation Central (PC)', 'enable_fc'),
  GenerateFcApiKey: {
    scriptId: 'GenerateFcApiKey',
    title: 'Generate FC API Key',
    description: 'Generates Foundation Central API key YAML.',
    fields: [...commonPcFields, { key: 'fc_alias_key_name', label: 'FC Alias Key Name', type: 'text', required: true, placeholder: 'fc-api-key' }],
    build: values => toYaml({ ...pcBase(values), fc_alias_key_name: text(values, 'fc_alias_key_name') }),
  },
  EnableMarketplace: pcToggleSchema('EnableMarketplace', 'Enable Marketplace (PC)', 'enable_marketplace'),
  AcceptEulaPe: initialPcSchema('AcceptEulaPe', 'Accept EULA (PE)', 'pe'),
  AcceptEulaPc: initialPcSchema('AcceptEulaPc', 'Accept EULA (PC)', 'pc'),
  UpdatePulsePe: haSchema('UpdatePulsePe', 'Update Pulse (PE)', 'enable_pulse'),
  UpdatePulsePc: pcToggleSchema('UpdatePulsePc', 'Update Pulse (PC)', 'enable_pulse'),
  HaReservation: haSchema('HaReservation', 'Set HA Reservation (PE)', 'ha_reservation'),
  RebuildCapacityReservation: haSchema('RebuildCapacityReservation', 'Set Rebuild Capacity (PE)', 'enable_rebuild_reservation'),
  UpdateDsip: updateDsipSchema,
  UpdateCvmFoundation: updateCvmFoundationSchema,
}

const ALL_SCRIPT_CONFIG_SCHEMAS: Record<string, ScriptConfigSchema> = {
  ...EXACT_SCRIPT_CONFIG_SCHEMAS,
  ...FIELD_GUIDED_SCRIPT_CONFIG_SCHEMAS,
}

function exampleForField(field: ScriptConfigField): string | number | boolean {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === 'boolean') return false
  if (field.type === 'number') return 1
  if (field.options?.length) return field.options[0]
  const key = field.key.toLowerCase()
  if (key.includes('pc_ip')) return '10.4.72.20'
  if (key.includes('cluster_ip')) return '10.4.72.10'
  if (key.includes('cvm_ip')) return '10.4.72.11'
  if (key.includes('remote_pc_ips')) return '10.4.80.20'
  if (key.includes('ip')) return field.type === 'list' ? '10.4.72.50' : '10.4.72.50'
  if (key.includes('credential')) return field.key.includes('cvm') ? 'cvm_credential' : field.key.includes('pe') ? 'pe_user' : 'pc_user'
  if (key.includes('name')) return field.type === 'list' ? 'ztf-wizard-test-01' : 'ztf-wizard-test-01'
  if (key.includes('url')) return 'https://repo.local/artifact.bin'
  if (key.includes('domain')) return 'example.local'
  if (key.includes('email')) return 'ztf-wizard-test@example.local'
  if (field.placeholder) return field.placeholder.split('\n')[0].replace(/<[^>]+>/g, 'ztf-wizard-test').trim()
  return field.type === 'list' ? 'ztf-wizard-test-01' : 'ztf-wizard-test'
}

function withGuidance(schema: ScriptConfigSchema): ScriptConfigSchema {
  const required = schema.fields.filter(field => field.required)
  const riskLevel = DESTRUCTIVE_SCRIPT_IDS.has(schema.scriptId) ? 'destructive' : schema.riskLevel ?? 'low'
  return {
    ...schema,
    riskLevel,
    confirmationPhrase: riskLevel === 'destructive' ? `RUN ${schema.scriptId}` : schema.confirmationPhrase,
    requiredNotes: schema.requiredNotes ?? required.map(field => `${field.label} is required.`),
    exampleValues: schema.exampleValues ?? Object.fromEntries(schema.fields.map(field => [field.key, exampleForField(field)])),
  }
}

const missingScriptConfigSchemas = SCRIPTS
  .filter(script => !ALL_SCRIPT_CONFIG_SCHEMAS[script.id])
  .map(script => script.id)

if (missingScriptConfigSchemas.length) {
  throw new Error(`Missing script config schemas: ${missingScriptConfigSchemas.join(', ')}`)
}

export const SCRIPT_CONFIG_SCHEMAS: Record<string, ScriptConfigSchema> = SCRIPTS.reduce<Record<string, ScriptConfigSchema>>((schemas, script) => {
  schemas[script.id] = withGuidance(ALL_SCRIPT_CONFIG_SCHEMAS[script.id])
  return schemas
}, {})

export const SCRIPT_CONFIG_SCHEMA_IDS = Object.keys(SCRIPT_CONFIG_SCHEMAS)
