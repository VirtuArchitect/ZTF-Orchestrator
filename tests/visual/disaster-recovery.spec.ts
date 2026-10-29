import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page, role = 'admin') {
  await page.addInitScript(role => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'isolated-fixture', user: { username: 'recovery-reviewer', role }, sidebarOpen: false,
    sidebarPreferenceInitialized: true, settings: {},
  }, version: 0 })), role)
  const checks = { network: 'reviewed', images: 'reviewed', credentials: 'reviewed', dnsNtp: 'reviewed', backupAccess: 'reviewed' }
  const dc = { id: 'dc1', name: 'Datacenter Alpha', foundationEndpoint: 'http://foundation.example.com:8000', notes: 'Approved recovery network', prerequisites: checks }
  const revision = { revision: 1, sha256: 'a'.repeat(64), deploymentConfigFile: 'deploy.yml', deploymentContent: 'foundation_vm_ip: foundation.example.com\n', clusterName: 'HCI-01', clusterVip: '192.0.2.20', targets: ['NODE1', 'NODE2', 'NODE3'], steps: [{ workflow: 'config-cluster', configFile: 'post.yml', configContent: 'clusters: {}\n', sha256: 'b'.repeat(64) }], pipelineName: 'Post deployment', approvedBy: 'reviewer', approvedAt: '2026-10-28T08:00:00Z' }
  const profile = { id: 'p1', name: 'HCI-01 Recovery', datacenterId: dc.id, kind: 'existing', revision: 1, reviewed: true, drifted: false, deploymentConfigFile: 'deploy.yml', pipelineId: 'pipe', revisions: [revision] }
  const writes: string[] = []
  const datacenters = [dc]
  let preparedRun: unknown = null
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET') writes.push(path)
    let value: unknown = []
    if (path === '/api/system/check') value = { checks: [], ztfInstalled: true }
    if (path === '/api/configs') value = [{ name: 'deploy.yml' }, { name: 'post.yml' }]
    if (path === '/api/pipelines') value = [{ id: 'pipe', name: 'Post deployment', steps: [] }]
    if (path === '/api/recovery') value = { datacenters, profiles: [profile], runs: [] }
    if (path === '/api/recovery/datacenters') {
      const added = { ...request.postDataJSON(), id: 'dc2' }; datacenters.push(added); value = added
    }
    if (path === '/api/recovery/profiles/p1') value = profile
    if (path === '/api/recovery/runs') {
      preparedRun = { id: 'run1', profileId: profile.id, profileName: profile.name, datacenterId: dc.id, mode: request.postDataJSON().mode, status: 'prepared', revision: 1, clusterName: revision.clusterName, clusterVip: revision.clusterVip, baselineSha256: revision.sha256, foundationEndpoint: dc.foundationEndpoint, steps: [], snapshot: revision }
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
    if (req.method() !== 'GET') writes.push({path, body:req.postDataJSON()})
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
  await expect(page.getByRole('alert')).toContainText('HTTP 429')
  await expect(page.getByRole('alert')).toContainText('do not resubmit a deployment')
  await expect(page.getByRole('alert')).not.toContainText('private raw response')
  expect(writes).toEqual([])
})
