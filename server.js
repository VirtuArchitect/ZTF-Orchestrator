const express = require('express')
const cors    = require('cors')
const { spawn } = require('child_process')
const crypto  = require('crypto')
const fs      = require('fs')
const path    = require('path')
const os      = require('os')
const yaml    = require('js-yaml')

const app  = express()
const PORT = 3001

// ─── CORS – localhost only ────────────────────────────────────────────────────

app.use(cors({
  origin: [
    'http://localhost:3001', 'http://127.0.0.1:3001',
    'http://localhost:5173', 'http://127.0.0.1:5173',
  ],
}))

app.use(express.json({ limit: '1mb' }))

// ─── Security headers ─────────────────────────────────────────────────────────

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cache-Control', 'no-store')
  next()
})

// ─── Config paths ─────────────────────────────────────────────────────────────

const CONFIG_DIR   = path.join(os.homedir(), '.ztf-ui')
const CONFIGS_DIR  = path.join(CONFIG_DIR, 'configs')
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json')
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json')
const API_KEY_FILE  = path.join(CONFIG_DIR, '.api_key')

// ─── Allowed workflow/script IDs ──────────────────────────────────────────────

const ALLOWED_WORKFLOWS = new Set([
  'cluster-create', 'imaging-only', 'imaging', 'site-deploy',
  'config-cluster', 'deploy-pc', 'config-pc', 'pod-config',
  'deploy-management-pc', 'config-management-pc',
  'calm-vm-workloads', 'calm-edgeai-vm-workload', 'ndb',
])

const ALLOWED_SCRIPTS = new Set([
  'AddAdServerPe', 'AddAdServerPc', 'CreateRoleMappingPe', 'CreateRoleMappingPc',
  'CreateLocalUser', 'DeleteLocalUser', 'AddSamlIdp',
  'CreateSubnetPe', 'CreateSubnetPc', 'DeleteSubnetPe', 'CreateVpc',
  'UpdateDnsNtp', 'EnableFlowNetworking',
  'CreateContainer', 'DeleteContainer', 'CreateObjectStore', 'CreateBucket',
  'CreateVm', 'DeleteVm', 'PowerOnVm', 'PowerOffVm', 'CloneVm',
  'UploadImage', 'DeleteImage',
  'CreateSecurityPolicy', 'CreateAddressGroup', 'CreateServiceGroup',
  'CreateCategory', 'AssignCategoryToVm',
  'CreateNkeCluster', 'DeleteNkeCluster', 'EnableNke',
  'CreateDbServer', 'RegisterNdbCluster', 'CreateNdbNetworkProfile',
  'DeployPc', 'RegisterPcToPe', 'EnableMicrosegmentation', 'EnableObjects',
  'EnableDr', 'CreateProtectionRule', 'CreateRecoveryPlan', 'RegisterRemoteAz',
  'ConfigureEula', 'EnablePulse', 'SetHaReservation', 'SetRebuildCapacity',
  'UpdateClusterName',
  'UpdateFoundation', 'UpdateNcc',
])

const ALLOWED_REPOS = new Set([
  'https://github.com/nutanixdev/zerotouch-framework.git',
  'https://github.com/nutanixdev/zerotouch-framework',
])

// ─── Secure directory & API key ───────────────────────────────────────────────

function secureMkdir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  try { fs.chmodSync(dir, 0o700) } catch {}
}

function secureWrite(filePath, content) {
  fs.writeFileSync(filePath, content)
  try { fs.chmodSync(filePath, 0o600) } catch {}
}

secureMkdir(CONFIG_DIR)
secureMkdir(CONFIGS_DIR)

function loadOrCreateApiKey() {
  if (fs.existsSync(API_KEY_FILE)) {
    const key = fs.readFileSync(API_KEY_FILE, 'utf8').trim()
    if (key) return key
  }
  const key = crypto.randomBytes(32).toString('hex')
  secureWrite(API_KEY_FILE, key)
  return key
}

const API_KEY = loadOrCreateApiKey()

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const clientKey = req.headers['x-api-key'] || ''
  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(API_KEY)
  const received = Buffer.from(clientKey.padEnd(API_KEY.length, '\0').slice(0, API_KEY.length))
  if (clientKey.length !== API_KEY.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch { return fallback }
}

function writeJSON(file, data) {
  secureWrite(file, JSON.stringify(data, null, 2))
}

function getSettings() {
  const defaults = {
    ztfPath: path.join(os.homedir(), 'zerotouch-framework'),
    pythonPath: 'python3',
    configDir: CONFIGS_DIR,
    repoUrl: 'https://github.com/nutanixdev/zerotouch-framework.git',
  }
  return { ...defaults, ...readJSON(SETTINGS_FILE, {}) }
}

/**
 * Returns the resolved path if it's within baseDir and has no traversal,
 * otherwise null.
 */
function safeConfigPath(name, baseDir) {
  const safeName = path.basename(name)
  if (!safeName || safeName === '.' || safeName === '..') return null
  const resolved = path.resolve(baseDir, safeName)
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) &&
      resolved !== path.resolve(baseDir)) return null
  return resolved
}

function validateYaml(content) {
  try { yaml.load(content); return { ok: true } }
  catch (e) { return { ok: false, error: e.message } }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/settings', requireAuth, (req, res) => {
  res.json(getSettings())
})

app.post('/api/settings', requireAuth, (req, res) => {
  const allowed = new Set(['ztfPath', 'pythonPath', 'configDir', 'repoUrl'])
  const filtered = Object.fromEntries(
    Object.entries(req.body || {}).filter(([k]) => allowed.has(k))
  )
  writeJSON(SETTINGS_FILE, filtered)
  res.json({ success: true })
})

// ─── System Check ─────────────────────────────────────────────────────────────

app.get('/api/system/check', requireAuth, async (req, res) => {
  const settings = getSettings()

  const runCheck = (name, args) => new Promise(resolve => {
    const proc = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', code => resolve({ name, ok: code === 0, value: out.trim() }))
    proc.on('error', () => resolve({ name, ok: false, value: 'check failed' }))
  })

  const ztfInstalled = fs.existsSync(path.join(settings.ztfPath, 'main.py'))

  const results = await Promise.all([
    runCheck('Python 3.9+', [settings.pythonPath, '--version']),
    runCheck('pip',          [settings.pythonPath, '-m', 'pip', '--version']),
    runCheck('git',          ['git', '--version']),
  ])
  results.push({ name: 'ZTF Installed', ok: ztfInstalled, value: ztfInstalled ? 'found' : '' })

  if (ztfInstalled) {
    const reqPath = path.join(settings.ztfPath, 'requirements', 'requirements.txt')
    const found = fs.existsSync(reqPath)
    results.push({ name: 'Requirements File', ok: found, value: found ? reqPath : '' })
  }

  res.json({ checks: results, ztfInstalled })
})

// ─── Install ZTF ──────────────────────────────────────────────────────────────

app.post('/api/install', requireAuth, (req, res) => {
  const settings = getSettings()

  if (!ALLOWED_REPOS.has(settings.repoUrl)) {
    return res.status(400).json({ error: 'Repository URL not allowed' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`)

  const runCmd = (args, cwd) => new Promise((resolve, reject) => {
    send('log', '$ ' + args.join(' '))
    const proc = spawn(args[0], args.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    proc.stdout.on('data', d => send('stdout', d.toString()))
    proc.stderr.on('data', d => send('stderr', d.toString()))
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)))
    proc.on('error', reject)
  })

  ;(async () => {
    try {
      if (!fs.existsSync(path.join(settings.ztfPath, 'main.py'))) {
        send('step', 'Cloning ZeroTouch Framework...')
        await runCmd(['git', 'clone', settings.repoUrl, settings.ztfPath])
      } else {
        send('step', 'Updating existing ZeroTouch Framework...')
        await runCmd(['git', 'pull'], settings.ztfPath)
      }

      send('step', 'Installing Python dependencies...')
      const reqFile = fs.existsSync(path.join(settings.ztfPath, 'requirements', 'requirements.txt'))
        ? path.join(settings.ztfPath, 'requirements', 'requirements.txt')
        : path.join(settings.ztfPath, 'requirements.txt')
      await runCmd([settings.pythonPath, '-m', 'pip', 'install', '--no-deps', '-r', reqFile], settings.ztfPath)

      send('done', 'ZeroTouch Framework installed successfully!')
    } catch (err) {
      console.error('Install error:', err)
      send('error', 'Installation failed. Check server logs for details.')
    }
    res.end()
  })()
})

// ─── Config Files ─────────────────────────────────────────────────────────────

app.get('/api/configs', requireAuth, (req, res) => {
  const dir = getSettings().configDir || CONFIGS_DIR
  secureMkdir(dir)
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.json'))
    .map(f => { const s = fs.statSync(path.join(dir, f)); return { name: f, size: s.size, modified: s.mtime } })
  res.json(files)
})

app.get('/api/configs/:name', requireAuth, (req, res) => {
  const dir = getSettings().configDir || CONFIGS_DIR
  const filePath = safeConfigPath(req.params.name, dir)
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  res.json({ name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf8') })
})

app.post('/api/configs/:name', requireAuth, (req, res) => {
  const dir = getSettings().configDir || CONFIGS_DIR
  const filePath = safeConfigPath(req.params.name, dir)
  if (!filePath) return res.status(400).json({ error: 'Invalid filename' })
  const ext = path.extname(filePath)
  if (!['.yml', '.yaml', '.json'].includes(ext)) return res.status(400).json({ error: 'Only .yml/.yaml/.json allowed' })
  const content = (req.body || {}).content || ''
  if (ext === '.yml' || ext === '.yaml') {
    const result = validateYaml(content)
    if (!result.ok) return res.status(400).json({ error: `Invalid YAML: ${result.error}` })
  }
  secureMkdir(dir)
  secureWrite(filePath, content)
  res.json({ success: true })
})

app.delete('/api/configs/:name', requireAuth, (req, res) => {
  const dir = getSettings().configDir || CONFIGS_DIR
  const filePath = safeConfigPath(req.params.name, dir)
  if (!filePath) return res.status(400).json({ error: 'Invalid filename' })
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  res.json({ success: true })
})

// ─── Global Config ────────────────────────────────────────────────────────────

app.get('/api/global-config', requireAuth, (req, res) => {
  const ztfPath = getSettings().ztfPath
  const globalYml = path.join(ztfPath, 'config', 'global.yml')
  res.json(fs.existsSync(globalYml)
    ? { content: fs.readFileSync(globalYml, 'utf8'), path: globalYml }
    : { content: null, path: globalYml })
})

app.post('/api/global-config', requireAuth, (req, res) => {
  const content = (req.body || {}).content || ''
  const result = validateYaml(content)
  if (!result.ok) return res.status(400).json({ error: `Invalid YAML: ${result.error}` })
  const ztfPath = getSettings().ztfPath
  const globalYml = path.join(ztfPath, 'config', 'global.yml')
  fs.mkdirSync(path.dirname(globalYml), { recursive: true })
  secureWrite(globalYml, content)
  res.json({ success: true })
})

// ─── Execute Workflow ─────────────────────────────────────────────────────────

app.post('/api/execute', requireAuth, (req, res) => {
  const { workflow, script, configFile, configContent, debug } = req.body || {}
  const settings = getSettings()

  // Validate against allowlist
  if (workflow && !ALLOWED_WORKFLOWS.has(workflow)) return res.status(400).json({ error: 'Unknown workflow' })
  if (script  && !ALLOWED_SCRIPTS.has(script))     return res.status(400).json({ error: 'Unknown script' })
  if (!workflow && !script)                         return res.status(400).json({ error: 'workflow or script required' })

  const configsDir = settings.configDir || CONFIGS_DIR
  const executionId = Date.now().toString()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data, executionId })}\n\n`)

  ;(async () => {
    // Write config file
    let cfgPath = null
    if (configContent && configFile) {
      cfgPath = safeConfigPath(configFile, configsDir)
      if (!cfgPath) { send('error', 'Invalid config filename'); res.end(); return }
      const ext = path.extname(cfgPath)
      if (ext === '.yml' || ext === '.yaml') {
        const r = validateYaml(configContent)
        if (!r.ok) { send('error', `Invalid YAML: ${r.error}`); res.end(); return }
      }
      secureMkdir(configsDir)
      secureWrite(cfgPath, configContent)
    }

    // Build command as an array — no shell interpolation
    const args = [settings.pythonPath, 'main.py']
    if (workflow) args.push('--workflow', workflow)
    if (script)   args.push('--script', script)
    if (cfgPath)  args.push('-f', cfgPath)
    if (debug)    args.push('--debug')

    send('start', { command: args.slice(0, 4).join(' ') + '…', workingDir: settings.ztfPath })

    const startTime = Date.now()

    const proc = spawn(args[0], args.slice(1), { cwd: settings.ztfPath })

    proc.stdout.on('data', d => send('stdout', d.toString()))
    proc.stderr.on('data', d => send('stderr', d.toString()))

    proc.on('error', err => {
      console.error('Execution error:', err)
      send('error', 'Execution failed. Check server logs for details.')
      res.end()
    })

    proc.on('close', code => {
      const duration = Date.now() - startTime
      const status = code === 0 ? 'success' : 'failed'

      // Save history — no full command or file paths (sensitive)
      const history = readJSON(HISTORY_FILE, [])
      history.unshift({
        id:        executionId,
        workflow:  workflow || script,
        type:      workflow ? 'workflow' : 'script',
        status,
        duration,
        timestamp: new Date().toISOString(),
      })
      writeJSON(HISTORY_FILE, history.slice(0, 100))

      send('done', { code, status, duration })
      res.end()
    })

    req.on('close', () => proc.kill())
  })()
})

// ─── Execution History ────────────────────────────────────────────────────────

app.get('/api/executions', requireAuth, (req, res) => {
  res.json(readJSON(HISTORY_FILE, []))
})

app.delete('/api/executions', requireAuth, (req, res) => {
  writeJSON(HISTORY_FILE, [])
  res.json({ success: true })
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log('='.repeat(60))
  console.log('  Nutanix ZeroTouch Framework UI')
  console.log('='.repeat(60))
  console.log(`  URL:     http://localhost:${PORT}`)
  console.log(`  API Key: ${API_KEY}`)
  console.log()
  console.log('  Paste the API key into Settings > API Key in the UI.')
  console.log(`  The key is also saved at: ${API_KEY_FILE}`)
  console.log('='.repeat(60))
})
