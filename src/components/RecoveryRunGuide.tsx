import { useEffect, useState } from 'react'
import type { ExecutionJob } from '../types'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { PASSWORD_SETUP_CONFIRMATION, PASSWORD_SETUP_WORKFLOW } from '../utils/initialPasswordSetup'
import FoundationVmProgress from './FoundationVmProgress'

type StageStatus = 'Completed' | 'Current' | 'Blocked' | 'Pending' | 'Not required'
type GuidedRun = {
  id: string
  status: string
  clusterName?: string
  revision?: number
  updatedAt?: string
  approvalId?: string
  healthEvidence?: { at: string }
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

// Derive labels from the saved filename, never from a step's position in a pipeline.
function stepPurpose(step: GuidedRun['snapshot']['steps'][number]) {
  const title = step.configFile.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '')
    .replace(/^\d+[._ -]*/, '').replace(/[_-]+/g, ' ').trim()
  return title || step.workflow.replace(/[_-]+/g, ' ')
}

function recordedDate(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'
  return new Date(value).toISOString()
}

export default function RecoveryRunGuide({ run, admin, job, jobError, readError = '', selectedStepIndex = run.steps.length, onPasswordSetupChange }: {
  run: GuidedRun; admin: boolean; job: ExecutionJob | null; jobError: string
  selectedStepIndex?: number
  readError?: string
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
      submitting: { target: 'recovery-history', label: 'Review submission history', text: 'Submission is in progress. Follow the existing job and run history. Do not submit another deployment.' },
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

  const completedCount = run.steps.filter(step => step.status === 'success').length
  const stage = closed ? 'Closed after reconciliation' : stages[position ?? -1] || 'Status needs review'
  const pipelineVisible = Boolean(run.currentJobId || completedCount || ['ready_for_configuration', 'configuring', 'awaiting_acceptance', 'accepted'].includes(run.status))
  const approval = run.approvalId ? 'Deployment approval reference recorded; action-specific checks still apply' : 'No deployment approval reference recorded'
  const nextAction = closed ? 'Review run history before preparing another recovery.' : action?.text || 'Review recorded status and existing jobs. Do not resubmit blindly.'
  const blocker = readError ? 'Run refresh failed; displayed state may be stale' : reconciliation ? 'Target state needs reconciliation' : 'None recorded; follow the next action'

  function exportHandover() {
    // Deliberate allowlist: no YAML, credentials, endpoints, raw errors or log bodies.
    const lines = ['ZTF-Orchestrator recovery handover', `Generated: ${new Date().toISOString()}`,
      `Cluster: ${run.clusterName || 'Not recorded'}`, `Run: ${run.id}`, `Revision: ${run.revision ?? 'Not recorded'}`,
      `Recorded status: ${run.status}`, `State freshness: ${readError ? 'Refresh failed; displayed run may be stale' : 'Last successfully loaded snapshot; check current state before action'}`,
      `Current stage: ${stage}`, `Completed: ${completedCount} / ${run.snapshot.steps.length}`,
      `Blocker: ${blocker}`, `Approval: ${approval}`, `Last recorded run update: ${recordedDate(run.updatedAt)}`,
      `Health evidence recorded: ${recordedDate(run.healthEvidence?.at)} (freshness is checked by the server)`,
      `Execution result: ${jobError ? 'Unavailable; displayed result may be stale' : job ? job.status : 'Not available'}`,
      `Next action: ${nextAction}`, '', 'Recorded completed work:',
      ...run.steps.filter(step => step.status === 'success').map(step => `Step ${step.index + 1}: completed; job ${step.jobId}`),
      '', 'This is a snapshot, not permission to execute. Re-open the run for current state.',
      'Infrastructure recovery only. Workload restoration remains a separate backup-platform handoff.']
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'ztf-recovery-handover.txt'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function goToAction() {
    const target = document.getElementById(action?.target || '')
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return <section aria-label="Recovery stage guide" className="space-y-4 rounded-lg border border-border p-4">
    <div><h3 className="text-lg font-semibold text-gray-100">Recovery workspace</h3>
      <p className="text-sm text-gray-400">One next action. Recorded completed work retained. Existing approvals and verification still apply.</p></div>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]"><div className="min-w-0 space-y-4">
    {typeof journalId === 'string' && journalId && <p className="break-all text-sm">Password setup journal run ID: {journalId}</p>}
    {admin && passwordSelected && run.status === 'ready_for_configuration' && <PasswordSetupApproval
      key={`${run.id}:${selectedStepIndex}:${selectedStep.configContent}`} run={run} step={selectedStep} onChange={onPasswordSetupChange} />}


    {closed ? <p className="text-sm">This run is closed after reconciliation. Review its history before preparing another recovery.</p>
      : action ? <div className="space-y-2 rounded border border-border p-3">
        <h4 className="font-semibold">Next action</h4>
        <p className="text-sm text-gray-300">{action.text}</p>
        {admin && <button type="button" className="btn-primary" onClick={goToAction}>{action.label}</button>}
        {!admin && <p className="text-xs text-gray-400">An administrator performs the next recovery action.</p>}
      </div> : <p className="text-sm text-amber-500">Review this run's recorded status and jobs before taking another action.</p>}
    {['submitting', 'deploying', 'bootstrapping', 'configuring'].includes(run.status) && <section aria-label="Current recovery execution" className="space-y-2 rounded border border-border p-3">
      <h4 className="font-semibold">Current execution</h4>
      {jobError ? <p className="text-sm text-amber-500">{jobError} Displayed execution details may be stale.</p>
        : job ? <>
          <p className="text-sm">Job {job.id} · {job.status}</p>
          <p className="text-sm">Reported stage: {job.lastRecordedStage || job.progress?.phase || 'Not reported'}</p>
          {job.progress && <p className="text-xs text-gray-400">{job.progress.estimated ? 'Estimated' : 'Reported'} job progress: {job.progress.percent}%</p>}
          {job.foundationStatus && <details><summary className="cursor-pointer text-sm">Foundation phases and node progress</summary>
            <FoundationVmProgress snapshot={job.foundationStatus} active={['queued', 'running'].includes(job.status)} outcome={job.status} logs={job.logs} />
          </details>}
        </> : <p className="text-sm">Waiting for the saved job result. Do not submit another deployment.</p>}
      {(run.currentJobId || run.deploymentJobId) && <Link className="text-sm text-nutanix-blue underline" to={`/jobs?job=${encodeURIComponent(run.currentJobId || run.deploymentJobId || '')}`}>Open current execution and logs</Link>}
    </section>}
    {reconciliation && <div role="status" className="space-y-2 rounded border border-amber-500/40 p-3">
      <h4 className="font-semibold">{run.currentJobId ? 'Configuration needs attention' : 'Foundation deployment needs attention'}</h4>
      <p className="text-sm">{run.steps.filter(step => step.status === 'success').length} pipeline steps completed.</p>
      <p className="text-sm">No automatic retry. Completed steps will not be repeated by continuation.</p>
      {jobError ? <p className="text-sm text-amber-500">{jobError}</p>
        : !job ? <p className="text-sm">Loading the saved execution result…</p>
        : <>
          <p className="text-sm">Job {job.id} · {job.status} · return code {job.returnCode ?? 'unavailable'}</p>
          <p className="text-sm">Failed stage: {job.lastRecordedStage || job.progress?.phase || 'Not recorded'}</p>
          {job.diagnostics?.likelyFix && <p className="text-sm">Suggested check: {job.diagnostics.likelyFix}</p>}
          {failure ? <details className="rounded border border-border p-2"><summary className="cursor-pointer text-sm">View failure details</summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{failure}</pre></details>
            : <p className="text-sm">The saved result does not identify the cause. Inspect the execution log and Foundation session before retrying.</p>}
          <Link className="text-sm text-nutanix-blue underline" to={`/jobs?job=${encodeURIComponent(job.id)}`}>Open this job and its log</Link>
        </>}
      <p className="text-xs text-gray-400">A failed Orchestrator job alone does not confirm whether Foundation started imaging.</p>
    </div>}
    <div className="rounded border border-border p-3">
      <h4 className="mb-2 text-sm font-semibold">Recovery stages</h4>
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
    </div>
    <details key={`${run.id}:${pipelineVisible}`} open={pipelineVisible} className="space-y-2 rounded border border-border p-3">
      <summary className="cursor-pointer text-sm">Pipeline steps · {run.steps.filter(step => step.status === 'success').length} / {run.snapshot.steps.length} completed</summary>
      <p className="text-xs text-gray-400">Completed steps retain their recorded jobs. Continuation starts with the next eligible step.</p>
      <ol className="space-y-1 break-words text-sm">
        {run.snapshot.steps.map((step, index) => {
          const completed = run.steps.find(item => item.index === index && item.status === 'success')
          const current = index === run.steps.length
          const status: StageStatus = completed ? 'Completed' : current && reconciliation ? 'Blocked'
            : current && ['ready_for_configuration', 'configuring', 'awaiting_bootstrap', 'bootstrapping'].includes(run.status) ? 'Current' : 'Pending'
          return <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border p-2">
            <span className="w-full font-medium md:w-auto md:flex-1">{stepPurpose(step)}</span>
            <span className="min-w-0 break-all text-xs md:flex-1">{String(index + 1).padStart(2, '0')}. {step.configFile || step.workflow}</span>
            <span className={`ml-2 ${stageStyles[status]}`}>{status}</span>
            <span className="w-full text-xs text-gray-400">Workflow: {step.workflow}</span>
            {completed && <Link className="ml-2 text-nutanix-blue underline" to={`/jobs?job=${encodeURIComponent(completed.jobId)}`}>Job {completed.jobId}</Link>}
            {completed?.initialPasswordRunId && <span className="block break-all text-xs">Password setup journal run ID: {completed.initialPasswordRunId}</span>}
          </li>
        })}
      </ol>
    </details>
    </div><aside aria-label="Shift handover" className="space-y-3 rounded border border-border p-4">
      <h4 className="font-semibold text-gray-100">Shift handover</h4>
      <dl className="space-y-3 break-words text-sm">
        {[
          ['Target', run.clusterName || 'Not recorded'], ['Current stage', stage],
          ['Completed', `${completedCount} of ${run.snapshot.steps.length} steps`],
          ['Blocker', blocker],
          ['Approval', approval], ['Last run update', recordedDate(run.updatedAt)],
          ['Health evidence', run.healthEvidence ? `${recordedDate(run.healthEvidence.at)}; server checks freshness` : 'Not recorded'],
          ['Next action', nextAction],
        ].map(([name, value]) => <div key={name}><dt className="font-medium text-gray-100">{name}</dt><dd className="text-gray-400">{value}</dd></div>)}
      </dl>
      <button type="button" className="btn-secondary w-full" onClick={exportHandover}>Export handover summary</button>
      <p className="text-xs text-gray-400">Snapshot only, not execution approval. No configuration contents or raw logs are exported.</p>
      <p className="text-xs text-gray-400">Infrastructure recovery only. VM restoration remains with your backup platform.</p>
    </aside></div>
  </section>
}
