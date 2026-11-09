import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page, role = 'admin', options: { blocker?: string; used?: boolean; linked?: boolean } = {}) {
  await page.addInitScript(role => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'isolated-fixture', user: { username: 'recovery-reviewer', role }, sidebarOpen: false,
    sidebarPreferenceInitialized: true, settings: {},
  }, version: 0 })), role)
  const checks = { network: 'reviewed', images: 'reviewed', credentials: 'reviewed', dnsNtp: 'reviewed', backupAccess: 'reviewed' }
  const dc = { id: 'dc1', name: 'Datacenter Alpha', foundationEndpoint: 'http://foundation.example.com:8000', notes: 'Approved recovery network', prerequisites: checks }
  const revision = { revision: 1, sha256: 'a'.repeat(64), deploymentConfigFile: 'deploy.yml', deploymentContent: 'foundation_vm_ip: foundation.example.com\n', clusterName: 'HCI-01', clusterVip: '192.0.2.20', targets: ['NODE1', 'NODE2', 'NODE3'], steps: [{ workflow: 'config-cluster', configFile: 'post.yml', configContent: 'clusters: {}\n', sha256: 'b'.repeat(64) }], pipelineName: 'Post deployment', approvedBy: 'reviewer', approvedAt: '2026-10-28T08:00:00Z' }
  const profile = { id: 'p1', name: 'HCI-01 Recovery', datacenterId: dc.id, kind: 'existing', revision: 1, reviewed: true, drifted: false, deploymentConfigFile: 'deploy.yml', pipelineId: 'pipe', revisions: [revision], updatedAt: '2026-11-05T08:00:00Z', archivedAt: '', archiveNotes: '', lifecycle: {} }
  const writes: string[] = []
  const datacenters = [dc]
  let preparedRun: unknown = null
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
    if (path === '/api/recovery') value = { datacenters, profiles: removed ? [] : [profile], runs: [] }
    if (path === '/api/recovery/datacenters') {
      const added = { ...request.postDataJSON(), id: 'dc2' }; datacenters.push(added); value = added
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
      preparedRun = { id: 'run1', profileId: profile.id, profileName: profile.name, datacenterId: dc.id, mode: request.postDataJSON().mode, status: 'prepared', updatedAt:'2026-11-05T08:00:00Z', revision: 1, clusterName: revision.clusterName, clusterVip: revision.clusterVip, baselineSha256: revision.sha256, foundationEndpoint: dc.foundationEndpoint, steps: [], snapshot: revision }
      value = preparedRun
    }
    if (path === '/api/recovery/runs/run1/close-prepared') { (preparedRun as {status:string}).status = 'closed_reconciled'; value = preparedRun }
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
