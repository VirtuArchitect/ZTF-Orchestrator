import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'
import { SCRIPT_CONFIG_SCHEMAS } from '../../src/scriptConfigSchemas'

const pc = '00000000-0000-4000-8000-000000000001'
const pe = '00000000-0000-4000-8000-000000000002'

test('draft YAML contains only connection reference and exact PE UUID', () => {
  const schema = SCRIPT_CONFIG_SCHEMAS.UnregisterPeFromPc
  expect(schema.fields.some(f => f.type === 'password')).toBe(false)
  expect(yaml.load(schema.build({ pc_endpoint: 'https://pc.example.com:9440', pc_credential: 'pc_admin', pe_cluster_uuid: pe }))).toEqual({
    pc_endpoint: 'https://pc.example.com:9440', pc_credential: 'pc_admin', pe_cluster_uuid: pe,
  })
  expect(() => schema.build({ pc_endpoint: 'http://pc.example.com', pc_credential: 'pc_admin', pe_cluster_uuid: pe })).toThrow()
})

test('administrator wizard generates, reviews, approves and submits once with simulated APIs', async ({ page }) => {
  const calls: { path: string; data: any }[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') calls.push({ path, data: request.postDataJSON() })
    if (path === '/api/pc-unregistration/review') {
      const draft = yaml.load(request.postDataJSON().configContent) as object
      return route.fulfill({ json: { config: { ...draft, expected_pc_uuid: pc, expected_pe_name: 'HCI-01' } } })
    }
    if (path === '/api/approvals') return route.fulfill({ json: { id: 'approval-fixture' } })
    if (path === '/api/jobs' && request.method() === 'POST') return route.fulfill({ status: 202, json: { id: 'job-fixture' } })
    if (path === '/api/system/check') return route.fulfill({ json: { ztfInstalled: true, checks: [] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/workflows/unregister-pe-from-pc')
  await page.getByLabel('PC endpoint', { exact: true }).fill('https://pc.example.com:9440')
  await page.getByLabel('PC credential reference', { exact: true }).fill('pc_admin')
  await page.getByLabel('PE cluster UUID', { exact: true }).fill(pe)
  await page.getByRole('button', { name: 'Generate YAML', exact: true }).click()
  expect(calls.filter(c => c.path.startsWith('/api/pc-unregistration') || c.path === '/api/jobs')).toEqual([])
  await expect(page.getByLabel('Removal YAML')).toContainText('pc_credential: pc_admin')
  await page.getByRole('heading', { name: '1. Generate the removal YAML' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/pc-unregistration-inputs.png' })
  await page.getByRole('button', { name: 'Look up target (read-only)' }).click()
  await expect(page.getByText('HCI-01', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request removal approval' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Request removal approval' }).click()
  await expect(page.getByText('approval-fixture', { exact: true })).toBeVisible()
  await page.getByLabel('Type UNREGISTER '+pe, { exact: true }).fill('UNREGISTER '+pe)
  await page.getByRole('button', { name: 'Submit approved removal once' }).click()
  await expect(page.getByRole('link', { name: 'Follow this job and its verification' })).toHaveAttribute('href', /job=job-fixture/)
  await expect(page.getByRole('button', { name: 'Submit approved removal once' })).toBeDisabled()
  const approved = calls.find(c => c.path === '/api/approvals')!.data
  const submitted = calls.filter(c => c.path === '/api/jobs')
  expect(submitted).toHaveLength(1)
  expect(submitted[0].data.configContent).toBe(approved.configContent)
  expect(yaml.load(approved.configContent)).toMatchObject({ expected_pc_uuid: pc, expected_pe_name: 'HCI-01', dependencies_reviewed: true })
  await page.screenshot({ path: 'test-results/pc-unregistration-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/pc-unregistration-mobile.png', fullPage: true })
})
