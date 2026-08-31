import { useState } from 'react'
import {
  Search, Play, Terminal, ChevronRight,
  Plus, X, ChevronUp, ChevronDown, ListChecks,
} from 'lucide-react'
import Layout from '../components/Layout'
import { SCRIPTS, SCRIPT_CATEGORIES } from '../data'
import Terminal_component from '../components/Terminal'
import ScriptConfigWizard from '../components/ScriptConfigWizard'
import { SCRIPT_CONFIG_SCHEMAS } from '../scriptConfigSchemas'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface LogLine { type: string; data: string; ts: number }
interface ScriptProgress { phase: string; percent: number; detail: string; estimated: boolean }

const CATEGORY_COLORS: Record<string, string> = {
  'Authentication': 'badge-purple',
  'Networking':     'badge-blue',
  'Storage':        'badge-yellow',
  'Compute':        'badge-green',
  'Images':         'badge-gray',
  'Security':       'badge-red',
  'Kubernetes':     'badge-blue',
  'Database':       'badge-yellow',
  'Services':       'badge-green',
  'Prism Central':  'badge-blue',
  'Prism Element':  'badge-purple',
  'System':         'badge-gray',
}

export default function Scripts() {
  const [search,        setSearch]        = useState('')
  const [category,      setCategory]      = useState('All')
  const [queue,         setQueue]         = useState<string[]>([])   // ordered script IDs
  const [configContent, setConfigContent] = useState('')
  const [logs,          setLogs]          = useState<LogLine[]>([])
  const [runStatus,     setRunStatus]     = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [runTitle,      setRunTitle]      = useState('')
  const [runCommand,    setRunCommand]    = useState('')
  const [progress,      setProgress]      = useState<ScriptProgress>({
    phase: 'Queued',
    percent: 0,
    detail: 'Waiting to start script execution',
    estimated: true,
  })

  const filtered = SCRIPTS.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || s.category === category
    return matchSearch && matchCat
  })

  // ── Queue helpers ─────────────────────────────────────────────────────────
  const toggleQueue = (id: string) =>
    setQueue(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])

  const removeFromQueue = (id: string) =>
    setQueue(prev => prev.filter(s => s !== id))

  const moveInQueue = (idx: number, dir: -1 | 1) =>
    setQueue(prev => {
      const next = [...prev]
      const tmp  = next[idx + dir]
      next[idx + dir] = next[idx]
      next[idx]       = tmp
      return next
    })

  // ── Run ───────────────────────────────────────────────────────────────────
  const runScripts = async () => {
    if (!queue.length) return
    const selectedQueue = [...queue]
    const destructive = selectedQueue.filter(id => SCRIPT_CONFIG_SCHEMAS[id]?.riskLevel === 'destructive')
    const confirmationPhrase = destructive.length ? `RUN ${destructive.join(',')}` : ''
    if (destructive.length) {
      const entered = window.prompt(`Destructive action confirmation required.\n\nScripts: ${destructive.join(', ')}\nType exactly: ${confirmationPhrase}`)
      if (entered !== confirmationPhrase) return
    }
    const nextCommand = `python main.py --script ${selectedQueue.join(',')}`
    setRunTitle(selectedQueue.length === 1
      ? SCRIPTS.find(s => s.id === selectedQueue[0])?.name ?? selectedQueue[0]
      : `${selectedQueue.length} scripts`)
    setRunCommand(nextCommand)
    setRunStatus('running')
    setLogs([])
    setProgress({
      phase: 'Queued',
      percent: 0,
      detail: 'Waiting for execution stream',
      estimated: true,
    })

    const resp = await apiFetch('/api/execute', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script:        selectedQueue,          // pass as array; server joins to A,B,C
        configContent,
        configFile:    `multi-script-${Date.now()}.yml`,
        ...(destructive.length ? {
          riskAcknowledged: true,
          destructiveConfirmation: confirmationPhrase,
        } : {}),
      }),
    })

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      const message = data.error || 'Script execution request failed'
      setLogs(prev => [...prev, { type: 'error', data: message, ts: Date.now() }])
      setProgress({
        phase: 'Failed',
        percent: 100,
        detail: message,
        estimated: true,
      })
      setRunStatus('error')
      return
    }

    if (!resp.body) {
      setProgress({
        phase: 'Failed',
        percent: 100,
        detail: 'Script execution stream was not available',
        estimated: true,
      })
      setRunStatus('error')
      return
    }

    const reader  = resp.body.getReader()
    const decoder = new TextDecoder()
    let   buffer  = ''

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
          setLogs(prev => [...prev, {
            type: evt.type,
            data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data),
            ts:   Date.now(),
          }])
          if (evt.type === 'job' && evt.data?.progress) {
            setProgress(evt.data.progress)
          }
          if (evt.type === 'done')  setRunStatus(evt.data?.status === 'success' ? 'done' : 'error')
          if (evt.type === 'done') {
            setProgress({
              phase: evt.data?.status === 'success' ? 'Completed' : 'Failed',
              percent: 100,
              detail: evt.data?.status === 'success'
                ? 'Script queue finished'
                : 'Script queue ended with an error; review the output',
              estimated: true,
            })
          }
          if (evt.type === 'error') {
            setProgress({
              phase: 'Failed',
              percent: 100,
              detail: typeof evt.data === 'string' ? evt.data : 'Script execution failed',
              estimated: true,
            })
            setRunStatus('error')
          }
        } catch { /* ignore */ }
      }
    }
  }

  const scriptLabel = queue.length === 1
    ? SCRIPTS.find(s => s.id === queue[0])?.name ?? queue[0]
    : `${queue.length} scripts`

  return (
    <Layout
      title="Scripts 1.x"
      subtitle="Browse and run individual ZTF 1.x scripts — select multiple to run in sequence"
    >
      <div className="flex gap-6 h-full">

        {/* ── Left: list ─────────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9"
              placeholder="Search scripts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {['All', ...SCRIPT_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={clsx(
                  'px-2 py-1 rounded text-xs font-medium transition-all',
                  category === cat
                    ? 'bg-nutanix-blue text-white'
                    : 'bg-surface border border-border text-gray-500 hover:text-gray-300'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 rounded-xl border border-border bg-surface p-2">
            <p className="text-xs text-gray-600 px-2 py-1">{filtered.length} scripts</p>
            {filtered.map(script => {
              const inQueue   = queue.includes(script.id)
              const queuePos  = queue.indexOf(script.id) + 1
              return (
                <button
                  key={script.id}
                  onClick={() => { toggleQueue(script.id); setLogs([]); setRunStatus('idle') }}
                  className={clsx(
                    'w-full text-left px-3 py-2.5 rounded-lg transition-all group',
                    inQueue
                      ? 'bg-nutanix-blue/20 border border-nutanix-blue/30'
                      : 'hover:bg-surface-elevated'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Terminal size={12} className="text-gray-500 flex-shrink-0" />
                    <span className="text-sm text-gray-300 flex-1 truncate font-medium">{script.name}</span>
                    {inQueue
                      ? <span className="w-5 h-5 rounded-full bg-nutanix-blue flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">{queuePos}</span>
                      : <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400" />
                    }
                  </div>
                  <span className={clsx('badge text-xs mt-1', CATEGORY_COLORS[script.category] || 'badge-gray')}>
                    {script.category}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Right: queue + config + terminal ──────────────────────────── */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {queue.length > 0 ? (
            <>
              {/* Queue panel */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-100 flex items-center gap-2 text-sm">
                    <ListChecks size={15} className="text-nutanix-cyan" />
                    Script Queue
                    <span className="text-xs text-gray-500 font-mono">
                      --script {queue.join(',')}
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setQueue([])}
                      className="btn-ghost text-xs gap-1 text-gray-500 hover:text-red-400"
                    >
                      <X size={12} /> Clear
                    </button>
                    <button
                      onClick={runScripts}
                      disabled={runStatus === 'running'}
                      className="btn-success gap-1.5"
                    >
                      <Play size={14} />
                      {runStatus === 'running' ? 'Running…' : `Run ${scriptLabel}`}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {queue.map((id, idx) => {
                    const s = SCRIPTS.find(sc => sc.id === id)
                    return (
                      <div key={id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border">
                        <span className="w-5 h-5 rounded-full bg-nutanix-blue/30 flex items-center justify-center text-[10px] text-nutanix-cyan font-bold flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-300 font-medium truncate">{s?.name ?? id}</p>
                          <p className="text-xs text-gray-500 font-mono truncate">{id}</p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => moveInQueue(idx, -1)} disabled={idx === 0}
                            className="btn-ghost p-0.5 disabled:opacity-20"><ChevronUp size={12} /></button>
                          <button onClick={() => moveInQueue(idx, 1)} disabled={idx === queue.length - 1}
                            className="btn-ghost p-0.5 disabled:opacity-20"><ChevronDown size={12} /></button>
                        </div>
                        <button onClick={() => removeFromQueue(id)}
                          className="btn-ghost p-1 text-gray-600 hover:text-red-400">
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>

                <p className="text-xs text-gray-600 mt-3">
                  Scripts run sequentially in the order shown. Click a script in the list to add or remove it.
                </p>
              </div>

              {/* Config input */}
              <div className="card flex-1">
                <label className="label mb-2">Shared Configuration (YAML/JSON) — optional</label>
                <div className="mb-3">
                  <ScriptConfigWizard scriptIds={queue} onGenerate={setConfigContent} />
                </div>
                <textarea
                  className="input font-mono text-xs resize-none h-40"
                  value={configContent}
                  onChange={e => setConfigContent(e.target.value)}
                  placeholder={`# Shared config passed to all scripts with -f\n\ncluster_ip: 10.0.0.1\npe_credential: pe_user`}
                />
                <div className="mt-2 p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
                  <p className="text-xs text-blue-300">
                    One config file is shared across all scripts in the queue. Leave empty to run without a config file.
                  </p>
                </div>
              </div>

              {runStatus !== 'idle' && (
                <ScriptExecutionModal
                  command={runCommand}
                  logs={logs}
                  progress={progress}
                  status={runStatus === 'running' ? 'running' : runStatus === 'done' ? 'done' : 'error'}
                  title={runTitle}
                  onClose={() => runStatus !== 'running' && setRunStatus('idle')}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <ListChecks size={40} className="mx-auto mb-3 opacity-20 text-nutanix-cyan" />
                <p className="text-lg font-medium">No scripts selected</p>
                <p className="text-sm mt-1">
                  Click scripts in the list to add them to the queue
                </p>
                <p className="text-xs mt-2 text-gray-600">
                  Select multiple scripts to run them in sequence as <span className="font-mono">--script A,B,C</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

function ScriptExecutionModal({
  command,
  logs,
  onClose,
  progress,
  status,
  title,
}: {
  command: string
  logs: LogLine[]
  onClose: () => void
  progress: ScriptProgress
  status: 'running' | 'done' | 'error'
  title: string
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-3xl max-h-[calc(100vh-3rem)] bg-gray-950 rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 flex items-center justify-center flex-shrink-0">
              <Play size={14} className="text-nutanix-cyan" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-100 truncate">
                {status === 'running' ? 'Running: ' : 'Script Run: '}{title}
              </h3>
              <p className="text-xs text-gray-500 font-mono truncate">{command}</p>
            </div>
          </div>
          {status !== 'running' && (
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-4 min-h-0 overflow-hidden">
          <ScriptProgressPanel progress={progress} />
          <Terminal_component
            logs={logs}
            status={status}
            title={command || 'python main.py --script'}
            statusLabel={status === 'running' ? 'Running...' : status === 'done' ? 'Completed' : 'Failed'}
            bodyClassName="min-h-[26rem] max-h-[60vh]"
          />
        </div>
        {status !== 'running' && (
          <div className="px-6 pb-4 flex justify-end">
            <button onClick={onClose} className="btn-secondary">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ScriptProgressPanel({ progress }: { progress: ScriptProgress }) {
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
  return (
    <div className="mb-4 rounded-lg border border-border bg-surface/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-gray-200">{progress.phase || 'Preparing script execution'}</span>
        <span className="text-gray-500">{progress.estimated ? 'Estimated progress' : 'Progress'} - {percent}%</span>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-gray-900 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Estimated script execution progress"
      >
        <div className="h-full rounded-full bg-nutanix-cyan transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      {progress.detail && (
        <p className="mt-2 text-xs text-gray-500 break-words">{progress.detail}</p>
      )}
    </div>
  )
}
