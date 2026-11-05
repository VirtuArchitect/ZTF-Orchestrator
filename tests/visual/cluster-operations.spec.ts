import { expect, test, type Page } from '@playwright/test'

function fixture() {
  const at = new Date().toISOString()
  return { version: 1, revision: 0, collectedAt: at, clusters: [{ id: 'cluster1', name: 'HCI-01', datacenter: 'DC01', owner: 'Infrastructure', peEndpoint: 'https://pe.example.com:9440', peCredential: 'pe_monitor', expectedUuid: '00000000-0000-4000-8000-000000000001', expectedNodes: [{ serial: 'NODE1', hostIp: '192.0.2.22', cvmIp: '192.0.2.23' }], configFiles: ['post.yml'], pipelineId: 'pipe1', recoveryProfileId: '', updatedAt: at, observationFresh: true, observation: { collectionStatus:'completed', status: 'good', collectedAt: at, message: 'Expected identity and membership matched; PE reports Good.', checks: [{ name: 'PE identity', status: 'passed' }] } }],
    attention: { 'job-old': { id: 'job-old', jobId: 'old', title: 'Job requires review', detail: 'config-cluster', status: 'open', owner: '', notes: '', updatedAt: at } }, jobs: [{ id: 'job1', workflow: 'config-cluster', configFile: 'post.yml', status: 'success', updatedAt: at }], pipelines: [{ id: 'pipe1', name: 'Post deployment' }], recoveryProfiles: [], recoveryRuns: [] }
}

async function seed(page: Page, role = 'admin', state = fixture()) {
  const writes: { path: string; body: Record<string, unknown> }[] = []
  await page.addInitScript(role => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-operator', role }, sidebarOpen: true, sidebarPreferenceInitialized: true, settings: {} }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  }, role)
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() !== 'GET' && path !== '/api/auth/activity') writes.push({ path, body: req.postDataJSON() })
    if (path === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    if (path === '/api/operations') return route.fulfill({ json: state })
    if (path === '/api/recovery') return route.fulfill({ json: { datacenters: [], profiles: [], runs: [] } })
    if (path === '/api/configs') return route.fulfill({ json: [{ name: 'post.yml' }] })
    if (path === '/api/operations/clusters') {
      const body = req.postDataJSON(); state.revision++; state.clusters.push({ ...body, id: 'cluster2', updatedAt: new Date().toISOString() })
      return route.fulfill({ json: { id: 'cluster2', revision: state.revision } })
    }
    if (path === '/api/operations/attention/job-old') {
      Object.assign(state.attention['job-old'], req.postDataJSON()); state.revision++
      return route.fulfill({ json: { revision: state.revision } })
    }
    if (path.endsWith('/health') && path.includes('/operations/')) return route.fulfill({ json: { status: 'unknown' } })
    if (path === '/api/health/details') return route.fulfill({ json: { status: 'healthy', storage: 'file' } })
    if (path === '/api/maintenance/database-backups') return route.fulfill({ json: { backups: [] } })
    if (path === '/api/visibility/summary') return route.fulfill({ status: 503, json: { error: 'fixture' } })
    return route.fulfill({ json: [] })
  })
  return { writes, state }
}

test('overview links cluster context and does not collect PE or submit automation on view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1300 })
  const { writes } = await seed(page)
  await page.goto('/overview')
  const workspace = page.getByRole('region', { name: 'Managed cluster workspace' })
  await expect(workspace.getByRole('button', { name: 'Review HCI-01' })).toBeVisible()
  await expect(workspace.getByText('PE-reported health: Good', { exact: true }).first()).toBeVisible()
  await expect(workspace.getByText('Post deployment', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Persistent attention items' }).getByText('Job requires review', { exact: true })).toBeVisible()
  await expect(workspace.getByText(/This is not NCC/)).toBeVisible()
  expect(writes).toEqual([])
  await page.screenshot({ path: 'test-results/cluster-operations-overview.png', fullPage: true, animations: 'disabled' })
})

test('stale good observations never present as fresh health', async ({ page }) => {
  const state = fixture(); state.clusters[0].observationFresh = false; state.clusters[0].observation.collectedAt = new Date(Date.parse(state.collectedAt)-901_000).toISOString()
  await seed(page, 'admin', state)
  await page.goto('/clusters')
  await expect(page.getByText('Evidence expired', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('PE-reported health: Good', { exact: true })).toHaveCount(0)
})

test('administrator creates organizational record without running infrastructure work', async ({ page }) => {
  const { writes } = await seed(page)
  await page.goto('/clusters')
  await page.getByRole('button', { name: 'Add cluster record' }).click()
  await page.getByLabel('Exact cluster name', { exact: true }).fill('HCI-02')
  await page.getByLabel('Datacenter label', { exact: true }).fill('DC02')
  await page.getByLabel('PE HTTPS endpoint', { exact: true }).fill('https://pe2.example.com:9440')
  await page.getByRole('button', { name: 'Save cluster record', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Review HCI-02' })).toBeVisible()
  expect(writes.map(w => w.path)).toEqual(['/api/operations/clusters'])
  expect(writes[0].body.expectedUuid).toEqual('')
  expect(writes[0].body.expectedNodes).toEqual([])
})

test('Foundation baseline import fills only identity and membership without execution or secrets', async ({ page }) => {
  const { writes } = await seed(page)
  await page.route('**/api/configs/post.yml', route => route.fulfill({ json: { content: 'create_clusters:\n  - cluster_name: HCI-02\n    cluster_vip: 192.0.2.40\n    cluster_password: fixture-secret-not-imported\n    nodes_list:\n      - node_serial: NODE02\n        host_ip: 192.0.2.42\n        cvm_ip: 192.0.2.43\n' } }))
  await page.goto('/clusters')
  await page.getByRole('button', { name: 'Add cluster record' }).click()
  await page.getByLabel('Foundation deployment file', { exact: true }).selectOption('post.yml')
  await page.getByRole('button', { name: 'Read expected membership from YAML' }).click()
  await page.getByLabel('Choose cluster baseline').selectOption('0')
  await expect(page.getByLabel('Exact cluster name', { exact: true })).toHaveValue('HCI-02')
  await expect(page.getByLabel('PE HTTPS endpoint', { exact: true })).toHaveValue('https://192.0.2.40:9440')
  await expect(page.getByLabel('Expected cluster UUID (independently verified)', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('PE read-only credential reference', { exact: true })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Expected physical membership (JSON: serial, hostIp, cvmIp)', exact: true })).toHaveValue(/NODE02/)
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Save cluster record', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].path).toBe('/api/operations/clusters')
  expect(JSON.stringify(writes[0].body)).not.toContain('fixture-secret')
  expect(writes[0].body.expectedNodes).toEqual([{ serial: 'NODE02', hostIp: '192.0.2.42', cvmIp: '192.0.2.43' }])
})

test('attention resolution requires review notes and preserves the record', async ({ page }) => {
  const { writes } = await seed(page)
  await page.goto('/clusters')
  const panel = page.getByRole('region', { name: 'Persistent attention items' })
  await panel.getByRole('button', { name: 'Update review' }).click()
  await panel.getByLabel('Review status', { exact: true }).selectOption('resolved')
  await expect(panel.getByRole('button', { name: 'Save attention review' })).toBeDisabled()
  await panel.getByLabel('Review / reconciliation notes (no secrets)').fill('Verified target state; failure reconciled without replay.')
  await panel.getByRole('button', { name: 'Save attention review' }).click()
  await expect(panel.getByText('No open observed exceptions. This is not a live health assessment.')).toBeVisible()
  await panel.getByLabel('Include resolved records').check()
  await expect(panel.getByText('Job requires review', { exact: true })).toBeVisible()
  expect(writes[0].body.status).toEqual('resolved')
})

test('viewer cannot collect, register or resolve and existing specialist routes remain available', async ({ page }) => {
  const { writes } = await seed(page, 'viewer')
  await page.goto('/clusters')
  await expect(page.getByRole('button', { name: 'Add cluster record' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Collect PE health (read-only)' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Update review' })).toHaveCount(0)
  expect(writes).toEqual([])
})

test('operational GET polling honours Retry-After and marks prior data stale', async ({ page }) => {
  await page.clock.install()
  await seed(page)
  let calls = 0
  await page.route('**/api/operations', route => {
    calls++
    if (calls <= 2) return route.fulfill({ json: fixture() })
    return route.fulfill({ status: 429, headers: { 'Retry-After': '90' }, json: { error: 'rate limited' } })
  })
  await page.goto('/clusters')
  await expect(page.getByRole('button', { name: 'Review HCI-01' })).toBeVisible()
  await page.clock.fastForward(30_001)
  await expect(page.getByText(/Operational records unavailable \(HTTP 429\)/).first()).toBeVisible()
  const previous = calls
  await page.clock.fastForward(89_000)
  expect(calls).toBe(previous)
  await page.clock.fastForward(1_100)
  await expect.poll(() => calls).toBe(previous + 1)
})

test('mobile cluster and review controls have no page-level overflow', async ({ page }) => {
  await seed(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/clusters')
  await expect(page.getByRole('button', { name: 'Review HCI-01' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/cluster-operations-mobile.png', fullPage: true, animations: 'disabled' })
})

test('existing recovery run deep link is read-only and failed refresh stays explicitly stale', async ({ page }) => {
  const { writes } = await seed(page)
  await page.clock.install()
  const run = { id: 'run1', mode: 'recovery', clusterName: 'HCI-01', clusterVip: '192.0.2.20', status: 'needs_reconciliation', revision: 1, foundationEndpoint: 'http://foundation.example.com:8000', steps: [], snapshot: { targets: ['NODE1'], deploymentContent: 'clusters: {}', steps: [], revision: 1 } }
  let reads = 0
  await page.route('**/api/recovery/runs/run1', route => {
    reads++
    return reads <= 2 ? route.fulfill({ json: run }) : route.fulfill({ status: 429, headers: { 'Retry-After': '120' }, contentType: 'text/html', body: '<h1>Rate limited</h1>' })
  })
  await page.goto('/recovery?run=run1')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Last successful run refresh:', { exact: false })).toBeVisible()
  await page.clock.fastForward(10_100)
  await expect(dialog.getByRole('status')).toContainText("This run's displayed state is stale")
  const previous = reads
  await page.clock.fastForward(119_000)
  expect(reads).toBe(previous)
  expect(writes).toEqual([])
})


for (const offset of [-3_600_000, 3_600_000]) {
  test(`browser clock offset ${offset} warns without expiring fresh appliance evidence`, async ({ page }) => {
    await page.clock.install()
    const state = fixture()
    state.collectedAt = '2026-11-05T08:13:59Z'
    state.clusters[0].observation.collectedAt = '2026-11-05T08:12:01Z'
    await page.clock.setSystemTime(new Date(Date.parse(state.collectedAt)+offset))
    const {writes} = await seed(page,'admin',state)
    await page.goto('/overview')
    const workspace = page.getByRole('region',{name:'Managed cluster workspace'})
    await expect(workspace.getByText('PE-reported health: Good',{exact:true}).first()).toBeVisible()
    await expect(workspace.getByRole('status')).toContainText('Browser/appliance clock mismatch')
    await expect(workspace.getByText(/Evidence age: 1m 58s/)).toBeVisible()
    await expect(workspace.getByText('Evidence expired',{exact:true})).toHaveCount(0)
    expect(writes).toEqual([])
  })
}

test('failed collection is distinct from completed unknown health and retains the cause after expiry', async ({page}) => {
  const state=fixture();state.clusters[0].observation.collectionStatus='failed';state.clusters[0].observation.status='unknown'
  state.clusters[0].observation.message='PE observation failed. Check the credential reference, certificate trust/SAN, connectivity and API compatibility.'
  state.clusters[0].observation.collectedAt=new Date(Date.parse(state.collectedAt)-901_000).toISOString()
  state.clusters[0].observationFresh=false
  const {writes}=await seed(page,'admin',state)
  await page.goto('/clusters')
  await expect(page.getByText('Collection failed',{exact:true}).first()).toBeVisible()
  await expect(page.getByText(/15-minute window expired/)).toBeVisible()
  await expect(page.getByText(/certificate trust\/SAN/)).toBeVisible()
  await expect(page.getByText('PE-reported health: Good',{exact:true})).toHaveCount(0)
  expect(writes).toEqual([])
})

test('future evidence and invalid timestamps have explicit labels', async ({page}) => {
  const state=fixture();state.clusters[0].observation.collectedAt=new Date(Date.parse(state.collectedAt)+120_000).toISOString();state.clusters[0].observationFresh=false
  await seed(page,'admin',state)
  await page.goto('/clusters')
  await expect(page.getByText('Evidence clock mismatch',{exact:true}).first()).toBeVisible()
  state.clusters[0].observation.collectedAt='2026-11-05T08:12:01'
  await page.reload()
  await expect(page.getByText('Invalid evidence timestamp',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('PE-reported health: Good',{exact:true})).toHaveCount(0)
})

test('dashboard refresh failure does not claim that PE collection failed', async ({page}) => {
  await page.clock.install()
  await seed(page)
  let reads=0
  await page.route('**/api/operations',route => ++reads<=2 ? route.fulfill({json:fixture()}) : route.fulfill({status:503,json:{error:'unavailable'}}))
  await page.goto('/clusters')
  await expect(page.getByText('PE-reported health: Good',{exact:true}).first()).toBeVisible()
  await page.clock.fastForward(30_001)
  await expect(page.getByText('Dashboard refresh failed',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('Collection failed',{exact:true})).toHaveCount(0)
})

test('monotonic elapsed time expires evidence between dashboard refreshes', async ({page}) => {
  await page.clock.install()
  const state=fixture();state.clusters[0].observation.collectedAt=new Date(Date.parse(state.collectedAt)-899_000).toISOString()
  await seed(page,'admin',state)
  await page.goto('/clusters')
  await expect(page.getByText('PE-reported health: Good',{exact:true}).first()).toBeVisible()
  await page.clock.fastForward(2_100)
  await expect(page.getByText('Evidence expired',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('PE-reported health: Good',{exact:true})).toHaveCount(0)
})


test('health status reference view separates outcomes without making collection requests', async ({page}) => {
  const state=fixture(), base=structuredClone(state.clusters[0])
  state.clusters=['fresh','expired','failed','clock'].map((kind,index) => {
    const row=structuredClone(base);row.id='cluster'+index;row.name='HCI-0'+(index+1)
    row.observation.collectedAt=new Date(Date.parse(state.collectedAt)+({fresh:-118_000,expired:-960_000,failed:-30_000,clock:120_000}[kind] || 0)).toISOString()
    row.observationFresh=kind==='fresh'
    if(kind==='failed') {row.observation.collectionStatus='failed';row.observation.status='unknown';row.observation.message='PE collection failed; check credentials, certificate trust/SAN and connectivity.'}
    return row
  })
  const review=state.attention['job-old']
  state.attention=Object.fromEntries(['PE evidence expired','PE collection failed','PE evidence clock mismatch'].map((title,index)=>['health-'+index,{...review,id:'health-'+index,title,clusterId:'cluster'+(index+1),jobId:undefined,detail:'HCI-0'+(index+2)}])) as typeof state.attention
  const {writes}=await seed(page,'admin',state)
  await page.setViewportSize({width:1600,height:1100})
  await page.goto('/clusters')
  const workspace=page.getByRole('region',{name:'Managed cluster workspace'})
  for(const label of ['PE-reported health: Good','Evidence expired','Collection failed','Evidence clock mismatch']) await expect(workspace.getByText(label,{exact:true}).first()).toBeVisible()
  expect(writes).toEqual([])
  if(process.env.ZTF_CAPTURE_HEALTH_GUIDE) await page.screenshot({path:'docs/assets/pe-health-reporting/health-states.png',fullPage:true,animations:'disabled'})
})
