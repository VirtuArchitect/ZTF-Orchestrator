import { expect, test, type Page } from '@playwright/test'

const update = { id: 'fixture-update', version: 'v1.8.5-rc1-example', target: 'ztf-orchestrator', packageId: 'example-package', packageAvailable: true, name: 'Example update', repository: 'virtuarchitect/ztf-orchestrator', containerImage: 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.5-rc1-example', status: 'imported', source: 'offline' }
const plan = { id: 'example-plan', version: update.version, packageId: update.packageId, ready: true, backupBytes: 1024 ** 3,
  disks: [{ location: '/opt/ztf-orchestrator', freeBytes: 30 * 1024 ** 3, requiredBytes: 6 * 1024 ** 3, ok: true }],
  cleanup: [{ id: 'package:obsolete-example', label: 'Imported package v1.8.4-example', sizeBytes: 640 * 1024 ** 2 }] }

async function setup(page: Page, role = 'admin', available = true) {
  await page.addInitScript(role => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-operator', role }, settings: {}, ztfInstalled: true, sidebarOpen: true, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  }, role)
  const fixture = { operation: null as null | Record<string, unknown>, actions: [] as Array<Record<string, unknown>>, updates: [] as typeof update[], loseInstallResponse: false, hostReads: 0 }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/appliance/updates/control') {
      if (route.request().method() === 'GET') {
        fixture.hostReads++
        return route.fulfill({ json: { available, maintenance: fixture.operation?.action === 'install', operation: fixture.operation, message: available ? '' : 'Guided updates require the one-time host update service installation.' } })
      }
      const data = route.request().postDataJSON()
      fixture.actions.push(data)
      fixture.operation = { id: data.requestId, action: data.action, status: ['preflight', 'storage'].includes(data.action) ? 'succeeded' : 'running', message: data.action === 'install' ? 'Stopping application writes; PostgreSQL remains running' : 'Readiness checks complete.', ...(data.action === 'preflight' ? { plan } : data.action === 'storage' ? { plan: { ...plan, purpose: 'storage', packageId: '' } } : {}) }
      if (data.action === 'install' && fixture.loseInstallResponse) return route.abort()
      return route.fulfill({ status: 202, json: { id: data.requestId, status: 'queued' } })
    }
    if (path === '/api/appliance/updates/import-package') { fixture.updates = [update]; return route.fulfill({ status: 201, json: update }) }
    if (path === '/api/appliance/updates') return route.fulfill({ json: { current: { version: '1.8.5-rc1' }, updates: fixture.updates, allowedRepositories: [] } })
    if (path === '/api/appliance/artifacts') return route.fulfill({ json: { artifacts: [], summary: {} } })
    if (path === '/api/appliance/status') return route.fulfill({ json: { checks: [], containerPaths: {} } })
    if (path === '/api/ztf/compatibility') return route.fulfill({ json: { installed: true, supportedModes: [] } })
    if (path === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/appliance')
  await page.getByRole('button', { name: 'Updates', exact: true }).click()
  return fixture
}

async function uploadAndCheck(page: Page) {
  const guide = page.getByRole('region', { name: 'Guided appliance update' })
  await guide.getByLabel('1. Upload offline appliance update ZIP').setInputFiles({ name: 'example-update.zip', mimeType: 'application/zip', buffer: Buffer.from('isolated browser fixture') })
  await guide.getByRole('button', { name: 'Upload and Verify ZIP' }).click()
  await expect(guide.getByRole('button', { name: 'Check Readiness' })).toBeEnabled()
  await guide.getByRole('button', { name: 'Check Readiness' }).click()
  await expect(guide.getByText('Readiness: Ready for review', { exact: true })).toBeVisible({ timeout: 10000 })
  return guide
}

test('guided ZIP import, readiness, reviewed cleanup and exact approval', async ({ page }) => {
  const fixture = await setup(page)
  const guide = await uploadAndCheck(page)
  await expect(guide.getByRole('button', { name: 'Back Up and Install' })).toBeDisabled()
  await guide.getByText('Review safe cleanup', { exact: false }).click()
  await expect(guide.getByRole('button', { name: 'Remove Selected Artifacts' })).toBeDisabled()
  expect(fixture.actions.map(v => v.action)).toEqual(['preflight'])
  await guide.getByRole('checkbox').first().check()
  await expect(guide.getByRole('button', { name: 'Remove Selected Artifacts' })).toBeEnabled()
  await page.setViewportSize({ width: 1585, height: 1500 })
  await page.locator('main').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: 'test-results/guided-appliance-update-readiness.png', fullPage: true })
  await guide.getByLabel(`Type INSTALL ${update.version} to approve this version`).fill(`INSTALL ${update.version}`)
  await guide.getByRole('button', { name: 'Back Up and Install' }).click()
  await expect(guide.getByText('Operation: install · running', { exact: true })).toBeVisible({ timeout: 10000 })
  expect(fixture.actions.filter(v => v.action === 'install')).toHaveLength(1)
  await page.locator('main').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: 'test-results/guided-appliance-update-progress.png', fullPage: true })
})

test('unavailable service explains bootstrap and disables installation', async ({ page }) => {
  await setup(page, 'admin', false)
  const guide = page.getByRole('region', { name: 'Guided appliance update' })
  await expect(guide.getByText('Guided updates require the one-time host update service installation.')).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Check Readiness' })).toBeDisabled()
})

test('storage can be reviewed before upload without approving installation', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }) })
  const fixture = await setup(page)
  const guide = page.getByRole('region', { name: 'Guided appliance update' })
  await guide.getByRole('button', { name: 'Review Storage Before Upload' }).click()
  await expect(guide.getByText('Storage review (installation not approved)', { exact: true })).toBeVisible({ timeout: 10000 })
  await expect(guide.getByRole('button', { name: 'Back Up and Install' })).toHaveCount(0)
  expect(fixture.actions.map(v => v.action)).toEqual(['storage'])
})

test('lost installation response reconnects to durable operation without resubmitting', async ({ page }) => {
  const fixture = await setup(page)
  const guide = await uploadAndCheck(page)
  fixture.loseInstallResponse = true
  await guide.getByLabel(`Type INSTALL ${update.version} to approve this version`).fill(`INSTALL ${update.version}`)
  await guide.getByRole('button', { name: 'Back Up and Install' }).click()
  await expect(guide.getByRole('alert')).toContainText('Submission could not be confirmed')
  await expect(guide.getByText('Operation: install · running', { exact: true })).toBeVisible({ timeout: 10000 })
  await page.reload()
  await page.getByRole('button', { name: 'Updates', exact: true }).click()
  await expect(page.getByText('Operation: install · running', { exact: true })).toBeVisible()
  expect(fixture.actions.filter(v => v.action === 'install')).toHaveLength(1)
})

test('operator retains existing appliance tools without privileged service access', async ({ page }) => {
  const fixture = await setup(page, 'operator')
  await expect(page.getByText('An administrator can install appliance updates.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check Readiness' })).toHaveCount(0)
  expect(fixture.hostReads).toBe(0)
})

test('guided update is usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  const guide = await uploadAndCheck(page)
  await expect(guide.getByRole('button', { name: 'Back Up and Install' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.locator('main').evaluate(element => { element.scrollTop = 0 })
  await page.screenshot({ path: 'test-results/guided-appliance-update-mobile.png', fullPage: true })
})
