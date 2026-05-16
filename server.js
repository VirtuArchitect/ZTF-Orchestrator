const express = require('express')
const cors = require('cors')
const { spawn, exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Config and state directories
const CONFIG_DIR = path.join(os.homedir(), '.ztf-ui')
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json')
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json')
const CONFIGS_DIR = path.join(CONFIG_DIR, 'configs')

// Ensure directories exist
[CONFIG_DIR, CONFIGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
})

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

// --- Settings ---
app.get('/api/settings', (req, res) => {
  const defaults = {
    ztfPath: path.join(os.homedir(), 'zerotouch-framework'),
    pythonPath: 'python3',
    configDir: CONFIGS_DIR,
    repoUrl: 'https://github.com/nutanixdev/zerotouch-framework.git',
  }
  res.json({ ...defaults, ...readJSON(SETTINGS_FILE, {}) })
})

app.post('/api/settings', (req, res) => {
  writeJSON(SETTINGS_FILE, req.body)
  res.json({ success: true })
})

// --- System Check ---
app.get('/api/system/check', async (req, res) => {
  const settings = { ...{ pythonPath: 'python3', ztfPath: path.join(os.homedir(), 'zerotouch-framework') }, ...readJSON(SETTINGS_FILE, {}) }

  const checks = []

  const runCheck = (name, cmd) => new Promise(resolve => {
    exec(cmd, (err, stdout) => {
      resolve({ name, ok: !err, value: err ? null : stdout.trim() })
    })
  })

  const results = await Promise.all([
    runCheck('Python 3.9+', `${settings.pythonPath} --version`),
    runCheck('pip', `pip3 --version`),
    runCheck('git', 'git --version'),
    runCheck('ZTF Installed', `test -f "${settings.ztfPath}/main.py" && echo "found"`),
  ])

  const ztfInstalled = results.find(r => r.name === 'ZTF Installed')?.ok || false

  if (ztfInstalled) {
    const reqFile = path.join(settings.ztfPath, 'requirements', 'requirements.txt')
    results.push({ name: 'Requirements File', ok: fs.existsSync(reqFile), value: reqFile })
  }

  res.json({ checks: results, ztfInstalled })
})

// --- Install ZTF ---
app.post('/api/install', (req, res) => {
  const settings = { ...{ ztfPath: path.join(os.homedir(), 'zerotouch-framework'), repoUrl: 'https://github.com/nutanixdev/zerotouch-framework.git', pythonPath: 'python3' }, ...readJSON(SETTINGS_FILE, {}) }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`)

  const runCmd = (cmd, cwd) => new Promise((resolve, reject) => {
    send('log', `$ ${cmd}`)
    const proc = spawn('bash', ['-c', cmd], { cwd })
    proc.stdout.on('data', d => send('stdout', d.toString()))
    proc.stderr.on('data', d => send('stderr', d.toString()))
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)))
  })

  ;(async () => {
    try {
      if (!fs.existsSync(settings.ztfPath)) {
        send('step', 'Cloning ZeroTouch Framework...')
        await runCmd(`git clone ${settings.repoUrl} "${settings.ztfPath}"`)
      } else {
        send('step', 'Updating existing ZeroTouch Framework...')
        await runCmd('git pull', settings.ztfPath)
      }

      send('step', 'Installing Python dependencies...')
      const reqFile = fs.existsSync(path.join(settings.ztfPath, 'requirements', 'requirements.txt'))
        ? 'requirements/requirements.txt'
        : 'requirements.txt'
      await runCmd(`${settings.pythonPath} -m pip install -r ${reqFile}`, settings.ztfPath)

      send('done', 'ZeroTouch Framework installed successfully!')
    } catch (err) {
      send('error', err.message)
    }
    res.end()
  })()
})

// --- Config Files ---
app.get('/api/configs', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const dir = settings.configDir || CONFIGS_DIR
  if (!fs.existsSync(dir)) return res.json([])
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.json'))
  res.json(files.map(f => {
    const stat = fs.statSync(path.join(dir, f))
    return { name: f, size: stat.size, modified: stat.mtime }
  }))
})

app.get('/api/configs/:name', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const dir = settings.configDir || CONFIGS_DIR
  const filePath = path.join(dir, path.basename(req.params.name))
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  res.json({ name: req.params.name, content: fs.readFileSync(filePath, 'utf8') })
})

app.post('/api/configs/:name', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const dir = settings.configDir || CONFIGS_DIR
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, path.basename(req.params.name))
  fs.writeFileSync(filePath, req.body.content)
  res.json({ success: true })
})

app.delete('/api/configs/:name', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const dir = settings.configDir || CONFIGS_DIR
  const filePath = path.join(dir, path.basename(req.params.name))
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  res.json({ success: true })
})

// --- Global Config ---
app.get('/api/global-config', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const ztfPath = settings.ztfPath || path.join(os.homedir(), 'zerotouch-framework')
  const globalYml = path.join(ztfPath, 'config', 'global.yml')
  if (fs.existsSync(globalYml)) {
    res.json({ content: fs.readFileSync(globalYml, 'utf8'), path: globalYml })
  } else {
    res.json({ content: null, path: globalYml })
  }
})

app.post('/api/global-config', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {})
  const ztfPath = settings.ztfPath || path.join(os.homedir(), 'zerotouch-framework')
  const globalYml = path.join(ztfPath, 'config', 'global.yml')
  const dir = path.dirname(globalYml)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(globalYml, req.body.content)
  res.json({ success: true })
})

// --- Execute Workflow ---
app.post('/api/execute', (req, res) => {
  const { workflow, script, schema, configFile, configContent, debug } = req.body
  const settings = readJSON(SETTINGS_FILE, {})
  const ztfPath = settings.ztfPath || path.join(os.homedir(), 'zerotouch-framework')
  const pythonPath = settings.pythonPath || 'python3'
  const configsDir = settings.configDir || CONFIGS_DIR

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const executionId = Date.now().toString()
  const send = (type, data) => res.write(`data: ${JSON.stringify({ type, data, executionId })}\n\n`)

  ;(async () => {
    // Write config file if content provided
    let cfgPath = configFile
    if (configContent) {
      cfgPath = path.join(configsDir, configFile || `${workflow || script}-${executionId}.yml`)
      if (!fs.existsSync(configsDir)) fs.mkdirSync(configsDir, { recursive: true })
      fs.writeFileSync(cfgPath, configContent)
    }

    // Build command
    let cmd = `${pythonPath} main.py`
    if (workflow) cmd += ` --workflow ${workflow}`
    if (script) cmd += ` --script ${script}`
    if (schema) cmd += ` --schema ${schema}`
    if (cfgPath) cmd += ` -f "${cfgPath}"`
    if (debug) cmd += ` --debug`

    send('start', { command: cmd, workingDir: ztfPath })

    const startTime = Date.now()

    const proc = spawn('bash', ['-c', cmd], { cwd: ztfPath })

    proc.stdout.on('data', d => send('stdout', d.toString()))
    proc.stderr.on('data', d => send('stderr', d.toString()))

    proc.on('close', code => {
      const duration = Date.now() - startTime
      const status = code === 0 ? 'success' : 'failed'

      // Save to history
      const history = readJSON(HISTORY_FILE, [])
      history.unshift({
        id: executionId,
        workflow: workflow || script,
        type: workflow ? 'workflow' : 'script',
        command: cmd,
        status,
        duration,
        timestamp: new Date().toISOString(),
        configFile: cfgPath,
      })
      writeJSON(HISTORY_FILE, history.slice(0, 100))

      send('done', { code, status, duration })
      res.end()
    })

    req.on('close', () => proc.kill())
  })()
})

// --- Execution History ---
app.get('/api/executions', (req, res) => {
  res.json(readJSON(HISTORY_FILE, []))
})

app.delete('/api/executions', (req, res) => {
  writeJSON(HISTORY_FILE, [])
  res.json({ success: true })
})

app.listen(PORT, () => {
  console.log(`ZTF UI Server running on http://localhost:${PORT}`)
})
