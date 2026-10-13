import { expect, test, type Page } from '@playwright/test'
import { dump, load } from 'js-yaml'
import { validateClusterConfig } from '../../src/utils/clusterConfig'

const cluster = (ref: string, pulse: boolean) => ({
  name: 'test-cluster', pe_credential: ref, new_pe_admin_credential: ref,
  eula: { username: 'Test Operator', company_name: 'Example', job_title: 'Engineer' }, enable_pulse: pulse,
  name_servers_list: ['192.0.2.53'], ntp_servers_list: ['ntp.example.com'],
  ha_reservation: { enable_failover: true, num_host_failure_to_tolerate: 1 },
  directory_services: { directory_type: 'ACTIVE_DIRECTORY', ad_name: 'EXAMPLE', ad_domain: 'example.com', ad_directory_url: 'ldap://192.0.2.54:389', service_account_credential: 'directory_ref', role_mappings: [{ role_type: 'ROLE_CLUSTER_VIEWER', entity_type: 'GROUP', values: ['readers'] }] },
  containers: [{ name: 'data', replication_factor: 2, compression_enabled: true, on_disk_dedup: 'OFF', erasure_code: 'OFF' }],
  networks: [{ name: 'vlan110', subnet_type: 'VLAN', vlan_id: 110, ip_config: { network_ip: '198.51.100.0', network_prefix: 24, default_gateway_ip: '198.51.100.1', pool_list: [{ range: '198.51.100.10 198.51.100.20' }], dhcp_options: { domain_name_server_list: ['192.0.2.53'] } } }],
})

async function seed(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'test-token', user: { username: 'test-admin', role: 'admin' }, sidebarOpen: false, settings: {},
  }, version: 0 })))
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().endsWith('/api/system/check') ? { checks: [], ztfInstalled: true } : [] }))
  await page.goto('/workflows/config-cluster')
}
async function importConfig(page: Page, config: unknown) {
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'cluster-config.yml', mimeType: 'text/yaml', buffer: Buffer.from(dump(config)) })
}
async function exported(page: Page): Promise<any> {
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL)
    URL.createObjectURL = blob => { (window as any).exportedConfig = (blob as Blob).text(); return original(blob) }
  })
  await page.getByRole('button', { name: 'Download Config' }).click()
  return load(await page.evaluate(() => (window as any).exportedConfig))
}

test('native initial config imports and exports without losing per-cluster or advanced fields', async ({ page }) => {
  await seed(page)
  const input = { skip_pc_registration: true, default_pe_password: '  test-only-current  ', clusters: { '192.0.2.100': cluster('admin_a', true), '192.0.2.101': cluster('admin_b', false) } }
  await importConfig(page, input)
  await expect(page.getByLabel('Prism Element IP').first()).toHaveValue('192.0.2.100')
  expect(await exported(page)).toEqual(input)
  const first = page.getByRole('region', { name: 'Cluster 1', exact: true })
  await first.getByLabel('Pulse', { exact: true }).selectOption('Disabled')
  await first.getByLabel('New PE Admin Credential Ref').fill('admin_a_new')
  const result = await exported(page)
  expect(result.clusters['192.0.2.100']).toMatchObject({ enable_pulse: false, pe_credential: 'admin_a_new', new_pe_admin_credential: 'admin_a_new' })
  expect(result.clusters['192.0.2.101']).toEqual(input.clusters['192.0.2.101'])
  expect(result.clusters['192.0.2.100'].networks[0].ip_config.dhcp_options).toEqual({ domain_name_server_list: ['192.0.2.53'] })
  await first.getByLabel('Accept EULA', { exact: true }).uncheck()
  await first.getByLabel('Configure HA Reservation').uncheck()
  const disabled = await exported(page)
  expect(disabled.clusters['192.0.2.100']).not.toHaveProperty('eula')
  expect(disabled.clusters['192.0.2.100']).not.toHaveProperty('ha_reservation')
  expect(disabled.default_pe_password).toBe(input.default_pe_password)
  await page.getByLabel('Existing PE Admin Password Override').fill('')
  expect(await exported(page)).not.toHaveProperty('default_pe_password')
  await page.screenshot({ path: 'test-results/cluster-config-desktop.png', fullPage: true })
})

test('new form generates native password, EULA, Pulse, storage and network keys for dry run', async ({ page }) => {
  await seed(page)
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeDisabled()
  const first = page.getByRole('region', { name: 'Cluster 1', exact: true })
  await first.getByLabel('Prism Element IP').fill('192.0.2.100')
  await first.getByLabel('New PE Admin Credential Ref').fill('pe_new')
  await first.getByLabel('DNS Servers').pressSequentially('192.0.2.53, 192.0.2.54')
  await first.getByLabel('Accept EULA').check()
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeDisabled()
  await first.getByLabel('EULA Name').fill('Test Operator')
  await first.getByLabel('Company Name').fill('Example')
  await first.getByLabel('Pulse', { exact: true }).selectOption('Enabled')
  await first.getByRole('button', { name: 'Add Container', exact: true }).click()
  await first.getByLabel('Container Name').fill('data')
  await first.getByRole('button', { name: 'Add Network', exact: true }).click()
  await first.getByLabel('Network Name').fill('vlan110')
  await first.getByLabel('VLAN ID').fill('110')
  await first.getByLabel('IP Pools').fill('198.51.100.10-198.51.100.20')
  const output = await exported(page)
  const c = output.clusters['192.0.2.100']
  expect(c.name_servers_list).toEqual(['192.0.2.53', '192.0.2.54'])
  expect(c).toMatchObject({ pe_credential: 'pe_new', new_pe_admin_credential: 'pe_new', enable_pulse: true, eula: { username: 'Test Operator', company_name: 'Example' } })
  expect(c.containers[0]).toMatchObject({ compression_enabled: true, on_disk_dedup: 'OFF' })
  expect(c.networks[0]).toMatchObject({ subnet_type: 'VLAN', vlan_id: 110, ip_config: { pool_list: [{ range: '198.51.100.10 198.51.100.20' }] } })
  expect(c).not.toHaveProperty('pulse')
  expect(c).not.toHaveProperty('storage_containers')
  await expect(page.getByLabel('Existing PE Admin Password Override')).toHaveAttribute('type', 'password')
  let submitted: any
  await page.route('**/api/execute', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"done","data":{"code":0,"status":"success"}}\n\n' })
  })
  await page.getByRole('button', { name: 'Dry Run', exact: true }).click()
  await expect.poll(() => submitted?.dryRun).toBe(true)
  expect(load(submitted.configContent)).toEqual(output)
})

test('validator rejects legacy fields, malformed structures and mismatched credentials', () => {
  const valid = { clusters: { '192.0.2.100': cluster('pe_new', false) } }
  expect(validateClusterConfig(valid)).toEqual([])
  for (const patch of [{ pulse: true }, { storage_containers: [] }, { active_directory: {} }, { enable_pulse: 'true' }, { eula: {} }, { ha_reservation: true }, { networks: {} }, { new_pe_admin_credential: 'different' }]) {
    expect(validateClusterConfig({ clusters: { '192.0.2.100': { ...cluster('pe_new', false), ...patch } } }).length).toBeGreaterThan(0)
  }
})

test('native cluster form fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page)
  await importConfig(page, { clusters: { '192.0.2.100': cluster('pe_new', true) } })
  await expect(page.getByLabel('New PE Admin Credential Ref')).toHaveValue('pe_new')
  await page.screenshot({ path: 'test-results/cluster-config-mobile.png', fullPage: true })
  await page.getByLabel('IP Pools').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/cluster-config-mobile-network.png', fullPage: true })
})

test('legacy config import is rejected without replacing the current native config', async ({ page }) => {
  await seed(page)
  const native = { clusters: { '192.0.2.100': cluster('pe_new', true) } }
  await importConfig(page, native)
  await importConfig(page, { clusters: { '192.0.2.100': { ...cluster('pe_new', true), pulse: true } } })
  await expect(page.getByText(/Legacy fields.*unsupported/)).toBeVisible()
  expect(await exported(page)).toEqual(native)
})
