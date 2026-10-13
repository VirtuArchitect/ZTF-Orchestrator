const mapping = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const filled = (value: unknown) => typeof value === 'string' && Boolean(value.trim())

export function validateClusterConfig(value: unknown): string[] {
  if (!mapping(value) || !mapping(value.clusters) || !Object.keys(value.clusters).length) return ['Add at least one cluster keyed by Prism Element IP.']
  const errors: string[] = []
  if (value.default_pe_password !== undefined && typeof value.default_pe_password !== 'string') errors.push('Existing password override must be a string.')
  for (const [ip, c] of Object.entries(value.clusters)) {
    const fail = (message: string) => errors.push(`${ip || 'Cluster'}: ${message}`)
    if (!ip.trim() || !mapping(c)) { fail('Prism Element IP and cluster settings are required.'); continue }
    if (!filled(c.pe_credential) || !filled(c.new_pe_admin_credential)) fail('Both PE credential references are required.')
    else if (c.pe_credential !== c.new_pe_admin_credential) fail('PE API and new admin credential references must match for initial configuration.')
    if (['pulse', 'storage_containers', 'active_directory'].some(key => key in c)) fail('Legacy fields pulse/storage_containers/active_directory are unsupported. Use enable_pulse, containers and directory_services.')
    if (c.enable_pulse !== undefined && typeof c.enable_pulse !== 'boolean') fail('enable_pulse must be a boolean.')
    if (c.eula !== undefined && (!mapping(c.eula) || !filled(c.eula.username) || !filled(c.eula.company_name))) fail('EULA name and company are required.')
    if (c.ha_reservation !== undefined && (!mapping(c.ha_reservation) || typeof c.ha_reservation.enable_failover !== 'boolean' || !Number.isInteger(c.ha_reservation.num_host_failure_to_tolerate) || c.ha_reservation.num_host_failure_to_tolerate < 0)) fail('HA reservation requires enable_failover and a non-negative integer host failure count.')
    if (c.directory_services !== undefined && (!mapping(c.directory_services) || c.directory_services.directory_type !== 'ACTIVE_DIRECTORY' || ['ad_name', 'ad_domain', 'ad_directory_url', 'service_account_credential'].some(key => !filled(c.directory_services[key])))) fail('Complete the native directory service fields and service-account credential reference.')
    const roles = c.directory_services?.role_mappings
    if (roles !== undefined && (!Array.isArray(roles) || roles.some((role: unknown) => !mapping(role) || !['ROLE_CLUSTER_ADMIN', 'ROLE_USER_ADMIN', 'ROLE_BACKUP_ADMIN', 'ROLE_CLUSTER_VIEWER'].includes(role.role_type) || !['GROUP', 'OU', 'USER'].includes(role.entity_type) || !Array.isArray(role.values) || !role.values.length || role.values.some((entry: unknown) => !filled(entry))))) fail('Role mappings require supported role/entity types and entity values.')
    for (const key of ['containers', 'networks']) {
      if (c[key] === undefined) continue
      if (!Array.isArray(c[key])) { fail(`${key} must be a list.`); continue }
      for (const item of c[key]) {
        if (!mapping(item) || !filled(item.name)) { fail(`${key} require item names.`); continue }
        if (key === 'containers' && ((item.replication_factor !== undefined && ![1, 2, 3].includes(item.replication_factor)) || (item.on_disk_dedup !== undefined && !['ON', 'OFF'].includes(item.on_disk_dedup)))) fail('Container replication factor or deduplication value is invalid.')
        if (key === 'containers' && ('compression' in item || 'dedup' in item || (item.compression_enabled !== undefined && typeof item.compression_enabled !== 'boolean'))) fail('Use compression_enabled and on_disk_dedup for container settings.')
        if (key === 'networks' && (item.subnet_type !== 'VLAN' || !Number.isInteger(item.vlan_id) || item.vlan_id < 0 || item.vlan_id > 4094 || !mapping(item.ip_config))) fail('Networks require VLAN type, VLAN ID 0-4094 and an ip_config object.')
        if (key === 'networks' && ['network_ip', 'prefix', 'default_gateway_ip', 'ip_pools'].some(field => field in item)) fail('Network addressing and pool_list belong inside ip_config.')
        if (key === 'networks' && mapping(item.ip_config) && item.ip_config.network_prefix !== undefined && (!Number.isInteger(item.ip_config.network_prefix) || item.ip_config.network_prefix < 0 || item.ip_config.network_prefix > 32)) fail('Network prefix must be an integer from 0 to 32.')
      }
    }
  }
  return errors
}
