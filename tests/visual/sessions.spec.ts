import { expect, test, type Page } from '@playwright/test'

const rows = Array.from({ length: 5 }, (_, i) => ({
  id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
  username: i < 2 ? 'example-admin' : i < 4 ? 'example-operator' : 'example-viewer',
  role: i < 2 ? 'admin' : i < 4 ? 'operator' : 'viewer',
  signedInAt: '2026-11-02T09:00:00Z', expiresAt: '2026-11-02T17:00:00Z',
  lastActivityAt: i === 4 ? null : '2026-11-02T09:20:00Z',
  isCurrent: i === 0, recentlyActive: i === 0 || i === 2,
}))

async function setup(page: Page, role = 'admin', unavailable = false) {
  const activity: string[] = [], revoked: string[] = [], reads: string[] = []
  let sessions = [...rows]
  await page.addInitScript(role => {
    if (!sessionStorage.getItem('session-fixture-initialized')) {
      sessionStorage.setItem('session-fixture-initialized', 'yes')
      sessionStorage.setItem('ztf-ui-store', JSON.stringify({ state: { sessionToken: 'fixture-only', user: { username: 'example-admin', role }, sidebarOpen: false, sidebarPreferenceInitialized: true, settings: {} }, version: 0 }))
    }
    localStorage.setItem('ztf-theme-mode', 'light')
  }, role)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method()
    if (path === '/api/auth/activity') { activity.push(path); return route.fulfill({ json: { success: true } }) }
    if (path === '/api/auth/sessions') {
      reads.push(path)
      if (unavailable) return route.fulfill({ status: 503, json: { error: 'unavailable' } })
      return route.fulfill({ json: { sessions, observedAt: '2026-11-02T09:30:00Z', recentActivityWindowSeconds: 300, summary: { uniqueUsers: new Set(sessions.map(s => s.username)).size, totalSessions: sessions.length, recentlyActiveUsers: 2, recentlyActiveSessions: 2 } } })
    }
    if (path.startsWith('/api/auth/sessions/') && method === 'DELETE') {
      revoked.push(path)
      const id = path.split('/').pop()
      const currentSession = sessions.find(s => s.id === id)?.isCurrent
      sessions = sessions.filter(s => s.id !== id)
      return route.fulfill({ json: { success: true, currentSession } })
    }
    if (path === '/api/system/check') return route.fulfill({ json: { checks: [], ztfInstalled: true } })
    return route.fulfill({ json: [] })
  })
  return { activity, revoked, reads }
}

test('admin session counts, metadata, confirmation and individual revocation', async ({ page }) => {
  const fixture = await setup(page)
  await page.goto('/users')
  const panel = page.getByTestId('sessions-panel')
  await expect(panel.getByText('Signed-in users', { exact: true }).locator('..')).toContainText('3')
  await expect(panel.getByText('Total sessions', { exact: true }).locator('..')).toContainText('5')
  await expect(panel.getByText('Recently active users', { exact: true }).locator('..')).toContainText('2')
  await expect(panel.getByText('Not tracked', { exact: true })).toHaveCount(2)
  await expect(panel.getByText('This session', { exact: false })).toBeVisible()
  await panel.getByRole('button', { name: `Revoke session ${rows[1].id} for example-admin`, exact: true }).click()
  expect(fixture.revoked).toEqual([])
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm revocation', exact: true }).click()
  await expect(panel.getByText('Total sessions', { exact: true }).locator('..')).toContainText('4')
  expect(fixture.revoked).toEqual([`/api/auth/sessions/${rows[1].id}`])
  await expect(panel.getByRole('button', { name: `Revoke session ${rows[0].id} for example-admin`, exact: true })).toBeVisible()
})

test('revoking the current session signs out the current browser', async ({ page }) => {
  await setup(page)
  await page.goto('/users')
  await page.getByRole('button', { name: `Revoke session ${rows[0].id} for example-admin`, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke and sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
})

for (const role of ['viewer', 'operator']) test(`${role} cannot see or fetch administrator session data`, async ({ page }) => {
  const fixture = await setup(page, role)
  await page.goto('/users')
  await expect(page.getByRole('heading', { name: 'Permission Required', exact: true })).toBeVisible()
  await expect(page.getByTestId('sessions-panel')).toHaveCount(0)
  expect(fixture.reads).toEqual([])
})

test('unavailable session data is not presented as zero active users', async ({ page }) => {
  await setup(page, 'admin', true)
  await page.goto('/users')
  const panel = page.getByTestId('sessions-panel')
  await expect(panel.getByRole('alert')).toContainText('Session information is unavailable')
  await expect(panel.getByText('Total sessions', { exact: true }).locator('..')).toContainText('—')
  await expect(panel.locator('tbody tr')).toHaveCount(0)
})

test('idle clocks and session-list polling do not send activity reports', async ({ page }) => {
  await page.clock.install()
  const fixture = await setup(page)
  await page.goto('/users')
  await expect(page.getByTestId('sessions-panel').locator('tbody tr')).toHaveCount(5)
  await page.clock.fastForward(120_000)
  expect(fixture.activity).toEqual([])
  await page.getByRole('button', { name: 'Refresh sessions', exact: true }).click()
  await expect.poll(() => fixture.activity.length).toBe(1)
  await page.clock.fastForward(120_000)
  expect(fixture.activity).toHaveLength(1)
})

test('sessions and confirmation fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/users')
  await expect(page.getByTestId('sessions-panel').locator('tbody tr')).toHaveCount(5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: `Revoke session ${rows[1].id} for example-admin`, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/sessions-mobile.png', fullPage: true })
})
