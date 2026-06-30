import { useState, useEffect } from 'react'
import { Shield, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react'
import Layout from '../components/Layout'
import { apiFetch } from '../utils/api'
import clsx from 'clsx'

interface LogEntry {
  ts:      string
  level:   string
  msg:     string
  event?:  string
  user?:   string
  ip?:     string
  action?: string
  method?: string
  path?:   string
  query?:  string
  workflow?: string
  status?: string
  [key: string]: unknown
}

const LEVEL_STYLE: Record<string, string> = {
  INFO:    'bg-blue-900/30 text-blue-300',
  WARNING: 'bg-yellow-900/30 text-yellow-300',
  ERROR:   'bg-red-900/30 text-red-400',
  DEBUG:   'bg-gray-800 text-gray-500',
}

const EVENT_FILTERS = [
  { id: 'OPERATIONS', label: 'Operations', action: '', includeHttp: false },
  { id: 'AUTH', label: 'Auth', action: 'login', includeHttp: false },
  { id: 'JOBS', label: 'Jobs', action: 'job', includeHttp: false },
  { id: 'GOVERNANCE', label: 'Governance', action: 'approval', includeHttp: false },
  { id: 'CONFIG', label: 'Config', action: 'config', includeHttp: false },
  { id: 'BACKUPS', label: 'Backups', action: 'backup', includeHttp: false },
  { id: 'SYSTEM', label: 'System', action: 'health', includeHttp: false },
  { id: 'HTTP', label: 'Raw HTTP', action: '', includeHttp: true },
] as const

type EventFilterId = typeof EVENT_FILTERS[number]['id']

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function describeEntry(entry: LogEntry) {
  const action = entry.action || entry.msg

  if (entry.event === 'http_request' || entry.method || entry.path) {
    const target = `${entry.method || ''} ${entry.path || ''}`.trim() || action
    return {
      title: target,
      detail: entry.query ? `Query: ${entry.query}` : 'HTTP request processed',
    }
  }

  if (entry.workflow) {
    const status = entry.status ? ` - ${entry.status}` : ''
    return {
      title: `${titleCase(entry.msg)}${status}`,
      detail: `Workflow: ${entry.workflow}`,
    }
  }

  if (entry.status) {
    return {
      title: `${titleCase(entry.msg)} - ${entry.status}`,
      detail: action !== entry.msg ? action : '',
    }
  }

  return {
    title: titleCase(entry.msg),
    detail: action !== entry.msg ? action : '',
  }
}

export default function AuditLog() {
  const [entries,   setEntries]   = useState<LogEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [levelFlt,  setLevelFlt]  = useState('ALL')
  const [eventFlt,  setEventFlt]  = useState<EventFilterId>('OPERATIONS')
  const [expanded,  setExpanded]  = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '500' })
      const eventFilter = EVENT_FILTERS.find(item => item.id === eventFlt) || EVENT_FILTERS[0]
      if (levelFlt !== 'ALL') params.set('level', levelFlt)
      if (!eventFilter.includeHttp) params.set('include_http', 'false')
      if (eventFilter.action) params.set('action', eventFilter.action)
      const resp = await apiFetch(`/api/audit-log?${params}`)
      if (resp.ok) {
        const data: LogEntry[] = await resp.json()
        setEntries(data.slice().reverse()) // newest first
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [levelFlt, eventFlt])

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      e.msg?.toLowerCase().includes(q) ||
      e.user?.toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q) ||
      e.event?.toLowerCase().includes(q) ||
      e.method?.toLowerCase().includes(q) ||
      e.path?.toLowerCase().includes(q) ||
      e.workflow?.toLowerCase().includes(q) ||
      e.ip?.includes(q)
    )
  })

  // Extra fields to show in expanded view (excluding already-shown ones)
  const extraKeys = (e: LogEntry) =>
    Object.entries(e).filter(([k]) =>
      !['ts', 'level', 'msg', 'logger', 'user', 'ip', 'status'].includes(k)
    )

  return (
    <Layout
      title="Audit Log"
      subtitle="Operational events by default; raw HTTP requests are available for debug review"
      actions={
        <button onClick={load} disabled={loading} className="btn-secondary gap-1.5">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      }
    >
      {/* Filters */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-1">
          {EVENT_FILTERS.map(item => (
            <button
              key={item.id}
              onClick={() => setEventFlt(item.id)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                eventFlt === item.id
                  ? item.id === 'HTTP'
                    ? 'bg-yellow-700 text-white'
                    : 'bg-nutanix-blue text-white'
                  : 'bg-surface border border-border text-gray-500 hover:text-gray-300'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9"
              placeholder="Search message, user, IP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {['ALL', 'INFO', 'WARNING', 'ERROR'].map(l => (
                <button
                  key={l}
                  onClick={() => setLevelFlt(l)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    levelFlt === l
                      ? 'bg-nutanix-blue text-white'
                      : 'bg-surface border border-border text-gray-500 hover:text-gray-300'
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-500">
              {filtered.length} entries
              {eventFlt !== 'HTTP' ? ' (raw HTTP hidden)' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 && !loading && (
        <div className="card text-center py-16">
          <Shield size={40} className="mx-auto mb-3 opacity-20 text-nutanix-cyan" />
          <p className="text-gray-500">
            {entries.length === 0
              ? 'No log entries found. Events are recorded once the server processes requests.'
              : 'No entries match the current filter.'}
          </p>
        </div>
      )}

      <div className="space-y-1">
            {filtered.map((entry, i) => {
              const isExpanded = expanded === i
              const extras = extraKeys(entry)
              const description = describeEntry(entry)
              return (
            <div
              key={i}
              className={clsx(
                'rounded-lg border transition-all',
                isExpanded ? 'border-nutanix-blue/30 bg-nutanix-blue/5' : 'border-border bg-surface hover:border-border-light'
              )}
            >
              {/* Main row */}
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(isExpanded ? null : i)}
              >
                {/* Timestamp */}
                <span className="text-xs text-gray-500 font-mono w-40 flex-shrink-0">
                  {new Date(entry.ts).toLocaleString()}
                </span>

                {/* Level badge */}
                <span className={clsx(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                  LEVEL_STYLE[entry.level] || LEVEL_STYLE.DEBUG
                )}>
                  {entry.level}
                </span>

                {/* Event summary */}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-200 font-semibold truncate">
                    {description.title}
                  </span>
                  {description.detail && (
                    <span className="block text-xs text-gray-500 truncate mt-0.5">
                      {description.detail}
                    </span>
                  )}
                </span>

                {/* User */}
                {entry.user && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {entry.user}
                  </span>
                )}

                {/* IP */}
                {entry.ip && (
                  <span className="text-xs text-gray-600 font-mono flex-shrink-0">
                    {entry.ip}
                  </span>
                )}

                {/* Status */}
                {entry.status && (
                  <span className={clsx(
                    'text-xs flex-shrink-0',
                    entry.status === 'success' ? 'text-nutanix-teal' : 'text-red-400'
                  )}>
                    {entry.status}
                  </span>
                )}

                {extras.length > 0 && (
                  isExpanded ? <ChevronUp size={13} className="text-gray-600 flex-shrink-0" />
                             : <ChevronDown size={13} className="text-gray-600 flex-shrink-0" />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && extras.length > 0 && (
                <div className="px-4 pb-3 border-t border-border/40">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                    {extras.map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2 text-xs">
                        <span className="text-gray-500 font-mono w-28 flex-shrink-0">{k}</span>
                        <span className="text-gray-300 font-mono break-all">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Layout>
  )
}
