import { expect, test } from '@playwright/test'

const uuid = '12345678-0000-4000-8000-000000000001'
const cluster = { uuid, name: 'LAB-AHV-01', aosVersion: '7.5.1.8', hostSerials: ['LAB-01', 'LAB-02', 'LAB-03'] }
const observation = { cluster, state: 'unconfigured', lastKeyBackupAt: null }
const content = JSON.stringify({ cluster, desired: { type: 'SOFTWARE', scope: 'CLUSTER', kmsType: 'NATIVE_LOCAL' } })
const base = '/api/dare'

for (const mode of ['pc', 'pe-direct'] as const) {
test(mode + ' - reviews a read-only DARE plan, requires approval and confirms the task readback', async ({ page }) => {
  let approved = false
  const applies: unknown[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' },
      sidebarOpen: true, sidebarPreferenceInitialized: true,
    }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [{
      id: 'example-cluster', name: cluster.name, expectedUuid: uuid,
      peEndpoint: 'https://pe.example.com:9440', peCredential: 'pe_admin',
    }] } })
    if (path === base) return route.fulfill({ json: { applyEnabled: true } })
    if (path === base + '/discover') {
      const body = route.request().postDataJSON()
      if (mode === 'pe-direct') {
        expect(body.mode).toBe('pe-direct')
        expect(body.verify_tls).toBe(false)
        expect(body.tls_bypass_reason).toBe('CHG-123 fresh cluster')
        expect(body).not.toHaveProperty('pc_endpoint')
        expect(body).not.toHaveProperty('pc_credential')
      }
      return route.fulfill({ json: observation })
    }
    if (path === base + '/preflight') return route.fulfill({ json: { ...observation, content, sha256: 'a'.repeat(64) } })
    if (path === base + '/approval') return route.fulfill({ status: 201, json: { id: 'approval-1' } })
    if (path === '/api/approvals/approval-1') return route.fulfill({ json: { status: approved ? 'approved' : 'pending' } })
    if (path === base + '/apply') {
      applies.push(route.request().postDataJSON())
      return route.fulfill({ status: 202, json: { id: 'job-1' } })
    }
    if (path === '/api/jobs/job-1') return route.fulfill({ json: {
      status: 'success', diagnostics: { encryptionState: 'enabled', backgroundStatus: 'unreported' },
    } })
    return route.fulfill({ json: {} })
  })
  await page.setViewportSize({ width: 1536, height: 940 })
  await page.goto('/start/configure')
  await page.getByRole('link', { name: 'Enable Data-at-Rest Encryption (DARE)' }).click()
  await page.getByLabel('Managed cluster (optional)').selectOption('example-cluster')
  if (mode === 'pc') {
  await page.getByLabel('Connection mode').selectOption('pc')
  await expect(page.getByLabel('Verify PE TLS certificate (optional)', { exact: true })).not.toBeChecked()
  await page.getByLabel('Prism Central HTTPS endpoint').fill('https://pc.example.com:9440')
  await page.getByLabel('PC credential reference').fill('pc_admin')
  } else {
    await expect(page.getByLabel('Prism Central HTTPS endpoint')).toHaveCount(0)
    await expect(page.getByLabel('Verify PE TLS certificate')).not.toBeChecked()
    await page.getByLabel('TLS bypass reason').fill('')
    await expect(page.getByRole('button', { name: 'Discover cluster (read-only)' })).toBeDisabled()
    await page.getByLabel('TLS bypass reason').fill('CHG-123 fresh cluster')
  }
  await page.getByRole('button', { name: 'Discover cluster (read-only)' }).click()
  await expect(page.getByRole('heading', { name: 'Native KMS (Local)' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue to preflight' }).click()
  await expect(page.getByRole('button', { name: 'Run read-only preflight' })).toBeDisabled()
  for (const item of await page.getByRole('checkbox').all()) await item.check()
  await page.getByLabel('Change ticket or key recovery runbook ID').fill('CHG-123')
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await expect(page.getByText('Software encryption cannot be disabled after enablement.', { exact: true })).toBeVisible()
  if (mode === 'pe-direct') await expect(page.getByText(/PE direct.*TLS verification bypassed for this run.*CHG-123 fresh cluster/)).toBeVisible()
  if (mode === 'pe-direct') {
    await page.getByRole('button', { name: 'Start a new review' }).click()
    await expect(page.getByLabel('Verify PE TLS certificate')).not.toBeChecked()
    await expect(page.getByLabel('TLS bypass reason')).toHaveValue('Initial cluster deployment or disaster recovery configuration')
    await page.getByLabel('Managed cluster (optional)').selectOption('example-cluster')
    await page.getByLabel('Verify PE TLS certificate').uncheck()
    await page.getByLabel('TLS bypass reason').fill('CHG-123 fresh cluster')
    await page.getByRole('button', { name: 'Discover cluster (read-only)' }).click()
    await page.getByRole('button', { name: 'Continue to preflight' }).click()
    for (const item of await page.getByRole('checkbox').all()) await item.check()
    await page.getByLabel('Change ticket or key recovery runbook ID').fill('CHG-123')
    await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  }
  await page.getByRole('button', { name: 'Request independent approval' }).click()
  await expect(page.getByText('Approval · pending', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/dare-review.png', fullPage: true })
  await expect(page.getByRole('button', { name: 'Continue to enablement' })).toBeDisabled()
  expect(applies).toHaveLength(0)
  approved = true
  await page.reload()
  await page.getByRole('button', { name: 'Continue to enablement' }).click()
  await expect(page.getByRole('button', { name: 'Enable approved encryption' })).toBeDisabled()
  await page.getByLabel('Type ENCRYPT ' + uuid).fill('ENCRYPT ' + uuid)
  await page.getByRole('button', { name: 'Enable approved encryption' }).click()
  await expect(page.getByText('Encryption configuration verified in Prism.', { exact: true })).toBeVisible()
  await expect(page.getByText(/Check background encryption progress/)).toBeVisible()
  expect(applies).toEqual([{ content, approvalId: 'approval-1', confirmation: 'ENCRYPT ' + uuid }])
})

}
