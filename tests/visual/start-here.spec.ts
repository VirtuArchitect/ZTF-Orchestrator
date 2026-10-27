import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page, role = 'admin', username = 'guide-test') {
  await page.addInitScript(({ role, username }) => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'fixture-only', user: { username, role }, sidebarOpen: false, sidebarPreferenceInitialized: true, settings: {},
  }, version: 0 })), { role, username })
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().endsWith('/api/system/check') ? { checks: [], ztfInstalled: true } : [] }))
}

test('new users land on four choices and can persist a scoped landing preference', async ({ page, context }) => {
  await seed(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/start$/)
  for (const name of ['Deploy a Cluster', 'Configure an Existing Cluster', 'Monitor & Assess', 'Run Saved Automation'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await page.getByRole('combobox', { name: 'My landing page' }).selectOption('/overview')
  await page.goto('/')
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Deploy a Cluster', exact: true })).toBeVisible()
  const otherUser = await context.newPage()
  await seed(otherUser, 'admin', 'different-user')
  await otherUser.goto('/')
  await expect(otherUser).toHaveURL(/\/start$/)
})

test('guide resumes without submissions and hands off to existing workflow and pipeline', async ({ page }) => {
  await seed(page)
  const writes: string[] = []
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(r.url()) })
  await page.goto('/start/deploy')
  await page.getByRole('radio', { name: 'Foundation VM', exact: true }).check()
  await page.getByRole('button', { name: '3. Define the cluster', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue later' }).click()
  await expect(page.getByRole('status')).toContainText('nothing was executed')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Define the cluster', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Foundation VM configuration' })).toHaveAttribute('href', '/workflows/cluster-create-foundation-vm')
  await page.getByRole('button', { name: '5. Review & approve', exact: true }).click()
  await expect(page.getByText(/Imaging can overwrite existing installations/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review approvals' })).toHaveAttribute('href', '/approvals')
  await page.getByRole('button', { name: '7. Continue with post-configuration', exact: true }).click()
  await page.getByRole('link', { name: 'Continue to Post-Configuration', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Build your post-configuration pipeline' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open pipelines' })).toHaveAttribute('href', '/pipelines')
  expect(writes).toEqual([])
})

test('all deployment methods resolve to existing execution forms', async ({ page }) => {
  await seed(page)
  for (const [name, id] of [['Foundation VM', 'cluster-create-foundation-vm'], ['Foundation Central', 'cluster-create'], ['Standalone FCA', 'cluster-create-standalone-fca']]) {
    await page.goto('/start/deploy')
    await page.getByRole('button', { name: '1. Choose deployment method', exact: true }).click()
    await page.getByRole('radio', { name, exact: true }).check()
    await page.getByRole('button', { name: '2. Connect to the deployment service', exact: true }).click()
    await expect(page.getByRole('link', { name: `Open ${name} configuration` })).toHaveAttribute('href', `/workflows/${id}`)
  }
})

test('viewer guidance preserves protected routes and hides execution links', async ({ page }) => {
  await seed(page, 'viewer')
  await page.goto('/start/deploy')
  await page.getByRole('button', { name: '2. Connect to the deployment service', exact: true }).click()
  await expect(page.getByText(/Your viewer role cannot open/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Foundation VM configuration' })).toHaveCount(0)
  await page.goto('/workflows/cluster-create-foundation-vm')
  await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible()
})

test('invalid saved guide data falls back safely and mobile guidance fits', async ({ page }) => {
  await seed(page)
  await page.addInitScript(() => localStorage.setItem('ztf-guide-v1:guide-test:deployment', JSON.stringify({ method: 'https://invalid.example', step: 900 })))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/start/deploy')
  await expect(page.getByRole('heading', { name: 'Choose deployment method', exact: true })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Foundation VM', exact: true })).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/start-here-mobile.png', fullPage: true })
})

test('unavailable browser storage reports failed saves without claiming success', async ({ page }) => {
  await seed(page)
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('ztf-guide-v1:')) throw new DOMException('Storage disabled', 'SecurityError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/start')
  await page.getByRole('combobox', { name: 'My landing page' }).selectOption('/overview')
  await expect(page.getByRole('status')).toContainText('not saved')
  await page.goto('/start/deploy')
  await page.getByRole('button', { name: 'Save and continue later' }).click()
  await expect(page.getByRole('status')).toContainText('not saved')
})

test('saved pipelines show descriptive actions with internal identifiers in details', async ({ page }) => {
  await seed(page)
  await page.route('**/api/pipelines', route => route.fulfill({ json: [{
    id: 'guide-pipeline', name: 'Example post-configuration', updatedAt: '2026-10-01T12:00:00Z',
    steps: [{ workflow: 'config-cluster', configFile: 'example-cluster.yml' }],
  }] }))
  await page.goto('/pipelines')
  await expect(page.getByText('Configure Cluster', { exact: true })).toBeVisible()
  await expect(page.getByTitle('Action ID: config-cluster')).toContainText('Configure Cluster')
})

test('capture start page and deployment guidance in both themes', async ({ page }) => {
  await seed(page)
  await page.addInitScript(() => {
    const stored = JSON.parse(sessionStorage.getItem('ztf-ui-store') || '{}')
    stored.state.sidebarOpen = true
    sessionStorage.setItem('ztf-ui-store', JSON.stringify(stored))
  })
  await page.setViewportSize({ width: 1440, height: 1050 })
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(theme => localStorage.setItem('ztf-theme-mode', theme), theme)
    await page.goto('/start')
    await page.screenshot({ path: `test-results/start-here-${theme}.png`, fullPage: true })
    await page.goto('/start/deploy')
    await page.screenshot({ path: `test-results/deployment-guide-${theme}.png`, fullPage: true })
  }
})
