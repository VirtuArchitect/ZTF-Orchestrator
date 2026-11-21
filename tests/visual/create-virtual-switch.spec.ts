import { expect, test } from '@playwright/test'
const uuid = '12345678-0000-4000-8000-000000000001'
const base = '/api/create-virtual-switch'

async function fixture(page: any, enabled = true, changeRequired = true) {
  let approved = false
  let submitted = false
  const posts: { path: string; data: any }[] = []
  const hosts = [1, 2, 3].map(i => ({ id: 'host-' + i, name: 'AHV-' + i, serial: 'SERIAL-' + i,
    observed: { switches: { br0: { ports: ['eth0', 'eth1'], mtu: 1500 } } } }))
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only',
      user: { username: 'example-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async (route: any) => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (req.method() === 'POST' && path.startsWith(base)) posts.push({ path, data: req.postDataJSON() })
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [{ id: 'cluster', name: 'LAB-CLUSTER',
      peEndpoint: 'https://pe.example.com:9440', peCredential: 'pe_ref', expectedUuid: uuid }] } })
    if (path === base) return route.fulfill({ json: { applyEnabled: enabled } })
    if (path === base + '/preflight') {
      const body = req.postDataJSON()
      expect(body.connection.verify_tls).toBe(false)
      expect(body.connection).not.toHaveProperty('pc_endpoint')
      expect(body.switchName).toBe('vs1')
      return route.fulfill({ json: { content: JSON.stringify({ intent: body }), sha256: 'a'.repeat(64), changeRequired,
        plan: { clusterName: 'LAB-CLUSTER', bridge: 'br1', hosts } } })
    }
    if (path === base + '/approval') return route.fulfill({ status: 201, json: { id: 'approval-1' } })
    if (path === '/api/approvals/approval-1') return route.fulfill({ json: { status: approved ? 'approved' : 'pending', ...(submitted ? { jobId: 'job-1' } : {}) } })
    if (path === base + '/apply') { submitted = true; return route.fulfill({ status: 202, json: { id: 'job-1' } }) }
    if (path === '/api/jobs/job-1') return route.fulfill({ json: { status: 'success', diagnostics: { verifiedHosts: hosts.map(h => ({ hostId: h.id, host: h.name, bridge: 'br1', mtu: 1500, action: 'created', stage: 'verified' })) } } })
    return route.fulfill({ json: {} })
  })
  return { posts, approve: () => { approved = true } }
}
async function fill(page: any) {
  await page.getByLabel('Managed cluster (optional)').selectOption('cluster')
  await page.getByLabel('CVM credential reference').fill('cvm_ref')
  await page.getByLabel('CVM SSH host keys by IP as JSON').fill(JSON.stringify(Object.fromEntries([21, 22, 23].map(i => [`192.0.2.${i}`, 'SHA256:' + 'A'.repeat(43)]))))
  await page.getByLabel(/I reviewed exact hosts/).check()
}

test('separate create-only wizard generates config, requires approval and verifies every host', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/start/configure')
  await page.getByRole('link', { name: 'Create Virtual Switch', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create Virtual Switch', exact: true })).toBeVisible()
  await expect(page.getByLabel('Connection mode').getByRole('option', { name: 'Prism Central managed' })).toHaveCount(0)
  await expect(page.getByLabel('Verify PE TLS certificate')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Run read-only preflight' })).toBeDisabled()
  await fill(page)
  await page.getByRole('button', { name: 'Generate YAML' }).click()
  await expect(page.getByLabel('Generated YAML')).toContainText('switchName: vs1')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Config' }).click()
  expect((await download).suggestedFilename()).toBe('create-virtual-switch.yml')
  expect(state.posts).toEqual([])
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await expect(page.getByRole('list', { name: 'Per-host creation plan' }).getByText(/Create empty bridge/)).toHaveCount(3)
  await page.getByRole('button', { name: 'Request independent approval' }).click()
  await page.getByLabel(`Type CREATE SWITCH ${uuid} vs1`).fill(`CREATE SWITCH ${uuid} vs1`)
  await expect(page.getByRole('button', { name: 'Create approved virtual switch' })).toBeDisabled()
  state.approve()
  await page.reload()
  await page.getByLabel(`Type CREATE SWITCH ${uuid} vs1`).fill(`CREATE SWITCH ${uuid} vs1`)
  await page.getByRole('button', { name: 'Create approved virtual switch' }).click()
  await expect(page.getByText(/AHV-1 · br1 · MTU 1500 · created · verified/)).toBeVisible()
  expect(state.posts.filter(x => x.path.endsWith('/apply'))).toHaveLength(1)
  await page.screenshot({ path: 'test-results/create-virtual-switch-light.png', fullPage: true })
})

test('planning mode and existing switches never expose live creation', async ({ page }) => {
  const state = await fixture(page, false, false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/scripts/create-virtual-switch')
  await expect(page.getByText(/live switch creation is disabled pending hardware validation/)).toBeVisible()
  await fill(page)
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await expect(page.getByText('Empty switch already present on every host. No change or approval is needed.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request independent approval' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create approved virtual switch' })).toHaveCount(0)
  expect(state.posts.map(x => x.path)).toEqual([base + '/preflight'])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
