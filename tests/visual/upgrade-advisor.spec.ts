import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page, role = 'admin') {
  const input = { inventory: { clusterName: 'Example', components: { aos: '7.3.0' } }, targets: { aos: '7.3.1' }, evidence: { lcmPrecheck: '', releaseNotesReviewed: false, compatibilityReviewed: false, prismCentralVersionCaptured: false, darkSiteBundleReviewed: false }, context: { edition: 'enterprise', darkSite: false, features: '' } }
  const assessment = { id: 'saved-1', status: 'review', inventory: input.inventory, targets: input.targets, context: input.context, summary: { total: 1, review: 1, unknown: 0, clear: 0, blocked: 0, warning: 0 }, findings: [{ id: 'lcm', title: 'LCM precheck needed', status: 'review', severity: 'high', component: 'aos', message: 'Missing evidence', guidance: 'Run LCM prechecks', evidence: [], source: { label: 'Example source', url: '' } }], rulesVersion: 'test', generatedAt: '2026-10-16T00:00:00Z', phases: [], readOnly: true }
  let saved = false
  await page.addInitScript(({ role }) => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture', user: { username: 'reviewer', role }, sidebarOpen: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  }, { role })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    let data: unknown = {}
    if (url.pathname.endsWith('/rules')) data = { version: 'test', name: 'Rules', phases: [], rules: [] }
    else if (url.pathname.endsWith('/source-packs')) data = { sourcePacks: [] }
    else if (url.pathname.endsWith('/inventory')) data = { id: 'inventory-1', clusterName: 'Example', components: { aos: '7.3.0' }, collectedAt: '2026-10-16T00:00:00Z', unknownComponents: ['ahv', 'ncc'], errors: [{ component: 'ahv', message: 'Inventory returned HTTP 403' }] }
    else if (url.pathname.endsWith('/assess')) data = assessment
    else if (url.pathname.endsWith('/assessments') && method === 'POST') { saved = true; data = { id: 'saved-1', assessment, assessmentInput: input } }
    else if (url.pathname.endsWith('/assessments')) data = { assessments: saved ? [{ id: 'saved-1', clusterName: 'Example', status: 'review', createdAt: assessment.generatedAt, createdBy: 'reviewer' }] : [] }
    else if (url.pathname.endsWith('/assessments/saved-1')) data = { id: 'saved-1', assessment, assessmentInput: input, inventoryCollection: null }
    await route.fulfill({ json: data })
  })
}

test('collect review save reopen and detect changed inputs', async ({ page }) => {
  await fixture(page)
  const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)))
  await page.goto('/upgrade-advisor')
  await page.getByLabel('PE HTTPS endpoint').fill('https://pe.example.com:9440')
  await page.getByLabel('PE credential reference').fill('pe_monitor')
  await page.getByRole('button', { name: 'Collect inventory', exact: true }).click()
  await expect(page.getByText('ahv: Inventory returned HTTP 403')).toBeVisible()
  await page.getByLabel('AOS', { exact: true }).nth(1).fill('7.3.1')
  await page.getByRole('button', { name: 'Run Assessment', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Readiness actions' })).toBeVisible()
  await page.getByRole('button', { name: 'Save assessment snapshot' }).click()
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save assessment snapshot' })).toBeEnabled()
  await page.getByLabel('AOS', { exact: true }).nth(1).fill('7.3.2')
  await expect(page.getByRole('button', { name: 'Save assessment snapshot' })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Inputs changed')
  await page.screenshot({ path: 'test-results/upgrade-advisor-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})

test('viewer cannot collect or save', async ({ page }) => {
  await fixture(page, 'viewer'); await page.goto('/upgrade-advisor')
  await expect(page.getByRole('button', { name: 'Collect inventory', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save assessment snapshot' })).toHaveCount(0)
})

test('mobile layout does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await fixture(page); await page.goto('/upgrade-advisor')
  await expect(page.getByRole('heading', { name: 'Prism inventory' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: 'test-results/upgrade-advisor-mobile.png', fullPage: true })
})
