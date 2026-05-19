import { useState, useRef } from 'react'
import { CheckCircle, XCircle, Loader, Download, Terminal as TermIcon, RefreshCw } from 'lucide-react'
import Layout from '../components/Layout'
import Terminal from '../components/Terminal'
import { useStore } from '../store'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface LogLine { type: string; data: string; ts: number }

const STEPS = ['Check Prerequisites', 'Install Framework', 'Verify Installation']

export default function Setup() {
  const { setSystemChecks, ztfInstalled } = useStore()
  const [step, setStep] = useState(0)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [checks, setChecks] = useState<Array<{ name: string; ok: boolean; value: string | null }>>([])
  const [logs, setLogs] = useState<LogLine[]>([])
  const [installStatus, setInstallStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  const appendLog = (type: string, data: string) =>
    setLogs(prev => [...prev, { type, data, ts: Date.now() }])

  const runCheck = async () => {
    setChecking(true)
    setChecks([])
    try {
      const resp = await apiFetch('/api/system/check')
      const data = await resp.json()
      setChecks(data.checks)
      setSystemChecks(data.checks, data.ztfInstalled)
      setStep(1)
    } finally {
      setChecking(false)
    }
  }

  const runInstall = async () => {
    setInstalling(true)
    setInstallStatus('running')
    setLogs([])

    const resp = await apiFetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    if (!resp.body) { setInstallStatus('error'); return }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

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
            if (evt.type === 'done') setInstallStatus('done')
            if (evt.type === 'error') setInstallStatus('error')
          } catch { /* ignore */ }
        }
      }
    }
    setInstalling(false)
    if (installStatus !== 'error') {
      setInstallStatus('done')
      setStep(2)
      // Re-check after install
      const resp2 = await apiFetch('/api/system/check')
      const data = await resp2.json()
      setChecks(data.checks)
      setSystemChecks(data.checks, data.ztfInstalled)
    }
  }

  return (
    <Layout title="Setup & Install" subtitle="Install and configure the ZeroTouch Framework">
      {/* Steps */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              i === step ? 'bg-nutanix-blue text-white' :
              i < step ? 'text-nutanix-teal' : 'text-gray-500'
            )}>
              <span className={clsx(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                i === step ? 'bg-white/20' :
                i < step ? 'bg-nutanix-teal/20' : 'bg-gray-800'
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Prerequisites */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-900/30 border border-blue-700/30 flex items-center justify-center">
              <RefreshCw size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Prerequisites Check</h3>
              <p className="text-xs text-gray-500">Verify required tools are installed</p>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {[
              { name: 'Python 3.9+', desc: 'Required for running ZTF' },
              { name: 'pip', desc: 'Python package manager' },
              { name: 'git', desc: 'For cloning the repository' },
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
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-300">{req.name}</p>
                    <p className="text-xs text-gray-500">{check?.value || req.desc}</p>
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
            {checking ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {checking ? 'Checking...' : 'Run Prerequisites Check'}
          </button>
        </div>

        {/* Step 2: Install */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center">
              <Download size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Install ZeroTouch Framework</h3>
              <p className="text-xs text-gray-500">Clone repo and install Python dependencies</p>
            </div>
          </div>

          <div className="space-y-2 mb-4 text-sm text-gray-400">
            <p>This will:</p>
            <ul className="space-y-1 ml-4">
              <li className="flex items-center gap-2"><span className="text-nutanix-cyan">1.</span> Clone the ZTF repository from GitHub</li>
              <li className="flex items-center gap-2"><span className="text-nutanix-cyan">2.</span> Install required Python packages via pip</li>
              <li className="flex items-center gap-2"><span className="text-nutanix-cyan">3.</span> Verify the installation</li>
            </ul>
          </div>

          {ztfInstalled && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-nutanix-teal/10 border border-nutanix-teal/30 mb-4">
              <CheckCircle size={14} className="text-nutanix-teal" />
              <span className="text-sm text-nutanix-teal">ZTF is already installed</span>
            </div>
          )}

          <button
            onClick={runInstall}
            disabled={installing || checks.length === 0}
            className={clsx('btn-primary w-full justify-center', ztfInstalled && 'opacity-80')}
          >
            {installing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            {installing ? 'Installing...' : ztfInstalled ? 'Reinstall / Update' : 'Install Framework'}
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      {logs.length > 0 && (
        <div className="mt-6">
          <Terminal
            logs={logs}
            status={installStatus === 'running' ? 'running' : installStatus === 'done' ? 'done' : 'error'}
            title="Installation Output"
          />
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 card">
        <div className="flex items-center gap-3 mb-4">
          <TermIcon size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-100">Manual Installation</h3>
        </div>
        <p className="text-sm text-gray-400 mb-3">Alternatively, install manually in your terminal:</p>
        <div className="space-y-2">
          {[
            '# Clone the repository',
            'git clone https://github.com/nutanixdev/zerotouch-framework.git',
            '',
            '# Enter the directory',
            'cd zerotouch-framework',
            '',
            '# Install dependencies',
            'pip install -r requirements/requirements.txt',
          ].map((line, i) => (
            <div key={i} className={clsx(
              'font-mono text-xs',
              line.startsWith('#') ? 'text-gray-600' : line === '' ? '' : 'text-gray-300'
            )}>
              {line || ' '}
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-gray-400">
            After installation, go to{' '}
            <a href="/settings" className="text-nutanix-cyan hover:underline">Settings</a>{' '}
            to configure the ZTF installation path.
          </p>
        </div>
      </div>
    </Layout>
  )
}
