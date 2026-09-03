import { useStore } from './store'

const DEMO_TOKEN = 'ztf-orchestrator-demo-token'
const now = new Date('2026-08-13T09:30:00Z')

export function isDemoMode() {
  return import.meta.env.VITE_ZTF_DEMO === 'true'
}

function iso(minutesAgo: number) {
  return new Date(now.getTime() - minutesAgo * 60_000).toISOString()
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

async function requestJson(request: Request) {
  try {
    return await request.clone().json()
  } catch {
    return {}
  }
}

const systemChecks = [
  { name: 'State Backend', ok: true, value: 'PostgreSQL - demo dataset' },
  { name: 'Drift Detection', ok: true, value: 'Matched - pc-baseline.yml / simulated' },
  { name: 'Python 3.9+', ok: true, value: 'Python 3.11.15' },
  { name: 'pip', ok: true, value: 'pip 26.1.2 from /opt/ztf-python/lib/python3.11/site-packages' },
  { name: 'git', ok: true, value: 'git version 2.47.3' },
  { name: 'ZTF Installed', ok: true, value: 'Legacy ZTF 1.x workflow/script CLI detected' },
  { name: 'ZTF 2.x Plan/Apply', ok: true, value: 'enabled for simulated plan jobs' },
  { name: 'NKP Framework', ok: true, value: 'found' },
  { name: 'Requirements File', ok: true, value: 'requirements/prod.txt' },
]

const executions = [
  {
    id: 'demo-run-003',
    workflow: 'deploy-pc',
    type: 'workflow',
    command: '/opt/ztf-python/bin/python main.py --workflow deploy-pc -f /var/lib/ztf-orchestrator/configs/pc-deploy-demo.yml',
    status: 'success',
    returnCode: 0,
    duration: 184000,
    timestamp: iso(42),
    configFile: 'pc-deploy-demo.yml',
    configPath: '/var/lib/ztf-orchestrator/configs/pc-deploy-demo.yml',
    stdout: '[INFO] Prism Central deployment task completed successfully',
    stderr: '',
  },
  {
    id: 'demo-run-002',
    workflow: 'config-cluster',
    type: 'workflow',
    command: '/opt/ztf-python/bin/python main.py --workflow config-cluster -f /var/lib/ztf-orchestrator/configs/cluster-baseline-demo.yml',
    status: 'failed',
    returnCode: 1,
    duration: 39000,
    timestamp: iso(118),
    configFile: 'cluster-baseline-demo.yml',
    configPath: '/var/lib/ztf-orchestrator/configs/cluster-baseline-demo.yml',
    stderr: '[ERROR] credential reference pe_user was not found in global.yml',
    diagnostics: {
      category: 'credential_error',
      likelyFix: 'Confirm the credential reference exists in Global Config and has the required role.',
      evidence: '[INFO] Calling action get_creds_from_vault',
    },
  },
  {
    id: 'demo-run-001',
    workflow: 'CreateContainerPe',
    type: 'script',
    command: '/opt/ztf-python/bin/python main.py --script CreateContainerPe -f /var/lib/ztf-orchestrator/configs/container-demo.yml',
    status: 'success',
    returnCode: 0,
    duration: 16000,
    timestamp: iso(240),
    configFile: 'container-demo.yml',
    configPath: '/var/lib/ztf-orchestrator/configs/container-demo.yml',
    stdout: '[INFO] Storage container ztf-demo-container created',
    stderr: '',
  },
]

const jobs = [
  {
    id: 'demo-job-ztf2-plan',
    status: 'success',
    workflow: 'ztf2:plan',
    type: 'ztf2',
    framework: 'ztf2',
    user: 'demo-admin',
    createdAt: iso(18),
    updatedAt: iso(16),
    startedAt: iso(18),
    finishedAt: iso(16),
    returnCode: 0,
    progress: { phase: 'Completed', percent: 100, detail: 'Simulated ZTF 2.x plan generated', estimated: false, updatedAt: iso(16) },
    logs: [
      { type: 'start', data: { command: 'ztf plan --input input.yml --global-file global.yml --state state.yml --out demo-plan.json' }, ts: iso(18) },
      { type: 'stdout', data: 'Plan: 1 to add, 0 to change, 0 to destroy', ts: iso(17) },
      { type: 'done', data: { status: 'success', code: 0 }, ts: iso(16) },
    ],
    trace: {
      framework: 'ztf2',
      runtimeMode: 'ztf2_iac',
      action: 'plan',
      planId: 'demo-plan-001',
      planPath: '/var/lib/ztf-orchestrator/ztf2-projects/default/plans/demo-plan-001-plan.json',
      inputFile: 'input.yml',
      globalFile: 'global.yml',
      stateFile: 'state.yml',
      inputSha256: 'demo-input-sha256',
      globalSha256: 'demo-global-sha256',
      statePath: '/var/lib/ztf-orchestrator/ztf2-projects/default/state.yml',
      ztfVersionRef: 'v2.0.0',
    },
  },
  {
    id: 'demo-job-running',
    status: 'running',
    workflow: 'deploy-management-pc',
    type: 'workflow',
    framework: 'ztf',
    user: 'demo-admin',
    createdAt: iso(12),
    updatedAt: iso(1),
    startedAt: iso(10),
    progress: { phase: 'deploy', percent: 62, detail: 'Waiting for Prism Central VM task completion', estimated: true, updatedAt: iso(1) },
    logs: [
      { type: 'start', data: 'Demo job started', ts: iso(10) },
      { type: 'stdout', data: '[INFO] Submitting Prism Central deployment task', ts: iso(9) },
    ],
    taskIds: ['demo-prism-task-00042'],
  },
  {
    id: 'demo-job-success',
    status: 'success',
    workflow: 'deploy-pc',
    type: 'workflow',
    framework: 'ztf',
    user: 'demo-admin',
    createdAt: iso(50),
    updatedAt: iso(42),
    startedAt: iso(49),
    finishedAt: iso(42),
    returnCode: 0,
    progress: { phase: 'complete', percent: 100, detail: 'Completed without error', estimated: false, updatedAt: iso(42) },
    logs: [{ type: 'done', data: 'Completed without error', ts: iso(42) }],
    taskIds: ['demo-prism-task-00021'],
  },
  {
    id: 'demo-job-failed',
    status: 'failed',
    workflow: 'config-cluster',
    type: 'workflow',
    framework: 'ztf',
    user: 'demo-operator',
    createdAt: iso(130),
    updatedAt: iso(118),
    startedAt: iso(125),
    finishedAt: iso(118),
    returnCode: 1,
    diagnostics: {
      command: '/opt/ztf-python/bin/python main.py --workflow config-cluster -f cluster-baseline-demo.yml',
      configFile: 'cluster-baseline-demo.yml',
      configPath: '/var/lib/ztf-orchestrator/configs/cluster-baseline-demo.yml',
      stderrTail: '[ERROR] credential reference pe_user was not found in global.yml',
      category: 'credential_error',
      likelyFix: 'Confirm the credential reference exists in Global Config and has the required role.',
    },
  },
]

const driftRuns = [
  {
    id: 'demo-drift-001',
    configFile: 'pc-baseline-demo.yml',
    workflow: 'config-pc',
    status: 'drifted',
    baseline: 'last_applied',
    observedLabel: 'Prism Central demo state',
    appliedExecutionId: 'demo-run-003',
    summary: { matched: 18, changed: 1, missing: 0, unexpected: 1, total: 20 },
    findings: [
      { path: 'clusters.DEV_LAB.ntp_servers_list[1]', status: 'changed', desired: '1.pool.ntp.org', observed: 'time.demo.local' },
      { path: 'clusters.DEV_LAB.categories.owner', status: 'unexpected', desired: null, observed: 'lab-team' },
    ],
    timestamp: iso(35),
    user: 'demo-admin',
    message: 'Simulated drift found in Prism Central baseline',
  },
]

const schedules = [
  {
    id: 'demo-schedule-001',
    name: 'Nightly drift check',
    workflow: 'config-pc',
    script: '',
    configFile: 'pc-baseline-demo.yml',
    configContent: 'clusters: {}',
    cronExpr: '0 22 * * 1-5',
    enabled: true,
    createdAt: iso(1440),
    nextRun: new Date(now.getTime() + 5 * 60 * 60_000).toISOString(),
    lastRun: iso(1380),
    lastStatus: 'success',
  },
]

const approvals = [
  {
    id: 'demo-approval-ztf2',
    workflow: 'ztf2:apply',
    configFile: 'input.yml',
    configContent: 'domains:\n  lab:\n    data: {}\n    resources: {}\n    outputs: {}\n',
    requestedBy: 'demo-operator',
    requestedAt: iso(15),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    notes: 'Simulated approval for the exact ZTF 2.x plan artifact.',
    pipelineId: null,
    jobId: null,
    metadata: {
      planId: 'demo-plan-001',
      inputSha256: 'demo-input-sha256',
      globalSha256: 'demo-global-sha256',
      statePath: '/var/lib/ztf-orchestrator/ztf2-projects/default/state.yml',
    },
  },
  {
    id: 'demo-approval-001',
    workflow: 'deploy-management-pc',
    configFile: 'pod-management-deploy-demo.yml',
    configContent: 'pc_deploy: demo',
    requestedBy: 'demo-operator',
    requestedAt: iso(20),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    notes: 'Simulated approval request for demo mode.',
    pipelineId: null,
    jobId: 'demo-job-running',
  },
]

const configs: Record<string, string> = {
  'pc-deploy-demo.yml': 'pc_deploy:\n  pc_name: pc-demo\n  cluster_ip: pe-demo.example.invalid\n  pe_credential: pe_user\n',
  'cluster-baseline-demo.yml': 'clusters:\n  pe-demo.example.invalid:\n    name: DEV_LAB\n    pe_credential: pe_user\n',
  'input.yml': 'domains:\n  lab:\n    data: {}\n    resources: {}\n    outputs: {}\n',
  'global.yml': 'vault_to_use: local\nip_allocation_method: static\nvaults:\n  local:\n    credentials:\n      pe_user:\n        username: admin\n        password: <demo-secret>\n',
}

function demoStoreSeed() {
  const state = useStore.getState()
  state.setAuth(DEMO_TOKEN, { username: 'demo-admin', role: 'admin' })
  state.setSystemChecks(systemChecks, true)
  state.setSettings({
    ztfPath: '/opt/zerotouch-framework',
    ztf1Enabled: true,
    ztf2Enabled: true,
    ztf2Path: '/opt/zerotouch-framework-2x',
    ztf2Command: 'ztf',
    ztf2ProjectDir: '/var/lib/ztf-orchestrator/ztf2-projects/default',
    nkpPath: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework',
    pythonPath: '/opt/ztf-python/bin/python',
    configDir: '/var/lib/ztf-orchestrator/configs',
    activeProfileId: 'demo-lab',
    connectionProfiles: [{
      id: 'demo-lab',
      name: 'DEV_LAB Demo',
      description: 'Simulated connection defaults for the public static demo',
      environment: 'lab',
      prismCentral: {
        endpoint: 'https://pc-demo.local:9440',
        credentialRef: 'pc_user',
        remoteCredentialRef: 'remote_pc_credentials',
        defaultPcVersion: 'pc.2024.3',
        enableObjects: false,
        enableNke: true,
        enableFlow: true,
        enableNetworkController: false,
      },
      foundationCentral: {
        endpoint: 'https://foundation-demo.local:9440',
        credentialRef: 'foundation_central',
        apiKeyRef: 'foundation_api_key',
        aosUrl: 'https://mirror.demo.local/aos.qcow2',
        hypervisorType: 'kvm',
        hypervisorUrl: 'https://mirror.demo.local/ahv.iso',
        foundationVersion: 'demo',
      },
      prismElement: {
        defaultClusterVip: 'pe-demo.example.invalid',
        peCredentialRef: 'pe_user',
        cvmCredentialRef: 'cvm_credential',
        storageContainer: 'ztf-demo-container',
        networkName: 'vlan-30',
      },
      ncm: {
        endpoint: 'https://ncm-demo.local',
        credentialRef: 'ncm_user',
        projectName: 'Demo Project',
        accountName: 'NTNX_LOCAL_AZ',
      },
      directory: {
        domain: 'demo.local',
        ldapUrl: 'ldaps://ad.demo.local',
        serviceAccountCredentialRef: 'service_account_credential',
        defaultGroups: 'Demo-Ops,Demo-Admins',
      },
      ipam: {
        method: 'static',
        infobloxHost: '',
        credentialRef: 'infoblox_user',
        dnsView: 'default',
        networkView: 'default',
      },
      defaults: {
        dnsServers: 'dns1.example.invalid,dns2.example.invalid',
        ntpServers: '0.pool.ntp.org,1.pool.ntp.org',
        timezone: 'Europe/London',
        siteCode: 'DEV',
      },
    }],
  })
}

function okAction(message: string, extra: Record<string, unknown> = {}) {
  return json({ ok: true, demo: true, message, ...extra })
}

const DEMO_INSTALLED_BUILD = {
  version: '1.8.0',
  versionTag: 'v1.8.0',
  installedIdentity: 'v1.8.0 / demo-build',
  sourceRef: 'v1.8.0',
  commit: 'demo-build',
  buildDate: '2026-08-25',
  containerImage: 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.0',
  updatePackageId: 'demo-update-package',
  appliedUpdate: {},
}

async function demoResponse(request: Request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/ZTF-Orchestrator(?=\/)/, '')
  const method = request.method.toUpperCase()

  if (path === '/health') return json({ status: 'healthy', version: '1.8.0', installed: DEMO_INSTALLED_BUILD, storage: 'demo' })
  if (!path.startsWith('/api/')) return null

  if (path === '/api/auth/login') {
    return json({ token: DEMO_TOKEN, user: { username: 'demo-admin', role: 'admin' } })
  }
  if (path === '/api/auth/logout') return okAction('Demo session reset.')
  if (path === '/api/system/check') return json({
    checks: systemChecks,
    ztfInstalled: true,
    ztf2Installed: true,
    ztf2: {
      enabled: true,
      installed: true,
      compatible: true,
      layout: 'ztf-2.x',
      path: '/opt/zerotouch-framework-2x',
      command: 'ztf',
      projectDir: '/var/lib/ztf-orchestrator/ztf2-projects/default',
      message: 'ZTF 2.x plan/apply CLI layout detected',
      requiredRef: 'v2.0.0',
    },
  })
  if (path === '/api/ztf2/status') return json({
    enabled: true,
    installed: true,
    compatible: true,
    layout: 'ztf-2.x',
    path: '/opt/zerotouch-framework-2x',
    command: 'ztf',
    projectDir: '/var/lib/ztf-orchestrator/ztf2-projects/default',
    repoUrl: 'https://github.com/nutanixdev/zerotouch-framework.git',
    message: 'ZTF 2.x plan/apply CLI layout detected',
    requiredRef: 'v2.0.0',
  })
  if (path === '/api/ztf2/install' && method === 'POST') {
    const lines = [
      { type: 'step', data: 'Using demo ZeroTouch Framework 2.x checkout.' },
      { type: 'stdout', data: 'Installing ZTF 2.x package into the configured runtime...' },
      { type: 'stdout', data: 'ztf --help' },
      { type: 'done', data: 'ZeroTouch Framework 2.x installed successfully!' },
    ]
    return new Response(lines.map(line => `data: ${JSON.stringify(line)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  if (path === '/api/install' && method === 'POST') {
    const lines = [
      { type: 'step', data: 'Using demo ZeroTouch Framework 1.x checkout.' },
      { type: 'stdout', data: 'Installing Python dependencies...' },
      { type: 'done', data: 'ZeroTouch Framework installed successfully!' },
    ]
    return new Response(lines.map(line => `data: ${JSON.stringify(line)}\n\n`).join(''), {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  if (path === '/api/health/details') {
    return json({
      status: 'healthy',
      storage: 'postgres',
      version: '1.8.0',
      installed: DEMO_INSTALLED_BUILD,
      database: { configured: true, location: 'postgresql://demo:***@postgres:5432/ztf_orchestrator' },
      jobs: { workers: 1, queued: 0, running: 1, recent: jobs.length },
    })
  }
  if (path === '/api/visibility/summary') {
    return json({
      operations: { queued: 0, running: 1, failed: 1, longRunning: 0, totalJobs: jobs.length },
      governance: { pendingApprovals: 1, driftedChecks: 1, unknownBaselines: 0, latestDriftStatus: 'drifted' },
      schedules: { enabled: 1, total: 1, nextRun: schedules[0].nextRun, lastFailed: null },
      storage: {
        backend: 'postgres',
        databaseConfigured: true,
        databaseLocation: 'postgresql://demo:***@postgres:5432/ztf_orchestrator',
        lastBackup: { filename: 'ztf-demo-backup-20260813.sql', size: 82491, createdAt: iso(90) },
        backupWarning: 'OK',
      },
      deployment: { ztfInstalled: true, nkpInstalled: true, nkpProfiles: 1, generatedNkpConfigs: 2, nkpBinaries: 1, availableNkpBinaries: 1, defaultNkpBinary: 'nkp-linux-amd64-demo' },
      evidence: { total: 2, latestStatus: 'ready', latestAt: iso(45), latestProfile: 'DEV_LAB Demo', ready: 1, blocked: 0, needsReview: 1 },
    })
  }
  if (path === '/api/executions') return method === 'DELETE' ? okAction('Execution history clear simulated.') : json(executions)
  if (path.startsWith('/api/jobs/')) {
    if (path.endsWith('/cancel')) return json({ ...jobs[0], status: 'cancelled', finishedAt: iso(0) })
    if (method === 'DELETE') return okAction('Job delete simulated.')
  }
  if (path === '/api/jobs') {
    if (method === 'POST') {
      const body = await requestJson(request)
      const action = String(body.ztf2Action || body.action || 'plan')
      return json({
        id: `demo-job-${Date.now()}`,
        status: 'queued',
        workflow: body.framework === 'ztf2' ? `ztf2:${action}` : String(body.workflow || body.script || 'demo-workflow'),
        type: body.framework === 'ztf2' ? 'ztf2' : body.script ? 'script' : 'workflow',
        framework: body.framework || 'ztf',
        user: 'demo-admin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        trace: body.framework === 'ztf2' ? {
          framework: 'ztf2',
          runtimeMode: 'ztf2_iac',
          action,
          workflowTemplate: String(body.workflowTemplate || ''),
          planId: `demo-plan-${Date.now()}`,
          planPath: '/var/lib/ztf-orchestrator/ztf2-projects/default/plans/demo-plan-workflow.json',
          statePath: '/var/lib/ztf-orchestrator/ztf2-projects/default/state.yml',
        } : undefined,
        demo: true,
      }, { status: 202 })
    }
    return json(jobs)
  }
  if (path.startsWith('/api/jobs?') || path === '/api/jobs/') return json(jobs)
  if (path === '/api/drift') return method === 'DELETE' ? okAction('Drift history clear simulated.') : json(driftRuns)
  if (path === '/api/drift/check') return okAction('Drift check simulated.', { run: driftRuns[0] })
  if (path === '/api/approvals') {
    if (method === 'POST') return json({ ...approvals[0], id: `demo-approval-${Date.now()}` }, { status: 201 })
    return json(approvals)
  }
  if (/^\/api\/approvals\/[^/]+\/(approve|reject)$/.test(path)) return okAction('Approval decision simulated.')
  if (path.startsWith('/api/approvals/')) return okAction('Approval update simulated.')
  if (path === '/api/schedules') {
    if (method === 'POST') return json({ ...schedules[0], id: `demo-schedule-${Date.now()}` }, { status: 201 })
    return json(schedules)
  }
  if (path.includes('/run-now')) return okAction('Schedule run simulated.')
  if (path.startsWith('/api/schedules/')) return okAction('Schedule update simulated.')
  if (path === '/api/configs') return json(Object.keys(configs))
  if (path.startsWith('/api/configs/')) {
    const parts = path.split('/')
    const name = decodeURIComponent(parts[3] || '')
    if (path.endsWith('/backups')) return json([{ version: 'demo-1', timestamp: iso(120), size: configs[name]?.length || 0 }])
    if (path.includes('/restore/')) return okAction('Config restore simulated.')
    if (method === 'DELETE') return okAction('Config delete simulated.')
    if (method === 'PUT' || method === 'POST') return okAction('Config save simulated.', { name })
    return json({ name, content: configs[name] || '# Demo config placeholder\n' })
  }
  if (path === '/api/global-config') {
    if (method === 'PUT' || method === 'POST') return okAction('Global config save simulated.')
    return json({ content: configs['global.yml'] })
  }
  if (path === '/api/settings') {
    if (method === 'PUT' || method === 'POST') return okAction('Settings save simulated.')
    return json(useStore.getState().settings)
  }
  if (path === '/api/settings/test-connection') return okAction('Connection test simulated.', { status: 'ok' })
  if (path === '/api/execute') {
    const body = await requestJson(request)
    return json({
      id: `demo-job-${Date.now()}`,
      status: 'queued',
      workflow: String(body.workflow || body.script || 'demo-workflow'),
      type: body.script ? 'script' : 'workflow',
      user: 'demo-admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      demo: true,
    }, { status: 202 })
  }
  if (path === '/api/yaml-studio/validate') {
    const body = await requestJson(request)
    const content = String(body.content || '')
    const errors = content.trim() ? [] : ['YAML content is required.']
    return json({ kind: String(body.kind || 'workflow-config'), valid: errors.length === 0, errors, warnings: ['Demo validation checks YAML shape only.'], rootType: content.trim().startsWith('-') ? 'list' : 'mapping' }, { status: errors.length ? 400 : 200 })
  }
  if (path === '/api/yaml-studio/save') {
    const body = await requestJson(request)
    return json({ filename: String(body.filename || 'demo.yaml'), validation: { valid: true, errors: [], warnings: ['Saved in demo memory only.'] } })
  }
  if (path === '/api/yaml-studio/export') {
    return new Response(new Blob(['Demo export bundle. No infrastructure data is included.\n'], { type: 'application/zip' }), {
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="ztf-demo-export.zip"' },
    })
  }
  if (path === '/api/appliance/status') {
    return json({
      detected: true,
      runtime: { status: 'healthy', version: '1.8.0', installed: DEMO_INSTALLED_BUILD, ztfCompatible: true, message: 'Legacy ZTF 1.x workflow/script CLI detected' },
      hostLayout: { status: 'demo', visible: 7, expected: 7, message: 'Simulated appliance host layout' },
      checks: [{ name: 'Demo appliance', ok: true, status: 'ok', value: 'static GitHub Pages demo', message: 'No host access in demo mode' }],
      containerPaths: { nkpBundles: '/var/lib/ztf-orchestrator/bundles', nkpFramework: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework', ztfFramework: '/opt/zerotouch-framework' },
    })
  }
  if (path === '/api/appliance/artifacts') return json({ artifacts: [], summary: { total: 0, verified: 0, archived: 0, expiring: 0, expired: 0, pending: 0 } })
  if (path === '/api/appliance/updates') {
    return json({
      current: { version: '1.8.0', installed: DEMO_INSTALLED_BUILD, containerImage: 'ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.0', requestPath: '/var/lib/ztf-orchestrator/appliance_update_request.json' },
      updates: [],
      staged: null,
      allowedRepositories: ['virtuarchitect/ztf-orchestrator', 'nutanixdev/zerotouch-framework', 'virtuarchitect/nkp-zerotouch-framework'],
      targets: [{ id: 'ztf-orchestrator', label: 'ZTF-Orchestrator', defaultRepo: 'VirtuArchitect/ZTF-Orchestrator', defaultPath: '' }],
    })
  }
  if (path.startsWith('/api/appliance/')) return okAction('Appliance action simulated.')
  if (path === '/api/ztf/compatibility') return json({
    installed: true,
    compatible: true,
    layout: 'legacy-1.x',
    entrypoint: 'main.py',
    requiredRef: 'v1.5.2',
    message: 'Legacy ZTF 1.x workflow/script CLI detected',
    defaultMode: 'legacy-workflows',
    runtimes: {
      ztf1: { enabled: true, compatible: true, layout: 'legacy-1.x', path: '/opt/zerotouch-framework' },
      ztf2: { enabled: true, compatible: true, layout: 'ztf-2.x', path: '/opt/zerotouch-framework-2x', command: 'ztf', projectDir: '/var/lib/ztf-orchestrator/ztf2-projects/default' },
    },
    supportedModes: [
      { id: 'legacy-workflows', label: 'ZTF 1.x legacy workflows', available: true, description: 'Runs python main.py workflow and script commands through the existing catalog.' },
      { id: 'ztf2-iac', label: 'ZTF 2.x plan/apply mode', available: true, description: 'Runs separate ztf plan/apply/refresh/destroy projects with approval-bound apply.' },
    ],
  })
  if (path === '/api/nkp/status') return json({ installed: true, path: '/var/lib/ztf-orchestrator/nkp-zerotouch-framework', repoUrl: 'https://github.com/VirtuArchitect/nkp-zerotouch-framework.git', script: 'scripts/zt.sh', safePhases: ['validate', 'prepare', 'generate'], configs: ['air-gapped.example.yaml'] })
  if (path === '/api/nkp/profiles') return json([{ id: 'demo-profile', name: 'DEV_LAB Demo', environment: 'lab', createdAt: iso(500), updatedAt: iso(60), status: 'ready' }])
  if (path.startsWith('/api/nkp/')) return okAction('NKP action simulated.')
  if (path === '/api/validation-evidence') return json([
    {
      id: 'demo-evidence-native-foundation-001',
      source: 'native-foundation',
      type: 'native-foundation-review-packet',
      status: 'blocked',
      workflow: 'native-foundation-deploy',
      executionStatus: 'planning_only',
      configFile: 'native-foundation-deploy.yml',
      createdAt: iso(35),
      createdBy: 'demo-operator',
      notes: 'Simulated native Foundation review packet for HCI, compute, and storage-only planning.',
      readiness: { status: 'blocked', score: 0 },
      schemaValidation: { status: 'pass' },
      metadata: {
        nativeFoundationPacketId: 'native-foundation-review-demo001',
        nativeFoundationPhase: 'full_deployment',
        nativeFoundationExecutionAuthorizationCarriedPersistenceGateStatus: 'blocked',
        nativeFoundationExecutionAuthorizationCarriedPersistenceGateEvidence: 'Generate execution authorization records with carried authorization-persistence provenance before mutating enablement can be considered.',
        nativeFoundationExecutionAuthorizationCarriedPersistenceRecordCount: 0,
        nativeFoundationExecutionAuthorizationMissingCarriedPersistenceRecordCount: 1,
      },
    },
    { id: 'demo-evidence-001', source: 'nkp', profileId: 'demo-profile', status: 'ready', createdAt: iso(45), createdBy: 'demo-admin', notes: 'Simulated evidence package for public demo.' },
  ])
  if (path.startsWith('/api/validation-evidence/')) return okAction('Validation evidence action simulated.')
  if (path === '/api/pipelines') return json([{ id: 'demo-pipeline-001', name: 'Deploy and validate PC', steps: [{ workflow: 'deploy-pc', configFile: 'pc-deploy-demo.yml' }], createdAt: iso(800), updatedAt: iso(90) }])
  if (path.startsWith('/api/pipelines/')) return okAction('Pipeline action simulated.')
  if (path === '/api/parallel-runs') return json([])
  if (path.startsWith('/api/parallel-runs')) return okAction('Parallel run action simulated.')
  if (path === '/api/users') return json([{ username: 'demo-admin', role: 'admin' }, { username: 'demo-operator', role: 'operator' }, { username: 'demo-viewer', role: 'viewer' }])
  if (path.startsWith('/api/users/')) return okAction('User action simulated.')
  if (path === '/api/audit-log') return json([{ id: 'demo-audit-001', actor: 'demo-admin', action: 'demo.started', resource: 'github-pages', timestamp: iso(5), details: { mode: 'simulated' } }])
  if (path.startsWith('/api/upgrade-advisor/')) return json({ version: 'demo', name: 'Demo upgrade rules', description: 'Read-only simulated advisory data', phases: [], rules: [], sourcePacks: [], readOnly: true })
  if (path === '/api/maintenance/database-backups') return json({ backups: [{ filename: 'ztf-demo-backup-20260813.sql', size: 82491, createdAt: iso(90) }] })
  if (path.startsWith('/api/maintenance/database-backups')) return okAction('Database maintenance action simulated.')

  return json([])
}

export function installDemoMode() {
  if (!isDemoMode() || typeof window === 'undefined') return
  demoStoreSeed()
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const response = await demoResponse(request)
    if (response) return response
    return originalFetch(input, init)
  }
}
