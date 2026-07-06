import type { ScriptConfigField, ScriptConfigSchema } from './types'
import { toYaml } from './utils/yaml'

type Values = Record<string, string | number | boolean>

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

const commonPeFields: ScriptConfigField[] = [
  { key: 'cluster_ip', label: 'Prism Element IP', type: 'text', required: true, placeholder: '10.4.72.10' },
  { key: 'pe_credential', label: 'PE Credential Ref', type: 'text', required: true, defaultValue: 'pe_user' },
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
        pe_credential: text(values, 'pe_credential'),
        ...body,
      },
    },
  }
}

export const SCRIPT_CONFIG_SCHEMAS: Record<string, ScriptConfigSchema> = {
  AddAdServerPe: {
    scriptId: 'AddAdServerPe',
    title: 'Add AD Server (PE)',
    description: 'Creates Prism Element Active Directory configuration and optional role mapping YAML.',
    fields: [...commonPeFields, ...directoryFields],
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
    fields: [...commonPeFields, { key: 'dns_servers', label: 'DNS Servers', type: 'list', required: true, placeholder: '10.4.72.11\n10.4.72.12' }],
    build: values => toYaml(peCluster(values, { name_servers_list: list(values, 'dns_servers') })),
  },
  AddNtpServersPe: {
    scriptId: 'AddNtpServersPe',
    title: 'Add NTP Servers (PE)',
    description: 'Creates Prism Element NTP server YAML for one cluster.',
    fields: [...commonPeFields, { key: 'ntp_servers', label: 'NTP Servers', type: 'list', required: true, placeholder: '0.pool.ntp.org\n1.pool.ntp.org' }],
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
    build: values => toYaml(peCluster(values, {
      ...(text(values, 'cluster_name') ? { name: text(values, 'cluster_name') } : {}),
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
      ...commonPeFields,
      { key: 'container_name', label: 'Container Name', type: 'text', required: true, placeholder: 'SelfServiceContainer' },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', defaultValue: 2 },
      { key: 'advertised_capacity_gb', label: 'Advertised Capacity GB', type: 'number', defaultValue: 1024 },
      { key: 'reserved_gb', label: 'Reserved GB', type: 'number', defaultValue: 0 },
      { key: 'compression_enabled', label: 'Compression', type: 'boolean', defaultValue: true },
      { key: 'erasure_code', label: 'Erasure Code', type: 'select', defaultValue: 'OFF', options: ['OFF', 'ON'] },
      { key: 'on_disk_dedup', label: 'On-Disk Dedup', type: 'select', defaultValue: 'OFF', options: ['OFF', 'ON'] },
    ],
    build: values => toYaml(peCluster(values, {
      containers: [{
        name: text(values, 'container_name'),
        replication_factor: integer(values, 'replication_factor') || 2,
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
      ...commonPeFields,
      { key: 'cluster_name', label: 'Cluster Name', type: 'text', placeholder: 'cluster-01' },
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
      ...(text(values, 'cluster_name') ? { name: text(values, 'cluster_name') } : {}),
      vms: [{
        name: text(values, 'vm_name'),
        hypervisor_type: 'AHV',
        timezone: 'UTC',
        memory_mb: integer(values, 'memory_mb') || 4096,
        num_vcpus: integer(values, 'num_vcpus') || 2,
        num_cores_per_vcpu: integer(values, 'cores_per_vcpu') || 1,
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
      ...commonPeFields,
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
    fields: [...commonPcFields, ...commonPeFields],
    build: values => toYaml({
      pc_ip: text(values, 'pc_ip'),
      pc_credential: text(values, 'pc_credential'),
      clusters: {
        [text(values, 'cluster_ip')]: {
          pe_credential: text(values, 'pe_credential'),
        },
      },
    }),
  },
}

export const SCRIPT_CONFIG_SCHEMA_IDS = Object.keys(SCRIPT_CONFIG_SCHEMAS)
