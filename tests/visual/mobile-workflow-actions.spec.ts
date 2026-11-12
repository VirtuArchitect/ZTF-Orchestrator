import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'test-token', user: { username: 'test-admin', role: 'admin' },
      sidebarOpen: false, settings: {},
    }, version: 0 }))
  })
  await page.route('**/api/**', route => {
    if (route.request().url().endsWith('/api/system/check')) {
      return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    }
    return route.fulfill({ json: [] })
  })
})

for (const width of [320, 390, 768, 1440]) {
  test(`page actions remain visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/workflows/deploy-pc')
    const actions = page.getByRole('group', { name: 'Page actions' })
    await expect(actions).toBeVisible()
    for (const name of ['Import Config', 'Dry Run', 'Run Workflow']) {
      const button = actions.getByRole('button', { name, exact: true })
      await expect(button).toBeVisible()
      const buttonBox = await button.boundingBox()
      expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(width)
    }
    const box = await actions.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `test-results/workflow-actions-${width}.png` })
    await page.goto('/yaml-studio')
    await expect(page.getByRole('button', { name: 'Revalidate', exact: true })).toBeVisible()
    await page.goto('/settings')
    await expect(page.getByRole('button', { name: 'Save Settings', exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/page-actions-${width}.png` })
  })
}

test('management imports retain supplied YAML in the editor and dry run', async ({ page }) => {
  const yaml = 'pod:\n  pc_ip: 192.0.2.77\n  pc_credential: supplied_pc\n  clusters: {}\n'
  let submitted = ''
  await page.route('**/api/execute', async route => {
    submitted = route.request().postDataJSON().configContent
    await route.fulfill({ contentType: 'text/event-stream', body:
      'data: {"type":"done","data":{"status":"success","dryRun":true}}\n\n' })
  })
  await page.goto('/workflows/deploy-management-pc')
  await page.getByRole('banner').locator('input[type="file"]').setInputFiles({
    name: 'management.yml', mimeType: 'text/yaml', buffer: Buffer.from(yaml),
  })
  await expect(page.locator('textarea')).toHaveValue(/192\.0\.2\.77/)
  await expect(page.locator('textarea')).toHaveValue(/supplied_pc/)
  await page.getByRole('button', { name: 'Dry Run', exact: true }).click()
  await expect.poll(() => submitted).toContain('192.0.2.77')
  expect(submitted).toContain('supplied_pc')
  expect(submitted).not.toContain('management_pc:')
})
