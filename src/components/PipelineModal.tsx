import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, Clock, Loader, GitBranch } from 'lucide-react'
import { useInitialPasswordSetupCapability } from './useInitialPasswordSetupCapability'
import Terminal from './Terminal'
import { apiFetch } from '../utils/api'
import { PASSWORD_SETUP_WORKFLOW, PASSWORD_SETUP_CONFIRMATION } from '../utils/initialPasswordSetup'
import type { Pipeline, PipelineStepResult } from '../types'
import clsx from 'clsx'
import { actionName } from '../startGuide'

interface LogLine { type: string; data: string; ts: number }

interface Props {
  pipeline: Pipeline
  onClose: () => void
}

export default function PipelineModal({ pipeline, onClose }: Props) {
  const setupSteps = pipeline.steps.filter(s => s.workflow === PASSWORD_SETUP_WORKFLOW)
  const needsSetup = setupSteps.length > 0
  const passwordCapability = useInitialPasswordSetupCapability(needsSetup)
  const [passwordSetupApprovalId, setPasswordSetupApprovalId] = useState('')
  const [passwordSetupConfirmation, setPasswordSetupConfirmation] = useState('')
  const [passwordSetupResumeRunId, setPasswordSetupResumeRunId] = useState('')
  const [setupRequest, setSetupRequest] = useState<Record<string, string> | null>(null)
  const [logs,        setLogs]        = useState<LogLine[]>([])
  const [stepResults, setStepResults] = useState<PipelineStepResult[]>(
    pipeline.steps.map((s, i) => ({ step: i, workflow: s.workflow, configFile: s.configFile, status: 'running' as const }))
  )
  const [activeStep,  setActiveStep]  = useState(0)
  const [status,      setStatus]      = useState<'running' | 'success' | 'failed'>('running')

  useEffect(() => {
    if (needsSetup && !setupRequest) return
    let cancelled = false

    const appendLog = (type: string, data: string) => {
      if (cancelled) return
      setLogs(prev => [...prev, { type, data, ts: Date.now() }])
    }

    const run = async () => {
      const privilegedScripts = [...new Set(pipeline.steps.map(step => step.workflow)
        .filter(id => ['ChangeDefaultAdminPasswordPe', 'CreateLocalUsersPe'].includes(id)))]
      const needsConfirmation = privilegedScripts.length > 0
      const phrase = `RUN ${privilegedScripts.join(',')}`
      if (needsConfirmation && window.prompt(`This pipeline changes Prism Element administrative access. Type exactly: ${phrase}`) !== phrase) {
        setStatus('failed')
        appendLog('stderr', 'PE administration cancelled before execution.')
        return
      }
      const resp = await apiFetch(`/api/pipelines/${pipeline.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(needsConfirmation ? { riskAcknowledged: true, destructiveConfirmation: phrase } : {}), ...(setupRequest || {}) }),
      })
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}))
        appendLog('stderr', error.error || 'Pipeline execution request failed')
        setStatus('failed')
        return
      }
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
              appendLog('system', `─── Step ${data.step + 1}/${pipeline.steps.length}: ${data.configFile || pipeline.steps[data.step]?.configFile || actionName(data.workflow)} (${actionName(data.workflow)}) ───`)
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

    void run().catch(() => { if (!cancelled) { appendLog('stderr', 'Pipeline request failed. Review server state before retrying.'); setStatus('failed') } })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupRequest])

  const done = status !== 'running'

  if (needsSetup && !setupRequest) return <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
    <section role="dialog" aria-label="Approve initial password setup pipeline" className="card w-full max-w-2xl space-y-4 max-h-[90vh] overflow-auto">
      <h3 className="font-semibold">Review initial password setup · {pipeline.name}</h3>
      <p>Live writes default off pending lab validation. Obtain a fresh approval for the exact saved YAML below. The server verifies content, approval scope and resume state, and preserves completed steps.</p>
      <p role="status">{passwordCapability.liveEnabled ? 'Server live-write flag enabled; hardware validation still required.' : 'Server live-write flag off or unavailable. Pipeline execution disabled.'}</p>
      <ul>{setupSteps.map((step, i) => <li key={i} className="font-mono break-all">{step.configFile || 'Missing saved YAML — choose a file before running'}</li>)}</ul>
      <label className="block">Password setup approval ID<input name="passwordSetupApprovalId" className="input w-full" value={passwordSetupApprovalId} onChange={e => setPasswordSetupApprovalId(e.target.value)} /></label>
      <label className="block">Password setup confirmation: {PASSWORD_SETUP_CONFIRMATION}<input aria-label="Password setup confirmation" name="passwordSetupConfirmation" className="input w-full" value={passwordSetupConfirmation} onChange={e => setPasswordSetupConfirmation(e.target.value)} /></label>
      <label className="block">Password setup resume run ID (optional)<input name="passwordSetupResumeRunId" className="input w-full" value={passwordSetupResumeRunId} onChange={e => setPasswordSetupResumeRunId(e.target.value)} /></label>
      <p className="text-sm text-amber-300">One initial password setup step per run is supported by this approval control. Review PE administrative-access confirmation separately when present.</p>
      <div className="flex gap-3"><button className="btn-primary" disabled={!passwordCapability.liveEnabled || setupSteps.length !== 1 || !setupSteps[0]?.configFile || !passwordSetupApprovalId.trim() || passwordSetupConfirmation !== PASSWORD_SETUP_CONFIRMATION} onClick={() => setSetupRequest({ passwordSetupApprovalId: passwordSetupApprovalId.trim(), passwordSetupConfirmation, ...(passwordSetupResumeRunId.trim() ? { passwordSetupResumeRunId: passwordSetupResumeRunId.trim() } : {}) })}>Run approved pipeline</button><button className="btn-secondary" onClick={onClose}>Cancel</button></div>
    </section>
  </div>

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
                {status === 'running' ? `Step ${activeStep + 1} of ${pipeline.steps.length} · ${pipeline.steps[activeStep]?.configFile || actionName(pipeline.steps[activeStep]?.workflow || '')}` :
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
                  <span title={`Action ID: ${step.workflow}`} className="max-w-xs whitespace-normal break-words">
                    <span className="block">{step.configFile || actionName(step.workflow)}</span>
                    {step.configFile && <span className="block text-xs opacity-75">{actionName(step.workflow)}</span>}
                  </span>
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
