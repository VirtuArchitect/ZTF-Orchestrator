import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, required = false, savedAction = 'config-cluster', fail = false) {
  const writes: any[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true, settings: { approvalRequiredWorkflows: ['config-cluster'] } }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/pipelines/actions') return route.fulfill({ status: fail ? 503 : 200, json: { actions: [
      { id: 'config-cluster', available: !required, reason: required ? 'Requires a direct approved job under current Governance policy' : '' },
      { id: 'initial-host-cvm-password-setup', available: true, reason: '' },
      { id: 'pod-config', available: true, reason: '' },
    ] } })
    if (path === '/api/config-organization') return route.fulfill({ json: { version: 1, revision: 0, groups: [], assignments: {} } })
    if (path === '/api/configs') return route.fulfill({ json: [{ name: '08.yml' }] })
    if (path === '/api/pipelines') return route.fulfill({ json: [{ id: 'saved', name: 'Saved pipeline', executor: savedAction === 'RegisterToPc' ? 'native' : 'legacy', steps: [{ workflow: savedAction, configFile: '08.yml' }], updatedAt: '2026-11-24T10:00:00Z' }] })
    if (route.request().method() !== 'GET' && path !== '/api/auth/activity') writes.push({ path, body: route.request().postDataJSON() })
    return route.fulfill({ json: {} })
  })
  await page.goto('/pipelines')
  await page.getByTitle('Edit pipeline', { exact: true }).click()
  return writes
}

test('fresh server policy makes Configure Cluster available despite stale browser defaults', async ({ page }) => {
  const writes = await setup(page)
  const action = page.getByLabel('Workflow action 1', { exact: true })
  await expect(action).toBeEnabled()
  await expect(action).toHaveValue('config-cluster')
  await expect(action.getByRole('option', { name: 'Configure Cluster', exact: true })).toBeEnabled()
  await expect(action.locator('option')).toHaveText(['Select workflow', 'Initial Host & CVM Password Setup', 'Configure Cluster', 'Pod Config'])
  expect(writes).toEqual([])
  await page.screenshot({ path: 'test-results/pipeline-actions-light.png', fullPage: true })
})

test('required approval stays enforced and the UI explains the blocked choice', async ({ page }) => {
  const writes = await setup(page, true)
  const action = page.getByLabel('Workflow action 1', { exact: true })
  await expect(action).toHaveValue('config-cluster')
  await expect(action.getByRole('option', { name: /Configure Cluster/ })).toBeDisabled()
  await expect(page.getByLabel('Pipeline workflow availability')).toContainText('Use its direct approved workflow')
  await page.getByRole('button', { name: 'Update Pipeline', exact: true }).click()
  expect(writes).toEqual([])
})

test('retired saved action is retained instead of displaying the first option', async ({ page }) => {
  const writes = await setup(page, false, 'RegisterToPc')
  const action = page.getByLabel('Workflow action 1', { exact: true })
  await expect(action).toHaveValue('RegisterToPc')
  await expect(action.locator('option:checked')).toContainText('Register PE to PC')
  await expect(action.locator('option:checked')).toContainText('unavailable; retained')
  await page.getByRole('button', { name: 'Update Pipeline', exact: true }).click()
  expect(writes).toEqual([])
})

test('failed catalogue preserves draft and blocks save', async ({ page }) => {
  const writes = await setup(page, false, 'RegisterToPc', true)
  await expect(page.getByLabel('Pipeline workflow availability')).toContainText('could not be loaded')
  await expect(page.getByLabel('Workflow action 1', { exact: true })).toHaveValue('RegisterToPc')
  await expect(page.getByRole('button', { name: 'Update Pipeline', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh actions', exact: true })).toBeVisible()
  expect(writes).toEqual([])
})


test('new pipeline steps require an explicit action instead of defaulting to password setup', async ({ page }) => {
  const writes = await setup(page)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New Pipeline', exact: true }).click()
  await expect(page.getByLabel('Workflow action 1', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'Add Step', exact: true }).click()
  await expect(page.getByLabel('Workflow action 2', { exact: true })).toHaveValue('')
  await page.getByPlaceholder('e.g. Full Site Deployment').fill('Explicit choices required')
  await page.getByRole('button', { name: 'Create Pipeline', exact: true }).click()
  expect(writes).toEqual([])
})
