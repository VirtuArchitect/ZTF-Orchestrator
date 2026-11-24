import { expect, test, type Page } from '@playwright/test'

const groups = [
  { id: 'cluster-a', name: 'Cluster A', datacenter: 'DC-A', kind: 'cluster' },
  { id: 'cluster-b', name: 'Cluster B', datacenter: 'DC-B', kind: 'cluster' },
  { id: 'shared', name: 'Templates', datacenter: '', kind: 'shared' },
]
async function setup(page: Page, failGroups = false) {
  const submissions: any[] = []
  const pipelines: any[] = [
    { id: 'a', name: 'Alpha configuration', groupId: 'cluster-a', steps: [{ workflow: 'config-cluster', configFile: 'a.yml' }], updatedAt: '2026-11-24T10:00:00Z' },
    { id: 'b', name: 'Beta configuration', groupId: 'cluster-b', steps: [{ workflow: 'config-cluster', configFile: 'b.yml' }], updatedAt: '2026-11-24T10:00:00Z' },
    { id: 'old', name: 'Existing ungrouped', steps: [{ workflow: 'config-cluster', configFile: 'b.yml' }], updatedAt: '2026-11-24T10:00:00Z' },
    { id: 'removed', name: 'Previous group pipeline', groupId: 'deleted', steps: [], updatedAt: '2026-11-24T10:00:00Z' },
  ]
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/config-organization') return route.fulfill({ status: failGroups ? 503 : 200, json: { version: 1, revision: 0, groups, assignments: { 'a.yml': { groupId: 'cluster-a', purpose: '' }, 'b.yml': { groupId: 'cluster-b', purpose: '' }, 'shared.yml': { groupId: 'shared', purpose: '' } } } })
    if (path === '/api/pipelines/actions') return route.fulfill({ json: { actions: [{ id: 'config-cluster', available: true, reason: '' }] } })
    if (path === '/api/configs') return route.fulfill({ json: ['a.yml', 'b.yml', 'shared.yml'].map(name => ({ name })) })
    if (path === '/api/pipelines' && request.method() === 'GET') return route.fulfill({ json: pipelines })
    if (path === '/api/pipelines' && request.method() === 'POST') {
      const value = request.postDataJSON()
      submissions.push(value)
      const created = { ...value, id: 'new', updatedAt: '2026-11-24T11:00:00Z' }
      pipelines.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    if (path.startsWith('/api/pipelines/') && request.method() === 'PUT') {
      const value = request.postDataJSON()
      submissions.push(value)
      const item = pipelines.find(p => p.id === path.split('/').pop())!
      Object.assign(item, value)
      return route.fulfill({ json: item })
    }
    if (path.includes('/run') || path === '/api/execute' || path === '/api/jobs') throw new Error('No execution allowed during grouping test')
    return route.fulfill({ json: {} })
  })
  await page.goto('/pipelines')
  await expect(page.getByText('Alpha configuration', { exact: true })).toBeVisible()
  return submissions
}

test('datacenter and cluster filters, search, ungrouped and deleted groups stay accessible', async ({ page }) => {
  const submissions = await setup(page)
  const nav = page.getByRole('complementary', { name: 'Pipeline datacenters and clusters' })
  await nav.getByRole('button', { name: 'DC-A', exact: true }).click()
  await expect(page.getByText('Alpha configuration', { exact: true })).toBeVisible()
  await expect(page.getByText('Beta configuration', { exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/group=dc%3ADC-A/)
  await page.reload()
  await expect(nav.getByRole('button', { name: 'DC-A', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await nav.getByRole('button', { name: 'Ungrouped', exact: true }).click()
  await expect(page.getByText('Existing ungrouped', { exact: true })).toBeVisible()
  await expect(page.getByText('Previous group pipeline', { exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'All pipelines', exact: true }).click()
  await page.getByLabel('Search pipelines').fill('b.yml')
  await expect(page.getByText('Beta configuration', { exact: true })).toBeVisible()
  await expect(page.getByText('Alpha configuration', { exact: true })).toHaveCount(0)
  expect(submissions).toEqual([])
})

test('create in selected cluster, scope config choices and retain selection when regrouping', async ({ page }) => {
  const submissions = await setup(page)
  const nav = page.getByRole('complementary', { name: 'Pipeline datacenters and clusters' })
  await nav.getByRole('button', { name: 'Cluster A', exact: true }).click()
  await page.getByRole('button', { name: 'New Pipeline', exact: true }).click()
  await expect(page.getByLabel('Pipeline group')).toHaveValue('cluster-a')
  const picker = page.getByRole('combobox', { name: 'Configuration file', exact: true })
  await expect(picker.getByRole('option', { name: 'a.yml', exact: true })).toHaveCount(1)
  await expect(picker.getByRole('option', { name: 'shared.yml', exact: true })).toHaveCount(1)
  await expect(picker.getByRole('option', { name: 'b.yml', exact: true })).toHaveCount(0)
  await page.getByLabel('Workflow action 1', { exact: true }).selectOption('config-cluster')
  await picker.selectOption('a.yml')
  await page.getByLabel('Pipeline group').selectOption('cluster-b')
  await expect(picker).toHaveValue('a.yml')
  await expect(picker.getByRole('option', { name: /a.yml.*current selection/ })).toHaveCount(1)
  await page.getByPlaceholder('e.g. Full Site Deployment').fill('New cluster pipeline')
  await page.getByRole('button', { name: 'Create Pipeline', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(submissions[0].groupId).toBe('cluster-b')
  expect(submissions[0].steps[0].configFile).toBe('a.yml')
  await nav.getByRole('button', { name: 'Cluster B', exact: true }).click()
  await expect(page.getByText('New cluster pipeline', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/pipeline-cluster-navigation-light.png', fullPage: true })
})

test('group existing pipeline without replacing its steps', async ({ page }) => {
  const submissions = await setup(page)
  const card = page.getByText('Existing ungrouped', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')
  await card.getByTitle('Edit pipeline', { exact: true }).click()
  await page.getByLabel('Pipeline group').selectOption('cluster-a')
  await expect(page.getByRole('combobox', { name: 'Configuration file', exact: true })).toHaveValue('b.yml')
  await page.getByRole('button', { name: 'Update Pipeline', exact: true }).click()
  await expect.poll(() => submissions.length).toBe(1)
  expect(submissions[0].steps).toEqual([{ workflow: 'config-cluster', configFile: 'b.yml' }])
  expect(submissions[0].groupId).toBe('cluster-a')
})

test('group load failure keeps pipelines usable and mobile view fits', async ({ page }) => {
  await setup(page, true)
  await expect(page.getByRole('alert')).toContainText('Existing pipelines remain accessible')
  await page.getByRole('button', { name: 'New Pipeline', exact: true }).click()
  await expect(page.getByLabel('Pipeline group')).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  // Group navigation remains available above the builder on small displays.
  await expect(page.getByRole('complementary', { name: 'Pipeline datacenters and clusters' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
