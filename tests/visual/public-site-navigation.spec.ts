import { expect, test } from '@playwright/test'
const labels = ['Home', 'Current status', 'Capabilities', 'Demo', 'Resources', 'Documentation', 'Video tutorials', 'Releases', 'GitHub']
for (const width of [390, 1669]) {
  test(`shared public navigation and Home work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const path of ['', 'documentation/', 'tutorials/', 'releases/', 'demo/', 'demo/workflows']) {
      if (path === 'demo/workflows') {
        await page.route('**/ZTF-Orchestrator/demo/workflows', async route => {
          const response = await page.request.get('demo/')
          await route.fulfill({ response })
        })
      }
      await page.goto(path || './')
      const header = page.locator('[data-public-navigation]')
      await expect(header).toBeVisible()
      const links = header.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')
      expect((await links.allTextContents()).map(text => text.replace('↗', '').trim())).toEqual(labels)
      const hrefs = await links.evaluateAll(anchors => anchors.map(a => (a as HTMLAnchorElement).href))
      const root = new URL('/ZTF-Orchestrator/', page.url())
      expect(hrefs).toEqual(['', '#status', '#capabilities', 'demo/', '#resources', 'documentation/', 'tutorials/', 'releases/', 'https://github.com/VirtuArchitect/ZTF-Orchestrator'].map(path => new URL(path, root).href))
      expect(await links.evaluateAll(anchors => anchors.every(a => a.getBoundingClientRect().height === 44))).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(header.locator('img')).toBeVisible()
      await header.getByRole('link', { name: 'Home', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'ZTF-Orchestrator', exact: true })).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/ZTF-Orchestrator/')
    }
    await page.goto('documentation/')
    await page.locator('[data-public-navigation]').getByRole('link', { name: 'Capabilities', exact: true }).click()
    await expect(page.locator('#capabilities')).toBeInViewport()
    expect(new URL(page.url()).hash).toBe('#capabilities')
    expect(errors).toEqual([])
    await page.goto('./')
    await page.screenshot({ path: `test-results/public-navigation-${width}.png`, fullPage: false })
  })
}
