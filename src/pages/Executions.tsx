import { useState, useEffect } from 'react'
import { Trash2, RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import Layout from '../components/Layout'
import type { Execution } from '../types'
import clsx from 'clsx'

export default function Executions() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all')

  const load = async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/executions')
      if (resp.ok) setExecutions(await resp.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const clear = async () => {
    if (!confirm('Clear all execution history?')) return
    await fetch('/api/executions', { method: 'DELETE' })
    setExecutions([])
  }

  const filtered = executions.filter(e => filter === 'all' || e.status === filter)

  return (
    <Layout
      title="Execution History"
      subtitle="View and manage past workflow and script runs"
      actions={
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary gap-1.5">
            <RefreshCw size={13} />
            Refresh
          </button>
          {executions.length > 0 && (
            <button onClick={clear} className="btn-danger gap-1.5">
              <Trash2 size={13} />
              Clear All
            </button>
          )}
        </div>
      }
    >
      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['all', 'success', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize',
              filter === f
                ? 'bg-nutanix-blue text-white'
                : 'bg-surface border border-border text-gray-400 hover:text-gray-200'
            )}
          >
            {f} ({f === 'all' ? executions.length : executions.filter(e => e.status === f).length})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Loading...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Terminal size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No executions found</p>
          <p className="text-sm mt-1">Run a workflow or script to see history here</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(exec => (
          <div key={exec.id} className="card p-0 overflow-hidden">
            <button
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface-elevated/50 transition-colors text-left"
              onClick={() => setExpanded(expanded === exec.id ? null : exec.id)}
            >
              <StatusIcon status={exec.status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-100">{exec.workflow}</span>
                  <span className={clsx(
                    'badge text-xs',
                    exec.type === 'workflow' ? 'badge-blue' : 'badge-purple'
                  )}>
                    {exec.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">{new Date(exec.timestamp).toLocaleString()}</span>
                  {exec.duration && (
                    <span className="text-xs text-gray-600 flex items-center gap-1">
                      <Clock size={10} />
                      {(exec.duration / 1000).toFixed(1)}s
                    </span>
                  )}
                  {exec.configFile && (
                    <span className="text-xs font-mono text-gray-600 truncate">{exec.configFile}</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                {expanded === exec.id ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
              </div>
            </button>

            {expanded === exec.id && exec.command && (
              <div className="px-5 pb-4 border-t border-border">
                <p className="text-xs text-gray-500 mb-2 mt-3">Command:</p>
                <div className="bg-gray-950 rounded-lg p-3 font-mono text-xs text-gray-300 break-all">
                  {exec.command}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Layout>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle size={18} className="text-nutanix-teal flex-shrink-0" />
  if (status === 'failed') return <XCircle size={18} className="text-red-400 flex-shrink-0" />
  return <Clock size={18} className="text-yellow-400 flex-shrink-0 animate-pulse" />
}
