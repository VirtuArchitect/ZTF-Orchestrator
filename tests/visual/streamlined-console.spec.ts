import { expect, test, type Page } from '@playwright/test'

const recovery = {
  datacenters: [{ id: 'dc1', name: 'DC01' }, { id: 'dc2', name: 'DC02' }],
  profiles: [
    { id: 'p1', name: 'DC01-CLUSTER01', datacenterId: 'dc1', reviewed: true, drifted: false, lastRehearsal: '2026-10-29T10:00:00Z' },
    { id: 'p2', name: 'DC02-CLUSTER02', datacenterId: 'dc2', reviewed: false, drifted: true },
  ],
  runs: [{ id: 'run1', profileId: 'p1', clusterName: 'DC01-CLUSTER01', mode: 'recovery', status: 'awaiting_health_verification', deploymentJobId: 'job1', updatedAt: '2026-10-31T12:00:00Z' }],
}

async function seed(page: Page, role = 'admin') {
  await page.addInitScript(role => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-operator', role }, sidebarOpen: true, sidebarPreferenceInitialized: true, settings: {} }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  }, role)
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (url.pathname === '/api/recovery') return route.fulfill({ json: recovery })
    if (url.pathname === '/api/jobs') return route.fulfill({ json: [{ id: 'job1', workflow: 'cluster-create-foundation-vm', type: 'workflow', user: 'example-operator', status: 'success', createdAt: '2026-10-31T11:00:00Z', updatedAt: '2026-10-31T12:00:00Z' }] })
    if (url.pathname === '/api/drift') return route.fulfill({ json: [
      { id: 'old', configFile: 'baseline.yml', workflow: 'config-cluster', status: 'drifted', timestamp: '2026-10-29T10:00:00Z', summary: { changed: 1, missing: 0, unexpected: 0 }, findings: [] },
      { id: 'new', configFile: 'baseline.yml', workflow: 'config-cluster', status: 'matched', timestamp: '2026-10-31T10:00:00Z', summary: { changed: 0, missing: 0, unexpected: 0 }, findings: [] },
    ] })
    if (url.pathname === '/api/approvals') return route.fulfill({ json: [{ id: 'a1', status: 'pending' }] })
    if (url.pathname === '/api/health/details') return route.fulfill({ json: { status: 'healthy', storage: 'file' } })
    if (url.pathname === '/api/visibility/summary') return route.fulfill({ status: 503, json: { error: 'unavailable in fixture' } })
    if (url.pathname === '/api/maintenance/database-backups') return route.fulfill({ json: { backups: [] } })
    return route.fulfill({ json: [] })
  })
}

test('focused overview uses recorded data and preserves advanced functionality', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 1585, height: 992 })
  await page.goto('/overview')
  const core = page.getByTestId('operations-overview')
  for (const name of ['Deploy a Cluster', 'Configure a Cluster', 'Recover Infrastructure', 'Monitor & Verify']) await expect(core.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(core.getByText('Job succeeded', { exact: true })).toBeVisible()
  await expect(core.getByText('DC01-CLUSTER01', { exact: true })).toBeVisible()
  await expect(core.getByText('Drift detected', { exact: true })).toHaveCount(0)
  await expect(core.getByText('Recovery profiles need review', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'NKP Framework Preview', exact: true })).toBeHidden()
  await page.screenshot({ path: 'test-results/streamlined-20261031-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Optional Integrations', exact: true }).click()
  await expect(page.getByRole('link', { name: 'NKP Framework Preview', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Advanced Automation', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Scripts', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Parallel Exec', exact: true })).toBeVisible()
  await page.locator('#platform-details > summary').click()
  await expect(page.getByRole('heading', { name: 'Readiness Layers', exact: true })).toBeVisible()
  await core.getByRole('link', { name: 'View job job1', exact: true }).click()
  await expect(page).toHaveURL(/\/jobs\?job=job1$/)
  await expect(page.getByRole('button', { name: 'Collapse job details', exact: true })).toBeVisible()
})

test('cluster view filters saved profiles and never asserts live cluster health', async ({ page }) => {
  await seed(page)
  await page.goto('/clusters')
  await expect(page.getByText('DC01-CLUSTER01', { exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'Datacenter', exact: true }).selectOption('dc2')
  await expect(page.getByText('DC01-CLUSTER01', { exact: true })).toHaveCount(0)
  await expect(page.getByText('DC02-CLUSTER02', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Search profiles', exact: true }).fill('nothing')
  await expect(page.getByText('No saved profiles match this view.')).toBeVisible()
  await expect(page.getByText(/not discovered live clusters or verified health/)).toBeVisible()
})

test('recovery collection failure stays unavailable rather than reporting zero preparation', async ({ page }) => {
  await seed(page)
  await page.route('**/api/recovery', route => route.fulfill({ status: 429, contentType: 'text/html', body: '<h1>Too Many Requests</h1>' }))
  await page.goto('/overview')
  await expect(page.getByTestId('operations-overview').getByRole('status')).toContainText('Recovery records unavailable')
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible()
  await expect(page.getByTestId('operations-overview').getByRole('link', { name: /Cluster profiles/ })).toContainText('—')
})

test('viewer keeps guidance and read-only records without gaining privileged navigation', async ({ page }) => {
  await seed(page, 'viewer')
  await page.goto('/overview')
  await page.getByRole('button', { name: 'Administration', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Audit Log', exact: true })).toHaveCount(0)
  await page.goto('/workflows/config-cluster')
  await expect(page.getByRole('heading', { name: 'Permission Required' })).toBeVisible()
  await page.goto('/clusters')
  await expect(page.getByRole('heading', { name: 'Clusters', exact: true })).toBeVisible()
})

test('mobile actions remain usable without horizontal page overflow', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/overview')
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/streamlined-20261031-mobile.png', fullPage: true })
})
