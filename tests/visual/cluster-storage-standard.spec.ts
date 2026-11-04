import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'

const cluster = '00000000-0000-4000-8000-000000000001'
const container = '00000000-0000-4000-8000-000000000002'

test('storage workflow reviews cluster-specific YAML and submits the exact approved content once', async ({ page }) => {
  const calls: { path: string; data: any }[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') calls.push({ path, data: request.postDataJSON() })
    if (path === '/api/cluster-storage-standard/review') {
      const draft = yaml.load(request.postDataJSON().configContent) as object
      return route.fulfill({ json: { config: { ...draft, expected_cluster_uuid: cluster,
        expected_default: { name: 'default-container-12345', uuid: container }, dependencies_reviewed: false } } })
    }
    if (path === '/api/approvals') return route.fulfill({ json: { id: 'approval-fixture' } })
    if (path === '/api/jobs' && request.method() === 'POST') return route.fulfill({ status: 202, json: { id: 'job-fixture' } })
    if (path === '/api/system/check') return route.fulfill({ json: { ztfInstalled: true, checks: [] } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/workflows/cluster-storage-standard')
  const input = page.getByLabel('Cluster storage YAML', { exact: true })
  await input.fill(yaml.dump({ pe_endpoint: 'https://pe.example.com:9440', pe_credential: 'pe_admin', containers: [
    { name: 'SITE-B-VM', replication_factor: 2 }, { name: 'SITE-B-OPS', replication_factor: 2 }, { name: 'SITE-B-APP', replication_factor: 2 },
  ] }))
  await page.getByRole('button', { name: 'Check YAML syntax locally' }).click()
  expect(calls.filter(c => c.path === '/api/cluster-storage-standard/review' || c.path === '/api/jobs' || c.path === '/api/approvals')).toEqual([])
  await page.getByRole('button', { name: 'Discover default (read-only)' }).click()
  await expect(page.getByLabel('Reviewed storage YAML')).toContainText('default-container-12345')
  await expect(page.getByRole('button', { name: 'Request storage approval' })).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Request storage approval' }).click()
  await page.getByLabel('Type APPLY STORAGE '+cluster, { exact: true }).fill('APPLY STORAGE '+cluster)
  await page.getByRole('button', { name: 'Submit approved storage job once' }).click()
  await expect(page.getByRole('link', { name: 'Follow storage job and verification' })).toHaveAttribute('href', /job=job-fixture/)
  await expect(page.getByRole('button', { name: 'Submit approved storage job once' })).toBeDisabled()
  const approved = calls.find(c => c.path === '/api/approvals')!.data
  const jobs = calls.filter(c => c.path === '/api/jobs')
  expect(jobs).toHaveLength(1)
  expect(jobs[0].data.configContent).toBe(approved.configContent)
  expect((yaml.load(approved.configContent) as any).containers.map((c: any) => c.name)).toEqual(['SITE-B-VM', 'SITE-B-OPS', 'SITE-B-APP'])
  await page.screenshot({ path: 'test-results/cluster-storage-standard-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/cluster-storage-standard-mobile.png', fullPage: true })
})
