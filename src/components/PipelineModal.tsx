import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, Clock, Loader, GitBranch } from 'lucide-react'
import Terminal from './Terminal'
import { apiFetch } from '../utils/api'
import type { Pipeline, PipelineStepResult } from '../types'
import clsx from 'clsx'

interface LogLine { type: string; data: string; ts: number }

interface Props {
  pipeline: Pipeline
  onClose: () => void
}

export default function PipelineModal({ pipeline, onClose }: Props) {
  const [logs,        setLogs]        = useState<LogLine[]>([])
  const [stepResults, setStepResults] = useState<PipelineStepResult[]>(
    pipeline.steps.map((s, i) => ({ step: i, workflow: s.workflow, configFile: s.configFile, status: 'running' as const }))
  )
  const [activeStep,  setActiveStep]  = useState(0)
  const [status,      setStatus]      = useState<'running' | 'success' | 'failed'>('running')

  useEffect(() => {
    let cancelled = false

    const appendLog = (type: string, data: string) => {
      if (cancelled) return
      setLogs(prev => [...prev, { type, data, ts: Date.now() }])
    }

    const run = async () => {
      const resp = await apiFetch(`/api/pipelines/${pipeline.id}/run`, { method: 'POST' })
      if (!resp.body) return

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done || cancelled) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            const { type, data } = event

            if (type === 'step_start') {
              setActiveStep(data.step)
              setStepResults(prev => prev.map((r, i) =>
                i === data.step ? { ...r, status: 'running' } : r
              ))
              appendLog('system', `─── Step ${data.step + 1}/${pipeline.steps.length}: ${data.workflow} ───`)
            } else if (type === 'step_complete') {
              setStepResults(prev => prev.map((r, i) =>
                i === data.step ? { ...r, status: data.status, returnCode: data.returnCode } : r
              ))
            } else if (type === 'step_skipped') {
              setStepResults(prev => prev.map((r, i) =>
                i === data.step ? { ...r, status: 'skipped' } : r
              ))
            } else if (type === 'pipeline_done') {
              setStatus(data.status === 'success' ? 'success' : 'failed')
            } else if (type === 'stdout' || type === 'stderr') {
              appendLog(type, typeof data === 'string' ? data : JSON.stringify(data))
            }
          } catch { /* ignore */ }
        }
      }
    }

    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = status !== 'running'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-6">
      <div className="w-full max-w-4xl bg-gray-950 rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-nutanix-blue/20 border border-nutanix-blue/30 flex items-center justify-center">
              <GitBranch size={14} className="text-nutanix-cyan" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-100">{pipeline.name}</h3>
              <p className="text-xs text-gray-500">
                {status === 'running' ? `Step ${activeStep + 1} of ${pipeline.steps.length}` :
                 status === 'success' ? 'Pipeline completed successfully' :
                 'Pipeline failed — subsequent steps skipped'}
              </p>
            </div>
          </div>
          {done && (
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Step progress rail */}
        <div className="flex items-center gap-0 px-6 py-4 border-b border-border flex-shrink-0 overflow-x-auto">
          {pipeline.steps.map((step, i) => {
            const result = stepResults[i]
            const isActive = i === activeStep && status === 'running'
            return (
              <div key={i} className="flex items-center flex-shrink-0">
                <div className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  result?.status === 'success' ? 'bg-nutanix-teal/10 text-nutanix-teal border border-nutanix-teal/30' :
                  result?.status === 'failed'  ? 'bg-red-900/20 text-red-400 border border-red-700/30' :
                  result?.status === 'skipped' ? 'bg-gray-800/50 text-gray-600 border border-border' :
                  isActive ? 'bg-nutanix-blue/20 text-nutanix-cyan border border-nutanix-blue/40' :
                  'bg-surface text-gray-500 border border-border'
                )}>
                  {result?.status === 'success' && <CheckCircle size={12} />}
                  {result?.status === 'failed'  && <XCircle     size={12} />}
                  {result?.status === 'skipped' && <Clock       size={12} />}
                  {isActive && <Loader size={12} className="animate-spin" />}
                  {result?.status !== 'success' && result?.status !== 'failed' &&
                   result?.status !== 'skipped' && !isActive &&
                   <Clock size={12} />}
                  <span className="max-w-28 truncate">{step.workflow}</span>
                </div>
                {i < pipeline.steps.length - 1 && (
                  <div className={clsx(
                    'w-6 h-px mx-1 flex-shrink-0',
                    result?.status === 'success' ? 'bg-nutanix-teal/50' : 'bg-border'
                  )} />
                )}
              </div>
            )
          })}
        </div>

        {/* Terminal */}
        <div className="flex-1 p-4 overflow-hidden min-h-0">
          <Terminal
            logs={logs}
            status={status === 'running' ? 'running' : status === 'success' ? 'done' : 'error'}
            title={`pipeline: ${pipeline.name}`}
          />
        </div>

        {done && (
          <div className="px-6 pb-4 flex justify-end flex-shrink-0">
            <button onClick={onClose} className="btn-secondary">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
