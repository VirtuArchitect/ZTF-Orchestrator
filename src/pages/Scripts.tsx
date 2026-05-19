import { useState } from 'react'
import { Search, Play, Terminal, ChevronRight } from 'lucide-react'
import Layout from '../components/Layout'
import { SCRIPTS, SCRIPT_CATEGORIES } from '../data'
import Terminal_component from '../components/Terminal'
import clsx from 'clsx'
import { apiFetch } from '../utils/api'

interface LogLine { type: string; data: string; ts: number }

const CATEGORY_COLORS: Record<string, string> = {
  'Authentication': 'badge-purple',
  'Networking': 'badge-blue',
  'Storage': 'badge-yellow',
  'Compute': 'badge-green',
  'Images': 'badge-gray',
  'Security': 'badge-red',
  'Kubernetes': 'badge-blue',
  'Database': 'badge-yellow',
  'Services': 'badge-green',
  'Prism Central': 'badge-blue',
  'Prism Element': 'badge-purple',
  'System': 'badge-gray',
}

export default function Scripts() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState<string | null>(null)
  const [configContent, setConfigContent] = useState('')
  const [logs, setLogs] = useState<LogLine[]>([])
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  const filtered = SCRIPTS.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || s.category === category
    return matchSearch && matchCat
  })

  const selectedScript = SCRIPTS.find(s => s.id === selected)

  const runScript = async () => {
    if (!selected) return
    setRunStatus('running')
    setLogs([])

    const resp = await apiFetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        script: selected,
        configContent,
        configFile: `${selected}-${Date.now()}.yml`,
      }),
    })

    if (!resp.body) { setRunStatus('error'); return }

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
            setLogs(prev => [...prev, { type: evt.type, data: typeof evt.data === 'string' ? evt.data : JSON.stringify(evt.data), ts: Date.now() }])
            if (evt.type === 'done') setRunStatus(evt.data?.status === 'success' ? 'done' : 'error')
            if (evt.type === 'error') setRunStatus('error')
          } catch { /* ignore */ }
        }
      }
    }
  }

  return (
    <Layout title="Script Library" subtitle="Browse and run individual ZTF scripts">
      <div className="flex gap-6 h-full">
        {/* Left: Script List */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9"
              placeholder="Search scripts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Category filter */}
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

          {/* Script list */}
          <div className="flex-1 overflow-y-auto space-y-1 rounded-xl border border-border bg-surface p-2">
            <p className="text-xs text-gray-600 px-2 py-1">{filtered.length} scripts</p>
            {filtered.map(script => (
              <button
                key={script.id}
                onClick={() => { setSelected(script.id); setLogs([]); setRunStatus('idle') }}
                className={clsx(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-all group',
                  selected === script.id
                    ? 'bg-nutanix-blue/20 border border-nutanix-blue/30'
                    : 'hover:bg-surface-elevated'
                )}
              >
                <div className="flex items-center gap-2">
                  <Terminal size={12} className="text-gray-500 flex-shrink-0" />
                  <span className="text-sm text-gray-300 flex-1 truncate font-medium">{script.name}</span>
                  <ChevronRight size={12} className="text-gray-600 group-hover:text-gray-400" />
                </div>
                <span className={clsx('badge text-xs mt-1', CATEGORY_COLORS[script.category] || 'badge-gray')}>
                  {script.category}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: Script Detail */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {selectedScript ? (
            <>
              <div className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx('badge', CATEGORY_COLORS[selectedScript.category] || 'badge-gray')}>
                        {selectedScript.category}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-100">{selectedScript.name}</h2>
                    <p className="text-sm text-gray-400 mt-1">{selectedScript.description}</p>
                    <div className="mt-3">
                      <span className="text-xs font-mono text-gray-500 bg-gray-900 px-2 py-1 rounded">
                        --script {selectedScript.id}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={runScript}
                    disabled={runStatus === 'running'}
                    className="btn-success flex-shrink-0"
                  >
                    <Play size={14} />
                    {runStatus === 'running' ? 'Running...' : 'Run Script'}
                  </button>
                </div>
              </div>

              {/* Config input */}
              <div className="card flex-1">
                <label className="label mb-2">Configuration File Content (YAML/JSON)</label>
                <textarea
                  className="input font-mono text-xs resize-none h-48"
                  value={configContent}
                  onChange={e => setConfigContent(e.target.value)}
                  placeholder={`# Enter YAML configuration for ${selectedScript.id}\n# Required fields depend on the script schema\n\ncluster_ip: 10.0.0.1\npe_credential: pe_user`}
                />
                <div className="mt-2 p-3 rounded-lg bg-blue-900/10 border border-blue-700/20">
                  <p className="text-xs text-blue-300">
                    This config is saved and passed as <code className="font-mono bg-blue-900/30 px-1 rounded">-f config.yml</code> to the ZTF script.
                    Leave empty to use an existing config file.
                  </p>
                </div>
              </div>

              {/* Terminal */}
              {(logs.length > 0 || runStatus === 'running') && (
                <Terminal_component
                  logs={logs}
                  status={runStatus === 'running' ? 'running' : runStatus === 'done' ? 'done' : 'error'}
                  title={`--script ${selectedScript.id}`}
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Terminal size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">Select a script</p>
                <p className="text-sm mt-1">Choose a script from the list to configure and run it</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
