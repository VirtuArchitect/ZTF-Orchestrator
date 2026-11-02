export const INSTALL_STAGES = ['readiness', 'backup', 'load', 'restart', 'verify', 'complete'] as const
export interface StageOperation { status: string; stage?: string; events?: Array<{ stage: string }> }

/** Events mark entry, not success. Advancing past a recorded stage confirms completion. */
export function installationStages(operation: StageOperation) {
  const entered = operation.events?.map(event => event.stage) || []
  const last = [...entered, operation.stage || ''].filter(stage => INSTALL_STAGES.includes(stage as typeof INSTALL_STAGES[number])).at(-1)
  const current = INSTALL_STAGES.indexOf(last as typeof INSTALL_STAGES[number])
  const success = operation.status === 'succeeded' && operation.stage === 'complete'
  return INSTALL_STAGES.map((stage, index) => {
    let state: 'completed' | 'current' | 'pending' | 'failed' | 'interrupted' = 'pending'
    if (success || (index < current && entered.includes(stage))) state = 'completed'
    else if (index === current) {
      state = operation.status === 'failed' || operation.status === 'rejected' ? 'failed'
        : operation.status === 'interrupted' ? 'interrupted' : operation.status === 'running' ? 'current' : 'pending'
    }
    return { stage, state, label: { completed: 'Completed', current: 'In progress', pending: 'Pending', failed: 'Failed', interrupted: 'Interrupted' }[state] }
  })
}
