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
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'interrupted'
  duration?: number
  timestamp: string
  configFile?: string
  configContent?: string
}

export type ExecutionJobStatus = 'queued' | 'running' | 'cancelling' | 'success' | 'failed' | 'cancelled' | 'interrupted'

export interface ExecutionJobLogEvent {
  type: 'start' | 'stdout' | 'stderr' | 'error' | 'done' | 'job' | string
  data: unknown
  ts: string
}

export interface ExecutionProgress {
  phase: string
  percent: number
  detail?: string
  estimated: boolean
  updatedAt?: string
}

export interface ExecutionJob {
  id: string
  status: ExecutionJobStatus
  workflow: string
  type: 'workflow' | 'script' | 'nkp'
  framework?: 'ztf' | 'nkp' | string
  user: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  returnCode?: number | null
  progress?: ExecutionProgress
  logs?: ExecutionJobLogEvent[]
}

export interface SystemCheck {
  name: string
  ok: boolean
  value: string | null
}

export interface PipelineStep {
  workflow:   string
  configFile: string
}

export interface Pipeline {
  id:        string
  name:      string
  steps:     PipelineStep[]
  createdAt: string
  updatedAt: string
}

export interface PipelineStepResult {
  step:       number
  workflow:   string
  configFile?: string
  status:     'success' | 'failed' | 'skipped' | 'running'
  returnCode?: number
}

export interface Settings {
  ztfPath: string
  nkpPath: string
  pythonPath: string
  configDir: string
  repoUrl: string
  nkpRepoUrl: string
  webhookUrl: string
  activeProfileId: string
  connectionProfiles: ConnectionProfile[]
}

export interface ConnectionProfile {
  id: string
  name: string
  description?: string
  environment: 'lab' | 'preprod' | 'production' | 'customer' | 'other'
  prismCentral: {
    endpoint: string
    credentialRef: string
    remoteCredentialRef: string
    defaultPcVersion: string
    enableObjects: boolean
    enableNke: boolean
    enableFlow: boolean
    enableNetworkController: boolean
  }
  foundationCentral: {
    endpoint: string
    credentialRef: string
    apiKeyRef: string
    aosUrl: string
    hypervisorType: 'kvm' | 'esx' | 'hyperv'
    hypervisorUrl: string
    foundationVersion: string
  }
  prismElement: {
    defaultClusterVip: string
    peCredentialRef: string
    cvmCredentialRef: string
    storageContainer: string
    networkName: string
  }
  ncm: {
    endpoint: string
    credentialRef: string
    projectName: string
    accountName: string
  }
  directory: {
    domain: string
    ldapUrl: string
    serviceAccountCredentialRef: string
    defaultGroups: string
  }
  ipam: {
    method: 'static' | 'infoblox'
    infobloxHost: string
    credentialRef: string
    dnsView: string
    networkView: string
  }
  defaults: {
    dnsServers: string
    ntpServers: string
    timezone: string
    siteCode: string
  }
}

export type DriftStatus = 'matched' | 'drifted' | 'unknown'
export type DriftFindingStatus = 'matched' | 'changed' | 'missing' | 'unexpected'

export interface DriftFinding {
  path: string
  status: DriftFindingStatus
  desired: unknown
  observed: unknown
}

export interface DriftRun {
  id: string
  configFile: string
  workflow?: string
  status: DriftStatus
  baseline: 'last_applied' | 'current_state'
  observedLabel: string
  appliedExecutionId?: string | null
  summary: {
    matched: number
    changed: number
    missing: number
    unexpected: number
    total: number
  }
  findings: DriftFinding[]
  timestamp: string
  user: string
  message?: string
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

// ── Scheduled executions ──────────────────────────────────────────────────────

export interface Schedule {
  id:            string
  name:          string
  workflow:      string
  script:        string
  configFile:    string
  configContent: string
  cronExpr:      string
  enabled:       boolean
  createdAt:     string
  nextRun:       string | null
  lastRun:       string | null
  lastStatus:    'success' | 'failed' | 'error' | null
}

// ── Parallel execution ─────────────────────────────────────────────────────────

export interface ParallelSiteResult {
  label:       string
  status:      'pending' | 'running' | 'success' | 'failed' | 'error'
  returnCode:  number | null
  output:      string
  startedAt:   string | null
  finishedAt:  string | null
}

export interface ParallelRun {
  id:          string
  workflow:    string
  user:        string
  status:      'running' | 'success' | 'partial' | 'failed' | 'unknown'
  sites:       ParallelSiteResult[]
  startedAt:   string
  finishedAt:  string | null
}

export interface ParallelSiteInput {
  label:         string
  configContent: string
  configFile?:   string
}

// ── Approval gates ─────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export interface ApprovalRequest {
  id:            string
  workflow:      string
  configFile:    string
  configContent: string
  requestedBy:   string
  requestedAt:   string
  expiresAt:     string
  status:        ApprovalStatus
  decidedBy:     string | null
  decidedAt:     string | null
  notes:         string
  pipelineId:    string | null
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
