import { expect, test, type Page } from '@playwright/test'

const policy = { id: 'pe-policy', name: 'PE monitoring', configFile: 'pe.yml', workflow: '',
  baseline: 'live_pe', cronExpr: '0 * * * *', notifyOn: 'drift_or_unknown', enabled: true }

async function seed(page: Page, role = 'admin') {
  await page.addInitScript(role => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'test-token', user: { username: 'test-user', role }, sidebarOpen: false, settings: {},
  }, version: 0 })), role)
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path === '/api/configs' ? ['pe.yml'] : path === '/api/drift/policies' ? [policy]
      : path === '/api/system/check' ? { checks: [], ztfInstalled: true } : []
    return route.fulfill({ json })
  })
  await page.goto('/drift')
}

test('visible schedule edit preserves live baseline and updates the same policy', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: 'Edit schedule PE monitoring' }).click()
  await expect(page.getByText('Edit Policy', { exact: true })).toBeVisible()
  await expect(page.getByText('Baseline', { exact: true }).last().locator('..').locator('select')).toHaveValue('live_pe')
  await page.getByText('Policy Name', { exact: true }).locator('..').locator('input').fill('PE monitoring edited')
  await page.getByText('Schedule (UTC)', { exact: true }).locator('..').locator('input').fill('15 * * * *')
  const pending = page.waitForRequest(req => req.url().endsWith('/api/drift/policies/pe-policy') && req.method() === 'PUT')
  await page.getByRole('button', { name: 'Save Policy' }).click()
  const body = (await pending).postDataJSON()
  expect(body).toMatchObject({ name: 'PE monitoring edited', baseline: 'live_pe', cronExpr: '15 * * * *', enabled: true })
  expect(body.currentStateContent).toBe('')
})

test('manual live check shows unknown reads and collection errors', async ({ page }) => {
  await seed(page)
  await page.route('**/api/drift/check', route => route.fulfill({ json: {
    id: 'live-1', configFile: 'pe.yml', baseline: 'live_pe', status: 'unknown', observedLabel: 'Live Prism Element',
    timestamp: '2026-10-14T10:00:00Z', collectedAt: '2026-10-14T09:59:50Z', user: 'test-user',
    summary: { matched: 0, changed: 0, missing: 0, unexpected: 0, unknown: 1, total: 1 },
    collections: [{ endpoint: 'https://pe.example:9440', errors: { enable_pulse: 'PE returned HTTP 401' } }],
    findings: [{ path: 'pe.example.enable_pulse', status: 'unknown', desired: false, observed: null }],
  } }))
  await page.getByRole('button', { name: 'Live Prism Element', exact: true }).click()
  const pending = page.waitForRequest(req => req.url().endsWith('/api/drift/check'))
  await page.getByRole('button', { name: 'Run Drift Check' }).click()
  expect((await pending).postDataJSON().baseline).toBe('live_pe')
  await expect(page.getByText(/enable_pulse: PE returned HTTP 401/)).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Observed' })).toBeVisible()
  await page.screenshot({ path: 'test-results/live-pe-drift-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.getByRole('button', { name: 'Close navigation' }).isVisible()) {
    await page.getByRole('button', { name: 'Close navigation' }).click({ position: { x: 380, y: 100 } })
  }
  await expect(page.getByRole('button', { name: 'Live Prism Element', exact: true })).toBeVisible()
  await page.locator('main').evaluate(el => { el.scrollTop = 0; el.scrollLeft = 0 })
  await expect.poll(() => page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/live-pe-drift-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('viewer has no schedule edit action', async ({ page }) => {
  await seed(page, 'viewer')
  await expect(page.getByText('PE monitoring', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Edit schedule/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run Drift Check' })).toBeDisabled()
})
