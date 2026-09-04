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
    ipam: { method: config.ipAllocationMethod },
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
    obj.ipam = {
      method: 'infoblox',
      host: config.infoblox.host,
      username: config.infoblox.username,
      password: config.infoblox.password,
      dns_view: config.infoblox.dnsView,
      network_view: config.infoblox.networkView,
    }
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
  foundationCentralTarget: 'integrated_pc_fc' | 'standalone_fca'
  pcCredential: string
  cvmCredential: string
  pcIp: string
  fcaApiVersion?: string
  hardwareProviderExtId?: string
  hardwareProviderName?: string
  connectionExtId?: string
  aosImageExtId?: string
  hypervisorImageExtId?: string
  dnsServers: string[]
  ntpServers: string[]
  clusters: Array<{
    name: string
    clusterVip: string
    redundancyFactor: number
    timezone: string
    hostGateway?: string
    hostNetmask?: string
    hostVlanId?: number
    cvmGateway?: string
    cvmNetmask?: string
    cvmVlanId?: number
    ipmiGateway?: string
    ipmiNetmask?: string
    nodes: Array<{
      nodeSerial?: string
      cvmIp: string
      hostIp: string
      ipmiIp?: string
      hostname?: string
      cvmRamGb?: number
    }>
  }>
}): string {
  const createClusters: Record<string, unknown>[] = cfg.clusters.map(c => ({
    cluster_name: c.name,
    cluster_vip: c.clusterVip,
    redundancy_factor: c.redundancyFactor,
    timezone: c.timezone || 'UTC',
    ...(c.hostGateway ? { host_gateway: c.hostGateway } : {}),
    ...(c.hostNetmask ? { host_netmask: c.hostNetmask } : {}),
    ...(c.hostVlanId ? { host_vlan_id: c.hostVlanId } : {}),
    ...(c.cvmGateway ? { cvm_gateway: c.cvmGateway } : {}),
    ...(c.cvmNetmask ? { cvm_netmask: c.cvmNetmask } : {}),
    ...(c.cvmVlanId ? { cvm_vlan_id: c.cvmVlanId } : {}),
    ...(c.ipmiGateway ? { ipmi_gateway: c.ipmiGateway } : {}),
    ...(c.ipmiNetmask ? { ipmi_netmask: c.ipmiNetmask } : {}),
    nodes_list: c.nodes.map(n => ({
      node_serial: n.nodeSerial,
      cvm_ip: n.cvmIp,
      host_ip: n.hostIp,
      ...(n.ipmiIp ? { ipmi_ip: n.ipmiIp } : {}),
      ...(n.hostname ? { hypervisor_hostname: n.hostname } : {}),
      ...(n.cvmRamGb ? { cvm_ram_gb: n.cvmRamGb } : {}),
    })),
  }))

  if (cfg.foundationCentralTarget === 'standalone_fca') {
    return toYaml({
      ztf_orchestrator: {
        foundation_central_target: cfg.foundationCentralTarget,
        executor: 'orchestrator_lifecycle_v4',
      },
      fca_api_version: cfg.fcaApiVersion || 'v4.2.a2',
      fca_ip: cfg.pcIp,
      fca_credential: cfg.pcCredential,
      cvm_credential: cfg.cvmCredential,
      hardware_provider_ext_id: cfg.hardwareProviderExtId || '',
      hardware_provider_name: cfg.hardwareProviderName || '',
      connection_ext_id: cfg.connectionExtId || '',
      aos_image_ext_id: cfg.aosImageExtId || '',
      hypervisor_image_ext_id: cfg.hypervisorImageExtId || '',
      fca_execution: {
        submit_path: 'config/workflows',
        status_path_template: 'config/workflows/{extId}',
      },
      common_network_settings: {
        dns_servers: cfg.dnsServers,
        ntp_servers: cfg.ntpServers,
      },
      create_clusters: createClusters,
    })
  }

  return toYaml({
    ztf_orchestrator: {
      foundation_central_target: cfg.foundationCentralTarget,
    },
    pc_credential: cfg.pcCredential,
    cvm_credential: cfg.cvmCredential,
    pc_ip: cfg.pcIp,
    common_network_settings: {
      dns_servers: cfg.dnsServers,
      ntp_servers: cfg.ntpServers,
    },
    create_clusters: createClusters,
  })
}

export function buildImagingOnlyYaml(cfg: {
  foundationCentralTarget?: 'integrated_pc_fc' | 'standalone_fca'
  pcCredential: string
  cvmCredential: string
  pcIp: string
  fcaApiVersion?: string
  hardwareProviderExtId?: string
  hardwareProviderName?: string
  connectionExtId?: string
  aosImageExtId?: string
  hypervisorImageExtId?: string
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
  const imagingBatches = cfg.batches.map(b => ({
    nodes: b.nodes.map(n => ({
      cvm_ip: n.cvmIp,
      host_ip: n.hostIp,
      ...(n.ipmiIp ? { ipmi_ip: n.ipmiIp } : {}),
      ...(n.hostname ? { hypervisor_hostname: n.hostname } : {}),
      ...(n.cvmRamGb ? { cvm_ram_gb: n.cvmRamGb } : {}),
    })),
  }))

  if (cfg.foundationCentralTarget === 'standalone_fca') {
    return toYaml({
      ztf_orchestrator: {
        foundation_central_target: 'standalone_fca',
        executor: 'orchestrator_lifecycle_v4',
      },
      fca_api_version: cfg.fcaApiVersion || 'v4.2.a2',
      fca_ip: cfg.pcIp,
      fca_credential: cfg.pcCredential,
      cvm_credential: cfg.cvmCredential,
      hardware_provider_ext_id: cfg.hardwareProviderExtId || '',
      hardware_provider_name: cfg.hardwareProviderName || '',
      connection_ext_id: cfg.connectionExtId || '',
      aos_image_ext_id: cfg.aosImageExtId || '',
      hypervisor_image_ext_id: cfg.hypervisorImageExtId || '',
      fca_execution: {
        submit_path: 'config/node-imaging-jobs',
        status_path_template: 'config/node-imaging-jobs/{extId}',
      },
      common_network_settings: {
        dns_servers: cfg.dnsServers,
        ntp_servers: cfg.ntpServers,
      },
      imaging_batches: imagingBatches,
    })
  }

  return toYaml({
    pc_credential: cfg.pcCredential,
    cvm_credential: cfg.cvmCredential,
    pc_ip: cfg.pcIp,
    name_servers_list: cfg.dnsServers,
    ntp_servers_list: cfg.ntpServers,
    aos_url: cfg.aosUrl,
    hypervisor_type: cfg.hypervisorType,
    hypervisor_url: cfg.hypervisorUrl,
    imaging_batches: imagingBatches,
  })
}

export function buildSiteDeployYaml(cfg: {
  foundationCentralTarget?: 'integrated_pc_fc' | 'standalone_fca'
  pcCredential: string
  cvmCredential: string
  pcIp: string
  fcaApiVersion?: string
  hardwareProviderExtId?: string
  hardwareProviderName?: string
  connectionExtId?: string
  aosImageExtId?: string
  hypervisorImageExtId?: string
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
        cvmRamGb?: number
      }>
    }>
  }>
}): string {
  const sites = cfg.sites.map(s => ({
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
        ...(n.cvmRamGb ? { cvm_ram_gb: n.cvmRamGb } : {}),
      })),
    })),
  }))

  if (cfg.foundationCentralTarget === 'standalone_fca') {
    return toYaml({
      ztf_orchestrator: {
        foundation_central_target: 'standalone_fca',
        executor: 'orchestrator_lifecycle_v4',
      },
      fca_api_version: cfg.fcaApiVersion || 'v4.2.a2',
      fca_ip: cfg.pcIp,
      fca_credential: cfg.pcCredential,
      cvm_credential: cfg.cvmCredential,
      hardware_provider_ext_id: cfg.hardwareProviderExtId || '',
      hardware_provider_name: cfg.hardwareProviderName || '',
      connection_ext_id: cfg.connectionExtId || '',
      aos_image_ext_id: cfg.aosImageExtId || '',
      hypervisor_image_ext_id: cfg.hypervisorImageExtId || '',
      fca_execution: {
        submit_path: 'config/site-deployments',
        status_path_template: 'config/site-deployments/{extId}',
      },
      common_network_settings: {
        dns_servers: cfg.dnsServers,
        ntp_servers: cfg.ntpServers,
      },
      sites,
    })
  }

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
    sites,
  })
}

export function buildNativeFoundationDeployYaml(cfg: {
  executionScope: string
  engineMode: string
  foundationTarget: string
  compatibilityBaseline: string
  foundationVersion: string
  runnerIdentityRef: string
  artifactPolicy: string
  imageRepository: {
    endpoint: string
    credentialRef: string
    verifyTls: boolean
  }
  policy: {
    maxParallelSites: number
    maxParallelClustersPerSite: number
    requireApprovalBinding: boolean
    requireValidationEvidence: boolean
    failClosedUnsupportedFcaDellHci: boolean
    failurePolicy: string
  }
  evidenceRetention: {
    targetRef: string
    redactSecrets: boolean
  }
  prismElementValidation: {
    credentialRef: string
    timeoutMinutes: number
    requireClusterHealth: boolean
  }
  sites: Array<{
    siteName: string
    hardwareProvider: string
    providerCredentialRef: string
    bmcCredentialRef: string
    bmcCredential?: {
      username?: string
      password?: string
    }
    concurrencyLimit: number
    deploymentWindow: {
      timezone: string
      days: string[]
      start: string
      end: string
    }
    networkProfile: {
      bmcSubnet: string
      bmcGateway: string
      hostSubnet: string
      hostGateway: string
      cvmSubnet: string
      cvmGateway: string
      managementVlanId: number
      dnsServers: string[]
      ntpServers: string[]
    }
    clusters: Array<{
      clusterName: string
      deploymentType: string
      hypervisor: string
      clusterVip: string
      redundancyFactor: number
      timezone: string
      aosImage: {
        source: string
        version: string
        sha256: string
      }
      hypervisorImage: {
        source: string
        version: string
        sha256: string
      }
      nodes: Array<{
        nodeSerial: string
        role: string
        hardwareModel: string
        bmcAddress: string
        bmcCredentialRef: string
        bmcUsername?: string
        bmcPassword?: string
        hostIp: string
        cvmIp: string
        hostname: string
        bootMode: string
        cvmRamGb: number
      }>
    }>
  }>
}): string {
  return toYaml({
    ztf_orchestrator: {
      workflow: 'native-foundation-deploy',
      workflow_family: 'native_foundation',
      execution_scope: cfg.executionScope,
      support_boundary: 'dell_ahv_hci_controlled_uat',
    },
    foundation_engine: {
      mode: cfg.engineMode,
      target: cfg.foundationTarget,
      compatibility_baseline: cfg.compatibilityBaseline,
      foundation_version: cfg.foundationVersion,
      runner_identity_ref: cfg.runnerIdentityRef,
      artifact_policy: cfg.artifactPolicy,
      image_repository: {
        endpoint: cfg.imageRepository.endpoint,
        credential_ref: cfg.imageRepository.credentialRef,
        verify_tls: cfg.imageRepository.verifyTls,
      },
      orchestration: {
        site_strategy: 'sequential',
      },
      policy: {
        max_parallel_sites: cfg.policy.maxParallelSites,
        max_parallel_clusters_per_site: cfg.policy.maxParallelClustersPerSite,
        require_approval_binding: cfg.policy.requireApprovalBinding,
        require_validation_evidence: cfg.policy.requireValidationEvidence,
        fail_closed_unsupported_fca_dell_hci: cfg.policy.failClosedUnsupportedFcaDellHci,
        failure_policy: cfg.policy.failurePolicy,
      },
      evidence_retention: {
        target_ref: cfg.evidenceRetention.targetRef,
        redact_secrets: cfg.evidenceRetention.redactSecrets,
      },
      prism_element_validation: {
        credential_ref: cfg.prismElementValidation.credentialRef,
        timeout_minutes: cfg.prismElementValidation.timeoutMinutes,
        require_cluster_health: cfg.prismElementValidation.requireClusterHealth,
      },
      checkpoint: {
        completed_step_ids: [],
        failed_step_ids: [],
      },
      uat_evidence: {
        hardware_provider_discovery: {
          accepted: false,
          evidence_id: '',
        },
        image_source_verified: {
          accepted: false,
          evidence_id: '',
        },
        network_path_verified: {
          accepted: false,
          evidence_id: '',
        },
        recovery_runbook_reviewed: {
          accepted: false,
          evidence_id: '',
        },
        cluster_create_validated: {
          accepted: false,
          evidence_id: '',
        },
      },
    },
    sites: cfg.sites.map(site => ({
      site_name: site.siteName,
      hardware_provider: site.hardwareProvider,
      provider_credential_ref: site.providerCredentialRef,
      bmc_credential_ref: site.bmcCredentialRef,
      ...(site.bmcCredential?.username || site.bmcCredential?.password ? {
        bmc_credential: {
          username: site.bmcCredential.username || '',
          password: site.bmcCredential.password || '',
        },
      } : {}),
      concurrency_limit: site.concurrencyLimit,
      deployment_window: {
        timezone: site.deploymentWindow.timezone,
        days: site.deploymentWindow.days,
        start: site.deploymentWindow.start,
        end: site.deploymentWindow.end,
      },
      network_profile: {
        bmc_subnet: site.networkProfile.bmcSubnet,
        bmc_gateway: site.networkProfile.bmcGateway,
        host_subnet: site.networkProfile.hostSubnet,
        host_gateway: site.networkProfile.hostGateway,
        cvm_subnet: site.networkProfile.cvmSubnet,
        cvm_gateway: site.networkProfile.cvmGateway,
        management_vlan_id: site.networkProfile.managementVlanId,
        dns_servers: site.networkProfile.dnsServers,
        ntp_servers: site.networkProfile.ntpServers,
      },
      clusters: site.clusters.map(cluster => ({
        cluster_name: cluster.clusterName,
        deployment_type: cluster.deploymentType,
        hypervisor: cluster.hypervisor,
        cluster_vip: cluster.clusterVip,
        redundancy_factor: cluster.redundancyFactor,
        timezone: cluster.timezone,
        aos_image: {
          source: cluster.aosImage.source,
          version: cluster.aosImage.version,
          sha256: cluster.aosImage.sha256,
        },
        hypervisor_image: {
          source: cluster.hypervisorImage.source,
          version: cluster.hypervisorImage.version,
          sha256: cluster.hypervisorImage.sha256,
        },
        nodes: cluster.nodes.map(node => ({
          node_serial: node.nodeSerial,
          role: node.role,
          hardware_model: node.hardwareModel,
          bmc_address: node.bmcAddress,
          bmc_credential_ref: node.bmcCredentialRef,
          ...(node.bmcUsername || node.bmcPassword ? {
            bmc_username: node.bmcUsername || '',
            bmc_password: node.bmcPassword || '',
          } : {}),
          host_ip: node.hostIp,
          cvm_ip: node.cvmIp,
          hypervisor_hostname: node.hostname,
          boot_mode: node.bootMode,
          cvm_ram_gb: node.cvmRamGb,
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
  vmSize: string
  dnsServers: string[]
  ntpServers: string[]
  container: string
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
      pe_credential: cfg.peCredential,
      cvm_credential: cfg.cvmCredential,
      pc_configs: [{
        file_url: cfg.fileUrl,
        ...(cfg.metadataUrl ? { metadata_file_url: cfg.metadataUrl } : {}),
        pc_version: cfg.pcVersion,
        pc_vm_name_prefix: c.pcVmName,
        num_pc_vms: 1,
        pc_size: cfg.vmSize,
        pc_vip: c.vip || c.pcIp,
        ip_list: [c.pcIp],
        ntp_server_list: cfg.ntpServers,
        dns_server_ip_list: cfg.dnsServers,
        container_name: cfg.container,
        network_name: c.networkName,
        default_gateway: c.defaultGateway,
        subnet_mask: c.subnetMask,
        delete_existing_software: false,
      }],
    }
  })

  return toYaml({
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
