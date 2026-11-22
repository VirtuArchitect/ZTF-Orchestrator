import { expect, test, type Page } from '@playwright/test'

const base = '/api/ahv-uplink-migration'
const references = [{ reference: 'pe_admin_ref', username: 'admin' },
  { reference: 'cvm_current_ref', username: 'nutanix' }, { reference: 'cvm_replacement_ref', username: 'nutanix' },
  { reference: 'idrac_ref', username: 'root' }]

async function setup(page: Page, catalogues: ('ready' | 'empty' | 'failed')[] = ['ready'], saved = false) {
  const writes: string[] = []
  await page.addInitScript(({ saved }) => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only',
      user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
    if (saved) sessionStorage.setItem('ztf-ahv-uplink-draft:fixture-admin', JSON.stringify({
      connection: { mode: 'pe-direct', pe_endpoint: 'https://pe.example.com:9440', pe_credential: 'retained_missing_ref',
        cvm_credential: '00000000-0000-4000-8000-000000000001', cluster_uuid: '12345678-0000-4000-8000-000000000001',
        pc_endpoint: '', pc_credential: '', cvm_host_keys: '', verify_tls: false, tls_bypass_reason: 'Reviewed recovery exception' },
      destination: { mode: 'create', name: 'vs1', bondMode: 'ACTIVE_BACKUP', mtu: 1500 }, inventory: null,
      move: {}, reviewed: false, plan: null, approval: '', jobId: '', step: 0,
    }))
  }, { saved })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET' && path !== '/api/auth/activity') writes.push(path)
    if (path === base + '/credentials') {
      const result = catalogues[0] || 'ready'
      return route.fulfill({ status: result === 'failed' ? 500 : 200,
        json: result === 'failed' ? { error: 'Catalogue unavailable' } : { references: result === 'empty' ? [] : references } })
    }
    if (path === base) return route.fulfill({ json: { applyEnabled: true } })
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/configure/ahv-uplink-migration')
  return writes
}

test('dropdowns show reference and username, filter CVM accounts and never fetch raw global config', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()) })
  const writes = await setup(page)
  const pe = page.getByRole('combobox', { name: 'PE credential reference', exact: true })
  const cvm = page.getByRole('combobox', { name: 'CVM credential reference', exact: true })
  await expect(pe.getByRole('option', { name: 'pe_admin_ref — admin', exact: true })).toHaveCount(1)
  await expect(cvm.getByRole('option', { name: 'cvm_current_ref — nutanix', exact: true })).toHaveCount(1)
  await expect(cvm.getByRole('option', { name: /idrac_ref|pe_admin_ref/ })).toHaveCount(0)
  await pe.selectOption('pe_admin_ref')
  await cvm.selectOption('cvm_current_ref')
  await expect(pe).toHaveValue('pe_admin_ref')
  await expect(cvm).toHaveValue('cvm_current_ref')
  expect(requests.some(url => url.includes('/api/global-config'))).toBe(false)
  expect(writes).toEqual([])
  await page.getByLabel('Saved credential catalogue').screenshot({ path: 'test-results/uplink-credential-catalogue.png' })
  await cvm.locator('..').screenshot({ path: 'test-results/uplink-cvm-credential-selection.png' })
  await page.screenshot({ path: 'test-results/uplink-credential-selectors-light.png', fullPage: true })
})

test('failed and empty catalogues explain blocking and can refresh without changing a draft', async ({ page }) => {
  const outcomes: ('ready' | 'empty' | 'failed')[] = ['failed', 'empty', 'ready']
  const writes = await setup(page, outcomes)
  const catalogue = page.getByLabel('Saved credential catalogue')
  await expect(catalogue).toContainText('Credential catalogue unavailable')
  await expect(page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })).toBeDisabled()
  outcomes.shift()
  await page.getByRole('button', { name: 'Refresh credentials' }).click()
  await expect(catalogue).toContainText('No saved credential references')
  outcomes.shift()
  await page.getByRole('button', { name: 'Refresh credentials' }).click()
  await expect(page.getByLabel('PE credential reference', { exact: true }).getByRole('option', { name: 'pe_admin_ref — admin', exact: true })).toHaveCount(1)
  expect(writes).toEqual([])
})

test('old missing and UUID references remain visible but cannot unlock discovery', async ({ page }) => {
  const writes = await setup(page, ['ready'], true)
  const pe = page.getByLabel('PE credential reference', { exact: true })
  const cvm = page.getByLabel('CVM credential reference', { exact: true })
  await expect(pe).toHaveValue('retained_missing_ref')
  await expect(pe.getByRole('option', { name: /retained_missing_ref.*unavailable/ })).toHaveAttribute('disabled', '')
  await expect(cvm).toHaveValue('00000000-0000-4000-8000-000000000001')
  await expect(page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })).toBeDisabled()
  await expect(page.getByLabel('TLS bypass reason')).toHaveValue('Reviewed recovery exception')
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ztf-ahv-uplink-draft:fixture-admin')!))
  expect(saved.connection.pe_credential).toBe('retained_missing_ref')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(writes).toEqual([])
})

test('catalogue loading blocks discovery and PC selection also shows usernames', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const writes = await setup(page)
  await expect(page.getByRole('button', { name: 'Refresh credentials' })).toBeEnabled()
  await page.route('**/api/ahv-uplink-migration/credentials', async route => { await pending; return route.fulfill({ json: { references } }) })
  await page.getByRole('button', { name: 'Refresh credentials' }).click()
  await expect(page.getByLabel('Saved credential catalogue')).toContainText('Loading saved credential references')
  await expect(page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })).toBeDisabled()
  release()
  await page.getByLabel('Connection mode').selectOption('pc')
  await expect(page.getByLabel('PC credential reference', { exact: true }).getByRole('option', { name: 'pe_admin_ref — admin', exact: true })).toHaveCount(1)
  expect(writes).toEqual([])
})
