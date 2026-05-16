import yaml from 'js-yaml'

export function toYaml(obj: unknown): string {
  return yaml.dump(obj, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  })
}

export function fromYaml(str: string): unknown {
  return yaml.load(str)
}

export function buildGlobalYaml(config: {
  vaultToUse: string
  ipAllocationMethod: string
  credentials: Array<{ ref: string; username: string; password: string }>
  cyberark?: { host: string; certFile: string; keyFile: string }
  infoblox?: { host: string; username: string; password: string; dnsView: string; networkView: string }
}): string {
  const credMap: Record<string, { username: string; password: string }> = {}
  config.credentials.forEach(c => {
    credMap[c.ref] = { username: c.username, password: c.password }
  })

  const obj: Record<string, unknown> = {
    vault_to_use: config.vaultToUse,
    ip_allocation_method: config.ipAllocationMethod,
    vaults: {
      local: { credentials: credMap },
    },
  }

  if (config.vaultToUse === 'cyberark' && config.cyberark) {
    ;(obj.vaults as Record<string, unknown>).cyberark = {
      host: config.cyberark.host,
      cert_file: config.cyberark.certFile,
      key_file: config.cyberark.keyFile,
      credentials: credMap,
    }
  }

  if (config.ipAllocationMethod === 'infoblox' && config.infoblox) {
    obj.infoblox = {
      host: config.infoblox.host,
      username: config.infoblox.username,
      password: config.infoblox.password,
      dns_view: config.infoblox.dnsView,
      network_view: config.infoblox.networkView,
    }
  }

  return toYaml(obj)
}

export function buildClusterCreateYaml(cfg: {
  pcCredential: string
  cvmCredential: string
  fcIp: string
  dnsServers: string[]
  ntpServers: string[]
  clusters: Array<{
    name: string
    clusterVip: string
    redundancyFactor: number
    timezone: string
    cvmGateway?: string
    cvmNetmask?: string
    ipmiGateway?: string
    ipmiNetmask?: string
    nodes: Array<{
      cvmIp: string
      hostIp: string
      ipmiIp?: string
      hostname?: string
      cvmRamGb?: number
    }>
  }>
}): string {
  const clusters: Record<string, unknown>[] = cfg.clusters.map(c => ({
    cluster_name: c.name,
    cluster_vip: c.clusterVip,
    redundancy_factor: c.redundancyFactor,
    timezone: c.timezone || 'UTC',
    ...(c.cvmGateway ? { cvm_gateway: c.cvmGateway } : {}),
    ...(c.cvmNetmask ? { cvm_netmask: c.cvmNetmask } : {}),
    ...(c.ipmiGateway ? { ipmi_gateway: c.ipmiGateway } : {}),
    ...(c.ipmiNetmask ? { ipmi_netmask: c.ipmiNetmask } : {}),
    name_servers_list: cfg.dnsServers,
    ntp_servers_list: cfg.ntpServers,
    nodes: c.nodes.map(n => ({
      cvm_ip: n.cvmIp,
      host_ip: n.hostIp,
      ...(n.ipmiIp ? { ipmi_ip: n.ipmiIp } : {}),
      ...(n.hostname ? { hypervisor_hostname: n.hostname } : {}),
      ...(n.cvmRamGb ? { cvm_ram_gb: n.cvmRamGb } : {}),
    })),
  }))

  return toYaml({
    pc_credential: cfg.pcCredential,
    cvm_credential: cfg.cvmCredential,
    fc_ip: cfg.fcIp,
    clusters,
  })
}

export function buildImagingOnlyYaml(cfg: {
  pcCredential: string
  cvmCredential: string
  fcIp: string
  dnsServers: string[]
  ntpServers: string[]
  aosUrl: string
  hypervisorType: string
  hypervisorUrl: string
  batches: Array<{
    nodes: Array<{
      cvmIp: string
      hostIp: string
      ipmiIp?: string
      hostname?: string
      cvmRamGb?: number
    }>
  }>
}): string {
  return toYaml({
    pc_credential: cfg.pcCredential,
    cvm_credential: cfg.cvmCredential,
    fc_ip: cfg.fcIp,
    name_servers_list: cfg.dnsServers,
    ntp_servers_list: cfg.ntpServers,
    aos_url: cfg.aosUrl,
    hypervisor_type: cfg.hypervisorType,
    hypervisor_url: cfg.hypervisorUrl,
    imaging_batches: cfg.batches.map(b => ({
      nodes: b.nodes.map(n => ({
        cvm_ip: n.cvmIp,
        host_ip: n.hostIp,
        ...(n.ipmiIp ? { ipmi_ip: n.ipmiIp } : {}),
        ...(n.hostname ? { hypervisor_hostname: n.hostname } : {}),
        ...(n.cvmRamGb ? { cvm_ram_gb: n.cvmRamGb } : {}),
      })),
    })),
  })
}

export function buildSiteDeployYaml(cfg: {
  pcCredential: string
  cvmCredential: string
  pcIp: string
  dnsServers: string[]
  ntpServers: string[]
  aosUrl: string
  hypervisorType: string
  hypervisorUrl: string
  sites: Array<{
    siteName: string
    useExistingNetwork: boolean
    reImage: boolean
    hostSubnet: string
    hostGateway: string
    ipmiSubnet?: string
    ipmiGateway?: string
    domain?: string
    clusters: Array<{
      clusterName: string
      clusterVip: string
      redundancyFactor: number
      clusterSize: number
      cvmRam?: number
      nodes: Array<{
        nodeSerial?: string
        cvmIp: string
        hostIp: string
        ipmiIp?: string
        hostname?: string
        cvmVlanId?: number
      }>
    }>
  }>
}): string {
  return toYaml({
    pc_ip: cfg.pcIp,
    pc_credential: cfg.pcCredential,
    cvm_credential: cfg.cvmCredential,
    name_servers_list: cfg.dnsServers,
    ntp_servers_list: cfg.ntpServers,
    imaging_parameters: {
      aos_url: cfg.aosUrl,
      hypervisor_type: cfg.hypervisorType,
      hypervisor_url: cfg.hypervisorUrl,
    },
    sites: cfg.sites.map(s => ({
      site_name: s.siteName,
      use_existing_network_settings: s.useExistingNetwork,
      're-image': s.reImage,
      network: {
        host_subnet: s.hostSubnet,
        host_gateway: s.hostGateway,
        ...(s.ipmiSubnet ? { ipmi_subnet: s.ipmiSubnet } : {}),
        ...(s.ipmiGateway ? { ipmi_gateway: s.ipmiGateway } : {}),
        ...(s.domain ? { domain: s.domain } : {}),
      },
      clusters: s.clusters.map(c => ({
        cluster_name: c.clusterName,
        cluster_vip: c.clusterVip,
        redundancy_factor: c.redundancyFactor,
        cluster_size: c.clusterSize,
        ...(c.cvmRam ? { cvm_ram: c.cvmRam } : {}),
        node_details: c.nodes.map(n => ({
          ...(n.nodeSerial ? { node_serial: n.nodeSerial } : {}),
          cvm_ip: n.cvmIp,
          host_ip: n.hostIp,
          ...(n.ipmiIp ? { ipmi_ip: n.ipmiIp } : {}),
          ...(n.hostname ? { hypervisor_hostname: n.hostname } : {}),
          ...(n.cvmVlanId ? { cvm_vlan_id: n.cvmVlanId } : {}),
        })),
      })),
    })),
  })
}

export function buildPCDeployYaml(cfg: {
  peCredential: string
  cvmCredential: string
  pcVersion: string
  fileUrl: string
  metadataUrl?: string
  md5sum?: string
  vmSize: string
  dnsServers: string[]
  ntpServers: string[]
  container: string
  enableCmsp: boolean
  clusters: Array<{
    clusterIp: string
    pcVmName: string
    pcIp: string
    networkName: string
    defaultGateway: string
    subnetMask: string
    vip?: string
  }>
}): string {
  const clusterMap: Record<string, unknown> = {}
  cfg.clusters.forEach(c => {
    clusterMap[c.clusterIp] = {
      pc_vms: [{
        vm_name: c.pcVmName,
        size: cfg.vmSize,
        pc_ip: c.pcIp,
        network: c.networkName,
        default_gateway: c.defaultGateway,
        subnetmask: c.subnetMask,
        ...(c.vip ? { vip: c.vip } : {}),
        container: cfg.container,
        pc_version: cfg.pcVersion,
        file_url: cfg.fileUrl,
        ...(cfg.metadataUrl ? { metadata_url: cfg.metadataUrl } : {}),
        ...(cfg.md5sum ? { md5sum: cfg.md5sum } : {}),
        name_servers: cfg.dnsServers,
        ntp_servers: cfg.ntpServers,
        ...(cfg.enableCmsp ? { cmsp: { enable: true, cmsp_network: 'kPrivateNetwork' } } : {}),
      }],
    }
  })

  return toYaml({
    pe_credential: cfg.peCredential,
    cvm_credential: cfg.cvmCredential,
    clusters: clusterMap,
  })
}

export function buildClusterConfigYaml(cfg: {
  peCredential: string
  eulaUsername?: string
  eulaCompany?: string
  eulaJobTitle?: string
  enablePulse?: boolean
  adServerIp?: string
  adName?: string
  adDomain?: string
  adServiceUser?: string
  adServicePassword?: string
  adRoleMappings?: Array<{ role: string; entityType: string; values: string[] }>
  containers?: Array<{ name: string; replicationFactor?: number; compression?: boolean; dedup?: boolean }>
  networks?: Array<{ name: string; vlanId: number; networkIp?: string; prefix?: number; gateway?: string; ipPools?: string[] }>
  dnsServers?: string[]
  ntpServers?: string[]
  haReservation?: boolean
  clusters: string[]
}): string {
  const clusterMap: Record<string, unknown> = {}
  cfg.clusters.forEach(ip => {
    clusterMap[ip] = {
      ...(cfg.peCredential ? { pe_credential: cfg.peCredential } : {}),
      ...(cfg.eulaUsername ? { eula: { username: cfg.eulaUsername, company_name: cfg.eulaCompany || '', job_title: cfg.eulaJobTitle || '' } } : {}),
      ...(cfg.enablePulse !== undefined ? { pulse: cfg.enablePulse } : {}),
      ...(cfg.dnsServers?.length ? { name_servers_list: cfg.dnsServers } : {}),
      ...(cfg.ntpServers?.length ? { ntp_servers_list: cfg.ntpServers } : {}),
      ...(cfg.adServerIp ? {
        active_directory: {
          ad_server_ip: cfg.adServerIp,
          ad_name: cfg.adName || '',
          ad_domain: cfg.adDomain || '',
          ...(cfg.adServiceUser ? { service_account_username: cfg.adServiceUser } : {}),
          ...(cfg.adServicePassword ? { service_account_password: cfg.adServicePassword } : {}),
          ...(cfg.adRoleMappings?.length ? { role_mappings: cfg.adRoleMappings.map(r => ({ role: r.role, entity_type: r.entityType, entity_values: r.values })) } : {}),
        },
      } : {}),
      ...(cfg.containers?.length ? {
        storage_containers: cfg.containers.map(c => ({
          name: c.name,
          ...(c.replicationFactor ? { replication_factor: c.replicationFactor } : {}),
          ...(c.compression !== undefined ? { compression: c.compression } : {}),
          ...(c.dedup !== undefined ? { dedup: c.dedup } : {}),
        })),
      } : {}),
      ...(cfg.networks?.length ? {
        networks: cfg.networks.map(n => ({
          name: n.name,
          vlan_id: n.vlanId,
          ...(n.networkIp ? { network_ip: n.networkIp } : {}),
          ...(n.prefix ? { prefix: n.prefix } : {}),
          ...(n.gateway ? { default_gateway_ip: n.gateway } : {}),
          ...(n.ipPools?.length ? { ip_pools: n.ipPools.map(r => ({ range: r })) } : {}),
        })),
      } : {}),
      ...(cfg.haReservation !== undefined ? { ha_reservation: cfg.haReservation } : {}),
    }
  })

  return toYaml({ clusters: clusterMap })
}

export function buildCalmWorkloadsYaml(cfg: {
  ncmVmIp: string
  ncmCredential: string
  blueprints: Array<{ dslFile: string; name: string; appName: string; runtimeVars?: string }>
  projects: Array<{ projectName: string; clusterName: string; subnetName: string; imageName?: string; accountName?: string }>
}): string {
  return toYaml({
    ncm_vm_ip: cfg.ncmVmIp,
    ncm_credential: cfg.ncmCredential,
    bp_list: cfg.blueprints.map(b => ({
      dsl_file: b.dslFile,
      name: b.name,
      app_name: b.appName,
      runtime_vars: b.runtimeVars || '',
    })),
    projects: cfg.projects.map(p => ({
      PROJECT_NAME: p.projectName,
      CLUSTER_NAME: p.clusterName,
      SUBNET_NAME: p.subnetName,
      IMAGE_NAME: p.imageName || '',
      CATEGORIES: {},
      ACCOUNT_NAME: p.accountName || 'NTNX_LOCAL_AZ',
    })),
  })
}

export function buildNDBYaml(cfg: {
  clusterIp: string
  peCredential: string
  ndbCredential: string
  enablePulse?: boolean
  ndbVm?: {
    imagePath: string
    container: string
    vmName: string
    ram: number
    vcpus: number
    networkName: string
    vmIp: string
    gateway: string
    subnetMask: string
  }
  computeProfiles?: Array<{ name: string; vcpus: number; cores: number; ram: number }>
  registeredClusters?: Array<{ clusterIp: string; credential: string; storageContainer: string; agentVmIp: string }>
}): string {
  const obj: Record<string, unknown> = {
    cluster_ip: cfg.clusterIp,
    pe_credential: cfg.peCredential,
    ndb_credential: cfg.ndbCredential,
    ...(cfg.enablePulse !== undefined ? { enable_pulse: cfg.enablePulse } : {}),
  }

  if (cfg.ndbVm) {
    obj.images = [{ path: cfg.ndbVm.imagePath, container: cfg.ndbVm.container }]
    obj.ndb_vm = {
      vm_name: cfg.ndbVm.vmName,
      ram_gb: cfg.ndbVm.ram,
      vcpus: cfg.ndbVm.vcpus,
      network_name: cfg.ndbVm.networkName,
      vm_ip: cfg.ndbVm.vmIp,
      default_gateway: cfg.ndbVm.gateway,
      subnetmask: cfg.ndbVm.subnetMask,
    }
  }

  if (cfg.computeProfiles?.length) {
    obj.compute_profiles = cfg.computeProfiles.map(p => ({
      profile_name: p.name,
      vcpus: p.vcpus,
      cores_per_vcpu: p.cores,
      ram_gb: p.ram,
    }))
  }

  if (cfg.registeredClusters?.length) {
    obj.clusters = cfg.registeredClusters.map(c => ({
      cluster_ip: c.clusterIp,
      pe_credential: c.credential,
      storage_container: c.storageContainer,
      agent_vm_ip: c.agentVmIp,
    }))
  }

  return toYaml(obj)
}
