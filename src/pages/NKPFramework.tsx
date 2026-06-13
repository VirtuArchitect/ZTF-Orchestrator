import { useEffect, useMemo, useState } from 'react'
import { CheckCircle, Download, Loader, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import Terminal from '../components/Terminal'
import { apiFetch } from '../utils/api'
import clsx from 'clsx'

interface LogLine { type: string; data: string; ts: number }

interface NkpStatus {
  installed: boolean
  path: string
  repoUrl: string
  script: string
  safePhases: string[]
  configs: string[]
}

const PHASES = [
  { id: 'validate', label: 'Validate', hint: 'Schema, bundle, endpoint, and tool checks' },
  { id: 'prepare', label: 'Prepare', hint: 'Stage NKP tools and workspace metadata' },
  { id: 'generate', label: 'Generate', hint: 'Create cluster values, env, and deploy helper files' },
  { id: 'registry', label: 'Registry Plan', hint: 'Generate private registry plan only' },
  { id: 'deploy', label: 'Deploy Plan', hint: 'Generate dry-run deployment plan only' },
  { id: 'verify', label: 'Verify', hint: 'Collect local state and kubeconfig-based checks when available' },
  { id: 'runs', label: 'Runs', hint: 'Summarise NKP ZeroTouch run artifacts' },
]

export default function NKPFramework() {
  const [status, setStatus] = useState<NkpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [installStatus, setInstallStatus] = useState<'running' | 'done' | 'error'>('running')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [phase, setPhase] = useState('validate')
  const [configFile, setConfigFile] = useState('')
  const [configContent, setConfigContent] = useState('')
  const [strict, setStrict] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  const safePhases = useMemo(() => new Set(status?.safePhases || []), [status])

  const appendLog = (type: string, data: string) =>
    setLogs(prev => [...prev, { type, data, ts: Date.now() }])

  const loadStatus = async () => {
    setLoading(true)
    try {
      const resp = await apiFetch('/api/nkp/status')
      if (resp.ok) {
        const data = await resp.json()
        setStatus(data)
        if (!configFile && data.configs?.length) setConfigFile(data.configs[0])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStatus() }, [])

  const runInstall = async () => {
    setInstalling(true)
    setInstallStatus('running')
    setLogs([])
    setMessage('')
    try {
      const resp = await apiFetch('/api/nkp/install', { method: 'POST' })
      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({}))
        appendLog('error', err.error || `Server returned ${resp.status}`)
        setInstallStatus('error')
        return
      }

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
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            appendLog(evt.type, typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data))
            if (evt.type === 'done') setInstallStatus('done')
            if (evt.type === 'error') setInstallStatus('error')
          } catch { /* ignore malformed SSE line */ }
        }
      }
      setInstallStatus(prev => prev === 'error' ? 'error' : 'done')
      await loadStatus()
    } catch {
      appendLog('error', 'Could not reach the server.')
      setInstallStatus('error')
    } finally {
      setInstalling(false)
    }
  }

  const submitJob = async () => {
    setSubmitting(true)
    setMessage('')
    try {
      const resp = await apiFetch('/api/nkp/jobs', {
        method: 'POST',
        body: JSON.stringify({
          phase,
          configFile,
          configContent,
          strict,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setMessage(data.error || `Server returned ${resp.status}`)
        return
      }
      setMessage(`Submitted NKP ${phase} job ${data.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout
      title="NKP Framework"
      subtitle="Safe-phase orchestration for VirtuArchitect/nkp-zerotouch-framework"
      actions={
        <button onClick={loadStatus} disabled={loading} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
          <div className="card">
            <div className="flex items-start gap-3">
              <div className={clsx(
                'w-9 h-9 rounded-lg border flex items-center justify-center',
                status?.installed
                  ? 'bg-nutanix-teal/10 border-nutanix-teal/30 text-nutanix-teal'
                  : 'bg-amber-900/20 border-amber-700/30 text-amber-400'
              )}>
                {status?.installed ? <CheckCircle size={18} /> : <XCircle size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-gray-100">NKP ZeroTouch Framework</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {status?.installed ? 'Installed and ready for safe phases' : 'Install or point Settings at a cloned NKP framework'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm">
              <ReadOnly label="Path" value={status?.path || 'loading'} />
              <ReadOnly label="Script" value={status?.script || 'not found'} />
              <ReadOnly label="Repository" value={status?.repoUrl || ''} />
            </div>

            <button onClick={runInstall} disabled={installing} className="btn-primary w-full justify-center mt-5 gap-1.5">
              {installing ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              {status?.installed ? 'Reinstall / Update NKP Framework' : 'Install NKP Framework'}
            </button>
          </div>

          <div className="card">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 text-nutanix-cyan flex items-center justify-center">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="font-semibold text-gray-100">Safe Phase Launcher</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Apply, upgrade, registry push, and destroy actions are intentionally blocked in this release.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
              <div>
                <label className="label">Phase</label>
                <select className="input" value={phase} onChange={e => setPhase(e.target.value)}>
                  {PHASES.map(item => (
                    <option key={item.id} value={item.id} disabled={!safePhases.has(item.id)}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {PHASES.find(item => item.id === phase)?.hint}
                </p>
              </div>

              <div>
                <label className="label">Config File</label>
                <input
                  className="input font-mono"
                  value={configFile}
                  onChange={e => setConfigFile(e.target.value)}
                  placeholder="connected.example.yaml or nkp-lab.yaml"
                  list="nkp-configs"
                />
                <datalist id="nkp-configs">
                  {status?.configs.map(item => <option key={item} value={item} />)}
                </datalist>
                <p className="text-xs text-gray-500 mt-2">
                  Use an existing config file, or paste YAML below to save it before execution.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="label">Optional YAML Content</label>
              <textarea
                className="input font-mono min-h-48"
                value={configContent}
                onChange={e => setConfigContent(e.target.value)}
                placeholder="# Paste NKP environment YAML here to save/update the selected config file"
              />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />
                Strict validation
              </label>
              <div className="flex items-center gap-2">
                {message && (
                  <span className={clsx('text-sm', message.startsWith('Submitted') ? 'text-nutanix-teal' : 'text-red-300')}>
                    {message}
                  </span>
                )}
                {message.startsWith('Submitted') && (
                  <Link to="/jobs" className="btn-secondary text-sm">View Jobs</Link>
                )}
                <button onClick={submitJob} disabled={submitting || !status?.installed} className="btn-primary gap-1.5">
                  {submitting ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
                  Submit Phase
                </button>
              </div>
            </div>
          </div>
        </div>

        {logs.length > 0 && (
          <Terminal logs={logs} status={installStatus} title="NKP Framework Installation Output" />
        )}
      </div>
    </Layout>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 rounded-md border border-border bg-gray-950 px-3 py-2 font-mono text-xs text-gray-300 break-all">
        {value || 'not configured'}
      </div>
    </div>
  )
}
