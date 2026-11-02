import { test, expect } from '@playwright/test'
import yaml from 'js-yaml'
import { buildGlobalYaml } from '../../src/utils/yaml'
import { emptyOrganization, renameAssignment } from '../../src/utils/credentialOrganization'
import { installationStages } from '../../src/utils/applianceStages'

test('global YAML keeps flat references, unknown configuration and other vaults', () => {
  const baseConfig = { custom: { keep: true }, vaults: { local: { customOption: true, credentials: { ref01: { username: 'old', password: 'old', customHint: 'keep' } } }, other: { credentials: { ref02: { username: 'external', password: 'fixture' } } } }, ipam: { method: 'static', retain: 'custom' } }
  const output = yaml.load(buildGlobalYaml({ baseConfig, vaultToUse: 'local', ipAllocationMethod: 'static', credentials: [{ ref: 'ref01', username: 'admin', password: 'fixture-only' }] })) as any
  expect(output.vaults.local.credentials.ref01).toEqual({ username: 'admin', password: 'fixture-only', customHint: 'keep' })
  expect(output.vaults.other).toEqual(baseConfig.vaults.other)
  expect(output.custom).toEqual(baseConfig.custom)
  expect(output.ipam.retain).toBe('custom')
  expect(output).not.toHaveProperty('credentialOrganization')
  const cyberarkCredentials = { ref01: { username: 'vault-admin', password: 'different-fixture' } }
  const cyberark = yaml.load(buildGlobalYaml({ baseConfig: { ...baseConfig, vaults: { ...baseConfig.vaults, cyberark: { credentials: cyberarkCredentials } } }, vaultToUse: 'cyberark', ipAllocationMethod: 'static', credentials: [{ ref: 'ref01', username: 'admin', password: 'fixture-only' }] })) as any
  expect(cyberark.vaults.cyberark.credentials).toEqual(cyberarkCredentials)
  expect(baseConfig.vaults.local.credentials.ref01.username).toBe('old')
  expect(() => buildGlobalYaml({ vaultToUse: 'local', ipAllocationMethod: 'static', credentials: [{ ref: 'same', username: '', password: '' }, { ref: 'same', username: '', password: '' }] })).toThrow('unique')
  const org = { ...emptyOrganization(), assignments: { ref01: { groupId: 'one', purpose: 'PE' } } }
  expect(renameAssignment(org, 'ref01', 'ref02').assignments).toEqual({ ref02: { groupId: 'one', purpose: 'PE' } })
  const collision = { ...org, assignments: { ...org.assignments, ref02: { groupId: 'shared', purpose: 'Existing external reference' } } }
  expect(renameAssignment(collision, 'ref01', 'ref02')).toBe(collision)
})

test('stage history distinguishes completed, running, failed, interrupted and pending', () => {
  const events = ['readiness', 'backup', 'load'].map(stage => ({ stage }))
  expect(installationStages({ stage: 'load', status: 'running', events }).map(item => item.state)).toEqual(['completed', 'completed', 'current', 'pending', 'pending', 'pending'])
  expect(installationStages({ stage: 'failed', status: 'failed', events: [...events, { stage: 'failed' }] }).map(item => item.state)).toEqual(['completed', 'completed', 'failed', 'pending', 'pending', 'pending'])
  expect(installationStages({ stage: 'load', status: 'interrupted', events }).map(item => item.state)).toEqual(['completed', 'completed', 'interrupted', 'pending', 'pending', 'pending'])
  expect(installationStages({ stage: 'complete', status: 'succeeded', events }).every(item => item.state === 'completed')).toBe(true)
  expect(installationStages({ stage: 'backup', status: 'running', events: [{ stage: 'backup' }] })[0].state).toBe('pending')
  expect(installationStages({ stage: 'failed', status: 'failed', events: [] }).every(item => item.state === 'pending')).toBe(true)
})

test('create cluster/shared groups, assign existing credentials and persist labels without secret writes', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: true }, version: 0 })))
  let org = emptyOrganization()
  const globalContent = 'vault_to_use: local\nip_allocation_method: static\nvaults:\n  local:\n    credentials:\n      dc1_c01_admin:\n        username: admin\n        password: fixture-only\n      pc_admin:\n        username: admin\n        password: fixture-only-pc\ncustom_setting: retained\n'
  let globalWrites = 0
  let savedGlobal: any = null
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/global-config') {
      if (route.request().method() === 'POST') { globalWrites++; savedGlobal = yaml.load(route.request().postDataJSON().content); return route.fulfill({ json: { success: true } }) }
      return route.fulfill({ json: { content: globalContent } })
    }
    if (path === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (path === '/api/credential-organization') {
      if (route.request().method() === 'PUT') { const proposed = route.request().postDataJSON(); expect(JSON.stringify(proposed)).not.toContain('fixture-only'); org = { ...proposed, revision: org.revision + 1 } }
      return route.fulfill({ json: org })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto('/global-config')
  await page.getByRole('button', { name: 'Add group', exact: true }).click()
  await page.getByLabel('Datacenter', { exact: true }).fill('DC1')
  await page.getByLabel('Group name', { exact: true }).fill('AHV-Cluster-01')
  await page.getByRole('button', { name: 'Apply group', exact: true }).click()
  await page.getByRole('button', { name: 'All credentials 2', exact: true }).click()
  await page.getByLabel('Group for dc1_c01_admin', { exact: true }).selectOption({ label: 'DC1 / AHV-Cluster-01' })
  await page.getByLabel('Purpose for dc1_c01_admin', { exact: true }).fill('PE Administrator')
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  await expect(page.getByText('Grouping saved', { exact: true })).toBeVisible()
  expect(globalWrites).toBe(0)
  expect(org.assignments.dc1_c01_admin.purpose).toBe('PE Administrator')
  await page.reload()
  await page.getByRole('button', { name: 'AHV-Cluster-01 1', exact: true }).click()
  await expect(page.getByLabel('Username for dc1_c01_admin', { exact: true })).toHaveValue('admin')
  await expect(page.getByLabel('Password for dc1_c01_admin', { exact: true })).toHaveAttribute('type', 'password')
  await expect(page.getByLabel('Username for pc_admin', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Add group', exact: true }).click()
  await page.getByLabel('Group type', { exact: true }).selectOption('shared')
  await page.getByLabel('Group name', { exact: true }).fill('Prism Central')
  await page.getByRole('button', { name: 'Apply group', exact: true }).click()
  await page.getByRole('button', { name: 'All credentials 2', exact: true }).click()
  await page.getByLabel('Group for pc_admin', { exact: true }).selectOption({ label: 'Shared / Prism Central' })
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  await expect(page.getByText('Grouping saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'AHV-Cluster-01 1', exact: true }).click()
  await page.screenshot({ path: 'test-results/credential-groups-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1600, height: 1100 })
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Remove group', exact: true }).click()
  await expect(page.getByLabel('Username for dc1_c01_admin', { exact: true })).toHaveValue('admin')
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  expect(globalWrites).toBe(0)
  await page.getByRole('button', { name: 'YAML Preview', exact: true }).click()
  await expect(page.locator('main')).toContainText('custom_setting')
  await page.getByRole('button', { name: 'Save to ZTF', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved!', exact: true })).toBeVisible()
  expect(savedGlobal.vaults.local.credentials.dc1_c01_admin.password).toBe('fixture-only')
  expect(savedGlobal.custom_setting).toBe('retained')
  expect(savedGlobal).not.toHaveProperty('credentialOrganization')
})


test('a malformed existing global config cannot be overwritten by defaults', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false }, version: 0 })))
  let writes = 0
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') writes++
    if (path === '/api/global-config') return route.fulfill({ json: { content: '[invalid YAML' } })
    if (path === '/api/credential-organization') return route.fulfill({ json: emptyOrganization() })
    return route.fulfill({ json: {} })
  })
  await page.goto('/global-config')
  await expect(page.getByText('Unable to parse global configuration.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save to ZTF', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add group', exact: true })).toBeDisabled()
  expect(writes).toBe(0)
})

test('stale group saves keep the local draft and require reconciliation', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: true }, version: 0 })))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/global-config') return route.fulfill({ json: { content: 'vault_to_use: local\nvaults:\n  local:\n    credentials: {}\n' } })
    if (path === '/api/credential-organization') return route.request().method() === 'PUT'
      ? route.fulfill({ status: 409, json: { error: 'Grouping changed in another session. Reload before saving.' } })
      : route.fulfill({ json: emptyOrganization() })
    return route.fulfill({ json: {} })
  })
  await page.goto('/global-config')
  await page.getByRole('button', { name: 'Add group', exact: true }).click()
  await page.getByLabel('Datacenter', { exact: true }).fill('DC1')
  await page.getByLabel('Group name', { exact: true }).fill('AHV-Cluster-01')
  await page.getByRole('button', { name: 'Apply group', exact: true }).click()
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Reload before saving')
  await expect(page.getByText('Unsaved grouping changes', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'AHV-Cluster-01', exact: true })).toBeVisible()
})
