import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`video guide opens Overview 00 and seeks chapters at ${width}px`, async ({ page }) => {
    test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('tutorials/')
    await expect(page.locator('#parts button')).toHaveCount(15)
    await expect(page.locator('#parts button').first()).toHaveText('00. ZTF-Orchestrator Overview')
    await expect(page.locator('#title')).toContainText('ZTF-Orchestrator Overview')
    await expect.poll(() => page.locator('video').evaluate(video => video.videoWidth)).toBe(1920)
    await expect(page.locator('#chapters button')).toHaveCount(6)
    await page.locator('#chapters button').last().click()
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(180)
    await page.locator('video').evaluate(video => video.pause())
    await expect(page.getByRole('link', { name: 'Transcript', exact: true })).toHaveAttribute('href', /media\/.*Part-00.*-transcript\.txt$/)
    await page.locator('#parts button').last().click()
    await expect(page.locator('#title')).toContainText('Part 14')
    await expect(page.locator('#chapters button')).toHaveCount(5)
    await expect(page.locator('body')).toContainText('simulated console examples')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.locator('#parts button').first().click()
    await page.screenshot({ path: `test-results/user-guide-videos-${width}.png`, fullPage: true })
  })
}
