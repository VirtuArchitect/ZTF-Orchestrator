import type { ExecutionJobStatus } from '../types'

export const STANDALONE_FCA_HANDOFF_WORKFLOWS = new Set([
  'cluster-create-standalone-fca',
])

export function isStandaloneFcaHandoff(workflow: string | undefined, status: string | undefined) {
  return status === 'success' && STANDALONE_FCA_HANDOFF_WORKFLOWS.has(String(workflow || ''))
}

export function executionStatusLabel(workflow: string | undefined, status: string | undefined) {
  if (isStandaloneFcaHandoff(workflow, status)) return 'FCA handoff accepted'
  return status || 'unknown'
}

export function terminalStatusLabel(workflow: string | undefined, status: 'running' | 'done' | 'error') {
  if (status === 'done' && STANDALONE_FCA_HANDOFF_WORKFLOWS.has(String(workflow || ''))) {
    return 'Handoff accepted'
  }
  if (status === 'done') return 'Completed'
  if (status === 'error') return 'Failed'
  return 'Running...'
}

export function terminalSuccessProgress(workflow: string | undefined) {
  if (STANDALONE_FCA_HANDOFF_WORKFLOWS.has(String(workflow || ''))) {
    return {
      phase: 'FCA handoff accepted',
      detail: 'Standalone FCA accepted the Lifecycle request. Monitor Foundation Central for deployment completion.',
    }
  }
  return {
    phase: 'Completed',
    detail: 'Execution finished successfully',
  }
}

export function statusBadgeText(workflow: string | undefined, status: ExecutionJobStatus | string) {
  return executionStatusLabel(workflow, status)
}
