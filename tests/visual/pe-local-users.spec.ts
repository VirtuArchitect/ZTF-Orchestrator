import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'
import { SCRIPT_CONFIG_SCHEMAS } from '../../src/scriptConfigSchemas'

test('PE local-user wizard emits eight separate references, not passwords', () => {
  const schema = SCRIPT_CONFIG_SCHEMAS.CreateLocalUsersPe
  const config = yaml.load(schema.build(schema.exampleValues ?? {})) as any
  const cluster = Object.values(config.clusters)[0] as any
  expect(cluster.local_users).toHaveLength(8)
  expect(new Set(cluster.local_users.map((user: any) => user.credential_ref)).size).toBe(8)
  expect(JSON.stringify(config)).not.toContain('password')
  expect(schema.confirmationPhrase).toBe('RUN CreateLocalUsersPe')
  expect(() => schema.build({ ...schema.exampleValues, local_user_refs: 'invalid' })).toThrow()
})

test('PE users can be generated in Scripts and selected in a pipeline', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'fixture-token', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, settings: {},
  }, version: 0 })))
  await page.route('**/api/**', route => {
    const url = route.request().url()
    if (url.endsWith('/api/execute')) {
      const body = route.request().postDataJSON()
      expect(body.script).toEqual(['CreateLocalUsersPe'])
      expect(body.dryRun).toBe(true)
      expect(body.riskAcknowledged).toBeUndefined()
      return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"done","data":{"status":"success","dryRun":true}}\n\n' })
    }
    if (url.endsWith('/api/system/check')) return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (url.endsWith('/api/configs')) return route.fulfill({ json: [{ name: 'pe-local-admin-users.yml' }] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/scripts')
  await page.getByPlaceholder('Search scripts...').fill('Create Local Users')
  await page.getByRole('button', { name: /Create Local Users \(PE\)/ }).click()
  await page.getByLabel('Prism Element IP', { exact: false }).fill('192.0.2.10')
  await page.getByLabel('Cluster Name', { exact: false }).fill('example-cluster')
  await page.getByLabel('Local Users (username=credential reference)', { exact: false }).fill('invalid')
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.getByRole('alert')).toContainText('Check field formatting')
  await page.getByLabel('Local Users (username=credential reference)', { exact: false }).fill(
    String(SCRIPT_CONFIG_SCHEMAS.CreateLocalUsersPe.exampleValues?.local_user_refs),
  )
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.locator('textarea').last()).toHaveValue(/credential_ref: pe_ops_admin08/)
  await page.screenshot({ path: 'test-results/pe-local-users-script.png', fullPage: true })
  await page.getByRole('button', { name: 'Dry Run', exact: true }).click()
  await expect(page.getByText('Configuration and credential references validated; no PE changes made')).toBeVisible()
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'New Pipeline' }).click()
  await page.locator('select').first().selectOption('CreateLocalUsersPe')
  await page.locator('select').nth(1).selectOption('pe-local-admin-users.yml')
  await expect(page.locator('select').first()).toHaveValue('CreateLocalUsersPe')
  await page.screenshot({ path: 'test-results/pe-local-users-pipeline.png', fullPage: true })
})
