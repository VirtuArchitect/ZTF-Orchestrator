import { expect, test } from '@playwright/test'
import yaml from 'js-yaml'
import { SCRIPTS } from '../../src/data'
import { DESTRUCTIVE_SCRIPT_IDS, SCRIPT_CONFIG_SCHEMAS } from '../../src/scriptConfigSchemas'

const scriptId = 'SetPrismLoginTitlePe'
const schema = SCRIPT_CONFIG_SCHEMAS[scriptId]
const values = { cluster_ip: '192.0.2.10', cluster_name: 'example-cluster', pe_credential: 'pe_admin_ref', prism_login_title: 'Example Cluster' }

test('login-title wizard is discoverable, guarded and reference only', () => {
  expect(SCRIPTS.filter(script => script.id === scriptId)).toEqual([expect.objectContaining({
    name: 'Set Prism Login Title (PE)', category: 'Prism Element',
  })])
  expect(schema.riskLevel).toBe('medium')
  expect(DESTRUCTIVE_SCRIPT_IDS.has(scriptId)).toBe(false)
  expect(schema.confirmationPhrase).toBeUndefined()
  expect(schema.description).toContain('Orchestrator administrator')
  expect(schema.fields.map(field => field.key)).toEqual([
    'cluster_ip', 'pe_credential', 'cluster_name', 'prism_login_title', 'prism_login_title_verify_tls',
  ])
  expect(schema.fields.some(field => field.type === 'password')).toBe(false)
  expect(schema.fields.find(field => field.key === 'prism_login_title_verify_tls')).toMatchObject({ type: 'boolean', defaultValue: true })
  expect(yaml.load(schema.build(values))).toEqual({
    prism_login_title_verify_tls: true,
    clusters: { '192.0.2.10': { name: 'example-cluster', pe_credential: 'pe_admin_ref', prism_login_title: 'Example Cluster' } },
  })
  for (const verifyTls of [true, false]) {
    expect(yaml.load(schema.build({ ...values, prism_login_title_verify_tls: verifyTls }))).toMatchObject({ prism_login_title_verify_tls: verifyTls })
  }
})

test('titles round-trip exactly through YAML, including punctuation, whitespace and Unicode', () => {
  for (const title of ['  Operations: "Blue" #1 \\ cluster  ', "Owner's cluster", 'true', 'null', '[a, b]', '&anchor *alias', 'Cluster & Operations', 'Überblick 東京 🔒', 'x'.repeat(128), '🔒'.repeat(128)]) {
    const config = yaml.load(schema.build({ ...values, prism_login_title: title })) as any
    expect(config.clusters[values.cluster_ip].prism_login_title).toBe(title)
    expect(Object.keys(config.clusters[values.cluster_ip])).toEqual(['name', 'pe_credential', 'prism_login_title'])
  }
})

test('invalid titles, missing required fields and non-boolean TLS are rejected without normalization', () => {
  for (const title of ['', '   ', 'x'.repeat(129), '<b>Title</b>', 'title\nnext', 'title\rnext', 'title\tnext', 'title\u0000', 'title\u001b', 'title\u007f', 'title\u0085', 'title\u200b', 'title\u202e', 'title\ud800', true, 123]) {
    expect(() => schema.build({ ...values, prism_login_title: title }), JSON.stringify(title)).toThrow('Prism Login Title')
  }
  for (const verifyTls of ['false', 'true', '', 0, 1]) {
    expect(() => schema.build({ ...values, prism_login_title_verify_tls: verifyTls })).toThrow('boolean')
  }
  for (const key of ['cluster_ip', 'cluster_name', 'pe_credential', 'prism_login_title']) {
    expect(() => schema.build({ ...values, [key]: '' })).toThrow()
  }
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'fixture-token', user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, settings: {},
  }, version: 0 })))
  await page.route('**/api/**', route => {
    const url = route.request().url()
    if (url.endsWith('/api/system/check')) return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (url.endsWith('/api/configs')) return route.fulfill({ json: [{ name: 'pe-login-title.yml' }] })
    return route.fulfill({ json: [] })
  })
})

test('Scripts wizard preserves title and TLS choice and reports invalid formatting', async ({ page }) => {
  await page.goto('/scripts')
  await page.getByRole('button', { name: 'Prism Element', exact: true }).click()
  await page.getByPlaceholder('Search scripts...').fill('Set Prism Login Title')
  await page.getByRole('button', { name: /Set Prism Login Title \(PE\)/ }).click()
  await page.getByLabel('Prism Element IP', { exact: false }).fill(values.cluster_ip)
  await page.getByLabel('Cluster Name', { exact: false }).fill(values.cluster_name)
  await page.getByLabel('PE Credential Ref', { exact: false }).fill(values.pe_credential)
  const title = page.getByLabel('Prism Login Title', { exact: false })
  const tls = page.getByRole('checkbox', { name: 'Verify TLS' })
  await expect(tls).toBeChecked()
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await title.fill('<b>invalid</b>')
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.getByRole('alert')).toContainText('Check field formatting')
  await expect(page.locator('textarea').last()).not.toHaveValue(/prism_login_title:/)
  const preservedTitle = '  Operations: "Blue" #1 \\ cluster  '
  await title.fill(preservedTitle)
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeEnabled()
  const generated = yaml.load(await page.locator('textarea').last().inputValue()) as any
  expect(generated.prism_login_title_verify_tls).toBe(true)
  expect(generated.clusters[values.cluster_ip]).toEqual({ name: values.cluster_name, pe_credential: values.pe_credential, prism_login_title: preservedTitle })
  await tls.uncheck()
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  expect(yaml.load(await page.locator('textarea').last().inputValue())).toMatchObject({ prism_login_title_verify_tls: false })
  await title.fill('x'.repeat(129))
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await title.fill('   ')
  await expect(page.getByRole('button', { name: 'Generate YAML' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/pe-login-title-script.png', fullPage: true })
})

test('login-title script can be selected with its configuration in a pipeline', async ({ page }) => {
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'New Pipeline' }).click()
  await expect(page.locator('select').first().locator(`option[value="${scriptId}"]`)).toHaveCount(1)
  await page.locator('select').first().selectOption(scriptId)
  await page.locator('select').nth(1).selectOption('pe-login-title.yml')
  await expect(page.locator('select').first()).toHaveValue(scriptId)
  await expect(page.locator('select').nth(1)).toHaveValue('pe-login-title.yml')
})
