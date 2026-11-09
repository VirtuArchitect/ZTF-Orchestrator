import { expect, test } from '@playwright/test'

const cluster = '12345678-0000-4000-8000-000000000001'
const hosts = ['AHV-01', 'AHV-02', 'AHV-03'].map((name, index) => ({
  id: `host-${index}`, name, nics: ['eth0', 'eth1', 'eth2', 'eth3'].map(name => ({ name, up: true })),
}))
const base = '/api/ahv-uplink-migration'

test('assigns physical NICs per host and submits only the exact approved plan', async ({ page }) => {
  let approved = false
  const requests: { path: string; data: Record<string, unknown> }[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
      sessionToken: 'fixture-only', user: { username: 'example-admin', role: 'admin' },
      sidebarOpen: true, sidebarPreferenceInitialized: true,
    }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.method() === 'POST') requests.push({ path, data: req.postDataJSON() })
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [{
      id: 'cluster-1', expectedUuid: cluster, name: 'LAB-AHV-01', peEndpoint: 'https://pe.example.com:9440', peCredential: 'pe_ref',
    }] } })
    if (path === base) return route.fulfill({ json: { applyEnabled: true } })
    if (path === base + '/discover') return route.fulfill({ json: {
      clusterName: 'LAB-AHV-01', switches: [], hosts, source: { config: { clusters: [{
        hosts: hosts.map(host => ({ extId: host.id, hostNics: host.nics.map(nic => nic.name) })),
      }] } },
    } })
    if (path === base + '/preflight') return route.fulfill({ json: {
      content: 'exact-plan', sha256: 'a'.repeat(64), clusterName: 'LAB-AHV-01',
      assignments: hosts.map(host => ({ hostId: host.id, host: host.name, keep: ['eth0', 'eth1'], move: ['eth2', 'eth3'], destination: ['eth2', 'eth3'] })),
    } })
    if (path === base + '/approval') return route.fulfill({ status: 201, json: { id: 'approval-1' } })
    if (path === '/api/approvals/approval-1') return route.fulfill({ json: { status: approved ? 'approved' : 'pending' } })
    if (path === base + '/apply') return route.fulfill({ status: 202, json: { id: 'job-1' } })
    if (path === '/api/jobs/job-1') return route.fulfill({ json: {
      status: 'success', diagnostics: { verifiedHosts: hosts.map(host => ({ hostId: host.id, stage: 'verified' })) },
    } })
    return route.fulfill({ json: {} })
  })
  await page.setViewportSize({ width: 1586, height: 1050 })
  await page.goto('/configure/ahv-uplink-migration')
  await expect(page.getByRole('radio', { name: 'Create a new virtual switch' })).toBeChecked()
  await expect(page.getByLabel('Switch name')).toHaveValue('vs1')
  await page.getByLabel('Target cluster').selectOption('cluster-1')
  await page.getByLabel('Prism Central HTTPS endpoint').fill('https://pc.example.com:9440')
  await page.getByLabel('PC credential reference').fill('pc_ref')
  await page.getByRole('button', { name: 'Discover cluster (read-only)' }).click()
  await page.screenshot({ path: 'test-results/ahv-uplink-destination.png', fullPage: true })
  await page.getByRole('button', { name: 'Continue to uplink assignment' }).click()
  for (const host of hosts) {
    await expect(page.getByRole('radio', { name: `${host.name} eth0 keep on br0` })).toBeChecked()
    for (const name of ['eth2', 'eth3']) await page.getByRole('radio', { name: `${host.name} ${name} move to vs1` }).check()
  }
  await expect(page.getByText('6 uplinks stay on br0 (vs0) · 6 move to vs1')).toBeVisible()
  await page.screenshot({ path: 'test-results/ahv-uplink-assignments.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click({ position: { x: 370, y: 400 } })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1586, height: 1050 })
  await page.getByRole('button', { name: 'Continue to preflight' }).click()
  await expect(page.getByRole('button', { name: 'Run read-only preflight' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /I verified physical cabling/ }).check()
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await page.getByRole('button', { name: 'Request independent approval' }).click()
  await expect(page.getByRole('button', { name: 'Continue to apply' })).toBeDisabled()
  approved = true
  await page.reload()
  await page.getByRole('button', { name: 'Continue to apply' }).click()
  await expect(page.getByRole('button', { name: 'Apply approved plan' })).toBeDisabled()
  await page.getByLabel(`Type APPLY UPLINKS ${cluster}`).fill(`APPLY UPLINKS ${cluster}`)
  await page.getByRole('button', { name: 'Apply approved plan' }).click()
  await expect(page.getByRole('list', { name: 'Per-host verification' }).getByText('Both switch assignments verified')).toHaveCount(3)
  const preflight = requests.find(request => request.path === base + '/preflight')
  expect(preflight?.data.move).toEqual(Object.fromEntries(hosts.map(host => [host.id, ['eth2', 'eth3']])))
  expect(requests.filter(request => request.path === base + '/apply')).toEqual([{ path: base + '/apply',
    data: { content: 'exact-plan', approvalId: 'approval-1', confirmation: `APPLY UPLINKS ${cluster}` } }])
})
