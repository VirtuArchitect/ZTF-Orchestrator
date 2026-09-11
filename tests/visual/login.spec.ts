import { expect, test } from '@playwright/test'

test('login supports keyboard entry, visibility, pending and rejected requests', async ({ page }) => {
  let releaseRequest!: () => void
  const requestGate = new Promise<void>(resolve => { releaseRequest = resolve })
  await page.route('**/api/auth/login', async route => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ username: 'test-operator', password: 'test-password' })
    await requestGate
    await route.fulfill({ status: 401, json: { error: 'Invalid credentials' } })
  })
  await page.goto('/login')
  const username = page.getByLabel('Username', { exact: true })
  const password = page.getByLabel('Password', { exact: true })
  await expect(username).toBeFocused()
  await username.fill('test-operator')
  await page.keyboard.press('Tab')
  await expect(password).toBeFocused()
  await password.fill('test-password')
  await expect(password).toHaveAttribute('type', 'password')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Space')
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
  await password.press('Enter')
  await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  await expect(username).toBeDisabled()
  await expect(password).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Show password' })).toBeDisabled()
  releaseRequest()
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials')
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/\/login$/)
})

test('login handles network failure and a successful session redirect', async ({ page }) => {
  let attempt = 0
  await page.route('**/api/**', async route => {
    if (route.request().url().endsWith('/api/auth/login')) {
      if (++attempt === 1) return route.abort('failed')
      return route.fulfill({ json: { token: 'visual-test-token', user: { username: 'test-operator', role: 'viewer' } } })
    }
    if (route.request().url().endsWith('/api/system/check')) {
      return route.fulfill({ json: { checks: [], ztfInstalled: false } })
    }
    if (route.request().url().endsWith('/api/visibility/summary')) {
      return route.fulfill({ status: 503, json: { error: 'Unavailable in login fixture' } })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill('test-operator')
  await page.getByLabel('Password', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not reach the server')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
})

for (const width of [320, 390, 1536]) {
  test(`login fits ${width}px and preserves the dashboard theme`, async ({ page }) => {
    const browserErrors: string[] = []
    page.on('pageerror', error => browserErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
    await page.setViewportSize({ width, height: width === 1536 ? 1024 : 844 })
    await page.addInitScript(() => localStorage.setItem('ztf-theme-mode', 'dark'))
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.locator('.login-page')).toHaveCSS('background-color', 'rgb(248, 250, 252)')
    await expect(page.locator('html')).toHaveClass(/theme-dark/)
    await expect(page.getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', 'https://github.com/VirtuArchitect/ZTF-Orchestrator/tree/main/docs')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(() => page.locator('.login-brand img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await page.getByRole('heading', { name: 'Sign in' }).click()
    await page.screenshot({ path: `test-results/login-${width}.png`, fullPage: true })
    expect(browserErrors).toEqual([])
  })
}
