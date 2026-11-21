import { expect, test } from '@playwright/test'

test('MTU preflight carries the PE exception separately from PC trust and invalidates changed review', async ({ page }) => {
  let sent: Record<string, any> | null = null
  await page.addInitScript(() => sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: {
    sessionToken: 'fixture-only', user: { username: 'fixture-admin', role: 'admin' },
  }, version: 0 })))
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/virtual-switch-mtu/preflight') {
      sent = route.request().postDataJSON()
      return route.fulfill({ json: { content: 'exact-fixture-plan', changeRequired: true, plan: {
        clusterName: 'LAB-AHV', switch: { config: { mtu: 1500, extId: 'switch-1' } }, targetMtu: 9000, hosts: [],
      } } })
    }
    return route.fulfill({ json: { applyEnabled: false } })
  })
  await page.goto('/scripts/change-virtual-switch-mtu')
  const checkbox = page.getByLabel('Verify PE TLS certificate (optional)', { exact: true })
  await expect(checkbox).not.toBeChecked()
  for (const [name, value] of Object.entries({
    'Prism Central HTTPS endpoint': 'https://pc.example.com:9440', 'PC credential reference': 'pc_ref',
    'Prism Element HTTPS endpoint': 'https://pe.example.com:9440', 'PE credential reference': 'pe_ref',
    'Cluster UUID': '12345678-0000-4000-8000-000000000001',
  })) await page.getByLabel(name, { exact: true }).fill(value)
  await page.getByLabel(/I verified fabric MTU/).check()
  await page.getByRole('button', { name: 'Run read-only preflight' }).click()
  await expect(page.getByText('LAB-AHV · vs0 (br0)')).toBeVisible()
  expect(sent).toMatchObject({ connection: { pe_verify_tls: false,
    pe_tls_bypass_reason: 'Initial cluster deployment or disaster recovery configuration', pc_endpoint: 'https://pc.example.com:9440' } })
  expect(sent!.connection).not.toHaveProperty('pc_verify_tls')
  await checkbox.check()
  await expect(page.getByText('LAB-AHV · vs0 (br0)')).toHaveCount(0)
})
