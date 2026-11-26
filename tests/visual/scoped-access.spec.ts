import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, role: string, failure = false) {
  const requests: string[] = []
  const scopes = [{ id: 'one', name: 'Example cluster', datacenter: 'Example DC', peIp: 'https://192.0.2.20:9440', clusterUuid: 'example-uuid' }]
  await page.addInitScript(role => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'fixture-' + role, role }, sidebarOpen: true, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  }, role)
  await page.route('**/health', route => route.fulfill({ json: { ztf: { installed: true } } }))
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (path === '/api/access/workspace') return route.fulfill({ status: failure ? 503 : 200, json: failure ? { error: 'Access policy is unavailable. Contact an administrator.' } : {
      user: { username: 'fixture-' + role, role }, scopes,
      capabilities: role === 'operator' ? ['pipeline.execute', 'requests.create', 'drafts.create'] : [],
      pipelines: [{ id: 'baseline', name: 'Reviewed baseline', bindingId: 'binding', scopeIds: ['one'], steps: [{ workflow: 'config-cluster' }], executable: role === 'operator', reviewRequired: false }],
      runs: [{ id: 'receipt', pipelineId: 'baseline', status: 'success', events: [{ type: 'step_complete', data: { step: 0, status: 'success' } }], canCancel: false }], requests: [], recovery: [], drafts: []
    } })
    if (path === '/api/access/admin/bulk') return route.fulfill({ json: { document: { version: 1, revision: 0, profiles: [{ id: 'viewer', name: 'Viewer', role: 'viewer', capabilities: ['clusters.view', 'history.view'] }, { id: 'operator', name: 'Operator', role: 'operator', capabilities: ['clusters.view', 'pipeline.execute'] }], assignments: {} }, clusters: [], catalogueFingerprint: 'fixture' } })
    if (path === '/api/access/admin') return route.fulfill({ json: { policy: { version: 1, revision: 0, scopes: [], assignments: {}, bindings: [] }, users: [{ id: 'op', username: 'example-operator', role: 'operator' }, { id: 'view', username: 'example-viewer', role: 'viewer' }], pipelines: [], requests: [], drafts: [] } })
    if (path === '/api/auth/me') return route.fulfill({ json: { username: 'fixture-' + role, role } })
    return route.fulfill({ json: {} })
  })
  return requests
}

test('Viewer direct administration URL redirects to read-only scoped workspace', async ({ page }) => {
  const requests = await setup(page, 'viewer')
  await page.goto('/global-config')
  await expect(page).toHaveURL(/\/operations$/)
  await expect(page.getByRole('heading', { name: 'Read-only access' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Example cluster' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run reviewed pipeline' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Request recovery' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Global Config', exact: true })).toHaveCount(0)
  expect(requests.every(path => path.startsWith('/api/access/') || path.startsWith('/api/auth/'))).toBeTruthy()
  await page.screenshot({ path: 'test-results/scoped-viewer-light.png', fullPage: true })
})

test('Operator sees explicit capabilities and confirms exact reviewed intent', async ({ page }) => {
  const requests = await setup(page, 'operator')
  await page.goto('/pipelines')
  await expect(page.getByRole('button', { name: 'Run reviewed pipeline' })).toBeVisible()
  await page.getByRole('button', { name: 'Run reviewed pipeline' }).click()
  await expect(page.getByRole('button', { name: 'Confirm execution' })).toBeDisabled()
  await page.getByLabel('Type RUN baseline').fill('RUN wrong')
  await expect(page.getByRole('button', { name: 'Confirm execution' })).toBeDisabled()
  await page.getByLabel('Type RUN baseline').fill('RUN baseline')
  await expect(page.getByRole('button', { name: 'Confirm execution' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Request recovery' })).toBeDisabled()
  await page.getByLabel('Assigned cluster', { exact: true }).selectOption('one')
  await expect(page.getByRole('button', { name: 'Request recovery' })).toBeEnabled()
  expect(requests).not.toContain('/api/global-config')
  expect(requests).not.toContain('/api/pipelines')
  expect(requests).not.toContain('/api/approvals')
  await page.screenshot({ path: 'test-results/scoped-operator-light.png', fullPage: true })
})

test('Failed policy load exposes no stale target data', async ({ page }) => {
  await setup(page, 'viewer', true)
  await page.goto('/operations')
  await expect(page.getByRole('alert')).toContainText('Access policy is unavailable')
  await expect(page.getByRole('heading', { name: 'Example cluster' })).toHaveCount(0)
})

test('Admin can configure scopes; Viewer execution capabilities stay disabled', async ({ page }) => {
  await setup(page, 'admin')
  await page.goto('/access-control')
  await expect(page.getByRole('heading', { name: 'Access Control', exact: true })).toBeVisible()
  await page.getByText('Advanced legacy scopes and assignments', { exact: true }).click()
  await page.getByLabel('Account', { exact: true }).selectOption('view')
  await expect(page.getByLabel('Run reviewed pipelines', { exact: true })).toBeDisabled()
  await page.getByLabel('Account', { exact: true }).selectOption('op')
  await expect(page.getByLabel('Run reviewed pipelines', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Review exact pipeline', exact: true })).toBeDisabled()
  await page.screenshot({ path: 'test-results/scoped-admin-light.png', fullPage: true })
})
