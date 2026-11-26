import { expect, test } from '@playwright/test'

test('Bulk profile assignment selects datacentres and clusters without technical fields', async ({ page }) => {
  const clusters = Array.from({ length: 48 }, (_, i) => ({ id: 'cluster-' + i, name: `Cluster ${String(i + 1).padStart(2, '0')}`, datacenter: i < 24 ? 'DC North' : 'DC South', datacenterId: i < 24 ? 'north' : 'south', executionReady: i % 2 === 0 }))
  let saved: any = null
  const document = { version: 1, revision: 0, profiles: [
    { id: 'viewer', name: 'Viewer', role: 'viewer', capabilities: ['clusters.view', 'history.view'] },
    { id: 'operator', name: 'Operator', role: 'operator', capabilities: ['clusters.view', 'history.view', 'pipeline.execute', 'jobs.cancel_own', 'requests.create', 'drafts.create'] },
  ], assignments: {} }
  const users = [{ id: 'op1', username: 'operator-one', role: 'operator' }, { id: 'op2', username: 'operator-two', role: 'operator' }, { id: 'view', username: 'viewer-one', role: 'viewer' }]
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' }, sidebarOpen: true, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/health', route => route.fulfill({ json: { ztf: { installed: true } } }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/access/admin/bulk/preview') {
      const data = route.request().postDataJSON().document
      return route.fulfill({ json: { fingerprint: 'review', accounts: Object.entries(data.assignments).map(([id, a]: [string, any]) => ({ accountId: id, username: users.find(u => u.id === id)?.username, clusterCount: a.clusterIds.length + (a.datacenterIds.includes('south') ? 24 : 0), inheritedDatacenters: a.datacenterIds.length, capabilities: data.profiles.find((p: any) => p.id === a.profileId).capabilities })) } })
    }
    if (path === '/api/access/admin/bulk') {
      if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); return route.fulfill({ json: saved.document }) }
      return route.fulfill({ json: { document: saved?.document || document, clusters, catalogueFingerprint: 'catalogue' } })
    }
    if (path === '/api/access/admin') return route.fulfill({ json: { policy: { version: 1, revision: 0, scopes: [], assignments: {}, bindings: [] }, users, pipelines: [], requests: [], drafts: [], runs: [] } })
    if (path === '/api/auth/me') return route.fulfill({ json: { username: 'example-admin', role: 'admin' } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/access-control')
  const bulk = page.getByRole('region', { name: 'Bulk access management' })
  await expect(bulk.getByLabel('Run authorised pipelines', { exact: true })).toBeDisabled()
  await expect(bulk.getByLabel('PE HTTPS endpoint')).toHaveCount(0)
  await expect(bulk.getByLabel('Expected cluster UUID')).toHaveCount(0)
  await bulk.getByLabel('Permission profile', { exact: true }).selectOption('operator')
  await bulk.getByRole('button', { name: 'Select matching operator accounts' }).click()
  await bulk.getByRole('button', { name: 'Select all existing clusters in DC North' }).click()
  await bulk.getByLabel('Entire DC South, including future clusters').check()
  await expect(bulk.getByText('48 clusters selected', { exact: true })).toBeVisible()
  await bulk.getByLabel('Search datacentres or clusters').fill('Cluster 01')
  await expect(bulk.getByText('Cluster 01', { exact: true })).toBeVisible()
  await expect(bulk.getByText('Cluster 02', { exact: true })).toHaveCount(0)
  await bulk.getByLabel('Search datacentres or clusters').fill('')
  await bulk.getByRole('button', { name: 'Apply selection to draft' }).click()
  await bulk.getByRole('button', { name: 'Review access changes' }).click()
  await expect(bulk.getByRole('heading', { name: 'Review effective access' })).toBeVisible()
  await bulk.getByRole('button', { name: 'Save reviewed access' }).click()
  await expect(bulk.getByRole('status')).toContainText('bulk access saved')
  expect(Object.keys(saved.document.assignments)).toEqual(['op1', 'op2'])
  expect(saved.document.assignments.op1.clusterIds).toHaveLength(24)
  expect(saved.document.assignments.op1.datacenterIds).toEqual(['south'])
  expect(saved.document.assignments.op1).toEqual(saved.document.assignments.op2)
  await page.screenshot({ path: 'test-results/bulk-cluster-access-light.png', fullPage: true })
})
