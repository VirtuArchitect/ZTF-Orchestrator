import { useEffect, useRef } from 'react'
import { X, Play } from 'lucide-react'
import Terminal from './Terminal'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'

interface ExecutionModalProps {
  onClose: () => void
  workflow: string
  configContent: string
  configFile: string
  extraParams?: Record<string, string>
}

export default function ExecutionModal({ onClose, workflow, configContent, configFile, extraParams }: ExecutionModalProps) {
  const { runningExecution, startExecution, appendLog, finishExecution, addExecution } = useStore()
  const evtSourceRef = useRef<EventSource | null>(null)

  const execute = async () => {
    const id = Date.now().toString()
    startExecution(id, workflow)

    const body = {
      workflow,
      configContent,
      configFile,
      ...extraParams,
    }

    const resp = await apiFetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.body) return

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
            const event = JSON.parse(line.slice(6))
            appendLog(event.type, typeof event.data === 'string' ? event.data : JSON.stringify(event.data))

            if (event.type === 'done') {
              const status = event.data?.status === 'success' ? 'done' : 'error'
              finishExecution(status)
              addExecution({
                id: event.executionId || id,
                workflow,
                type: 'workflow',
                command: '',
                status: event.data?.status || 'failed',
                duration: event.data?.duration,
                timestamp: new Date().toISOString(),
                configFile,
              })
            } else if (event.type === 'error') {
              finishExecution('error')
            }
          } catch { /* ignore */ }
        }
      }
    }
  }

  useEffect(() => {
    execute()
    return () => {
      evtSourceRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-3xl bg-gray-950 rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 flex items-center justify-center">
              <Play size={14} className="text-nutanix-cyan" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">Running: {workflow}</h3>
              <p className="text-xs text-gray-500">{configFile}</p>
            </div>
          </div>
          {runningExecution?.status !== 'running' && (
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-4">
          {runningExecution && (
            <Terminal
              logs={runningExecution.logs}
              status={runningExecution.status}
              title={`python main.py --workflow ${workflow}`}
            />
          )}
        </div>
        {runningExecution?.status !== 'running' && (
          <div className="px-6 pb-4 flex justify-end">
            <button onClick={onClose} className="btn-secondary">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
