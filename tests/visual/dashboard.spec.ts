import { expect, test, type Page } from '@playwright/test'

const username = process.env.ZTF_VISUAL_USERNAME || ''
const password = process.env.ZTF_VISUAL_PASSWORD || ''

async function seedUiSession(page: Page) {
  await page.route('**/api/**', async route => {
    const url = route.request().url()
    if (url.endsWith('/api/system/check')) {
      await route.fulfill({ json: { checks: [], ztfInstalled: true } })
      return
    }
    if (url.endsWith('/api/visibility/summary')) {
      await route.fulfill({ json: {
        operations: { queued: 0, running: 0, failed: 0, longRunning: 0, totalJobs: 0 },
        governance: { pendingApprovals: 0, driftedChecks: 0, unknownBaselines: 0, latestDriftStatus: 'matched' },
        schedules: { enabled: 0, total: 0, nextRun: null, lastFailed: null },
        storage: { backend: 'file', databaseConfigured: false, databaseLocation: '', lastBackup: null, backupWarning: 'PostgreSQL not active' },
        deployment: { ztfInstalled: true, nkpInstalled: false, nkpProfiles: 0, generatedNkpConfigs: 0, nkpBinaries: 0, availableNkpBinaries: 0, defaultNkpBinary: null },
        evidence: { total: 0, latestStatus: 'none', latestAt: null, latestProfile: null, ready: 0, blocked: 0, needsReview: 0 },
      } })
      return
    }
    if (url.endsWith('/api/appliance/artifacts')) {
      await route.fulfill({ json: { artifacts: [], summary: { total: 0, verified: 0, archived: 0, expiring: 0, expired: 0, pending: 0 } } })
      return
    }
    if (url.endsWith('/api/appliance/status')) {
      await route.fulfill({ json: { detected: false, checks: [], containerPaths: {} } })
      return
    }
    if (url.endsWith('/api/ztf/compatibility')) {
      await route.fulfill({ json: { installed: true, compatible: true, layout: 'legacy-1.x', entrypoint: 'main.py', requiredRef: 'v1.5.2', message: 'Legacy ZTF 1.x workflow/script CLI detected', supportedModes: [] } })
      return
    }
    if (url.endsWith('/api/nkp/profiles')) {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.route('**/health', async route => {
    await route.fulfill({ json: { status: 'ok', storage: 'file' } })
  })
  await page.addInitScript(() => {
    window.sessionStorage.setItem('ztf-ui-store', JSON.stringify({
      state: {
        sessionToken: 'visual-smoke-token',
        user: { username: 'visual-smoke', role: 'admin' },
        sidebarOpen: true,
        settings: {
          ztfPath: '',
          nkpPath: '',
          pythonPath: 'python3',
          configDir: '',
          repoUrl: 'https://github.com/nutanixdev/zerotouch-framework.git',
          nkpRepoUrl: 'https://github.com/VirtuArchitect/nkp-zerotouch-framework.git',
          webhookUrl: '',
          activeProfileId: 'default',
          connectionProfiles: [],
        },
      },
      version: 0,
    }))
  })
}

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /ZeroTouch Enterprise Orchestrator/i })).toBeVisible()
  await expect(page.getByLabel('Username')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('dashboard supports theme toggle and appliance navigation', async ({ page }) => {
  if (username && password) {
    await page.goto('/login')
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
  } else {
    await seedUiSession(page)
    await page.goto('/')
  }

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

  const themeButton = page.getByRole('button', { name: /Theme:/ })
  await expect(themeButton).toBeVisible()
  await themeButton.click()
  await expect(page.locator('html')).toHaveClass(/theme-dark/)
  await themeButton.click()
  await expect(page.locator('html')).toHaveClass(/theme-light/)

  await page.getByRole('link', { name: /Appliance Ops/i }).click()
  await expect(page.getByRole('heading', { name: 'Appliance Operations' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Artifacts/i })).toBeVisible()
})

test('workflow cards stay readable in light theme', async ({ page }) => {
  await seedUiSession(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.goto('/workflows')

  await expect(page.locator('html')).toHaveClass(/theme-light/)
  await expect(page.getByRole('heading', { name: 'Cluster Create' })).toBeVisible()
  await expect(page.getByText('Creates clusters using Foundation Central with full node imaging')).toBeVisible()

  const infrastructureBadge = page.getByRole('link', { name: /Cluster Create/ }).locator('.badge')
  await expect(infrastructureBadge).toBeVisible()
  await expect(infrastructureBadge).toHaveCSS('color', 'rgb(29, 78, 216)')
  await expect(infrastructureBadge).toHaveCSS('background-color', 'rgb(219, 234, 254)')
})
