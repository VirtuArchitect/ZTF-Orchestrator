import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'

test('password rotation generates reference-only intent and gates execution', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/approvals') {
      await route.fulfill({ json: [{ id: 'approved-rotation', workflow: 'cvm-idrac-password-rotation',
        status: 'approved', configFile: 'rotation.yml', notes: 'Reviewed rotation', requestedBy: 'requester',
        expiresAt: '2099-01-01T00:00:00Z' }] })
    } else if (path === '/api/execute') {
      submitted = route.request().postDataJSON()
      await route.fulfill({ contentType: 'text/event-stream', body:
        'data: {"type":"stdout","data":"Read-only target checks passed"}\n\n' +
        'data: {"type":"done","data":{"status":"success","code":0}}\n\n' })
    } else if (path === '/api/settings') {
      await route.fulfill({ json: { approvalRequiredWorkflows: [], ztfPath: '/opt/zerotouch-framework' } })
    } else {
      await route.fulfill({ json: [] })
    }
  })
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'test-session', user: { username: 'reviewer', role: 'admin' },
    settings: { approvalRequiredWorkflows: [], connectionProfiles: [] }, sidebarOpen: true,
  }, version: 0 })))
  await page.goto('/workflows/cvm-idrac-password-rotation')
  await expect(page.getByRole('heading', { name: 'CVM & Dell iDRAC Password Rotation' })).toBeVisible()
  const fingerprint = 'SHA256:' + 'a'.repeat(43)
  await page.locator('input[type="file"]').setInputFiles({ name: 'rotation.yml', mimeType: 'text/yaml',
    buffer: Buffer.from(yaml.dump({ aos_version: '7.5.1.8',
      cvms: [{ address: '192.0.2.11', current_credential_ref: 'cvm_old', replacement_credential_ref: 'cvm_new', ssh_host_key_sha256: fingerprint }],
      idracs: [], idrac_followup_acknowledged: false })) })
  await expect(page.getByLabel('CVMs — all CVMs in one cluster')).toHaveValue(`192.0.2.11, cvm_old, cvm_new, ${fingerprint}`)
  await page.getByLabel('CVMs — all CVMs in one cluster').fill(`192.0.2.10, cvm_old, cvm_new, ${fingerprint}`)
  await page.getByLabel('Dell iDRAC controllers', { exact: true }).fill('192.0.2.20, bmc_old, bmc_new')
  await page.getByRole('checkbox').check()
  const run = page.getByRole('button', { name: 'Run Workflow', exact: true })
  await expect(run).toBeDisabled()
  await page.getByRole('combobox').selectOption('approved-rotation')
  await expect(run).toBeEnabled()
  page.once('dialog', async dialog => {
    expect(dialog.message()).toContain('ROTATE CVM AND IDRAC PASSWORDS')
    await dialog.dismiss()
  })
  await run.click()
  expect(submitted).toBeUndefined()
  await page.screenshot({ path: 'test-results/credential-rotation.png', fullPage: true })
  await page.getByRole('button', { name: 'Dry Run', exact: true }).click()
  await expect.poll(() => submitted?.dryRun).toBe(true)
  const config = yaml.load(String(submitted?.configContent)) as Record<string, unknown>
  expect(config.aos_version).toBe('7.5.1.8')
  expect(config.idrac_followup_acknowledged).toBe(true)
  expect(config.cvms).toEqual([{ address: '192.0.2.10', current_credential_ref: 'cvm_old',
    replacement_credential_ref: 'cvm_new', ssh_host_key_sha256: fingerprint }])
  expect(config).not.toHaveProperty('password')
})
