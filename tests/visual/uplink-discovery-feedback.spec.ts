import { expect, test, type Page } from '@playwright/test'

const base = '/api/ahv-uplink-migration'
const cluster = '12345678-0000-4000-8000-000000000001'
const hosts = [1, 2, 3].map(i => ({ id: `host-${i}`, name: `AHV-0${i}`,
  nics: ['eth0', 'eth1', 'eth2', 'eth3'].map(name => ({ name, up: true })) }))
const inventory = { clusterName: 'TEST-CLUSTER', hosts, switches: [],
  source: { config: { clusters: [{ hosts: hosts.map(host => ({ extId: host.id, hostNics: ['eth0', 'eth1', 'eth2', 'eth3'] })) }] } } }

async function setup(page: Page, outcomes: ('success' | 'failed' | 'empty')[] = ['success'], hold?: Promise<void>) {
  const posts: string[] = []
  await page.addInitScript(() => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only',
      user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST' && path.startsWith(base)) {
      posts.push(path)
      expect(path).toBe(base + '/discover')
    }
    if (path === base + '/discover') {
      if (hold) await hold
      const outcome = outcomes.shift() || 'success'
      if (outcome === 'failed') return route.fulfill({ status: 403, json: { error: 'CVM SSH host-key verification failed.' } })
      return route.fulfill({ json: outcome === 'empty' ? { ...inventory, hosts: [] } : inventory })
    }
    if (path === base) return route.fulfill({ json: { applyEnabled: true } })
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/configure/ahv-uplink-migration')
  return posts
}

async function fill(page: Page) {
  await page.getByLabel('Prism Element HTTPS endpoint', { exact: true }).fill('https://pe.example.com:9440')
  await page.getByLabel('PE credential reference', { exact: true }).fill('pe_ref')
  await page.getByLabel('Expected cluster UUID').fill(cluster)
  await page.getByLabel('CVM credential reference').fill('cvm_ref')
  await page.getByLabel('CVM SSH host keys by IP as JSON').fill(JSON.stringify(Object.fromEntries([1, 2, 3].map(i => [`192.0.2.${i}`, 'SHA256:' + 'A'.repeat(43)]))))
}

test('missing inputs, malformed pins and PC inputs explain disabled discovery and Continue', async ({ page }) => {
  const posts = await setup(page)
  const feedback = page.getByRole('region', { name: 'Cluster discovery', exact: true })
  await expect(feedback).toContainText('Complete before discovery:')
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeDisabled()
  await fill(page)
  await page.getByLabel('CVM SSH host keys by IP as JSON').fill('{bad')
  await expect(feedback).toContainText('correct the invalid JSON')
  await expect(page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })).toBeDisabled()
  await page.getByLabel('Connection mode').selectOption('pc')
  await expect(feedback.getByText('Prism Central HTTPS endpoint', { exact: true })).toBeVisible()
  expect(posts).toEqual([])
})

test('discovery shows Running, elapsed time, host results and a ready Continue', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const posts = await setup(page, ['success'], pending)
  await fill(page)
  await page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true }).click()
  await expect(page.getByText('Running — waiting for host and uplink inventory.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discovering cluster…' })).toBeDisabled()
  await expect(page.getByText(/Elapsed: [1-9]\d*s/)).toBeVisible()
  await expect(page.getByText('Discovery is running. Wait for host and uplink results before continuing.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: /Target cluster/ })).toBeDisabled()
  await page.getByRole('region', { name: 'Cluster discovery', exact: true }).screenshot({ path: 'test-results/uplink-discovery-running.png' })
  release()
  await expect(page.getByText('Passed — TEST-CLUSTER · 3 hosts discovered')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Discovered host inventory' }).getByRole('listitem')).toHaveCount(3)
  await expect(page.getByText('AHV-01 · 4 physical NICs · 4 uplinks on br0 (vs0)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeEnabled()
  await page.getByRole('region', { name: 'Cluster discovery', exact: true }).screenshot({ path: 'test-results/uplink-discovery-passed.png' })
  await page.locator('#uplink-assignment-guidance').locator('..').screenshot({ path: 'test-results/uplink-continue-ready.png' })
  await page.getByRole('button', { name: 'Continue to uplink assignment' }).click()
  await expect(page.getByRole('heading', { name: 'Assign uplinks', exact: true })).toBeVisible()
  expect(posts).toEqual([base + '/discover'])
})

test('failed discovery reports HTTP error and permits read-only retry', async ({ page }) => {
  const posts = await setup(page, ['failed', 'success'])
  await fill(page)
  await page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'CVM SSH host-key verification failed. (HTTP 403)' })).toBeVisible()
  await expect(page.getByText('Discovery failed. Resolve the reported error and retry Discover cluster (read-only).')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeDisabled()
  await page.getByRole('region', { name: 'Cluster discovery', exact: true }).screenshot({ path: 'test-results/uplink-discovery-failed.png' })
  await page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true }).click()
  await expect(page.getByText('Passed — TEST-CLUSTER · 3 hosts discovered')).toBeVisible()
  expect(posts).toEqual([base + '/discover', base + '/discover'])
})

test('failed refresh clears previous inventory and empty discovery never unlocks Continue', async ({ page }) => {
  await setup(page, ['success', 'failed', 'empty'])
  await fill(page)
  const discover = page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })
  await discover.click()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeEnabled()
  await discover.click()
  await expect(page.getByText('Failed — discovery did not complete.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Discovered host inventory' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeDisabled()
  await discover.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Discovery returned no hosts.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeDisabled()
})

test('destination and changed TLS settings explain each new blocker on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const posts = await setup(page)
  await fill(page)
  await page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeEnabled()
  await page.getByLabel('Switch name', { exact: true }).fill('')
  await expect(page.getByText('Enter a new switch name or select a discovered destination switch.')).toBeVisible()
  await page.getByLabel('Switch name', { exact: true }).fill('vs1')
  await page.getByLabel('Verify PE TLS certificate', { exact: true }).check()
  await expect(page.getByText('Discovery required again — connection or TLS settings changed.')).toBeVisible()
  await expect(page.getByText('Connection or TLS settings changed. Run Discover cluster (read-only) again before assigning uplinks.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue to uplink assignment' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(posts).toEqual([base + '/discover'])
})
