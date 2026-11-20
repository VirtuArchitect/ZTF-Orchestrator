import { useEffect, useState } from 'react'
import type { ExecutionJob } from '../types'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { PASSWORD_SETUP_CONFIRMATION, PASSWORD_SETUP_WORKFLOW } from '../utils/initialPasswordSetup'

type StageStatus = 'Completed' | 'Current' | 'Blocked' | 'Pending' | 'Not required'
type GuidedRun = {
  id: string
  status: string
  initialPasswordRunId?: string
  canRetryRegistration?: boolean
  deploymentJobId?: string
  currentJobId?: string
  bootstrapStepCount?: number
  steps: { index: number; status: string; jobId: string; initialPasswordRunId?: string }[]
  snapshot: { steps: { configFile: string; workflow: string; configContent: string }[] }
}

export type RecoveryPasswordSetupFields = {
  passwordSetupApprovalId: string
  passwordSetupConfirmation: string
}
const emptyPasswordSetup: RecoveryPasswordSetupFields = {
  passwordSetupApprovalId: '', passwordSetupConfirmation: '',
}

/** Only the selected, next password action may attach these optional fields. */
export function recoveryPasswordSetupFields(run: GuidedRun, index: number, fields: RecoveryPasswordSetupFields) {
  if (run.status !== 'ready_for_configuration' || index !== run.steps.length
    || run.snapshot.steps[index]?.workflow !== PASSWORD_SETUP_WORKFLOW) return {}
  return { passwordSetupApprovalId: fields.passwordSetupApprovalId.trim(),
    passwordSetupConfirmation: fields.passwordSetupConfirmation }
}

export function recoveryPasswordSetupReady(run: GuidedRun, index: number, fields: RecoveryPasswordSetupFields) {
  if (run.status !== 'ready_for_configuration') return false
  if (run.snapshot.steps[run.steps.length]?.workflow !== PASSWORD_SETUP_WORKFLOW) return true
  return index === run.steps.length && Boolean(fields.passwordSetupApprovalId.trim())
    && fields.passwordSetupConfirmation === PASSWORD_SETUP_CONFIRMATION
}

function PasswordSetupApproval({ run, step, onChange }: {
  run: GuidedRun; step: GuidedRun['snapshot']['steps'][number]
  onChange?: (fields: RecoveryPasswordSetupFields) => void
}) {
  const [fields, setFields] = useState(emptyPasswordSetup)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { onChange?.(fields) }, [fields, onChange])
  useEffect(() => () => { onChange?.(emptyPasswordSetup) }, [onChange])

  async function requestApproval() {
    setRequesting(true); setError(''); setMessage('')
    try {
      const response = await apiFetch('/api/approvals', { method: 'POST', body: JSON.stringify({
        workflow: PASSWORD_SETUP_WORKFLOW, configFile: step.configFile, configContent: step.configContent,
        notes: `Initial Host & CVM password setup for recovery ${run.id}`,
      }) })
      if (!response.ok) throw new Error(`Password setup approval request failed (HTTP ${response.status}).`)
      const result = await response.json()
      if (typeof result.id !== 'string' || !result.id.trim() || result.id.length > 200) {
        throw new Error('Approval response did not contain a usable request ID. Check Approvals before requesting again.')
      }
      setFields(value => ({ ...value, passwordSetupApprovalId: result.id }))
      setMessage('Request created. A different administrator must approve this exact filename and YAML before execution.')
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('Password setup approval request failed')
        ? e.message : 'Could not confirm the approval request. Check Approvals before requesting again.')
    } finally { setRequesting(false) }
  }

  return <section aria-label="Initial Host and CVM password approval" className="space-y-3 rounded border border-amber-500/40 p-3">
    <h4 className="font-semibold">Initial Host &amp; CVM passwords</h4>
    <p className="text-sm">This action requires its own approval. Deployment and PE bootstrap approvals do not authorize host or CVM password changes. Fresh PE health evidence remains required.</p>
    <p className="break-all text-sm">Saved password YAML: {step.configFile}</p>
    <details><summary className="cursor-pointer text-sm">Review exact password setup snapshot</summary>
      <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs">{step.configContent}</pre>
    </details>
    <button type="button" className="btn-secondary" disabled={requesting || !step.configFile || !step.configContent}
      onClick={() => void requestApproval()}>Request Password Setup Approval</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-amber-500">{error}</p>}
    <label className="block space-y-1 text-sm"><span>Independent password setup approval ID</span>
      <input className="input w-full" maxLength={200} value={fields.passwordSetupApprovalId}
        onChange={e => setFields(value => ({ ...value, passwordSetupApprovalId: e.target.value }))} />
    </label>
    <label className="block space-y-1 text-sm"><span>Password setup confirmation: {PASSWORD_SETUP_CONFIRMATION}</span>
      <input className="input w-full" autoComplete="off" value={fields.passwordSetupConfirmation}
        onChange={e => setFields(value => ({ ...value, passwordSetupConfirmation: e.target.value }))} />
    </label>
    <p className="text-xs text-gray-400">A request ID alone does not mean approval was granted. The server checks approval and confirmation again before submitting the dedicated password job.</p>
  </section>
}

const stages = [
  'Review targets and approve',
  'Foundation imaging',
  'Initial-access bootstrap',
  'Verify PE health',
  'Post-configuration pipeline',
  'Verify and accept',
  'Restore handoff',
]
const stagePositions: Record<string, number> = {
  prepared: 0, submitting: 1, deploying: 1,
  awaiting_bootstrap: 2, bootstrapping: 2,
  awaiting_health_verification: 3, ready_for_configuration: 4, configuring: 4,
  awaiting_acceptance: 5, accepted: 6,
}
const stageStyles: Record<StageStatus, string> = {
  Completed: 'text-emerald-600 dark:text-emerald-400',
  Current: 'text-blue-600 dark:text-blue-300',
  Blocked: 'text-amber-700 dark:text-amber-300',
  Pending: 'text-gray-500',
  'Not required': 'text-gray-500',
}

export default function RecoveryRunGuide({ run, admin, job, jobError, selectedStepIndex = run.steps.length, onPasswordSetupChange }: {
  run: GuidedRun; admin: boolean; job: ExecutionJob | null; jobError: string
  selectedStepIndex?: number
  onPasswordSetupChange?: (fields: RecoveryPasswordSetupFields) => void
}) {
  const selectedStep = run.snapshot.steps[selectedStepIndex]
  const passwordSelected = selectedStepIndex === run.steps.length && selectedStep?.workflow === PASSWORD_SETUP_WORKFLOW
  const diagnostics = job?.diagnostics as (ExecutionJob['diagnostics'] & { initialPasswordRunId?: string })
  const journalId = run.initialPasswordRunId || diagnostics?.initialPasswordRunId
  const reconciliation = run.status === 'needs_reconciliation'
  const closed = run.status === 'closed_reconciled'
  const bootstrap = run.bootstrapStepCount || 0
  const interruptedStage = run.currentJobId || run.steps.length
    ? run.steps.length < bootstrap ? 2 : 4 : 1
  const position = reconciliation ? interruptedStage : stagePositions[run.status]
  const action = reconciliation
    ? { target: 'recovery-reconcile', label: run.currentJobId ? 'Review reconciliation' : 'Check Foundation outcome', text: run.canRetryRegistration
      ? 'Reconcile PE and PC, confirm registration is absent, then record fresh PE health evidence before retrying step 08.'
      : 'Read the saved error, check Foundation and the target nodes, then record what happened before continuing.' }
    : {
      prepared: { target: 'recovery-approval', label: 'Review deployment approval', text: 'Review the exact targets, request approval and enter the deployment confirmations.' },
      submitting: { target: 'recovery-jobs', label: 'View existing jobs', text: 'Submission is in progress. Follow the existing job and run history.' },
      deploying: { target: 'recovery-jobs', label: 'Monitor Foundation imaging', text: 'Follow the submitted deployment job in Jobs / Queue.' },
      awaiting_bootstrap: { target: 'recovery-bootstrap', label: 'Review bootstrap approvals', text: 'Review and approve the pending initial-access steps.' },
      bootstrapping: { target: 'recovery-bootstrap', label: 'Monitor bootstrap', text: 'Follow the current job while initial-access configuration runs.' },
      awaiting_health_verification: { target: 'recovery-health', label: 'Verify PE health', text: 'Collect PE readbacks or record independent health evidence after bootstrap.' },
      ready_for_configuration: { target: 'recovery-configuration', label: run.canRetryRegistration ? 'Review step 08 retry' : 'Review remaining pipeline steps', text: run.canRetryRegistration
        ? 'Step 08 is the only eligible retry. Reconciliation, fresh health evidence and the existing approval policy are checked on submission.'
        : 'Review the remaining configuration snapshots. Health evidence must be fresh when configuration starts.' },
      configuring: { target: 'recovery-configuration', label: 'Monitor configuration', text: 'Follow the current job and the recorded completed steps.' },
      awaiting_acceptance: { target: 'recovery-reconcile', label: 'Review final acceptance', text: 'Verify configuration readbacks and current health, then record acceptance.' },
      accepted: { target: 'recovery-history', label: 'Review acceptance evidence', text: 'Infrastructure is accepted for handoff. Coordinate workload restoration with the backup platform and application owners.' },
    }[run.status]

  const failure = job?.diagnostics?.stderrTail
    || job?.logs?.filter(event => event.type === 'error' || event.type === 'stderr').map(event => String(event.data)).join('\n')
    || job?.diagnostics?.evidence

  function goToAction() {
    const target = document.getElementById(action?.target || '')
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return <section aria-label="Recovery stage guide" className="space-y-4 rounded-lg border border-border p-4">
    <h3 className="font-semibold text-gray-100">Recovery progress</h3>
    {typeof journalId === 'string' && journalId && <p className="break-all text-sm">Password setup journal run ID: {journalId}</p>}
    {admin && passwordSelected && run.status === 'ready_for_configuration' && <PasswordSetupApproval
      key={`${run.id}:${selectedStepIndex}:${selectedStep.configContent}`} run={run} step={selectedStep} onChange={onPasswordSetupChange} />}
    {reconciliation && <div role="status" className="space-y-2 rounded border border-amber-500/40 p-3">
      <h4 className="font-semibold">{run.currentJobId ? 'Configuration needs attention' : 'Foundation deployment needs attention'}</h4>
      <p className="text-sm">{run.steps.filter(step => step.status === 'success').length} pipeline steps completed.</p>
      {jobError ? <p className="text-sm text-amber-500">{jobError}</p>
        : !job ? <p className="text-sm">Loading the saved execution result…</p>
        : <>
          <p className="text-sm">Job {job.id} · {job.status} · return code {job.returnCode ?? 'unavailable'}</p>
          {failure ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{failure}</pre>
            : <p className="text-sm">The saved result does not identify the cause. Inspect the execution log and Foundation session before retrying.</p>}
          <Link className="text-sm text-nutanix-blue underline" to={`/jobs?job=${encodeURIComponent(job.id)}`}>Open this job and its log</Link>
        </>}
      <p className="text-xs text-gray-400">A failed Orchestrator job alone does not confirm whether Foundation started imaging.</p>
    </div>}

    {closed ? <p className="text-sm">This run is closed after reconciliation. Review its history before preparing another recovery.</p>
      : action ? <div className="space-y-2 rounded border border-border p-3">
        <h4 className="font-semibold">Next action</h4>
        <p className="text-sm text-gray-300">{action.text}</p>
        {admin && <button type="button" className="btn-primary" onClick={goToAction}>{action.label}</button>}
        {!admin && <p className="text-xs text-gray-400">An administrator performs the next recovery action.</p>}
      </div> : <p className="text-sm text-amber-500">Review this run's recorded status and jobs before taking another action.</p>}
    <details className="rounded border border-border p-3">
      <summary className="cursor-pointer text-sm">Recovery stages</summary>
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {stages.map((title, index) => {
        let status: StageStatus = position === undefined || closed ? 'Pending'
          : index < position ? 'Completed' : index === position ? reconciliation ? 'Blocked' : 'Current' : 'Pending'
        if (index === 2 && bootstrap === 0) status = 'Not required'
        return <li key={title} aria-current={status === 'Current' || status === 'Blocked' ? 'step' : undefined} className="rounded border border-border p-3 text-sm">
          <span className="block">{title}</span>
          <span className={stageStyles[status]}>{status}</span>
        </li>
      })}
    </ol>
    </details>
    <details className="space-y-2 rounded border border-border p-3">
      <summary className="cursor-pointer text-sm">Pipeline steps · {run.steps.filter(step => step.status === 'success').length} / {run.snapshot.steps.length} completed</summary>
      <p className="text-xs text-gray-400">Completed steps retain their recorded jobs. Continuation starts with the next eligible step.</p>
      <ol className="space-y-1 break-words text-sm">
        {run.snapshot.steps.map((step, index) => {
          const completed = run.steps.find(item => item.index === index && item.status === 'success')
          const current = index === run.steps.length
          const status: StageStatus = completed ? 'Completed' : current && reconciliation ? 'Blocked'
            : current && (run.status === 'configuring' || run.status === 'bootstrapping') ? 'Current' : 'Pending'
          return <li key={index} className="rounded border border-border p-2">
            <span>{String(index + 1).padStart(2, '0')}. {step.configFile || step.workflow}</span>
            <span className={`ml-2 ${stageStyles[status]}`}>{status}</span>
            {completed && <Link className="ml-2 text-nutanix-blue underline" to="/jobs">Job {completed.jobId}</Link>}
            {completed?.initialPasswordRunId && <span className="block break-all text-xs">Password setup journal run ID: {completed.initialPasswordRunId}</span>}
          </li>
        })}
      </ol>
    </details>
  </section>
}
