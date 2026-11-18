import { Link } from '../router'

type StageStatus = 'Completed' | 'Current' | 'Blocked' | 'Pending' | 'Not required'
type GuidedRun = {
  status: string
  canRetryRegistration?: boolean
  deploymentJobId?: string
  currentJobId?: string
  bootstrapStepCount?: number
  steps: { index: number; status: string; jobId: string }[]
  snapshot: { steps: { configFile: string; workflow: string }[] }
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

export default function RecoveryRunGuide({ run, admin }: { run: GuidedRun; admin: boolean }) {
  const reconciliation = run.status === 'needs_reconciliation'
  const closed = run.status === 'closed_reconciled'
  const bootstrap = run.bootstrapStepCount || 0
  const interruptedStage = run.currentJobId || run.steps.length
    ? run.steps.length < bootstrap ? 2 : 4 : 1
  const position = reconciliation ? interruptedStage : stagePositions[run.status]
  const action = reconciliation
    ? { target: 'recovery-reconcile', label: 'Review reconciliation', text: run.canRetryRegistration
      ? 'Reconcile PE and PC, confirm registration is absent, then record fresh PE health evidence before retrying step 08.'
      : 'Inspect the existing jobs and actual target state, then record reconciliation before continuing.' }
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

  function goToAction() {
    const target = document.getElementById(action?.target || '')
    if (target instanceof HTMLDetailsElement) target.open = true
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }

  return <section aria-label="Recovery stage guide" className="space-y-4 rounded-lg border border-border p-4">
    <h3 className="font-semibold text-gray-100">Recovery progress</h3>
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
    {closed ? <p className="text-sm">This run is closed after reconciliation. Review its history before preparing another recovery.</p>
      : action ? <div className="space-y-2 rounded border border-border p-3">
        <h4 className="font-semibold">Next action</h4>
        <p className="text-sm text-gray-300">{action.text}</p>
        {admin && <button type="button" className="btn-primary" onClick={goToAction}>{action.label}</button>}
        {!admin && <p className="text-xs text-gray-400">An administrator performs the next recovery action.</p>}
      </div> : <p className="text-sm text-amber-500">Review this run's recorded status and jobs before taking another action.</p>}
    <div className="space-y-2">
      <h4 className="font-semibold">Pipeline steps</h4>
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
          </li>
        })}
      </ol>
    </div>
  </section>
}
