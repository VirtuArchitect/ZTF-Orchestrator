import { expect, test, type Page } from '@playwright/test'
import yaml from 'js-yaml'
import { AHV_ACCOUNTS, PASSWORD_SETUP_CONFIRMATION, PASSWORD_SETUP_WORKFLOW, validatePasswordSetup } from '../../src/utils/initialPasswordSetup'
import { toYaml } from '../../src/utils/yaml'

const pin = 'SHA256:' + 'a'.repeat(43)
const config = () => ({ cluster_name: 'Fixture cluster', datacenter: 'Fixture DC', host_key_evidence: 'Trusted console record TEST-1',
  cvms: [{ address: '192.0.2.10', ssh_host_key_sha256: pin, current_credential_ref: 'cvm_current', replacement_credential_ref: 'cvm_new' }],
  hosts: [{ address: '192.0.2.20', ssh_host_key_sha256: pin, access_credential_ref: 'host_access', accounts: AHV_ACCOUNTS.map(username => ({ username, current_credential_ref: `${username}_current`, replacement_credential_ref: `${username}_new` })) }] })
const refs = ['cvm_current', 'cvm_new', 'host_access', ...AHV_ACCOUNTS.flatMap(u => [`${u}_current`, `${u}_new`])]
const ledger = [{ id: 'run-1', status: 'needs_reconciliation', cluster_name: 'Fixture cluster', targets: [
  { key: 'host-1-root', address: '192.0.2.20', account: 'root', status: 'uncertain', password: 'must-never-render' },
], completedSteps: ['cvm'], pipelineId: '' }]
async function setup(page: Page, pipelines: unknown[] = [], options: { runs?: unknown[]; liveEnabled?: boolean; approvalRequiredWorkflows?: string[] } = {}) {
  const writes: { path: string; body: any }[] = []
  await page.addInitScript(required => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'fixture', user: { username: 'fixture-admin', role: 'admin' },
    settings: { approvalRequiredWorkflows: required, connectionProfiles: [] }, sidebarOpen: false,
  }, version: 0 })), options.approvalRequiredWorkflows || [])
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET' && path !== '/api/auth/activity') writes.push({ path, body: request.postDataJSON() })
    if (path === '/api/yaml-studio/context') return route.fulfill({ json: { groups: [{ id: 'cluster-1', kind: 'cluster', name: 'Fixture cluster', datacenter: 'Fixture DC' }], references: refs.map(name => ({ name, groupId: 'cluster-1' })) } })
    if (path === '/api/approvals') return route.fulfill({ json: [
      { id: 'wrong-filename', workflow: PASSWORD_SETUP_WORKFLOW, configContent: toYaml(config()), configFile: 'another-cluster.yml', status: 'approved', expiresAt: '2099-01-01' },
      { id: 'wrong-content', workflow: PASSWORD_SETUP_WORKFLOW, configContent: 'wrong', status: 'approved', expiresAt: '2099-01-01' },
      { id: 'approved-setup', workflow: PASSWORD_SETUP_WORKFLOW, configContent: toYaml(config()), configFile: 'setup.yml', status: 'approved', expiresAt: '2099-01-01', notes: 'Exact reviewed YAML', requestedBy: 'fixture-reviewer' },
      { id: 'approved-custom', workflow: PASSWORD_SETUP_WORKFLOW, configContent: toYaml(config()), configFile: 'custom-host-passwords.yml', status: 'approved', expiresAt: '2099-01-01', notes: 'Reviewed custom filename', requestedBy: 'fixture-admin' },
    ] })
    if (path === '/api/initial-password-setup') return route.fulfill({ json: { applyEnabled: options.liveEnabled ?? true } })
    if (path === '/api/settings') return route.fulfill({ json: { approvalRequiredWorkflows: options.approvalRequiredWorkflows || [], connectionProfiles: [] } })
    if (path === '/api/pipelines') return route.fulfill({ json: pipelines })
    if (path === '/api/configs') return route.fulfill({ json: [{ name: 'setup.yml' }] })
    if (path === '/api/configs/setup.yml') return route.fulfill({ json: { content: toYaml(config()) } })
    if (path === '/api/initial-password-setup/runs') return route.fulfill({ json: options.runs || ledger })
    if (path.endsWith('/reconcile') || path.endsWith('/resume')) return route.fulfill({ json: { id: 'run-1', status: 'checking', password: 'must-never-render' } })
    if (path === '/api/execute' || /\/pipelines\/[^/]+\/run$/.test(path)) return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"done","data":{"status":"success"}}\n\ndata: {"type":"pipeline_done","data":{"status":"success"}}\n\n' })
    return route.fulfill({ json: [] })
  })
  return writes
}
async function importConfig(page: Page, value: unknown) {
  await page.locator('input[type=file]').setInputFiles({ name: 'setup.yml', mimeType: 'text/yaml', buffer: Buffer.from(toYaml(value)) })
}

test('strict schema rejects unknown properties, missing targets, mismatched CVM references and invalid identity', () => {
  expect(validatePasswordSetup(config())).toBe(true)
  for (const value of [ { ...config(), password: 'secret' }, { ...config(), cvms: [] }, { ...config(), hosts: [] },
    { ...config(), hosts: [{ ...config().hosts[0], accounts: [] }] },
    { ...config(), cvms: [{ ...config().cvms[0], ssh_host_key_sha256: 'untrusted' }] },
    { ...config(), cvms: [...config().cvms, { ...config().cvms[0], address: '192.0.2.11', current_credential_ref: 'different' }] },
    { ...config(), hosts: [{ ...config().hosts[0], accounts: [{ ...config().hosts[0].accounts[0], username: 'unsupported' }] }] },
    { ...config(), hosts: [{ ...config().hosts[0], password: 'secret' }] },
  ]) expect(validatePasswordSetup(value)).toBe(false)
})

test('guided form uses reference dropdowns, defaults to all accounts and generates strict intent', async ({ page }) => {
  const writes = await setup(page)
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await expect(page.getByText('Live writes default off pending lab validation.', { exact: false }).first()).toBeVisible()
  const download = page.getByRole('button', { name: 'Download Config', exact: true })
  await expect(download).toBeVisible()
  await expect(download).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Generate YAML', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate YAML', exact: true })).toBeDisabled()
  await expect(download).toHaveAttribute('title', 'Complete the required fields or import a valid configuration to download YAML')
  await page.getByLabel('Datacenter group', { exact: true }).selectOption('Fixture DC')
  await page.getByLabel('Cluster group', { exact: true }).selectOption('cluster-1')
  await page.getByLabel('Trusted host-key evidence', { exact: true }).fill('Trusted console record TEST-1')
  await page.getByLabel('Common CVM current reference').selectOption('cvm_current')
  await page.getByLabel('Common CVM replacement reference').selectOption('cvm_new')
  await page.getByLabel('CVM 1 address', { exact: true }).fill('192.0.2.10')
  await page.getByLabel('CVM 1 SSH SHA256 pin', { exact: true }).fill(pin)
  await page.getByLabel('Host 1 address', { exact: true }).fill('192.0.2.20')
  await page.getByLabel('Host 1 SSH SHA256 pin', { exact: true }).fill(pin)
  await page.getByLabel('Host 1 access reference').selectOption('host_access')
  for (const username of AHV_ACCOUNTS) {
    await expect(page.getByLabel(`Host 1 ${username} account`, { exact: true })).toBeChecked()
    await page.getByLabel(`Host 1 ${username} current reference`).selectOption(`${username}_current`)
    await page.getByLabel(`Host 1 ${username} replacement reference`).selectOption(`${username}_new`)
  }
  await expect(page.locator('input[type=password]')).toHaveCount(0)
  await expect(download).toBeEnabled()
  await page.getByRole('button', { name: 'Generate YAML', exact: true }).click()
  await expect(page.locator('main')).toContainText('Fixture cluster')
  expect(writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Configure', exact: true }).click()
  await expect(page.getByLabel('Cluster name', { exact: true })).toHaveValue('Fixture cluster')
  await page.screenshot({ path: 'test-results/initial-password-setup-guided-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const closeNavigation = page.getByRole('button', { name: 'Close navigation', exact: true })
  if (await closeNavigation.isVisible()) await closeNavigation.click({ position: { x: 380, y: 400 } })
  await expect.poll(async () => (await page.locator('main').boundingBox())?.x).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/initial-password-setup-guided-mobile.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Dry Run', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].path).toBe('/api/execute')
  expect(writes[0].body.dryRun).toBe(true)
  expect(writes[0].body.configFile).toBe(`${PASSWORD_SETUP_WORKFLOW}.yml`)
  expect(yaml.load(writes[0].body.configContent)).toEqual(config())
})

test('saved YAML requires matching approval and typed confirmation; rejected import fails closed', async ({ page }) => {
  const writes = await setup(page)
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  const run = page.getByRole('button', { name: 'Run Workflow', exact: true })
  await expect(run).toBeDisabled()
  await page.getByText('Load a saved configuration by datacenter / cluster').click()
  await page.getByRole('combobox', { name: 'Configuration file' }).selectOption('setup.yml')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Load into form' }).click()
  await expect(page.getByLabel('Cluster name', { exact: true })).toHaveValue('Fixture cluster')
  const approval = page.locator('select').filter({ has: page.locator('option[value="approved-setup"]') })
  await expect(approval.locator('option[value="wrong-content"]')).toHaveCount(0)
  await expect(approval.locator('option[value="wrong-filename"]')).toHaveCount(0)
  await expect(approval.locator('option[value="approved-custom"]')).toHaveCount(0)
  await approval.selectOption('approved-setup')
  page.once('dialog', dialog => { expect(dialog.message()).toContain(PASSWORD_SETUP_CONFIRMATION); return dialog.dismiss() })
  await run.click()
  expect(writes).toHaveLength(0)
  page.once('dialog', dialog => dialog.accept(PASSWORD_SETUP_CONFIRMATION))
  await run.click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].body).toMatchObject({ workflow: PASSWORD_SETUP_WORKFLOW, configFile: 'setup.yml', approvalId: 'approved-setup', destructiveConfirmation: PASSWORD_SETUP_CONFIRMATION })
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await importConfig(page, config())
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeEnabled()
  await importConfig(page, { ...config(), password: 'must-never-render' })
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Download Config', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download Config', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Generate YAML', exact: true })).toBeDisabled()
  await expect(run).toBeDisabled()
  await page.getByLabel('Cluster name', { exact: true }).fill('Edited after rejected import')
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeDisabled()
  await expect(page.locator('main')).not.toContainText('must-never-render')
  await page.screenshot({ path: 'test-results/initial-password-setup-invalid-import.png', fullPage: true })
})

test('governance shows the mandatory password approval even when optional policies are empty', async ({ page }) => {
  const writes = await setup(page, [], { approvalRequiredWorkflows: [] })
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Governance', exact: true }).click()
  const mandatory = page.getByRole('checkbox', { name: /Initial Host & CVM Password Setup/ })
  await expect(mandatory).toBeChecked()
  await expect(mandatory).toBeDisabled()
  await expect(page.getByText('Always required for live password changes.', { exact: false })).toBeVisible()
  expect(writes).toHaveLength(0)
})

test('custom imported filename binds approval creation, selection, download and execution to the same YAML', async ({ page }) => {
  const writes = await setup(page)
  await page.route('**/api/approvals', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    writes.push({ path: '/api/approvals', body: route.request().postDataJSON() })
    return route.fulfill({ json: { id: 'pending-custom', status: 'pending' } })
  })
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await page.locator('input[type=file]').setInputFiles({ name: 'custom-host-passwords.yml', mimeType: 'text/yaml', buffer: Buffer.from(toYaml(config())) })
  await expect(page.getByText('Reviewed configuration filename:', { exact: false })).toContainText('custom-host-passwords.yml')
  const approval = page.locator('select').filter({ has: page.locator('option[value="approved-custom"]') })
  await expect(approval.locator('option[value="approved-setup"]')).toHaveCount(0)
  await expect(approval.locator('option[value="wrong-filename"]')).toHaveCount(0)
  await expect(approval.locator('option[value="wrong-content"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Request approval for this configuration', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ path: '/api/approvals', body: { workflow: PASSWORD_SETUP_WORKFLOW, configFile: 'custom-host-passwords.yml', configContent: toYaml(config()) } })
  await expect(page.getByRole('button', { name: 'Run Workflow', exact: true })).toBeDisabled()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Config', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('custom-host-passwords.yml')
  await approval.selectOption('approved-custom')
  page.once('dialog', dialog => dialog.accept(PASSWORD_SETUP_CONFIRMATION))
  await page.getByRole('button', { name: 'Run Workflow', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toEqual({ path: '/api/execute', body: { workflow: PASSWORD_SETUP_WORKFLOW, configFile: 'custom-host-passwords.yml', configContent: toYaml(config()), approvalId: 'approved-custom', destructiveConfirmation: PASSWORD_SETUP_CONFIRMATION } })
})

test('recovery submits credential checks and fresh resume approval without claiming success', async ({ page }) => {
  const writes = await setup(page)
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await page.getByLabel('Recovery run', { exact: true }).selectOption('run-1')
  await expect(page.getByLabel('Reference-only run JSON')).not.toContainText('must-never-render')
  await page.getByLabel('Reconcile host-1-root', { exact: true }).check()
  await page.getByLabel('Credentials to check', { exact: true }).selectOption('replacement')
  await page.getByLabel('Reconciliation notes', { exact: true }).fill('Check uncertain target')
  await page.getByLabel('Reconciliation evidence', { exact: true }).fill('Console TEST-2')
  await page.getByRole('button', { name: 'Check selected credentials' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ path: '/api/initial-password-setup/runs/run-1/reconcile', body: { targetKeys: ['host-1-root'], selection: 'replacement', notes: 'Check uncertain target', evidence: 'Console TEST-2' } })
  await expect(page.getByLabel('Reference-only run JSON')).toContainText('uncertain')
  await expect(page.getByLabel('Reference-only result JSON')).not.toContainText('must-never-render')
  await page.getByLabel('Fresh resume approval ID').fill('fresh-approval')
  await page.getByLabel('Resume confirmation', { exact: true }).fill(PASSWORD_SETUP_CONFIRMATION)
  await page.getByRole('button', { name: 'Resume standalone run' }).click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1]).toEqual({ path: '/api/initial-password-setup/runs/run-1/resume', body: { approvalId: 'fresh-approval', destructiveConfirmation: PASSWORD_SETUP_CONFIRMATION } })
})

test('pipeline collects separate setup approval and resume ID while preserving PE confirmation', async ({ page }) => {
  const writes = await setup(page, [{ id: 'pipeline-1', name: 'Fixture pipeline', createdAt: '', updatedAt: '', steps: [
    { workflow: 'ChangeDefaultAdminPasswordPe', configFile: 'pe.yml' }, { workflow: PASSWORD_SETUP_WORKFLOW, configFile: 'setup.yml' },
  ] }])
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Approve initial password setup pipeline' })
  await expect(modal).toContainText('setup.yml')
  await expect(modal.getByRole('button', { name: 'Run approved pipeline' })).toBeDisabled()
  expect(writes).toHaveLength(0)
  await page.getByLabel('Password setup approval ID').fill('fresh-approval')
  await page.getByLabel('Password setup confirmation', { exact: true }).fill(PASSWORD_SETUP_CONFIRMATION)
  await page.getByLabel('Password setup resume run ID (optional)').fill('run-1')
  page.once('dialog', dialog => { expect(dialog.message()).toContain('RUN ChangeDefaultAdminPasswordPe'); return dialog.accept('RUN ChangeDefaultAdminPasswordPe') })
  await modal.getByRole('button', { name: 'Run approved pipeline' }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ path: '/api/pipelines/pipeline-1/run', body: { riskAcknowledged: true, destructiveConfirmation: 'RUN ChangeDefaultAdminPasswordPe', passwordSetupApprovalId: 'fresh-approval', passwordSetupConfirmation: PASSWORD_SETUP_CONFIRMATION, passwordSetupResumeRunId: 'run-1' } })
})

test('uncertain pipeline stages require explicit manual independent evidence; core checks stay separate', async ({ page }) => {
  const writes = await setup(page, [], { runs: [{ ...ledger[0], pipelineId: 'pipeline-1', pipelineAttempts: { '0': 'change_attempted', '1': 'pending', '2': 'completed' } }] })
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await page.getByLabel('Recovery run', { exact: true }).selectOption('run-1')
  const attestation = page.getByRole('group', { name: 'Manual reconciliation for pipeline step 1' })
  await expect(attestation).toContainText('not an automatic health or authentication check')
  const record = attestation.getByRole('button', { name: 'Record manual stage evidence' })
  await expect(record).toBeDisabled()
  await page.getByLabel('Pipeline step 1 outcome', { exact: true }).selectOption('not_applied')
  await page.getByLabel('Pipeline step 1 notes', { exact: true }).fill('Independently inspected PE state')
  await page.getByLabel('Pipeline step 1 evidence', { exact: true }).fill('Manual record TEST-3')
  await expect(record).toBeDisabled()
  await page.getByLabel('Independently verified pipeline step 1', { exact: true }).check()
  await record.click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toEqual({ path: '/api/initial-password-setup/runs/run-1/reconcile', body: { pipelineStep: 0, selection: 'not_applied', notes: 'Independently inspected PE state', evidence: 'Manual record TEST-3', independentlyVerified: true } })
  await expect(page.getByLabel('Reference-only run JSON')).toContainText('change_attempted')
  await expect(page.getByRole('button', { name: 'Resume standalone run' })).toHaveCount(0)
  await expect(page.getByText('Pipeline run: independently reconcile', { exact: false })).toContainText('passwordSetupResumeRunId = run-1')
  await page.getByLabel('Pipeline step 1 outcome', { exact: true }).selectOption('completed')
  await page.getByLabel('Independently verified pipeline step 1', { exact: true }).check()
  await record.click()
  await expect.poll(() => writes.length).toBe(2)
  expect(writes[1].body.selection).toBe('completed')
})

test('live-write flag off blocks apply and resume but permits mocked read-only checks', async ({ page }) => {
  const writes = await setup(page, [], { liveEnabled: false })
  await page.goto(`/workflows/${PASSWORD_SETUP_WORKFLOW}`)
  await importConfig(page, config())
  await page.locator('select').filter({ has: page.locator('option[value="approved-setup"]') }).selectOption('approved-setup')
  await expect(page.getByText('Server live-write flag off or unavailable.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run Workflow', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Dry Run', exact: true })).toBeEnabled()
  await page.getByLabel('Recovery run', { exact: true }).selectOption('run-1')
  await page.getByLabel('Fresh resume approval ID').fill('fresh-approval')
  await page.getByLabel('Resume confirmation', { exact: true }).fill(PASSWORD_SETUP_CONFIRMATION)
  await expect(page.getByRole('button', { name: 'Resume standalone run' })).toBeDisabled()
  expect(writes).toHaveLength(0)
})

test('pipeline selector exception only includes new mandatory workflow and Configure links do not write', async ({ page }) => {
  const writes = await setup(page, [], { approvalRequiredWorkflows: [PASSWORD_SETUP_WORKFLOW, 'config-cluster'] })
  await page.goto('/start/configure')
  await page.getByRole('link', { name: 'Initial Host & CVM Password Setup', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Initial Host & CVM Password Setup', exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  await page.goto('/pipelines')
  await page.getByRole('button', { name: 'New Pipeline', exact: true }).click()
  const workflowSelect = page.locator('select').filter({ has: page.locator(`option[value="${PASSWORD_SETUP_WORKFLOW}"]`) })
  await workflowSelect.selectOption(PASSWORD_SETUP_WORKFLOW)
  await expect(workflowSelect).toHaveValue(PASSWORD_SETUP_WORKFLOW)
  await expect(workflowSelect.locator('option[value="cvm-idrac-password-rotation"]')).toHaveCount(0)
  await expect(workflowSelect.locator('option[value="config-cluster"]')).toHaveCount(0)
  expect(writes).toHaveLength(0)
})

test('pipeline without password setup adds no new prompts or payload fields', async ({ page }) => {
  const writes = await setup(page, [{ id: 'legacy-1', name: 'Legacy fixture', createdAt: '', updatedAt: '', steps: [{ workflow: 'ChangeDefaultAdminPasswordPe', configFile: 'pe.yml' }] }])
  await page.goto('/pipelines')
  let prompts = 0
  page.on('dialog', dialog => { prompts++; expect(dialog.message()).toContain('RUN ChangeDefaultAdminPasswordPe'); return dialog.accept('RUN ChangeDefaultAdminPasswordPe') })
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  // The existing modal can replay its mount effect under development StrictMode.
  await expect.poll(() => writes.length).toBeGreaterThan(0)
  for (const write of writes) expect(write.body).toEqual({ riskAcknowledged: true, destructiveConfirmation: 'RUN ChangeDefaultAdminPasswordPe' })
  expect(prompts).toBe(writes.length)
  await expect(page.getByRole('dialog', { name: 'Approve initial password setup pipeline' })).toHaveCount(0)
})
