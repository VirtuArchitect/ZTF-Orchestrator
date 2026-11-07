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
    await expect.poll(() => page.locator('video').evaluate(video => video.currentTime)).toBeGreaterThan(206)
    await page.locator('video').evaluate(video => video.pause())
    await expect(page.getByRole('link', { name: 'Transcript', exact: true })).toHaveAttribute('href', /media\/.*Part-00.*-transcript\.txt$/)
    await page.locator('#parts button').nth(11).click()
    await expect(page.locator('#title')).toContainText('Part 11')
    await expect(page.locator('#chapters')).toContainText(/session/i)
    await expect(page.getByRole('link', { name: 'Captions (VTT)', exact: true })).toHaveAttribute('href', /media\/.*Part-11.*\.vtt$/)
    await expect(page.getByRole('link', { name: 'Chapter list', exact: true })).toHaveAttribute('href', /media\/.*Part-11.*-chapters\.txt$/)
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

test('mobile transcript Back restores the selected part and timestamp without playing', async ({ page }) => {
  test.skip(process.env.ZTF_TEST_STATIC_DEMO !== '1', 'Requires the assembled Pages demo')
  await page.setViewportSize({ width: 390, height: 720 })
  await page.goto('tutorials/')
  const player = page.locator('video')
  await expect(player).toHaveAttribute('playsinline', '')
  const selected = page.getByRole('button', { name: /^11\. Administration/ })
  const fullyVisible = () => player.evaluate(video => {
    const { top, bottom } = video.getBoundingClientRect()
    return top >= 0 && bottom <= window.innerHeight
  })

  await selected.click()
  await expect(page).toHaveURL(/\?part=11$/)
  await expect(selected).toHaveAttribute('aria-current', 'true')
  await expect.poll(fullyVisible).toBe(true)
  await expect(player).toBeFocused()
  await expect.poll(() => player.evaluate(video => video.videoWidth)).toBe(1920)

  await page.getByRole('button', { name: /Manage users and administrator sessions/ }).click()
  await expect.poll(fullyVisible).toBe(true)
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBeGreaterThanOrEqual(25)
  await expect.poll(() => player.evaluate(video => video.paused)).toBe(false)
  const beforeTranscript = await player.evaluate(video => video.currentTime)
  await page.getByRole('link', { name: 'Transcript', exact: true }).click()
  await expect(page).toHaveURL(/Part-11.*-transcript\.txt$/)
  await page.goBack()
  await expect(page).toHaveURL(/\?part=11$/)
  await expect(page.locator('#title')).toContainText('Part 11')
  await expect(selected).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => player.evaluate(video =>
    video.readyState >= 2 && !video.seeking && video.paused ? video.currentTime : -1
  )).toBeGreaterThanOrEqual(beforeTranscript - 0.1)
  expect(await player.evaluate(video => video.currentTime)).toBeLessThan(beforeTranscript + 2)
  await page.reload()
  await expect(page.locator('#title')).toContainText('Part 11')
  await expect.poll(() => player.evaluate(video => video.currentTime)).toBe(0)

  await page.goto('tutorials/?part=99')
  await expect(page.locator('#title')).toContainText('Part 00')
})
