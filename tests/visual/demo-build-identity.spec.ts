import { expect, test } from '@playwright/test'
import { APP_VERSION } from '../../src/version'

test('static demo About and appliance screens agree on the candidate identity', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the isolated built static demo')
  const backendRequests: string[] = []
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || /^\/api(?:\/|$)/.test(url.pathname)) {
      if (/^\/api(?:\/|$)/.test(url.pathname)) backendRequests.push(url.href)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto('settings')
  await expect(page.getByText('Demo mode: simulated data only. No Nutanix environment is connected and no workflows are executed.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'About', exact: true }).click()
  await expect(page.getByText(`v${APP_VERSION} / demo-build`, { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText('v1.8.4 / demo-build')
  await page.goto('appliance')
  await page.getByRole('button', { name: 'First Boot', exact: true }).click()
  await expect(page.getByText(APP_VERSION, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Updates', exact: true }).click()
  await expect(page.getByText(APP_VERSION, { exact: true })).toBeVisible()
  expect(backendRequests).toEqual([])
})
