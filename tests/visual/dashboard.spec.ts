import { expect, test, type Page } from '@playwright/test'

const username = process.env.ZTF_VISUAL_USERNAME || ''
const password = process.env.ZTF_VISUAL_PASSWORD || ''

type VisualDriftRun = {
  id: string
  status: 'matched' | 'drifted' | 'unknown'
  configFile: string
  workflow?: string
  message?: string
  timestamp: string
  summary: { changed: number; missing: number; unexpected: number }
  findings: unknown[]
}

async function seedUiSession(page: Page, options: { driftRuns?: VisualDriftRun[], executeEvents?: unknown[], nativeDellMutationEnabled?: boolean } = {}) {
  await page.route('**/api/**', async route => {
    const url = route.request().url()
    if (url.endsWith('/api/execute') && options.executeEvents) {
      await route.fulfill({
        contentType: 'text/event-stream',
        body: options.executeEvents.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
      })
      return
    }
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
      await route.fulfill({ json: {
        detected: true,
        runtime: { status: 'healthy', version: '1.5.6', ztfCompatible: true, message: 'Legacy ZTF 1.x workflow/script CLI detected' },
        hostLayout: {
          status: 'not_visible',
          visible: 0,
          expected: 7,
          message: 'Runtime is available, but one or more host first-boot paths are not visible from this app process.',
        },
        checks: [
          { name: 'Source checkout', ok: false, status: 'not_visible', value: '/opt/ztf-orchestrator-source', message: 'Not visible from this app process' },
          { name: 'Install directory', ok: false, status: 'not_visible', value: '/opt/ztf-orchestrator', message: 'Not visible from this app process' },
        ],
        containerPaths: {
          nkpBundles: '/var/lib/ztf-orchestrator/bundles',
          nkpFramework: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework',
          ztfFramework: '/opt/zerotouch-framework',
        },
      } })
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
    if (url.endsWith('/api/native-foundation/phases')) {
      await route.fulfill({ json: {
        currentExecutionMode: 'read_only',
        contractVersion: 'native-foundation-phase/v1.8.0-readonly',
        mutatingActionsEnabled: false,
        readOnly: true,
        supportedReadinessPhases: ['imaging_only', 'cluster_create'],
        summary: {
          phaseCount: 9,
          implementedPhaseCount: 9,
          mutatingEnabledPhaseCount: 0,
          currentBoundary: 'Planning, review, UAT evidence, and adapter hardening only; deployment mutation remains disabled.',
        },
        phases: [
          {
            id: 'architecture_boundary',
            name: 'Architecture Boundary',
            order: 0,
            status: 'implemented_foundation',
            readOnly: true,
            mutatingActionsEnabled: false,
            operatorOutcome: 'Defines ownership, safety boundaries, and artifact rules for native Foundation work.',
            evidenceRequired: [],
            nextGate: 'Intent model validation',
          },
          {
            id: 'production_hardening',
            name: 'Production Hardening',
            order: 8,
            status: 'implemented_read_only_hardening',
            readOnly: true,
            mutatingActionsEnabled: false,
            operatorOutcome: 'Builds adapter registry, allow-list, runtime admission, queue, job-state, restart/resume, backup/restore, and review packet controls.',
            evidenceRequired: [],
            nextGate: 'Future explicit mutating enablement change after controlled UAT',
          },
        ],
      } })
      return
    }
    if (url.endsWith('/api/native-foundation/provider-adapters')) {
      const mutationEnabled = options.nativeDellMutationEnabled === true
      await route.fulfill({ json: {
        adapterInterfaceVersion: mutationEnabled ? 'native-foundation-provider-adapter/v1.8.0-controlled-uat' : 'native-foundation-provider-adapter/v1.8.0-readonly',
        status: mutationEnabled ? 'ready' : 'blocked',
        readOnly: !mutationEnabled,
        mutatingActionsEnabled: mutationEnabled,
        providerAdapters: [
          {
            providerId: 'dell_idrac_redfish',
            status: mutationEnabled ? 'enabled_controlled_uat_mutating' : 'implemented_controlled_uat_read_only',
            readOnly: !mutationEnabled,
            mutatingActionsEnabled: mutationEnabled,
            readOnlyDiscovery: true,
            adapterFamily: 'redfish',
            vendor: 'Dell',
            serviceRoot: '/redfish/v1/',
            environmentControls: {
              liveDiscovery: 'ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY',
              mutatingUat: 'ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION',
            },
            controlledUatMutatingOperations: [],
          },
        ],
      } })
      return
    }
    if (url.endsWith('/api/nkp/profiles')) {
      await route.fulfill({ json: [] })
      return
    }
    if (url.endsWith('/api/drift')) {
      await route.fulfill({ json: options.driftRuns ?? [] })
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
  await expect(page.getByLabel('ZeroTouch Enterprise Orchestrator')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible()
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

test('sidebar brand links back to dashboard overview', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/workflows')

  await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible()
  await page.getByRole('link', { name: 'Dashboard Overview' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('dashboard drift attention message stays readable in light theme', async ({ page }) => {
  await seedUiSession(page, {
    driftRuns: [{
      id: 'visual-drift-unknown',
      status: 'unknown',
      configFile: 'cluster-baseline.yml',
      workflow: 'config-cluster',
      message: 'No successful baseline was found for comparison',
      timestamp: new Date('2026-08-13T08:30:00Z').toISOString(),
      summary: { changed: 0, missing: 0, unexpected: 0 },
      findings: [],
    }],
  })
  await page.addInitScript(() => {
    window.localStorage.setItem('ztf-theme-mode', 'light')
  })

  await page.goto('/')

  const driftBanner = page.getByLabel('Review latest drift detection result')
  await expect(driftBanner).toBeVisible()
  await expect(driftBanner).toContainText('Drift baseline unavailable')
  await expect(driftBanner).toContainText('cluster-baseline.yml')
  await expectLightThemeReadable(page)
})

test('workflow cards stay readable in light theme', async ({ page }) => {
  await seedUiSession(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('ztf-theme-mode', 'light')
  })
  await page.goto('/workflows')

  await expect(page.locator('html')).toHaveClass(/theme-light/)
  await expect(page.getByRole('heading', { name: 'Cluster Create', exact: true })).toBeVisible()
  await expect(page.getByText('Creates clusters using Foundation Central with full node imaging')).toBeVisible()

  const clusterCreateCard = page.getByRole('link').filter({
    has: page.getByRole('heading', { name: 'Cluster Create', exact: true }),
  })
  const infrastructureBadge = clusterCreateCard.locator('.badge')
  await expect(infrastructureBadge).toBeVisible()
  await expect(infrastructureBadge).toHaveCSS('color', 'rgb(29, 78, 216)')
  await expect(infrastructureBadge).toHaveCSS('background-color', 'rgb(219, 234, 254)')
})

test('workflow detail imports config into YAML preview', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/workflows/cluster-create')

  await expect(page.getByRole('heading', { name: 'Cluster Create', level: 2 })).toBeVisible()

  const config = [
    'pc_credential: foundation_central',
    'cvm_credential: cvm_credential',
    'pc_ip: 192.0.2.122',
    'common_network_settings:',
    '  dns_servers:',
    '    - 8.8.8.8',
    '  ntp_servers:',
    '    - 0.us.pool.ntp.org',
    'create_clusters:',
    '  - cluster_name: imported-cluster',
    '    cluster_vip: 192.0.2.200',
    '    redundancy_factor: 2',
    '    timezone: UTC',
    '    nodes_list:',
    '      - node_serial: NODE-001',
    '        cvm_ip: 192.0.2.211',
    '        host_ip: 192.0.2.212',
    '',
  ].join('\n')

  await page.locator('input[type="file"]').setInputFiles({
    name: 'create_cluster.yml',
    mimeType: 'text/yaml',
    buffer: Buffer.from(config),
  })

  await expect(page.getByText('Imported create_cluster.yml for Cluster Create.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'YAML Preview' })).toHaveClass(/bg-nutanix-blue/)
  await expect(page.getByText('imported-cluster')).toBeVisible()
  await expect(page.getByRole('button', { name: /Dry Run/i })).toBeEnabled()

  await page.getByRole('button', { name: 'Configure' }).click()
  await expect(page.locator('input[placeholder="10.0.0.100"]')).toHaveValue('192.0.2.122')
  await expect(page.locator('input[placeholder="my-cluster-01"]')).toHaveValue('imported-cluster')
  await expect(page.locator('input[placeholder="10.0.0.10"]')).toHaveValue('192.0.2.200')
  await expect(page.locator('input[placeholder="2Z3P..."]')).toHaveValue('NODE-001')
  await expect(page.locator('input[placeholder="10.0.0.11"]')).toHaveValue('192.0.2.211')
  await expect(page.locator('input[placeholder="10.0.0.12"]')).toHaveValue('192.0.2.212')
})

test('native Foundation detail separates phase status from Dell adapter status', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/workflows/native-foundation-deploy')

  await expect(page.getByRole('heading', { name: 'Native Foundation Deploy', level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Native Foundation Phase Status' })).toBeVisible()
  await expect(page.getByText('Done')).toBeVisible()
  await expect(page.getByText('Total')).toBeVisible()
  await expect(page.getByText('Live')).toBeVisible()

  await expect(page.getByText('Provider Adapter Status')).toBeVisible()
  await expect(page.getByText('Dell iDRAC Redfish')).toBeVisible()
  await expect(page.getByText('implemented controlled uat read only')).toBeVisible()
  await expect(page.getByText('discovery gated')).toBeVisible()
  await expect(page.getByText('mutation locked')).toBeVisible()
  await expect(page.getByText('Probe', { exact: true })).toBeVisible()
  await expect(page.getByText('Deploy', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run UAT Deploy' })).toBeDisabled()
})

test('native Foundation detail enables Dell UAT deploy when adapter mutation is enabled', async ({ page }) => {
  await seedUiSession(page, { nativeDellMutationEnabled: true })
  await page.goto('/workflows/native-foundation-deploy')

  await expect(page.getByRole('heading', { name: 'Native Foundation Deploy', level: 2 })).toBeVisible()
  const config = [
    'ztf_orchestrator:',
    '  workflow_family: native_foundation',
    'foundation_engine:',
    '  mode: controlled_uat',
    'sites:',
    '  - site_name: site-a',
    '    hardware_provider: dell_idrac_redfish',
    '    clusters: []',
    '',
  ].join('\n')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'native-foundation-deploy.yml',
    mimeType: 'text/yaml',
    buffer: Buffer.from(config),
  })

  await expect(page.getByText('Dell iDRAC Redfish')).toBeVisible()
  await expect(page.getByText('enabled controlled uat mutating')).toBeVisible()
  await expect(page.getByText('mutation enabled')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run UAT Deploy' })).toBeEnabled()
})

test('standalone FCA cluster workflow emits standalone config keys', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/workflows/cluster-create-standalone-fca')

  await expect(page.getByRole('heading', { name: 'Cluster Create (Standalone FCA)', level: 2 })).toBeVisible()
  await expect(page.getByText('--workflow cluster-create-standalone-fca -f create_fca_cluster.yml')).toBeVisible()

  const target = page.locator('select.input').first()
  await expect(target).toHaveValue('standalone_fca')
  await expect(target).toBeDisabled()

  await page.locator('input[placeholder="10.0.0.100"]').fill('192.0.2.122')
  await page.locator('input[placeholder="optional provider extId"]').fill('provider-1')
  await page.locator('input[placeholder="optional connection extId"]').fill('connection-1')
  await page.locator('input[placeholder="optional image extId"]').nth(0).fill('aos-image')
  await page.locator('input[placeholder="optional image extId"]').nth(1).fill('ahv-image')
  await page.locator('input[placeholder="10.0.0.1"]').fill('192.0.2.1')
  await page.locator('input[placeholder="255.255.255.0"]').fill('255.255.255.0')
  await page.getByRole('button', { name: 'YAML Preview' }).click()

  await expect(page.getByText('create_fca_cluster.yml', { exact: true })).toBeVisible()
  await expect(page.getByText('fca_ip: 192.0.2.122')).toBeVisible()
  await expect(page.getByText('fca_credential: foundation_central')).toBeVisible()
  await expect(page.getByText('hardware_provider_ext_id: provider-1')).toBeVisible()
  await expect(page.getByText('connection_ext_id: connection-1')).toBeVisible()
  await expect(page.getByText('aos_image_ext_id: aos-image')).toBeVisible()
  await expect(page.getByText('hypervisor_image_ext_id: ahv-image')).toBeVisible()
  await expect(page.getByText('cvm_gateway: 192.0.2.1')).toBeVisible()
  await expect(page.getByText('cvm_netmask: 255.255.255.0')).toBeVisible()
})

test('remaining standalone FCA workflows emit standalone config keys', async ({ page }) => {
  await seedUiSession(page)

  for (const workflow of [
    { path: '/workflows/imaging-only-standalone-fca', title: 'Imaging Only (Standalone FCA)', file: 'imaging_only_fca.yml' },
    { path: '/workflows/imaging-standalone-fca', title: 'Pod Imaging (Standalone FCA)', file: 'pod-deploy-fca.yml' },
    { path: '/workflows/site-deploy-standalone-fca', title: 'Site Deploy (Standalone FCA)', file: 'sites-deploy-fca.yml' },
  ]) {
    await page.goto(workflow.path)
    await expect(page.getByRole('heading', { name: workflow.title, level: 2 })).toBeVisible()
    await expect(page.getByText(`-f ${workflow.file}`)).toBeVisible()
    await page.getByRole('button', { name: 'Configure' }).click()

    await page.locator('input[placeholder="10.0.0.100"], input[placeholder="10.0.0.50"]').fill('192.0.2.122')
    await page.locator('input[placeholder="optional provider extId"]').fill('provider-1')
    await page.locator('input[placeholder="optional connection extId"]').fill('connection-1')
    await page.locator('input[placeholder="optional image extId"]').nth(0).fill('aos-image')
    await page.locator('input[placeholder="optional image extId"]').nth(1).fill('ahv-image')
    if (workflow.path === '/workflows/site-deploy-standalone-fca') {
      await expect(page.getByText('IPMI IP')).toBeVisible()
      await expect(page.getByText('CVM RAM (GB)')).toBeVisible()
      const ipmiInput = page.locator('input[placeholder="10.0.0.13"]').last()
      await ipmiInput.fill('192.0.2.213')
      await expect(ipmiInput).toHaveValue('192.0.2.213')
    }
    await page.getByRole('button', { name: 'YAML Preview' }).click()

    await expect(page.getByText(workflow.file, { exact: true })).toBeVisible()
    await expect(page.getByText('foundation_central_target: standalone_fca')).toBeVisible()
    await expect(page.getByText('executor: orchestrator_lifecycle_v4')).toBeVisible()
    await expect(page.getByText('fca_ip: 192.0.2.122')).toBeVisible()
    await expect(page.getByText('hardware_provider_ext_id: provider-1')).toBeVisible()
    await expect(page.getByText('connection_ext_id: connection-1')).toBeVisible()
    await expect(page.getByText('aos_image_ext_id: aos-image')).toBeVisible()
    await expect(page.getByText('hypervisor_image_ext_id: ahv-image')).toBeVisible()
    if (workflow.path === '/workflows/site-deploy-standalone-fca') {
      await expect(page.getByText('ipmi_ip: 192.0.2.213')).toBeVisible()
      await expect(page.getByText('cvm_ram_gb: 12')).toBeVisible()
    }
  }
})

test('script wizard emits PE cluster name using ZTF runtime key', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/scripts')

  await page.getByPlaceholder('Search scripts...').fill('Update Pulse')
  await page.getByRole('button', { name: /Update Pulse \(PE\)/ }).click()
  await page.getByRole('button', { name: /Load Example/i }).click()
  await page.getByRole('button', { name: /Generate YAML/i }).click()

  const generatedYaml = await page.locator('textarea').last().inputValue()
  expect(generatedYaml).toContain('name:')
  expect(generatedYaml).not.toContain('cluster_name:')
})

test('script wizard emits schema-valid PE role mapping YAML', async ({ page }) => {
  await seedUiSession(page)
  await page.goto('/scripts')

  await page.getByPlaceholder('Search scripts...').fill('Create Role Mapping')
  await page.getByRole('button', { name: /Create Role Mapping \(PE\)/ }).click()
  await page.getByRole('button', { name: /Load Example/i }).click()
  await page.getByRole('button', { name: /Generate YAML/i }).click()

  const generatedYaml = await page.locator('textarea').last().inputValue()
  expect(generatedYaml).toContain('name:')
  expect(generatedYaml).toContain('directory_services:')
  expect(generatedYaml).toContain('directory_type: ACTIVE_DIRECTORY')
  expect(generatedYaml).toContain('ad_domain:')
  expect(generatedYaml).toContain('ad_directory_url:')
  expect(generatedYaml).toContain('service_account_credential:')
  expect(generatedYaml).toContain('role_mappings:')
  expect(generatedYaml).not.toContain('cluster_name:')
})

test('script execution opens a large modal terminal', async ({ page }) => {
  await seedUiSession(page, {
    executeEvents: [
      { type: 'start', data: 'python main.py --script AddLocalUsers' },
      { type: 'job', data: { progress: { phase: 'Running script queue', percent: 45, detail: 'Streaming script output', estimated: true } } },
      { type: 'log', data: 'visible script output line\n' },
      { type: 'done', data: { status: 'success', duration: 1 } },
    ],
  })
  await page.goto('/scripts')

  await page.getByPlaceholder('Search scripts...').fill('Add Local Users')
  await page.getByRole('button', { name: /Add Local Users \(PC\)/ }).click()
  await page.getByRole('button', { name: /Run Add Local Users \(PC\)/ }).click()

  const dialog = page.locator('.fixed.inset-0')
  await expect(dialog.getByRole('heading', { name: /Script Run: Add Local Users \(PC\)|Running: Add Local Users \(PC\)/ })).toBeVisible()
  await expect(dialog.getByText('python main.py --script AddLocalUsers').first()).toBeVisible()
  await expect(dialog.getByText('visible script output line')).toBeVisible()

  const terminalBody = dialog.locator('.font-mono.text-xs').last()
  const box = await terminalBody.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThan(380)
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
    '/workflows/cluster-create-standalone-fca',
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
