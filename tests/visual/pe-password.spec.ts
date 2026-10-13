import { expect, test } from '@playwright/test'

test('password script is discoverable, generates YAML and can be selected in pipelines', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'test-token', user: { username: 'test-admin', role: 'admin' },
      sidebarOpen: false, settings: {},
    }, version: 0 }))
  })
  await page.route('**/api/**', route => {
    const url = route.request().url()
    if (url.endsWith('/api/system/check')) return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (url.endsWith('/api/configs')) return route.fulfill({ json: [{ name: 'pe-password.yml' }] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/scripts')
  await page.getByPlaceholder('Search scripts...').fill('Change Default Admin Password')
  await page.getByRole('button', { name: /Change Default Admin Password \(PE\)/ }).click()
  await page.getByLabel('Prism Element IP', { exact: false }).fill('192.0.2.10')
  await page.getByLabel('Cluster Name', { exact: false }).fill('test-cluster')
  await expect(page.getByLabel('Existing PE Admin Password Override')).toHaveAttribute('type', 'password')
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.locator('textarea').last()).toHaveValue(/new_pe_admin_credential: pe_admin_new/)
  await page.screenshot({ path: 'test-results/pe-password-script.png', fullPage: true })
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'New Pipeline' }).click()
  await page.locator('select').first().selectOption('ChangeDefaultAdminPasswordPe')
  await expect(page.locator('select').first()).toHaveValue('ChangeDefaultAdminPasswordPe')
  await page.locator('select').nth(1).selectOption('pe-password.yml')
  await page.screenshot({ path: 'test-results/pe-password-pipeline.png', fullPage: true })
})
