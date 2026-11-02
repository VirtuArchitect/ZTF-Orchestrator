import { test, expect } from '@playwright/test'
import { configMatches } from '../../src/components/ConfigScope'

const groups = [{ id: 'c01', name: 'AHV-01', datacenter: 'DC1', kind: 'cluster' as const }, { id: 'c02', name: 'AHV-02', datacenter: 'DC2', kind: 'cluster' as const }, { id: 'shared', name: 'Templates', datacenter: '', kind: 'shared' as const }]
const organization = () => ({ version: 1 as const, revision: 0, groups, assignments: { 'one.yml': { groupId: 'c01', purpose: 'Deployment' }, 'two.yml': { groupId: 'c02', purpose: 'Monitoring' }, 'shared.yml': { groupId: 'shared', purpose: 'Shared template' } } })

test('scope includes shared templates and orphan assignments become ungrouped', () => {
  const org = organization()
  expect(configMatches('one.yml', org, 'c01')).toBe(true)
  expect(configMatches('two.yml', org, 'c01')).toBe(false)
  expect(configMatches('shared.yml', org, 'c01')).toBe(true)
  expect(configMatches('one.yml', org, 'all', 'DC1')).toBe(true)
  expect(configMatches('one.yml', { ...org, groups: [] }, 'ungrouped')).toBe(true)
  expect(configMatches('one.yml', org, 'c01', '', 'Recovery')).toBe(false)
})

async function setup(page: import('@playwright/test').Page) {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture', user: { username: 'demo-admin', role: 'admin' }, sidebarOpen: true }, version: 0 })))
  let org: any = organization()
  const contents: Record<string, string> = { 'one.yml': 'clusters: {}\n', 'two.yml': 'clusters: {}\n', 'shared.yml': '# shared\n' }
  let writes = 0
  await page.route('**/api/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname)
    if (path === '/api/config-organization') {
      if (route.request().method() === 'PUT') org = { ...route.request().postDataJSON(), revision: org.revision + 1, groups }
      return route.fulfill({ json: org })
    }
    if (path === '/api/configs') return route.fulfill({ json: Object.keys(contents).map(name => ({ name, size: 12, modified: 1 })) })
    if (path.endsWith('/backups')) return route.fulfill({ json: [] })
    if (path.startsWith('/api/configs/')) {
      const name = path.split('/').pop()!
      if (route.request().method() === 'POST') { writes++; contents[name] = route.request().postDataJSON().content; return route.fulfill({ json: { success: true } }) }
      return route.fulfill({ json: { name, content: contents[name] } })
    }
    if (path === '/api/pipelines') return route.fulfill({ json: [{ id: 'p1', name: 'Demo baseline', updatedAt: new Date().toISOString(), steps: [{ workflow: 'config-cluster', configFile: 'two.yml' }] }] })
    if (path === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    return route.fulfill({ json: {} })
  })
  return { writes: () => writes, contents, org: () => org }
}

test('file labels save independently, filter and survive reload; create and upload inherit labels', async ({ page }) => {
  const state = await setup(page)
  await page.setViewportSize({ width: 1680, height: 1100 })
  await page.goto('/configs')
  await page.getByText('one.yml', { exact: true }).click()
  await page.getByLabel('File purpose', { exact: true }).selectOption('Recovery')
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Grouping saved')
  expect(state.writes()).toBe(0)
  expect(state.contents['one.yml']).toBe('clusters: {}\n')
  await page.reload()
  await page.getByRole('button', { name: 'AHV-01', exact: true }).click()
  await expect(page.getByText('two.yml', { exact: true })).toHaveCount(0)
  await expect(page.getByText('shared.yml', { exact: true })).toBeVisible()
  await page.getByLabel('Filter by purpose').selectOption('Recovery')
  await page.getByPlaceholder('new-config.yml').fill('recovery.yml')
  await page.getByPlaceholder('new-config.yml').press('Enter')
  await expect(page.getByLabel('File group', { exact: true })).toHaveValue('c01')
  await expect(page.getByLabel('File purpose', { exact: true })).toHaveValue('Recovery')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload', exact: true }).click()
  await (await chooser).setFiles({ name: 'upload.yml', mimeType: 'text/yaml', buffer: Buffer.from('clusters: {}\n') })
  await expect(page.getByLabel('File group', { exact: true })).toHaveValue('c01')
  expect(state.org().assignments['upload.yml']).toEqual({ groupId: 'c01', purpose: 'Recovery' })
  await page.screenshot({ path: 'test-results/config-groups-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByLabel('Search config files')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('pipeline retains selected file outside cluster filter and show all restores options', async ({ page }) => {
  await setup(page)
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'Edit pipeline' }).click()
  await page.getByText('Filter config files by datacenter / cluster', { exact: true }).click()
  await page.getByRole('button', { name: 'AHV-01', exact: true }).click()
  await expect(page.getByLabel('Configuration file', { exact: true })).toHaveValue('two.yml')
  await expect(page.getByLabel('Configuration file', { exact: true }).locator('option:checked')).toContainText('outside filter')
  await page.getByLabel('Show all files', { exact: true }).check()
  await expect(page.getByLabel('Configuration file', { exact: true }).locator('option:checked')).toHaveText('two.yml')
})

test('saved workflow configuration uses import validation and does not execute', async ({ page }) => {
  const state = await setup(page)
  state.contents['one.yml'] = 'clusters:\n  192.0.2.10:\n    name: AHV-01\n    pe_credential: pe_admin\n    new_pe_admin_credential: pe_admin\n'
  await page.goto('/workflows/config-cluster')
  await page.getByText('Load a saved configuration by datacenter / cluster', { exact: true }).click()
  await page.getByLabel('Configuration file', { exact: true }).selectOption('one.yml')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Load into form', exact: true }).click()
  await expect(page.getByText('Imported one.yml for Configure Cluster.', { exact: true })).toBeVisible()
  expect(state.writes()).toBe(0)
})

test('stale label saves preserve drafts and never report success or write YAML', async ({ page }) => {
  const state = await setup(page)
  await page.route('**/api/config-organization', async route => {
    if (route.request().method() === 'PUT') return route.fulfill({ status: 409, json: { error: 'Config grouping changed. Reload before saving.' } })
    return route.fulfill({ json: organization() })
  })
  await page.goto('/configs')
  await page.getByText('one.yml', { exact: true }).click()
  await page.getByLabel('File purpose', { exact: true }).selectOption('Recovery')
  await page.getByRole('button', { name: 'Save grouping', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Reload before saving')
  await expect(page.getByLabel('File purpose', { exact: true })).toHaveValue('Recovery')
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(state.writes()).toBe(0)
})

test('invalid saved workflow input is rejected before replacing the form', async ({ page }) => {
  await setup(page)
  await page.goto('/workflows/config-cluster')
  await page.getByText('Load a saved configuration by datacenter / cluster', { exact: true }).click()
  await page.getByLabel('Configuration file', { exact: true }).selectOption('shared.yml')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Load into form', exact: true }).click()
  await expect(page.getByText('Imported config must be a YAML or JSON object.', { exact: true })).toBeVisible()
})
