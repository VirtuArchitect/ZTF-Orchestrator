import { useEffect, useRef, useState } from 'react'
import { X, Play } from 'lucide-react'
import Terminal from './Terminal'
import { useStore } from '../store'
import { apiFetch } from '../utils/api'
import type { ExecutionProgress } from '../types'

interface ExecutionModalProps {
  onClose: () => void
  workflow: string
  configContent: string
  configFile: string
  extraParams?: Record<string, string>
  dryRun?: boolean
}

export default function ExecutionModal({ onClose, workflow, configContent, configFile, extraParams, dryRun }: ExecutionModalProps) {
  const { runningExecution, startExecution, appendLog, finishExecution, addExecution } = useStore()
  const evtSourceRef = useRef<EventSource | null>(null)
  const [progress, setProgress] = useState<ExecutionProgress>({
    phase: dryRun ? 'Running pre-flight checks' : 'Queued',
    percent: dryRun ? 20 : 0,
    detail: dryRun ? 'No changes will be made' : 'Waiting for execution worker',
    estimated: true,
  })

  const execute = async () => {
    const id = Date.now().toString()
    startExecution(id, workflow)

    const body = {
      workflow,
      configContent,
      configFile,
      ...(dryRun ? { dryRun: true } : {}),
      ...extraParams,
    }

    const resp = await apiFetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}))
      const message = data.error || 'Execution request failed'
      appendLog('error', message)
      setProgress({
        phase: 'Failed',
        percent: 100,
        detail: message,
        estimated: true,
      })
      finishExecution('error')
      return
    }

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

            if (event.type === 'job' && event.data?.progress) {
              setProgress(event.data.progress)
            } else if (event.type === 'done') {
              appendLog(event.type, typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
              const status = event.data?.status === 'success' ? 'done' : 'error'
              setProgress({
                phase: event.data?.status === 'success' ? 'Completed' : 'Failed',
                percent: 100,
                detail: event.data?.status === 'success'
                  ? 'Execution finished successfully'
                  : 'Execution ended with an error; review the output',
                estimated: true,
              })
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
              appendLog(event.type, typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
              setProgress({
                phase: 'Failed',
                percent: 100,
                detail: typeof event.data === 'string' ? event.data : 'Execution failed',
                estimated: true,
              })
              finishExecution('error')
            } else {
              appendLog(event.type, typeof event.data === 'string' ? event.data : JSON.stringify(event.data))
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
              <h3 className="font-semibold text-gray-100">
                {dryRun ? 'Dry Run: ' : 'Running: '}{workflow}
              </h3>
              <p className="text-xs text-gray-500">{dryRun ? 'Pre-flight checks — no changes will be made' : configFile}</p>
            </div>
          </div>
          {runningExecution?.status !== 'running' && (
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-4">
          <ProgressPanel progress={progress} />
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

function ProgressPanel({ progress }: { progress: ExecutionProgress }) {
  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0))
  return (
    <div className="mb-4 rounded-lg border border-border bg-surface/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-gray-200">{progress.phase || 'Preparing execution'}</span>
        <span className="text-gray-500">{progress.estimated ? 'Estimated progress' : 'Progress'} - {percent}%</span>
      </div>
      <div
        className="mt-2 h-2 rounded-full bg-gray-900 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Estimated execution progress"
      >
        <div className="h-full rounded-full bg-nutanix-cyan transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      {progress.detail && (
        <p className="mt-2 text-xs text-gray-500 break-words">{progress.detail}</p>
      )}
    </div>
  )
}
