import { expect, test, type Page } from '@playwright/test'

const passwordWorkflow = 'initial-host-cvm-password-setup'
const passwordConfirmation = 'SET INITIAL HOST AND CVM PASSWORDS'

async function seedPasswordRecovery(page: Page, role = 'admin', status = 'ready_for_configuration') {
  await seed(page, role)
  const content = 'cluster_name: HCI-01\nhost_key_evidence: mock/console\ncvms: []\nhosts: []\n'
  const run = { id: 'password-dr', profileName: 'HCI-01 Recovery', mode: 'recovery', status,
    revision: 1, clusterName: 'HCI-01', clusterVip: '192.0.2.20', foundationEndpoint: 'http://foundation.example.com:8000',
    baselineSha256: 'a'.repeat(64), deploymentJobId: 'foundation-complete', currentJobId: 'pe-complete', bootstrapStepCount: 1,
    canRetryRegistration: false, steps: [{ index: 0, status: 'success', jobId: 'pe-complete' }],
    snapshot: { targets: ['NODE1'], deploymentContent: 'create_clusters: []', steps: [
      { workflow: 'config-cluster', configFile: 'pe.yml', configContent: 'clusters: {}', sha256: 'b'.repeat(64) },
      { workflow: passwordWorkflow, configFile: 'reviewed-passwords.yml', configContent: content, sha256: 'c'.repeat(64) },
      { workflow: 'config-cluster', configFile: 'settings.yml', configContent: 'clusters: {}', sha256: 'd'.repeat(64) },
    ] }, events: [] }
  await page.route('**/api/recovery**', route => route.fulfill({ json: new URL(route.request().url()).pathname === '/api/recovery'
    ? { datacenters: [], profiles: [], runs: [run] } : run }))
  await page.route('**/api/jobs/pe-complete', route => route.fulfill({ json: {
    id: 'pe-complete', status: 'success', diagnostics: { initialPasswordRunId: 'password-journal-123' },
  } }))
  return { run, content }
}

test('DR password approval requests bind the exact saved snapshot and require separate confirmation', async ({ page }, testInfo) => {
  const { content } = await seedPasswordRecovery(page)
  const requests: unknown[] = []
  await page.route('**/api/approvals', async route => {
    requests.push(route.request().postDataJSON())
    await route.fulfill({ json: { id: 'password-approval-id', status: 'pending' } })
  })
  await page.goto('/recovery/runs?run=password-dr')
  const panel = page.getByRole('region', { name: 'Initial Host and CVM password approval' })
  await expect(panel).toBeVisible()
  await panel.getByText('Review exact password setup snapshot', { exact: true }).click()
  await expect(panel.locator('pre')).toHaveText(content)
  await expect(panel).toContainText('Deployment and PE bootstrap approvals do not authorize')
  await panel.getByRole('button', { name: 'Request Password Setup Approval' }).click()
  await expect(panel.getByLabel('Independent password setup approval ID')).toHaveValue('password-approval-id')
  await expect(panel.getByRole('status')).toContainText('A different administrator must approve')
  expect(requests).toEqual([{ workflow: passwordWorkflow, configFile: 'reviewed-passwords.yml',
    configContent: content, notes: 'Initial Host & CVM password setup for recovery password-dr' }])
  await expect(panel.getByLabel(`Password setup confirmation: ${passwordConfirmation}`)).toHaveValue('')
  await expect(page.getByText('Password setup journal run ID: password-journal-123', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('dr-password-approval.png'), fullPage: true })
})

test('DR password approval failures hide upstream response content', async ({ page }) => {
  await seedPasswordRecovery(page)
  await page.route('**/api/approvals', route => route.fulfill({ status: 403, contentType: 'text/html', body: 'private-upstream-marker' }))
  await page.goto('/recovery/runs?run=password-dr')
  const panel = page.getByRole('region', { name: 'Initial Host and CVM password approval' })
  await panel.getByRole('button', { name: 'Request Password Setup Approval' }).click()
  await expect(panel.getByRole('alert')).toContainText('HTTP 403')
  await expect(panel).not.toContainText('private-upstream-marker')
  await expect(panel.getByLabel('Independent password setup approval ID')).toHaveValue('')
})

test('DR parent configure request forwards only the selected password approval and confirmation', async ({ page }) => {
  const { run } = await seedPasswordRecovery(page)
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/recovery/runs/password-dr/configure', async route => {
    requests.push(route.request().postDataJSON())
    const index = run.steps.length
    run.steps.push({ index, status: 'success', jobId: `mock-completed-${index}` })
    if (run.steps.length === run.snapshot.steps.length) run.status = 'awaiting_acceptance'
    await route.fulfill({ json: run })
  })
  await page.goto('/recovery/runs?run=password-dr')
  const start = page.getByRole('button', { name: 'Run Remaining Pipeline Steps', exact: true })
  const selection = page.getByLabel('Recovery configuration step', { exact: true })
  const panel = page.getByRole('region', { name: 'Initial Host and CVM password approval' })
  await expect(selection).toHaveValue('1')
  await expect(start).toBeDisabled()
  await expect(page.getByLabel(/^PE script confirmation:/)).toHaveCount(0)
  await panel.getByLabel('Independent password setup approval ID').fill('approved-exact-password-snapshot')
  await panel.getByLabel(`Password setup confirmation: ${passwordConfirmation}`).fill(passwordConfirmation + ' ')
  await expect(start).toBeDisabled()
  await panel.getByLabel(`Password setup confirmation: ${passwordConfirmation}`).fill(passwordConfirmation)
  await expect(start).toBeEnabled()

  // Selecting a different snapshot cannot submit or retain password permission.
  await selection.selectOption('2')
  await expect(panel).toHaveCount(0)
  await expect(start).toBeDisabled()
  await selection.selectOption('1')
  await expect(panel.getByLabel('Independent password setup approval ID')).toHaveValue('')
  await expect(start).toBeDisabled()
  await panel.getByLabel('Independent password setup approval ID').fill('approved-exact-password-snapshot')
  await panel.getByLabel(`Password setup confirmation: ${passwordConfirmation}`).fill(passwordConfirmation)
  await start.click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({ riskAcknowledged: true, destructiveConfirmation: '', retryRegistrationOnly: false,
    passwordSetupApprovalId: 'approved-exact-password-snapshot', passwordSetupConfirmation: passwordConfirmation })
  await expect(page.getByText('Step 2 succeeded · job mock-completed-1', { exact: true })).toBeVisible()

  // Completed password permission is omitted from the next ordinary configure POST.
  await selection.selectOption('2')
  await expect(start).toBeEnabled()
  await start.click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1]).toEqual({ riskAcknowledged: true, destructiveConfirmation: '', retryRegistrationOnly: false })
  expect(run.steps[0]).toEqual({ index: 0, status: 'success', jobId: 'pe-complete' })
})

test('DR viewers cannot enter password execution approval fields', async ({ page }) => {
  await seedPasswordRecovery(page, 'viewer')
  await page.goto('/recovery/runs?run=password-dr')
  await expect(page.getByRole('region', { name: 'Recovery stage guide' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request Password Setup Approval' })).toHaveCount(0)
  await expect(page.getByLabel('Independent password setup approval ID')).toHaveCount(0)
})

test('DR failed health runs cannot enter password execution approval fields', async ({ page }) => {
  await seedPasswordRecovery(page, 'admin', 'awaiting_health_verification')
  await page.goto('/recovery/runs?run=password-dr')
  await expect(page.getByRole('region', { name: 'Recovery stage guide' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request Password Setup Approval' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run Remaining Pipeline Steps' })).toHaveCount(0)
})

test('DR password optional fields apply only to the selected pending password action', async ({ page }) => {
  const { run } = await seedPasswordRecovery(page)
  await page.goto('/recovery/runs?run=password-dr')
  const result = await page.evaluate(async ({ run, passwordConfirmation }) => {
    const path = '/src/components/RecoveryRunGuide.tsx'
    const { recoveryPasswordSetupFields, recoveryPasswordSetupReady } = await import(path)
    const fields = { passwordSetupApprovalId: ' independent-approval ', passwordSetupConfirmation: passwordConfirmation }
    return {
      selected: recoveryPasswordSetupFields(run, 1, fields),
      completed: recoveryPasswordSetupFields(run, 0, fields),
      other: recoveryPasswordSetupFields(run, 2, fields),
      failedHealth: recoveryPasswordSetupFields({ ...run, status: 'awaiting_health_verification' }, 1, fields),
      ready: recoveryPasswordSetupReady(run, 1, fields),
      missingApproval: recoveryPasswordSetupReady(run, 1, { ...fields, passwordSetupApprovalId: '' }),
      incorrectConfirmation: recoveryPasswordSetupReady(run, 1, { ...fields, passwordSetupConfirmation: passwordConfirmation + ' ' }),
      wrongSelection: recoveryPasswordSetupReady(run, 2, fields),
      healthNotReady: recoveryPasswordSetupReady({ ...run, status: 'awaiting_health_verification' }, 1, fields),
    }
  }, { run, passwordConfirmation })
  expect(result).toEqual({ selected: { passwordSetupApprovalId: 'independent-approval', passwordSetupConfirmation: passwordConfirmation },
    completed: {}, other: {}, failedHealth: {}, ready: true, missingApproval: false,
    incorrectConfirmation: false, wrongSelection: false, healthNotReady: false })
})

async function seed(page: Page, role = 'admin', options: { blocker?: string; used?: boolean; linked?: boolean; empty?: boolean; recoveryStatus?: string } = {}) {
  await page.addInitScript(role => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'isolated-fixture', user: { username: 'recovery-reviewer', role }, sidebarOpen: false,
    sidebarPreferenceInitialized: true, settings: {},
  }, version: 0 })), role)
  const checks = { network: 'reviewed', images: 'reviewed', credentials: 'reviewed', dnsNtp: 'reviewed', backupAccess: 'reviewed' }
  const dc = { id: 'dc1', name: 'Datacenter Alpha', foundationEndpoint: 'http://foundation.example.com:8000', notes: 'Approved recovery network', prerequisites: checks }
  const revision = { revision: 1, sha256: 'a'.repeat(64), deploymentConfigFile: 'deploy.yml', deploymentContent: 'foundation_vm_ip: foundation.example.com\n', clusterName: 'HCI-01', clusterVip: '192.0.2.20', targets: ['NODE1', 'NODE2', 'NODE3'], steps: [{ workflow: 'config-cluster', configFile: 'post.yml', configContent: 'clusters: {}\n', sha256: 'b'.repeat(64) }], pipelineName: 'Post deployment', approvedBy: 'reviewer', approvedAt: '2026-10-28T08:00:00Z' }
  const profile = { id: 'p1', name: 'HCI-01 Recovery', datacenterId: dc.id, kind: 'existing', revision: 1, reviewed: true, drifted: false, deploymentConfigFile: 'deploy.yml', pipelineId: 'pipe', revisions: [revision], updatedAt: '2026-11-05T08:00:00Z', archivedAt: '', archiveNotes: '', lifecycle: {} }
  const writes: string[] = []
  const datacenters = options.empty ? [] : [dc]
  if (options.recoveryStatus) revision.steps = Array.from({ length: 8 }, (_, index) => ({
    workflow: 'config-cluster', configFile: index === 7 ? '08_register_pc.yml' : `0${index + 1}_settings.yml`,
    configContent: 'clusters: {}\n', sha256: 'b'.repeat(64),
  }))
  const completed = options.recoveryStatus ? Array.from({ length: 7 }, (_, index) => ({ index, status: 'success', jobId: `completed-${index}` })) : []
  let preparedRun = options.recoveryStatus ? {
    id: 'run1', profileId: profile.id, profileName: profile.name, datacenterId: dc.id,
    mode: 'recovery', status: options.recoveryStatus, revision: 1, clusterName: revision.clusterName,
    clusterVip: revision.clusterVip, baselineSha256: revision.sha256, foundationEndpoint: dc.foundationEndpoint,
    steps: completed, snapshot: revision, deploymentJobId: 'foundation-complete', currentJobId: 'registration-failed',
    createdAt: '2026-11-05T08:00:00Z', updatedAt: '2026-11-05T08:00:00Z', canRetryRegistration: true,
    reconciliation: { registrationAbsent: false },
  } : null
  let removed = false
  const lifecycle = () => ({canEdit: !profile.archivedAt && !options.blocker, canArchive: !profile.archivedAt && !options.blocker, canRestore: Boolean(profile.archivedAt) && !options.blocker, canDelete: !options.used && !options.blocker && !options.linked, runCount: options.used || options.blocker ? 1 : 0, linkedClusterCount: options.linked ? 1 : 0, blockers: options.blocker ? [{id:'blocking-run',status:options.blocker}] : [], editReason: options.blocker ? 'Open recovery run requires completion or reconciliation: blocking-run ('+options.blocker+')' : profile.archivedAt ? 'Restore this archived profile before editing.' : '', archiveReason: options.blocker ? 'Open recovery run requires completion or reconciliation.' : '', restoreReason:'', deleteReason: options.used || options.blocker ? 'Recovery run history is retained. Archive this profile instead.' : options.linked ? 'Managed-cluster records reference this profile.' : ''})
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET' && path !== '/api/auth/activity') writes.push(path)
    profile.lifecycle = lifecycle()
    let value: unknown = []
    if (path === '/api/system/check') value = { checks: [], ztfInstalled: true }
    if (path === '/api/configs') value = [{ name: 'deploy.yml' }, { name: 'post.yml' }]
    if (path === '/api/pipelines') value = [{ id: 'pipe', name: 'Post deployment', steps: [] }]
    if (path === '/api/recovery') value = { datacenters, profiles: removed || options.empty ? [] : [profile], runs: preparedRun ? [preparedRun] : [] }
    if (path === '/api/recovery/datacenters') {
      const added = { ...request.postDataJSON(), id: 'dc2' }; datacenters.push(added); value = added
    }
    if (path === '/api/recovery/datacenters/dc2') {
      const saved = { ...request.postDataJSON(), id: 'dc2' }; datacenters[0] = saved; value = saved
    }
    if (path === '/api/recovery/profiles' && options.empty) {
      const body = request.postDataJSON()
      expect(body).toMatchObject({ datacenterId: 'dc2', deploymentConfigFile: 'deploy.yml', pipelineId: 'pipe' })
      value = { id: 'draft-profile', ...body }
    }
    if (path === '/api/recovery/profiles/p1') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON(); profile.name = body.name; profile.revision++; profile.revisions.push({...revision, revision:profile.revision, approvedBy:''}); profile.updatedAt='2026-11-05T08:01:00Z'
      }
      if (request.method() === 'DELETE') removed = true
      value = removed ? {deleted:true,id:profile.id} : profile
    }
    if (path === '/api/recovery/profiles/p1/archive') {profile.archivedAt='2026-11-05T08:01:00Z';profile.archiveNotes=request.postDataJSON().notes;profile.updatedAt='2026-11-05T08:01:00Z';profile.lifecycle=lifecycle();value=profile}
    if (path === '/api/recovery/profiles/p1/restore') {profile.archivedAt='';profile.updatedAt='2026-11-05T08:02:00Z';profile.lifecycle=lifecycle();value=profile}
    if (path === '/api/recovery/runs') {
      preparedRun = { id: 'run1', profileId: profile.id, profileName: profile.name, datacenterId: dc.id, mode: request.postDataJSON().mode, status: 'prepared', deploymentJobId: '', currentJobId: '', createdAt: '2026-11-05T08:00:00Z', canRetryRegistration: false, reconciliation: { registrationAbsent: false }, updatedAt:'2026-11-05T08:00:00Z', revision: 1, clusterName: revision.clusterName, clusterVip: revision.clusterVip, baselineSha256: revision.sha256, foundationEndpoint: dc.foundationEndpoint, steps: [], snapshot: revision }
      value = preparedRun
    }
    if (path === '/api/recovery/runs/run1/close-prepared') { (preparedRun as {status:string}).status = 'closed_reconciled'; value = preparedRun }
    if (path === '/api/recovery/runs/run1/reconcile' && preparedRun) {
      expect(request.postDataJSON()).toMatchObject({ resumeConfiguration: true, registrationAbsent: true })
      preparedRun.status = 'awaiting_health_verification'
      preparedRun.reconciliation.registrationAbsent = true
      value = preparedRun
    }
    if (path === '/api/recovery/runs/run1/health' && preparedRun) {
      expect(request.postDataJSON()).toMatchObject({ clusterIdentity: 'HCI-01', membershipVerified: true, servicesHealthy: true })
      preparedRun.status = 'ready_for_configuration'
      value = preparedRun
    }
    if (path === '/api/recovery/runs/run1/configure' && preparedRun) {
      expect(request.postDataJSON().retryRegistrationOnly).toBe(true)
      expect(request.postDataJSON()).not.toHaveProperty('passwordSetupApprovalId')
      expect(request.postDataJSON()).not.toHaveProperty('passwordSetupConfirmation')
      expect(preparedRun.reconciliation.registrationAbsent).toBe(true)
      expect(preparedRun.status).toBe('ready_for_configuration')
      preparedRun.status = 'awaiting_acceptance'
      preparedRun.steps = [...completed, { index: 7, status: 'success', jobId: 'retry-08-only' }]
      value = preparedRun
    }
    if (path === '/api/recovery/runs/run1/approval') value = { id: 'approval1' }
    if (path === '/api/recovery/runs/run1') {
      await new Promise(resolve => setTimeout(resolve, 200))
      value = preparedRun
    }
    await route.fulfill({ json: value })
  })
  return writes
}

test('datacenter creation persists through the recovery API without deployment', async ({ page }) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  await expect(page.getByRole('heading', { name: 'Disaster Recovery', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Datacenter', exact: true }).filter({ visible: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Datacenter name').fill('Datacenter Beta')
  await dialog.getByLabel('Foundation VM endpoint').fill('http://foundation-beta.example.com:8000')
  await dialog.getByLabel('Recovery dependencies and runbook notes').fill('Network and credentials reviewed')
  await dialog.getByRole('button', { name: 'Save Datacenter' }).click()
  await expect(page.getByRole('heading', { name: 'Datacenter Beta', exact: true })).toBeVisible()
  expect(writes).toEqual(['/api/recovery/datacenters'])
  await page.screenshot({ path: 'test-results/disaster-recovery-desktop.png', fullPage: true })
})

test('profile review prepares a real rehearsal but cannot skip destructive gates', async ({ page }) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Review Profile' }).click()
  await expect(page.getByRole('dialog')).toContainText('NODE1')
  await page.getByRole('button', { name: 'Prepare Rehearsal', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('REFOUNDATION HCI-01')
  await expect(page.getByRole('button', { name: 'Deploy Reviewed Recovery' })).toBeDisabled()
  expect(writes).toEqual(['/api/recovery/runs'])
  await page.getByRole('button', { name: 'Request Deployment Approval' }).click()
  await expect(page.getByLabel('Approved request ID')).toHaveValue('approval1')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('closing a run during polling does not reopen the dialog', async ({ page }) => {
  await seed(page)
  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Review Profile' }).click()
  await page.getByRole('button', { name: 'Prepare Rehearsal', exact: true }).click()
  const response = page.waitForResponse(r => r.url().endsWith('/api/recovery/runs/run1'))
  await page.waitForRequest(r => r.url().endsWith('/api/recovery/runs/run1'))
  await page.keyboard.press('Escape')
  await response
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('viewer can inspect baselines but cannot create or prepare recovery', async ({ page }) => {
  const writes = await seed(page, 'viewer')
  await page.goto('/recovery')
  await expect(page.getByRole('button', { name: 'Add Datacenter', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Review Profile' }).click()
  await expect(page.getByRole('button', { name: 'Prepare Recovery', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})

test('recovery is usable on mobile and in light theme', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/recovery')
  await expect(page.getByRole('heading', { name: 'Disaster Recovery', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Datacenter', exact: true }).filter({ visible: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.screenshot({ path: 'test-results/disaster-recovery-light.png', fullPage: true })
})

test('bootstrap is available before health and cannot start remaining configuration', async ({ page }) => {
  await seed(page)
  const writes: {path: string; body: Record<string, unknown>}[] = []
  const steps = ['password.yml', 'eula.yml', 'storage.yml'].map(configFile => ({workflow:'config-cluster', configFile, configContent:'clusters: {}\n', sha256:'b'.repeat(64)}))
  const run = {id:'bootstrap-run', profileName:'HCI-01 Recovery', mode:'recovery', status:'awaiting_bootstrap', revision:1,
    clusterName:'HCI-01', clusterVip:'192.0.2.20', foundationEndpoint:'http://foundation.example.com:8000',
    baselineSha256:'a'.repeat(64), deploymentJobId:'foundation-job', bootstrapStepCount:2, steps:[],
    snapshot:{targets:['NODE1','NODE2','NODE3'], deploymentContent:'create_clusters: []', steps}, events:[]}
  await page.route('**/api/recovery**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() !== 'GET' && path !== '/api/auth/activity') writes.push({path, body:req.postDataJSON()})
    if (path.endsWith('/bootstrap')) run.status='bootstrapping'
    await route.fulfill({json:path === '/api/recovery' ? {datacenters:[], profiles:[], runs:[run]} : run})
  })
  await page.goto('/recovery/runs')
  await page.getByRole('button', {name:/HCI-01 Recovery/}).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', {name:'Initial access bootstrap before PE health verification'})).toBeVisible()
  await expect(dialog.getByRole('button', {name:'Record Health Evidence'})).toHaveCount(0)
  await expect(dialog.getByRole('button', {name:'Run Remaining Pipeline Steps'})).toHaveCount(0)
  await expect(dialog.getByRole('button', {name:'Run Approved Bootstrap'})).toBeDisabled()
  await dialog.getByLabel('Bootstrap confirmation: BOOTSTRAP HCI-01').fill('BOOTSTRAP HCI-01')
  await dialog.getByRole('checkbox', {name:/I approve the reviewed initial-access/}).check()
  await dialog.getByRole('button', {name:'Run Approved Bootstrap'}).click()
  await expect(dialog.getByRole('button', {name:'Run Approved Bootstrap'})).toHaveCount(0)
  expect(writes).toEqual([{path:'/api/recovery/runs/bootstrap-run/bootstrap',body:{approvalIds:{},confirmation:'BOOTSTRAP HCI-01',riskAcknowledged:true,destructiveConfirmation:''}}])
  await page.screenshot({path:'test-results/recovery-bootstrap.png', fullPage:true})
})

test('HTML API errors explain the HTTP status without leaking the response', async ({ page }) => {
  const writes = await seed(page)
  await page.route('**/api/recovery', route => route.fulfill({status:429, contentType:'text/html', body:'<!doctype html><p>private raw response</p>'}))
  await page.goto('/recovery')
  await expect(page.getByRole('status')).toContainText('HTTP 429')
  await expect(page.getByRole('status')).toContainText('do not resubmit a deployment')
  await expect(page.getByRole('status')).not.toContainText('private raw response')
  expect(writes).toEqual([])
})

test('Edit Profile is visible in the list and saves a new draft revision', async ({ page }) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Edit profile HCI-01 Recovery', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Edit Recovery Profile')
  await dialog.getByLabel('Profile name', { exact: true }).fill('HCI-01 Recovery Updated')
  const save = page.waitForRequest(r => r.method() === 'PUT' && r.url().endsWith('/api/recovery/profiles/p1'))
  await dialog.getByRole('button', { name: 'Save Draft Revision' }).click()
  const request = await save
  expect(request.postDataJSON()).toMatchObject({expectedRevision:1, expectedUpdatedAt:'2026-11-05T08:00:00Z'})
  await expect(page.getByRole('cell', { name: /HCI-01 Recovery Updated existing cluster/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Revision 2', exact: true })).toBeVisible()
  expect(writes).toEqual(['/api/recovery/profiles/p1'])
})

test('archive and restore require exact confirmation and preserve review history', async ({ page }) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  if (process.env.ZTF_CAPTURE_PROFILE_GUIDE) {
    await page.setViewportSize({width:1440,height:1000})
    await page.getByRole('button', {name:'Cluster Profiles',exact:true}).click()
    await expect(page.getByRole('button', {name:'Archive profile HCI-01 Recovery', exact:true})).toBeEnabled()
    await page.screenshot({path:'docs/assets/recovery-profile-management/recovery-profile-management.png',fullPage:true})
  }
  await page.getByRole('button', { name: 'Archive profile HCI-01 Recovery', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name:'Confirm archive' })).toBeDisabled()
  await dialog.getByLabel('Confirmation: ARCHIVE HCI-01 Recovery', {exact:true}).fill('ARCHIVE HCI-01 Recovery')
  await dialog.getByLabel('Profile action notes (no secrets)', {exact:true}).fill('Retired baseline; retain recovery evidence.')
  await dialog.getByRole('button', { name:'Confirm archive' }).click()
  await expect(page.getByRole('button', {name:'Review Profile'})).toHaveCount(0)
  await page.getByLabel(/Include archived profiles/).check()
  await page.getByRole('button', {name:'Review Profile'}).click()
  dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('NODE1')
  await expect(dialog.getByRole('button', {name:'Prepare Recovery',exact:true})).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', {name:'Restore profile HCI-01 Recovery',exact:true}).click()
  dialog=page.getByRole('dialog')
  await dialog.getByLabel('Confirmation: RESTORE HCI-01 Recovery', {exact:true}).fill('RESTORE HCI-01 Recovery')
  await dialog.getByLabel('Profile action notes (no secrets)', {exact:true}).fill('Reinstated after review.')
  await dialog.getByRole('button', {name:'Confirm restore'}).click()
  await expect(page.getByRole('button', {name:'Edit profile HCI-01 Recovery',exact:true})).toBeEnabled()
  expect(writes).toEqual(['/api/recovery/profiles/p1/archive','/api/recovery/profiles/p1/restore'])
})

test('blocking run explains disabled management actions and historical usage prevents deletion', async ({ page }) => {
  const writes=await seed(page,'admin',{blocker:'needs_reconciliation'})
  await page.goto('/recovery')
  await expect(page.getByRole('button',{name:'Edit profile HCI-01 Recovery',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Archive profile HCI-01 Recovery',exact:true})).toBeDisabled()
  const deleteButton = page.getByRole('button', { name: 'Delete unused profile HCI-01 Recovery', exact: true })
  await expect(deleteButton).toBeDisabled()
  await expect(deleteButton).toHaveAccessibleDescription('Recovery run history is retained. Archive this profile instead.')
  await expect(page.getByRole('button',{name:/Review blocking run blocking-run/})).toBeVisible()
  await expect(page.getByText(/Open recovery run requires completion or reconciliation:/)).toBeVisible()
  expect(writes).toEqual([])
})

test('unused profile deletion is deliberate and makes no deployment requests', async ({ page }) => {
  const writes=await seed(page)
  await page.goto('/recovery')
  await page.getByRole('button',{name:'Delete unused profile HCI-01 Recovery',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await expect(dialog).toContainText('Saved YAML files, pipelines, credentials and datacenters are retained')
  await expect(dialog.getByRole('button',{name:'Confirm delete'})).toBeDisabled()
  await dialog.getByLabel('Confirmation: DELETE HCI-01 Recovery',{exact:true}).fill('DELETE HCI-01 Recovery')
  await dialog.getByLabel('Profile action notes (no secrets)',{exact:true}).fill('Unused duplicate profile.')
  const request=page.waitForRequest(r=>r.method()==='DELETE' && r.url().endsWith('/api/recovery/profiles/p1'))
  await dialog.getByRole('button',{name:'Confirm delete'}).click()
  expect((await request).method()).toBe('DELETE')
  await expect(page.getByRole('button',{name:'Review Profile'})).toHaveCount(0)
  expect(writes).toEqual(['/api/recovery/profiles/p1'])
})

test('viewer has no profile lifecycle mutation controls',async({page})=>{
  const writes=await seed(page,'viewer')
  await page.goto('/recovery')
  for(const name of ['Edit profile HCI-01 Recovery','Archive profile HCI-01 Recovery','Delete unused profile HCI-01 Recovery']) await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0)
  expect(writes).toEqual([])
})

test('stale profile update keeps the draft and reports the conflict',async({page})=>{
  await seed(page)
  await page.route('**/api/recovery/profiles/p1',route=>route.request().method()==='PUT'?route.fulfill({status:409,json:{error:'Profile changed. Reload and review it before changing it.'}}):route.fallback())
  await page.goto('/recovery')
  await page.getByRole('button',{name:'Edit profile HCI-01 Recovery',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await dialog.getByLabel('Profile name',{exact:true}).fill('Draft retained')
  await dialog.getByRole('button',{name:'Save Draft Revision'}).click()
  await expect(dialog.getByRole('alert')).toContainText('Profile changed')
  await expect(dialog.getByLabel('Profile name',{exact:true})).toHaveValue('Draft retained')
})


test('abandoned prepared run can close without any deployment request', async ({page}) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  await page.getByRole('button',{name:'Review Profile',exact:true}).click()
  await page.getByRole('button',{name:'Prepare Rehearsal',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Close prepared run without deploying',{exact:true}).click()
  const close = dialog.getByRole('button',{name:'Close Prepared Run',exact:true})
  await expect(close).toBeDisabled()
  await dialog.getByLabel('Closure confirmation: CLOSE PREPARED HCI-01',{exact:true}).fill('CLOSE PREPARED HCI-01')
  await dialog.getByLabel('Prepared-run closure notes',{exact:true}).fill('Abandoned before submission; baseline requires revision.')
  await close.click()
  await expect(dialog).toContainText('closed reconciled')
  expect(writes).toEqual(['/api/recovery/runs','/api/recovery/runs/run1/close-prepared'])
})

test('Start Here leads an administrator through first-time recovery setup without deployment', async ({ page }) => {
  const writes = await seed(page, 'admin', { empty: true })
  await page.goto('/start')
  await page.getByRole('link', { name: /Recover Infrastructure/ }).click()
  await expect(page).toHaveURL(/\/recovery$/)
  const setup = page.getByRole('region', { name: 'Set up infrastructure recovery' })
  await expect(setup.getByRole('heading', { level: 3 })).toHaveText([
    'Add a datacenter', 'Review recovery prerequisites', 'Link the deployment YAML and pipeline',
  ])
  await expect(setup.getByRole('link', { name: 'Config Files' })).toHaveAttribute('href', '/configs')
  await expect(setup.getByRole('link', { name: 'Pipelines' })).toHaveAttribute('href', '/pipelines')
  await setup.getByRole('button', { name: 'Add Datacenter' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Datacenter name').fill('Datacenter Beta')
  await dialog.getByLabel('Foundation VM endpoint').fill('http://foundation-beta.example.com:8000')
  await dialog.getByLabel('Recovery dependencies and runbook notes').fill('Approved runbook')
  await dialog.getByRole('button', { name: 'Save Datacenter' }).click()

  await setup.getByRole('button', { name: 'Review prerequisites for Datacenter Beta' }).click()
  await dialog.getByLabel('Provisioning network').selectOption('reviewed')
  await dialog.getByRole('button', { name: 'Save Datacenter' }).click()
  await expect(page.getByText('1 / 5 prerequisites reviewed')).toBeVisible()

  await setup.getByRole('button', { name: 'Link YAML and pipeline' }).click()
  await expect(dialog.getByRole('combobox', { name: 'Datacenter', exact: true })).toHaveValue('dc2')
  await dialog.getByLabel('Profile name').fill('HCI-02 Recovery')
  await dialog.getByLabel('Foundation VM deployment YAML').selectOption('deploy.yml')
  await dialog.getByLabel('Post-configuration pipeline').selectOption('pipe')
  await dialog.getByRole('button', { name: 'Save Draft Revision' }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes).toEqual(['/api/recovery/datacenters', '/api/recovery/datacenters/dc2', '/api/recovery/profiles'])
})

test('empty recovery setup is read-only for viewers', async ({ page }) => {
  const writes = await seed(page, 'viewer', { empty: true })
  await page.goto('/recovery')
  const setup = page.getByRole('region', { name: 'Set up infrastructure recovery' })
  await expect(setup.getByText(/An administrator can add datacenters/)).toBeVisible()
  await expect(setup.getByRole('button')).toHaveCount(0)
  expect(writes).toEqual([])
})


test('Recover Cluster reviews readiness and prepares through the existing deployment approval gate', async ({ page }) => {
  const writes = await seed(page)
  await page.goto('/recovery')
  await page.getByRole('banner').getByRole('button', { name: 'Recover Cluster', exact: true }).click()
  await page.getByLabel('Cluster recovery profile').selectOption('p1')
  await page.getByRole('button', { name: 'Review targets and readiness' }).click()
  await expect(page.getByRole('dialog')).toContainText('Review recovery readiness and exact targets')
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Prepare Recovery', exact: true }).click()
  const guide = page.getByRole('region', { name: 'Recovery stage guide' })
  await guide.getByText('Recovery stages', { exact: true }).click()
  await expect(guide.getByText('Review targets and approve', { exact: true }).locator('..')).toContainText('Current')
  await expect(page.getByRole('button', { name: 'Deploy Reviewed Recovery' })).toBeDisabled()
  expect(writes).toEqual(['/api/recovery/runs'])
})

test('Resume Recovery retains steps 01 through 07 and guides reconciliation, health and step 08 only', async ({ page }) => {
  const writes = await seed(page, 'admin', { recoveryStatus: 'needs_reconciliation' })
  await page.goto('/recovery')
  await page.getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review targets and readiness' })).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  const guide = page.getByRole('region', { name: 'Recovery stage guide' })
  await guide.getByText('Pipeline steps · 7 / 8 completed', { exact: true }).click()
  await expect(guide.getByText('08. 08_register_pc.yml').locator('..')).toContainText('Blocked')
  await expect(guide.getByText('01. 01_settings.yml').locator('..')).toContainText('Completed')
  await expect(page.getByRole('button', { name: 'Deploy Reviewed Recovery' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry step 08 only', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Review reconciliation', exact: true }).click()
  await page.getByLabel('What did Foundation and the nodes show?').fill('PE and PC reconciled, registration absent')
  await page.getByLabel('Log or ticket reference').fill('mock/reconciliation')
  await page.getByLabel('I checked Foundation and the target nodes; imaging and other active jobs have finished.').check()
  await page.getByLabel('Prepare to resume remaining configuration after fresh health evidence.').check()
  await expect(page.getByRole('button', { name: 'Save checked outcome' })).toBeDisabled()
  await page.getByLabel('I verified registration is absent in PE and PC.').check()
  await page.getByRole('button', { name: 'Save checked outcome' }).click()
  await expect(page.getByRole('button', { name: 'Retry step 08 only', exact: true })).toHaveCount(0)
  await page.getByLabel('Verified cluster identity').fill('HCI-01')
  await page.getByLabel('Health readback notes').fill('Fresh mock health readback')
  await page.getByLabel('Evidence reference', { exact: true }).fill('mock/fresh-health')
  await page.getByLabel('Expected membership and cluster services are healthy.').check()
  await page.getByRole('button', { name: 'Record Health Evidence' }).click()
  await expect(guide.getByRole('button', { name: 'Review step 08 retry' })).toBeVisible()
  await page.getByRole('button', { name: 'Retry step 08 only', exact: true }).click()
  await expect(guide.getByText('08. 08_register_pc.yml').locator('..')).toContainText('Completed')
  expect(writes).toEqual(['/api/recovery/runs/run1/reconcile', '/api/recovery/runs/run1/health', '/api/recovery/runs/run1/configure'])
})

test('viewer has recovery stage visibility without Recover Cluster or retry controls', async ({ page }) => {
  const writes = await seed(page, 'viewer', { recoveryStatus: 'needs_reconciliation' })
  await page.goto('/recovery/runs?run=run1')
  await expect(page.getByRole('region', { name: 'Recovery stage guide' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recover Cluster', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Review reconciliation', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry step 08 only', exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})


test('newly discovered open run redirects guided preparation to Resume Recovery', async ({ page }) => {
  const writes = await seed(page)
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/recovery')
  await page.goto('/recovery')
  const overview = await (await response).json()
  await page.getByRole('banner').getByRole('button', { name: 'Recover Cluster', exact: true }).click()
  await page.getByLabel('Cluster recovery profile').selectOption('p1')
  await page.getByRole('button', { name: 'Review targets and readiness' }).click()
  await page.route('**/api/recovery', route => route.fulfill({ json: {
    ...overview, runs: [{ id: 'other-run', profileId: 'p1', status: 'prepared', mode: 'recovery', revision: 1, steps: [] }],
  } }))
  await page.getByRole('button', { name: 'Prepare Recovery', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Resume Recovery', exact: true })).toBeVisible()
  expect(writes).toEqual([])
})


test('an interrupted bootstrap is blocked after completed Foundation imaging', async ({ page }) => {
  await seed(page, 'admin', { recoveryStatus: 'needs_reconciliation' })
  await page.goto('/recovery')
  const overview = await page.evaluate(async () => (await fetch('/api/recovery')).json())
  const run = { ...overview.runs[0], bootstrapStepCount: 2, steps: [], canRetryRegistration: false }
  await page.route('**/api/recovery/runs/run1', route => route.fulfill({ json: run }))
  await page.getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  const guide = page.getByRole('region', { name: 'Recovery stage guide' })
  await guide.getByText('Recovery stages', { exact: true }).click()
  await expect(guide.getByText('Foundation imaging', { exact: true }).locator('..')).toContainText('Completed')
  await expect(guide.getByText('Initial-access bootstrap', { exact: true }).locator('..')).toContainText('Blocked')
  await expect(page.getByRole('button', { name: 'Deploy Reviewed Recovery' })).toHaveCount(0)
})


test('early deployment failure shows its saved cause before collapsed future configuration', async ({ page }) => {
  const writes = await seed(page, 'admin', { recoveryStatus: 'needs_reconciliation' })
  await page.goto('/recovery')
  const overview = await page.evaluate(async () => (await fetch('/api/recovery')).json())
  const run = { ...overview.runs[0], currentJobId: '', steps: [], canRetryRegistration: false }
  await page.route('**/api/recovery/runs/run1', route => route.fulfill({ json: run }))
  await page.route('**/api/jobs/foundation-complete', route => route.fulfill({ json: {
    id: 'foundation-complete', status: 'failed', returnCode: -1,
    diagnostics: { stderrTail: 'Foundation image inventory request returned HTTP 503' },
    logs: [{ type: 'error', data: 'Foundation image inventory request returned HTTP 503' }],
  } }))
  await page.getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Resume Recovery', exact: true }).click()
  const guide = page.getByRole('region', { name: 'Recovery stage guide' })
  await expect(guide.getByText('Foundation image inventory request returned HTTP 503', { exact: true })).toBeVisible()
  await expect(guide.getByRole('link', { name: 'Open this job and its log' })).toHaveAttribute('href', '/jobs?job=foundation-complete')
  await expect(guide.getByText('08. 08_register_pc.yml')).toBeHidden()
  await expect(page.getByLabel('Recovery configuration step')).toHaveCount(0)
  await expect(page.getByLabel('Prepare to resume remaining configuration after fresh health evidence.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save checked outcome' })).toBeDisabled()
  expect(writes).toEqual([])
})
