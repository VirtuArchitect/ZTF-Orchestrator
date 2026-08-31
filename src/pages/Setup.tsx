import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, XCircle, Loader, Download, Terminal as TermIcon, RefreshCw, Boxes, GitBranch } from 'lucide-react'
import Layout from '../components/Layout'
import Terminal from '../components/Terminal'
import { useStore } from '../store'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface LogLine { type: string; data: string; ts: number }

interface RuntimeInfo {
  enabled?: boolean
  compatible?: boolean
  installed?: boolean
  layout?: string
  path?: string
  command?: string
  projectDir?: string
  message?: string
  requiredRef?: string
}

type RuntimeMode = 'ztf1' | 'ztf2'

const STEPS = ['Check Prerequisites', 'Install Framework', 'Verify Installation']

const RUNTIMES: Array<{
  id: RuntimeMode
  label: string
  description: string
}> = [
  {
    id: 'ztf1',
    label: 'ZTF 1.x Legacy',
    description: 'Workflow and script catalog runtime',
  },
  {
    id: 'ztf2',
    label: 'ZTF 2.x IaC',
    description: 'Plan/apply runtime for input.yml and global.yml',
  },
]

export default function Setup() {
  const { setSystemChecks, ztfInstalled, systemChecks } = useStore()
  const [runtime,       setRuntime]       = useState<RuntimeMode>('ztf1')
  const [step,          setStep]          = useState(
    systemChecks.length > 0 && systemChecks.every(check => check.ok) ? 1 : 0
  )
  const [checking,      setChecking]      = useState(false)
  const [installing,    setInstalling]    = useState(false)
  const [logs,          setLogs]          = useState<LogLine[]>([])
  const [installStatus, setInstallStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [checkError,    setCheckError]    = useState('')
  const [ztf2Info,      setZtf2Info]      = useState<RuntimeInfo | null>(null)
  const [ztf2Installed, setZtf2Installed] = useState(false)

  const runtimeInstalled = runtime === 'ztf2' ? ztf2Installed : ztfInstalled
  const installEndpoint = runtime === 'ztf2' ? '/api/ztf2/install' : '/api/install'
  const runtimeLabel = runtime === 'ztf2' ? 'ZTF 2.x' : 'ZTF 1.x'

  const checks = useMemo(() => {
    const wanted = new Set([
      'Python 3.9+',
      'pip',
      'git',
      runtime === 'ztf2' ? 'ZTF 2.x Plan/Apply' : 'ZTF Installed',
    ])
    return systemChecks.filter(check => wanted.has(check.name))
  }, [runtime, systemChecks])

  useEffect(() => {
    const runtimeCheck = checks.find(check => check.name === (runtime === 'ztf2' ? 'ZTF 2.x Plan/Apply' : 'ZTF Installed'))
    if (runtimeCheck?.ok) {
      setStep(prev => Math.max(prev, 1))
    }
  }, [checks, runtime])

  const appendLog = (type: string, data: string) =>
    setLogs(prev => [...prev, { type, data, ts: Date.now() }])

  const runCheck = async () => {
    setChecking(true)
    setCheckError('')
    try {
      const resp = await apiFetch('/api/system/check')
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setCheckError(err.error || `Server returned ${resp.status}`)
        return
      }
      const data = await resp.json()
      const safeChecks = Array.isArray(data.checks) ? data.checks : []
      setSystemChecks(safeChecks, !!data.ztfInstalled)
      setZtf2Info(data.ztf2 || null)
      setZtf2Installed(!!data.ztf2Installed || !!data.ztf2?.compatible)
      const runtimeCheckName = runtime === 'ztf2' ? 'ZTF 2.x Plan/Apply' : 'ZTF Installed'
      const runtimeCheck = safeChecks.find((check: { name: string }) => check.name === runtimeCheckName)
      if (runtimeCheck?.ok) {
        setStep(1)
      }
    } catch {
      setCheckError('Could not reach the server. Is it running?')
    } finally {
      setChecking(false)
    }
  }

  const runInstall = async () => {
    setInstalling(true)
    setInstallStatus('running')
    setLogs([])

    try {
      const resp = await apiFetch(installEndpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}))
        appendLog('error', err.error || `Server returned ${resp.status}`)
        setInstallStatus('error')
        setInstalling(false)
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6))
              appendLog(evt.type, typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data))
              if (evt.type === 'done')  setInstallStatus('done')
              if (evt.type === 'error') setInstallStatus('error')
            } catch { /* ignore malformed SSE line */ }
          }
        }
      }

      setInstalling(false)
      setInstallStatus(prev => prev === 'error' ? 'error' : 'done')
      setStep(2)

      const resp2 = await apiFetch('/api/system/check')
      if (resp2.ok) {
        const data2 = await resp2.json()
        const safeChecks = Array.isArray(data2.checks) ? data2.checks : []
        setSystemChecks(safeChecks, !!data2.ztfInstalled)
        setZtf2Info(data2.ztf2 || null)
        setZtf2Installed(!!data2.ztf2Installed || !!data2.ztf2?.compatible)
      }
    } catch {
      appendLog('error', 'Could not reach the server.')
      setInstallStatus('error')
      setInstalling(false)
    }
  }

  const manualCommands = runtime === 'ztf2'
    ? [
      '# Clone the ZTF 2.x repository',
      'git clone --branch v2.0.0 https://github.com/nutanixdev/zerotouch-framework.git /opt/zerotouch-framework-2x',
      '',
      '# Create a separate runtime',
      'python -m venv /opt/ztf2-python',
      '/opt/ztf2-python/bin/python -m pip install --upgrade pip',
      '',
      '# Install the ZTF 2.x CLI package',
      '/opt/ztf2-python/bin/python -m pip install /opt/zerotouch-framework-2x',
      '/opt/ztf2-python/bin/ztf --help',
    ]
    : [
      '# Clone the repository',
      'git clone --branch v1.5.2 https://github.com/nutanixdev/zerotouch-framework.git /opt/zerotouch-framework',
      '',
      '# Enter the directory',
      'cd /opt/zerotouch-framework',
      '',
      '# Install dependencies',
      'pip install -r requirements/requirements.txt',
    ]

  return (
    <Layout title="Setup & Install" subtitle="Install and configure ZeroTouch Framework runtimes">
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {RUNTIMES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setRuntime(item.id)
              setLogs([])
              setInstallStatus('idle')
              setStep(0)
            }}
            className={clsx(
              'flex items-center gap-3 rounded-lg border p-4 text-left transition-colors',
              runtime === item.id
                ? 'border-nutanix-blue bg-nutanix-blue/10'
                : 'border-border bg-gray-950/40 hover:border-gray-700'
            )}
          >
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center border',
              runtime === item.id ? 'border-nutanix-blue/40 bg-nutanix-blue/20 text-nutanix-cyan' : 'border-border text-gray-500'
            )}>
              {item.id === 'ztf2' ? <Boxes size={18} /> : <GitBranch size={18} />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-100">{item.label}</p>
              <p className="text-xs text-gray-500">{item.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              i === step ? 'bg-nutanix-blue text-white' :
              i < step   ? 'text-nutanix-teal' : 'text-gray-500'
            )}>
              <span className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                i === step ? 'bg-white/20' :
                i < step   ? 'bg-nutanix-teal/20' : 'bg-gray-800'
              )}>
                {i < step ? '✓' : i + 1}
              </span>
              {s}
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('h-px w-8 mx-1', i < step ? 'bg-nutanix-teal' : 'bg-border')} />
            )}
          </div>
        ))}
      </div>

      {checkError && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-700/40 text-sm text-red-400 flex items-center gap-2">
          <XCircle size={14} className="flex-shrink-0" />
          {checkError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-700/30 flex items-center justify-center">
              <RefreshCw size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Prerequisites Check</h3>
              <p className="text-xs text-gray-500">Verify required tools and selected runtime layout</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {[
              { name: 'Python 3.9+', desc: 'Required for installing framework packages' },
              { name: 'pip',         desc: 'Python package manager' },
              { name: 'git',         desc: 'For cloning the repository' },
              { name: runtime === 'ztf2' ? 'ZTF 2.x Plan/Apply' : 'ZTF Installed', desc: `${runtimeLabel} runtime detection` },
            ].map(req => {
              const check = checks.find(c => c.name === req.name)
              return (
                <div key={req.name} className="flex items-center gap-3 p-3 rounded-lg bg-gray-900 border border-border/50">
                  {check
                    ? check.ok
                      ? <CheckCircle size={16} className="text-nutanix-teal flex-shrink-0" />
                      : <XCircle size={16} className="text-red-400 flex-shrink-0" />
                    : <div className="w-4 h-4 rounded-full border-2 border-gray-700 flex-shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-300">{req.name}</p>
                    <p className="text-xs text-gray-500 break-words">{check?.value || req.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={runCheck}
            disabled={checking}
            className="btn-primary w-full justify-center"
          >
            {checking
              ? <Loader size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            {checking ? 'Checking...' : 'Run Prerequisites Check'}
          </button>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
              <Download size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Install {runtimeLabel} Framework</h3>
              <p className="text-xs text-gray-500">
                {runtime === 'ztf2'
                  ? 'Clone or update the v2 checkout and install the plan/apply CLI'
                  : 'Clone or update the legacy checkout and install Python dependencies'}
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4 text-sm text-gray-400">
            <p>This will:</p>
            <ul className="space-y-1 ml-4">
              {runtime === 'ztf2' ? (
                <>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">1.</span> Clone or update the configured ZTF 2.x checkout</li>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">2.</span> Install the package into the configured v2 runtime</li>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">3.</span> Verify the v2 CLI command</li>
                </>
              ) : (
                <>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">1.</span> Clone ZTF if missing, or pull updates from GitHub</li>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">2.</span> Reinstall required Python packages via pip</li>
                  <li className="flex items-center gap-2"><span className="text-nutanix-cyan">3.</span> Verify the installation</li>
                </>
              )}
            </ul>
          </div>

          {runtimeInstalled && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-nutanix-teal/10 border border-nutanix-teal/30 mb-4">
              <CheckCircle size={14} className="text-nutanix-teal" />
              <span className="text-sm text-nutanix-teal">{runtimeLabel} is already installed</span>
            </div>
          )}

          {runtime === 'ztf2' && ztf2Info && (
            <div className="mb-4 rounded-lg border border-border bg-gray-950/40 p-3 text-xs text-gray-500">
              <div className="grid grid-cols-1 gap-1">
                <p>Path: <span className="font-mono text-gray-300 break-all">{ztf2Info.path || 'not configured'}</span></p>
                <p>Command: <span className="font-mono text-gray-300 break-all">{ztf2Info.command || 'ztf'}</span></p>
                <p>Runtime enabled: <span className={ztf2Info.enabled ? 'text-nutanix-teal' : 'text-amber-400'}>{ztf2Info.enabled ? 'yes' : 'no'}</span></p>
              </div>
            </div>
          )}

          <button
            onClick={runInstall}
            disabled={installing || systemChecks.length === 0}
            className={clsx('btn-primary w-full justify-center', runtimeInstalled && 'opacity-80')}
          >
            {installing
              ? <Loader size={14} className="animate-spin" />
              : <Download size={14} />}
            {installing ? 'Installing...' : runtimeInstalled ? `Reinstall / Update ${runtimeLabel}` : `Install ${runtimeLabel}`}
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="mt-6">
          <Terminal
            logs={logs}
            status={installStatus === 'running' ? 'running' : installStatus === 'done' ? 'done' : 'error'}
            title={`${runtimeLabel} Installation Output`}
          />
        </div>
      )}

      <div className="mt-6 card">
        <div className="flex items-center gap-3 mb-4">
          <TermIcon size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-100">Manual Installation</h3>
        </div>
        <p className="text-sm text-gray-400 mb-3">Alternatively, install the selected runtime manually in your terminal:</p>
        <div className="space-y-2">
          {manualCommands.map((line, i) => (
            <div key={i} className={clsx(
              'font-mono text-xs break-all',
              line.startsWith('#') ? 'text-gray-600' : line === '' ? '' : 'text-gray-300'
            )}>
              {line || ' '}
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-gray-400">
            After installation, configure runtime availability in{' '}
            <span className="text-nutanix-cyan">Settings</span>.
          </p>
        </div>
      </div>
    </Layout>
  )
}
