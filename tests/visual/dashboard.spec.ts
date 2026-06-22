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
    if (url.endsWith('/api/appliance/updates')) {
      await route.fulfill({ json: {
        current: { version: '1.4.1', containerImage: '', requestPath: '/var/lib/ztf-orchestrator/appliance_update_request.json' },
        updates: [],
        staged: null,
        allowedRepositories: ['virtuarchitect/ztf-orchestrator', 'nutanixdev/zerotouch-framework', 'virtuarchitect/nkp-zerotouch-framework'],
        targets: [
          { id: 'ztf-orchestrator', label: 'ZTF-Orchestrator', defaultRepo: 'VirtuArchitect/ZTF-Orchestrator', defaultPath: '' },
          { id: 'ztf-framework', label: 'ZeroTouch Framework', defaultRepo: 'nutanixdev/zerotouch-framework', defaultPath: '/opt/zerotouch-framework' },
          { id: 'nkp-framework', label: 'NKP Framework', defaultRepo: 'VirtuArchitect/nkp-zerotouch-framework', defaultPath: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework' },
        ],
      } })
      return
    }
    if (url.endsWith('/api/appliance/status')) {
      await route.fulfill({ json: { detected: false, checks: [], containerPaths: {} } })
      return
    }
    if (url.endsWith('/api/nkp/status')) {
      await route.fulfill({ json: {
        installed: true,
        path: '/opt/nkp-zerotouch-framework',
        repoUrl: 'https://github.com/VirtuArchitect/nkp-zerotouch-framework.git',
        script: '/opt/nkp-zerotouch-framework/scripts/zt.sh',
        safePhases: ['validate', 'prepare', 'generate'],
        configs: ['air-gapped.example.yaml', 'connected.example.yaml'],
      } })
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

async function expectLightThemeReadable(page: Page) {
  const violations = await page.evaluate(() => {
    type Rgb = [number, number, number]
    type Rgba = [number, number, number, number]

    const parseRgb = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()))
      if (parts.length < 3 || parts.some(Number.isNaN)) return null
      return [parts[0], parts[1], parts[2], parts.length >= 4 ? parts[3] : 1]
    }

    const luminance = ([r, g, b]: Rgb) => {
      const channel = [r, g, b].map(value => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2]
    }

    const contrast = (fg: Rgb, bg: Rgb) => {
      const foreground = luminance(fg)
      const background = luminance(bg)
      const lighter = Math.max(foreground, background)
      const darker = Math.min(foreground, background)
      return (lighter + 0.05) / (darker + 0.05)
    }

    const visible = (element: Element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.55 && rect.width > 0 && rect.height > 0
    }

    const blend = (foreground: Rgba, background: Rgb): Rgb => {
      const alpha = foreground[3]
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha),
      ]
    }

    const backgroundFor = (element: Element): Rgb => {
      const chain: Element[] = []
      let current: Element | null = element
      while (current) {
        chain.unshift(current)
        current = current.parentElement
      }
      let background: Rgb = [255, 255, 255]
      for (const node of chain) {
        const color = window.getComputedStyle(node).backgroundColor
        if (color === 'transparent') continue
        const parsed = parseRgb(color)
        if (!parsed || parsed[3] === 0) continue
        background = blend(parsed, background)
      }
      return background
    }

    const ownText = (element: Element) => Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim() ?? '')
      .join(' ')
      .trim()

    return Array.from(document.querySelectorAll('body *'))
      .filter(element => visible(element) && ownText(element).length > 0)
      .map(element => {
        const style = window.getComputedStyle(element)
        const foreground = parseRgb(style.color)
        if (!foreground) return null
        const ratio = contrast([foreground[0], foreground[1], foreground[2]], backgroundFor(element))
        const largeText = Number.parseFloat(style.fontSize) >= 18 || Number.parseInt(style.fontWeight, 10) >= 700
        const minimum = largeText ? 3 : 4.5
        if (ratio >= minimum) return null
        return {
          text: ownText(element).slice(0, 80),
          className: element.getAttribute('class') ?? '',
          color: style.color,
          background: window.getComputedStyle(element.parentElement ?? element).backgroundColor,
          ratio: Number(ratio.toFixed(2)),
          minimum,
        }
      })
      .filter(Boolean)
      .slice(0, 12)
  })

  expect(violations).toEqual([])
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
  await expect(page.getByRole('button', { name: /Updates/i })).toBeVisible()
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

test('main pages keep readable text contrast in light theme', async ({ page }) => {
  await seedUiSession(page)
  const pageErrors: string[] = []
  page.on('pageerror', error => {
    pageErrors.push(`${page.url()}: ${error.message}`)
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('ztf-theme-mode', 'light')
  })

  const routes = [
    '/',
    '/setup',
    '/global-config',
    '/workflows',
    '/workflows/cluster-create',
    '/scripts',
    '/configs',
    '/executions',
    '/jobs',
    '/pipelines',
    '/schedules',
    '/parallel',
    '/nkp',
    '/validation-evidence',
    '/appliance',
    '/approvals',
    '/drift',
    '/settings',
    '/users',
    '/audit-log',
  ]

  for (const route of routes) {
    await test.step(route, async () => {
      const previousErrorCount = pageErrors.length
      await page.goto(route)
      expect(pageErrors.slice(previousErrorCount)).toEqual([])
      await expect(page.locator('html')).toHaveClass(/theme-light/)
      await expect(page.locator('main')).toBeVisible()
      await expectLightThemeReadable(page)
    })
  }
})
