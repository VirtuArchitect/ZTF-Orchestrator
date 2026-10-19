import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 1600, height: 1050 }, { width: 390, height: 844 }]) {
  test(`release document index is standalone and usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto('releases/')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Release Documents | ZTF-Orchestrator')
    await expect(page.getByRole('heading', { name: 'Release Documents', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'v1.8.5-rc1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'v1.8.4', exact: true })).toBeVisible()
    const pinned = page.locator('a[href*="/blob/ba57890fae90a0bc5938140afc32753dfe871656/"]')
    await expect(pinned).toHaveCount(18)
    expect(await page.locator('script, form, iframe').count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await page.locator('.brand img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.getByRole('link', { name: 'v1.5.6 installation checklist' }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('link', { name: 'v1.5.6 installation checklist' })).toBeVisible()
    expect(errors).toEqual([])
    await page.screenshot({ path: `test-results/release-documents-${viewport.width}.png`, fullPage: true })
  })
}
