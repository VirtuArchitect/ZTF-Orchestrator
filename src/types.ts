export type WorkflowCategory = 'Infrastructure' | 'Prism Central' | 'Configuration' | 'Pod Operations' | 'Workloads' | 'Services'

export interface WorkflowDef {
  id: string
  name: string
  description: string
  category: WorkflowCategory
  icon: string
  configFile: string
  details: string
}

export interface ScriptDef {
  id: string
  name: string
  category: string
  description: string
}

export interface Credential {
  ref: string
  username: string
  password: string
}

export interface GlobalConfig {
  vault_to_use: 'local' | 'cyberark'
  ip_allocation_method: 'static' | 'infoblox'
  vaults: {
    local?: {
      credentials: Record<string, { username: string; password: string }>
    }
    cyberark?: {
      host: string
      cert_file: string
      key_file: string
      credentials: Record<string, { username: string; password: string }>
    }
  }
  infoblox?: {
    host: string
    username: string
    password: string
    dns_view: string
    network_view: string
  }
}

export interface Execution {
  id: string
  workflow: string
  type: 'workflow' | 'script'
  command: string
  status: 'running' | 'success' | 'failed'
  duration?: number
  timestamp: string
  configFile?: string
}

export interface SystemCheck {
  name: string
  ok: boolean
  value: string | null
}

export interface Settings {
  ztfPath: string
  pythonPath: string
  configDir: string
  repoUrl: string
  webhookUrl: string
}

// Workflow config types

export interface NodeDetail {
  node_serial?: string
  cvm_ip: string
  host_ip: string
  ipmi_ip?: string
  cvm_vlan_id?: number
  hypervisor_hostname?: string
  cvm_ram?: number
}

export interface ClusterSpec {
  cluster_name: string
  cluster_vip: string
  redundancy_factor: 2 | 3
  cluster_size?: number
  cvm_ram?: number
  timezone?: string
  node_details?: NodeDetail[]
}

export interface NetworkSettings {
  name_servers_list: string[]
  ntp_servers_list: string[]
  cvm_gateway?: string
  cvm_netmask?: string
  ipmi_gateway?: string
  ipmi_netmask?: string
}

export interface ImagingParameters {
  aos_url: string
  aos_checksum?: string
  hypervisor_type: 'kvm' | 'esx' | 'hyperv'
  hypervisor_url: string
  hypervisor_checksum?: string
}

export interface SiteSpec {
  site_name: string
  use_existing_network_settings: boolean
  re_image: boolean
  imaging_parameters?: ImagingParameters
  network?: {
    host_subnet: string
    host_gateway: string
    ipmi_subnet?: string
    ipmi_gateway?: string
    domain?: string
  }
  clusters: ClusterSpec[]
  name_servers_list?: string[]
  ntp_servers_list?: string[]
}

export interface VlanConfig {
  name: string
  vlan_id: number
  network_ip?: string
  network_prefix?: number
  default_gw_ip?: string
  dhcp_domain_name?: string
  dhcp_domain_search?: string
  ip_pools?: Array<{ range: string }>
}

export interface StorageContainer {
  name: string
  replication_factor?: number
  compression?: boolean
  dedup?: boolean
  erasure_coding?: boolean
}

export interface ADConfig {
  ad_server_ip: string
  ad_name: string
  ad_domain: string
  service_account_username?: string
  service_account_password?: string
  role_mappings?: Array<{
    role: string
    entity_type: string
    entity_values: string[]
  }>
}

export interface ClusterConfigSpec {
  cluster_ip: string
  name_servers_list?: string[]
  ntp_servers_list?: string[]
  eula?: {
    username: string
    company_name: string
    job_title: string
  }
  enable_pulse?: boolean
  active_directory?: ADConfig
  storage_containers?: StorageContainer[]
  networks?: VlanConfig[]
  ha_reservation?: boolean
  rebuild_reservation?: boolean
}
