import { useEffect, useRef } from 'react'
import { X, Copy, CheckCircle, XCircle, Loader } from 'lucide-react'
import clsx from 'clsx'

interface LogLine {
  type: string
  data: string
  ts: number
}

interface TerminalProps {
  logs: LogLine[]
  status: 'running' | 'done' | 'error'
  title?: string
  onClose?: () => void
}

export default function Terminal({ logs, status, title, onClose }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const copyLogs = () => {
    const text = logs.map(l => l.data).join('')
    navigator.clipboard.writeText(text)
  }

  const logTextClass = (line: LogLine) => {
    if (line.type === 'step') return 'text-nutanix-cyan font-medium'
    if (line.type === 'done') return 'text-nutanix-teal'
    if (line.type === 'start') return 'text-gray-500'
    if (line.type === 'log') return 'text-blue-400'

    const text = String(line.data || '').replace(/\x1b\[[0-9;]*m/g, '').toUpperCase()
    const hasErrorSignal = /\[(ERROR|CRITICAL|FATAL)\]/.test(text)
      || /\b(ERROR|CRITICAL|FATAL|TRACEBACK|EXCEPTION|FAILED)\b/.test(text)
    if (line.type === 'error' || hasErrorSignal) return 'text-red-400'
    if (/\[(WARNING|WARN)\]/.test(text) || /\b(WARNING|WARN)\b/.test(text)) return 'text-yellow-300'
    if (/\[(PASS|SUCCESS)\]/.test(text) || /\b(PASS|SUCCESS|COMPLETED)\b/.test(text)) return 'text-nutanix-teal'

    return 'text-gray-100'
  }

  return (
    <div className="flex flex-col bg-gray-950 rounded-xl border border-border overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-border">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/80" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <div className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-xs text-gray-500 font-mono">{title || 'ZTF Execution'}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <Loader size={12} className="animate-spin" />
              <span>Running...</span>
            </div>
          )}
          {status === 'done' && (
            <div className="flex items-center gap-1.5 text-xs text-nutanix-teal">
              <CheckCircle size={12} />
              <span>Completed</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <XCircle size={12} />
              <span>Failed</span>
            </div>
          )}
          <button onClick={copyLogs} className="btn-ghost p-1" title="Copy logs">
            <Copy size={13} />
          </button>
          {onClose && (
            <button onClick={onClose} className="btn-ghost p-1">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs min-h-64 max-h-96 leading-relaxed">
        {logs.length === 0 && status === 'running' && (
          <span className="text-gray-500 cursor-blink">Initializing</span>
        )}
        {logs.map((line, i) => (
          <div key={i} className={clsx(
            'whitespace-pre-wrap break-all',
            logTextClass(line)
          )}>
            {line.type === 'step' && '▶ '}
            {line.type === 'done' && '✓ '}
            {line.type === 'error' && '✗ '}
            {line.type === 'start' ? `$ ${typeof line.data === 'object' ? (line.data as { command: string }).command : line.data}` : line.data}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
