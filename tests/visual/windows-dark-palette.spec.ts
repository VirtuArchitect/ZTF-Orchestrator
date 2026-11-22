import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page, theme: string) {
  const submitted: string[] = []
  await page.addInitScript(theme => {
    sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only',
      user: { username: 'fixture-admin', role: 'admin' }, sidebarOpen: false, sidebarPreferenceInitialized: true }, version: 0 }))
    if (!localStorage.getItem('ztf-theme-mode')) localStorage.setItem('ztf-theme-mode', theme)
  }, theme)
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET' && path !== '/api/auth/activity') submitted.push(path)
    if (path.endsWith('/credentials')) return route.fulfill({ json: { references: [
      { reference: 'pe_ref', username: 'admin' }, { reference: 'cvm_ref', username: 'nutanix' },
    ] } })
    if (path === '/api/operations') return route.fulfill({ json: { clusters: [] } })
    if (path === '/api/approvals') return route.fulfill({ json: [] })
    return route.fulfill({ json: { applyEnabled: true } })
  })
  await page.goto('/configure/ahv-uplink-migration')
  return submitted
}

for (const width of [390, 1440]) {
  for (const theme of ['dark', 'light']) {
    test(`${theme} palette at ${width}px keeps saved credential controls readable`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      const submitted = await setup(page, theme)
      await expect(page.locator('html')).toHaveClass(new RegExp('theme-' + theme))
      await expect(page.locator('body')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(248, 250, 252)')
      await expect(page.locator('section.card').first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(40, 40, 40)' : 'rgb(255, 255, 255)')
      const pe = page.getByLabel('PE credential reference', { exact: true })
      await pe.selectOption('pe_ref')
      await page.getByLabel('CVM credential reference', { exact: true }).selectOption('cvm_ref')
      await expect(pe).toHaveCSS('background-color', theme === 'dark' ? 'rgb(28, 28, 28)' : 'rgb(241, 245, 249)')
      const colors = await pe.evaluate(element => ({ text: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
      const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0)
      const values = [luminance(colors.text), luminance(colors.background)].sort((a, b) => a - b)
      expect((values[1] + .05) / (values[0] + .05)).toBeGreaterThanOrEqual(4.5)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByRole('button', { name: 'Discover cluster (read-only)', exact: true })).toBeDisabled()
      expect(submitted).toEqual([])
      await page.getByRole('heading', { name: 'AHV Uplink Migration', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `test-results/windows-palette-${theme}-${width}.png` })
    })
  }
}

test('theme switch and system preference preserve choices without submitting workflows', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const submitted = await setup(page, 'system')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(32, 32, 32)')
  await page.getByRole('button', { name: /^Theme: system/ }).click()
  await page.getByRole('button', { name: /^Theme: dark/ }).click()
  await expect(page.locator('html')).toHaveClass(/theme-light/)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Theme: light/ })).toBeVisible()
  await page.getByRole('button', { name: /^Theme: light/ }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveClass(/theme-light/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/theme-dark/)
  expect(submitted).toEqual([])
})
