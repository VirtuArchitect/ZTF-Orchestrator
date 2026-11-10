import { expect, test } from '@playwright/test'

const uuid = '12345678-0000-4000-8000-000000000001'
const content = JSON.stringify({ workflow: 'set-cluster-fqdn', intent: { fqdn: 'pe.example.com' } })
const confirmation = `SET FQDN ${uuid}`

test('post-deployment approval, acceptance and supervised checks on mobile', async ({ page }, testInfo) => {
  const submitted: unknown[] = []
  let approved = false
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' },
      sidebarOpen: false, sidebarPreferenceInitialized: true,
    }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/post-deployment') return route.fulfill({ json: { 'set-cluster-fqdn': true } })
    if (path === '/api/post-deployment/preflight') {
      expect(route.request().postDataJSON().intent.connection.cluster_uuid).toBe(uuid)
      return route.fulfill({ json: { content, sha256: 'a'.repeat(64), confirmation } })
    }
    if (path === '/api/post-deployment/approval') return route.fulfill({ status: 201, json: { id: 'approval-1' } })
    if (path === '/api/approvals/approval-1') return route.fulfill({ json: { status: approved ? 'approved' : 'pending', configContent: content } })
    if (path === '/api/post-deployment/apply') {
      submitted.push(route.request().postDataJSON())
      return route.fulfill({ status: 202, json: { id: 'job-1' } })
    }
    if (path === '/api/post-deployment/acceptance') return route.fulfill({ json: {
      status: 'operator_review_required', clusterUuid: uuid, collectedAt: '2026-01-01T12:00:00Z',
      checks: [{ label: 'Trusted cluster access', passed: true }],
    } })
    if (path === '/api/post-deployment/certificate-check') return route.fulfill({ json: {
      fqdn: 'pe.example.com', endpoints: [{ address: '192.0.2.1', leafSha256: 'b'.repeat(64) }],
    } })
    if (path === '/api/post-deployment/cvm-rename-plan') return route.fulfill({ json: {
      nodes: [{ serial: 'S1', cvmAddress: '192.0.2.10', displayName: 'NTNX-LAB-N01-CVM' }],
    } })
    return route.fulfill({ json: {} })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configure/post-deployment')
  await page.getByLabel('Prism Element endpoint').fill('https://pe.example.com:9440')
  await page.getByLabel('PE credential reference').fill('pe_ref')
  await page.getByLabel('Prism Central endpoint').fill('https://pc.example.com:9440')
  await page.getByLabel('PC credential reference').fill('pc_ref')
  await page.getByLabel('Managed cluster UUID').fill(uuid)
  await page.getByLabel('Expected cluster FQDN').fill('pe.example.com')
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await page.getByRole('button', { name: 'Request independent approval' }).click()
  await page.getByLabel(`Type ${confirmation}`).fill(confirmation)
  await expect(page.getByRole('button', { name: 'Submit approved job' })).toBeDisabled()
  approved = true
  await page.getByRole('button', { name: 'Check approval status' }).click()
  await page.getByRole('button', { name: 'Submit approved job' }).click()
  await expect(page.getByRole('link', { name: 'View submitted job' })).toBeVisible()
  expect(submitted).toEqual([{ content, approvalId: 'approval-1', confirmation }])
  await page.getByRole('button', { name: 'Acceptance checks' }).click()
  await page.getByLabel('Expected Dark Site repository URL').fill('https://lcm.example.com/release')
  await page.getByLabel('Expected AHV host serials').fill('S1\nS2\nS3')
  await page.getByLabel('Expected storage containers').fill('data')
  await page.getByRole('button', { name: 'Collect read-only checks' }).click()
  await expect(page.getByRole('heading', { name: 'Operator acceptance required' })).toBeVisible()
  await expect(page.getByText('Passed: Trusted cluster access')).toBeVisible()
  await page.getByRole('button', { name: 'PE certificate check' }).click()
  await page.getByRole('button', { name: 'Verify installed certificate' }).click()
  await expect(page.getByText(`Leaf SHA-256: ${'b'.repeat(64)}`)).toBeVisible()
  await page.getByRole('button', { name: 'CVM rename plan' }).click()
  await page.getByRole('button', { name: 'Build read-only rename plan' }).click()
  await expect(page.getByText('NTNX-LAB-N01-CVM')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request independent approval' })).toHaveCount(0)
  expect(submitted).toHaveLength(1)
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('post-deployment-mobile.png'), fullPage: true })
})

test('mobile sequence restores a supervised checkpoint and does not retry an unverified NCC job', async ({ page }) => {
  const base = '/api/post-deployment/runs'
  const actions: string[] = []
  let stage = 'certificate'
  let revision = 0
  let attempt = ''
  let failed = false
  const record = () => ({ id: 'fixture-run', revision, stage, attempt, approvalId: '', approvalStatus: '',
    confirmation: '', nccEnabled: true, jobVerified: false, intent: { connection: { cluster_uuid: uuid } },
    completed: [], reconciliations: [], job: failed ? { id: 'job-1', status: 'interrupted' } : null,
  })
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' },
      sidebarOpen: false, sidebarPreferenceInitialized: true,
    }, version: 0 }))
  })
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === base) return route.fulfill({ json: [record()] })
    if (path === base + '/fixture-run') {
      const body = route.request().postDataJSON()
      expect(body.revision).toBe(revision++)
      actions.push(body.action)
      if (stage === 'certificate') {
        expect(body.reference).toBe('CHG-1')
        expect(body.fingerprint).toBe('a'.repeat(64))
        stage = 'post-deployment-ncc'
        attempt = 'fixture-attempt'
        failed = true
      } else {
        expect(body.action).toBe('reconcile')
        expect(body.reference).toBe('CHG-2')
        attempt = ''
        failed = false
      }
      return route.fulfill({ json: record() })
    }
    return route.fulfill({ json: {} })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/configure/post-deployment/runs')
  await expect(page.getByRole('heading', { name: 'PE certificate replacement' })).toBeVisible()
  const checkpoint = page.getByRole('button', { name: 'Record checkpoint' })
  await expect(checkpoint).toBeDisabled()
  await page.getByLabel('Change or evidence reference').fill('CHG-1')
  await page.getByLabel('Approved leaf certificate SHA-256').fill('a'.repeat(64))
  await checkpoint.click()
  await expect(page.getByText('Outcome unverified.', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'NCC health checks' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check job and advance' })).toBeDisabled()
  expect(actions).toEqual(['continue'])
  await page.getByLabel('Change or evidence reference').fill('CHG-2')
  await page.getByRole('button', { name: 'Record reconciliation' }).click()
  await expect(page.getByRole('button', { name: 'Run NCC checks' })).toBeEnabled()
  expect(actions).toEqual(['continue', 'reconcile'])
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})
