import type { ExecutionProgress } from '../types'

export type NativeFoundationDeploymentPhaseStatus = 'pending' | 'running' | 'complete' | 'failed'

export interface NativeFoundationLogLine {
  type: string
  data: unknown
  ts?: number | string
}

export interface NativeFoundationDeploymentPhase {
  id: string
  label: string
  description: string
  status: NativeFoundationDeploymentPhaseStatus
  percent: number
  events: string[]
}

export interface NativeFoundationDeploymentProgress {
  percent: number
  statusLabel: string
  detail: string
  phases: NativeFoundationDeploymentPhase[]
  completedCount: number
  failedCount: number
  activePhase?: NativeFoundationDeploymentPhase
}

const PHASE_DEFS: Array<Omit<NativeFoundationDeploymentPhase, 'status' | 'percent' | 'events'>> = [
  {
    id: 'workflow-validation',
    label: 'Workflow Validation',
    description: 'Validates the Native Foundation intent, UAT gate, bindings, and deployment plan.',
  },
  {
    id: 'configure-hardware-provider',
    label: 'Configure Hardware Provider',
    description: 'Checks Dell iDRAC Redfish reachability and confirms the hardware provider gate.',
  },
  {
    id: 'patch-iso',
    label: 'Patch ISO',
    description: 'Validates the AHV and AOS image sources before imaging starts.',
  },
  {
    id: 'install-hypervisor',
    label: 'Install Hypervisor',
    description: 'Hands off AHV mounting and hypervisor installation to the configured deployment adapter.',
  },
  {
    id: 'install-aos',
    label: 'Install AOS',
    description: 'Tracks AOS deployment through the configured Foundation adapter.',
  },
  {
    id: 'cluster-formation',
    label: 'Cluster Formation',
    description: 'Forms the AHV HCI cluster, validates Prism Element, and records deployment evidence.',
  },
]

const COMPLETION_TEXT = 'Native Foundation Dell iDRAC deployment UAT path completed with real adapter evidence.'

function normalizeLogData(data: unknown): string {
  if (typeof data === 'string') return data
  if (data === null || data === undefined) return ''
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function cleanText(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function addEvent(phase: NativeFoundationDeploymentPhase, event: string): void {
  const text = cleanText(event)
  if (!text) return
  if (phase.events.includes(text)) return
  phase.events.push(text)
}

function mark(
  phase: NativeFoundationDeploymentPhase,
  status: NativeFoundationDeploymentPhaseStatus,
  event?: string,
): void {
  if (status === 'failed') {
    phase.status = 'failed'
  } else if (phase.status !== 'failed') {
    const currentRank = statusRank(phase.status)
    const nextRank = statusRank(status)
    if (nextRank > currentRank) phase.status = status
  }
  if (event) addEvent(phase, event)
}

function statusRank(status: NativeFoundationDeploymentPhaseStatus): number {
  if (status === 'pending') return 0
  if (status === 'running') return 1
  if (status === 'complete') return 2
  return 3
}

function isFailureLog(type: string, text: string): boolean {
  const upper = text.toUpperCase()
  return type === 'error'
    || /\b(ERROR|FAILED|FAILURE|TRACEBACK|EXCEPTION|BLOCKED)\b/.test(upper)
}

function phasePercent(index: number, status: NativeFoundationDeploymentPhaseStatus): number {
  if (status === 'complete') return 100
  if (status === 'failed') return 100
  if (status === 'running') return 50
  return 0
}

export function buildNativeFoundationDeploymentProgress(
  logs: NativeFoundationLogLine[] = [],
  status: 'running' | 'done' | 'error' = 'running',
  progress?: ExecutionProgress,
): NativeFoundationDeploymentProgress {
  const phases: NativeFoundationDeploymentPhase[] = PHASE_DEFS.map((phase) => ({
    ...phase,
    status: 'pending',
    percent: 0,
    events: [],
  }))
  const byId = Object.fromEntries(phases.map((phase) => [phase.id, phase]))

  const lines = logs.map((line) => ({
    type: line.type,
    text: cleanText(normalizeLogData(line.data)),
  })).filter((line) => line.text.length > 0)

  if (lines.length > 0) {
    mark(byId['workflow-validation'], 'running', 'Execution stream opened')
  }

  for (const { type, text } of lines) {
    const lower = text.toLowerCase()
    const failed = isFailureLog(type, text)

    if (
      lower.includes('native foundation deployment uat job started')
      || lower.includes('intent sha-256')
      || lower.includes('discovery sha-256')
      || lower.includes('review bindings')
      || lower.includes('controlled uat')
      || lower.includes('building deployment uat artifacts')
      || lower.includes('review packet')
    ) {
      mark(byId['workflow-validation'], lower.includes('building deployment uat artifacts') ? 'complete' : 'running', text)
    }

    if (
      lower.includes('dell idrac controlled-uat mutation gate')
      || lower.includes('probing dell idrac')
      || lower.includes('dell idrac probe')
      || lower.includes('dell idrac reachable')
      || lower.includes('hardware provider')
      || lower.includes('redfish')
    ) {
      const phase = byId['configure-hardware-provider']
      if (failed || lower.includes('blocked because one or more idrac targets')) {
        mark(phase, 'failed', text)
      } else if (/dell idrac probe:\s+\d+\s+passed,\s+0\s+failed/i.test(text)) {
        mark(phase, 'complete', text)
      } else {
        mark(phase, 'running', text)
      }
    }

    if (
      lower.includes('validating foundation image sources')
      || lower.includes('foundation image validation')
      || lower.includes('image source ready')
      || lower.includes('image validation failed')
      || lower.includes('aos/ahv image validation')
    ) {
      const phase = byId['patch-iso']
      if (failed || lower.includes('image validation failed')) {
        mark(phase, 'failed', text)
      } else if (/foundation image validation:\s+\d+\s+passed,\s+0\s+failed/i.test(text)) {
        mark(phase, 'complete', text)
      } else {
        mark(phase, 'running', text)
      }
    }

    if (
      lower.includes('running native foundation deployment adapter')
      || lower.includes('mount_install_ahv')
      || lower.includes('mount ahv')
      || lower.includes('install hypervisor')
      || lower.includes('hypervisor installation')
      || lower.includes('foundation adapter stdout')
      || lower.includes('foundation adapter stderr')
    ) {
      const phase = byId['install-hypervisor']
      mark(phase, failed ? 'failed' : 'running', text)
    }

    if (
      lower.includes('deploy_aos')
      || lower.includes('deploy aos')
      || lower.includes('install aos')
      || lower.includes('aos deployment')
      || lower.includes('aos install')
    ) {
      const phase = byId['install-aos']
      mark(phase, failed ? 'failed' : 'running', text)
    }

    if (
      lower.includes('form_hci_cluster')
      || lower.includes('cluster formation')
      || lower.includes('validating prism element cluster')
      || lower.includes('prism element validation')
      || lower.includes('foundation deployment evidence directory')
      || lower.includes('native foundation dell idrac deployment uat path completed')
      || lower.includes('real adapter evidence')
    ) {
      const phase = byId['cluster-formation']
      if (failed || lower.includes('prism element validation failed')) {
        mark(phase, 'failed', text)
      } else if (lower.includes('native foundation dell idrac deployment uat path completed')) {
        mark(phase, 'complete', text)
      } else {
        mark(phase, 'running', text)
      }
    }

    if (lower.includes(COMPLETION_TEXT.toLowerCase())) {
      mark(byId['install-hypervisor'], 'complete', 'Native Foundation adapter completed')
      mark(byId['install-aos'], 'complete', 'Native Foundation adapter completed')
      mark(byId['cluster-formation'], 'complete', text)
    }
  }

  if (status === 'done') {
    for (const phase of phases) {
      if (phase.status !== 'failed') mark(phase, 'complete')
    }
  }

  if (status === 'error') {
    const failedPhase = phases.find((phase) => phase.status === 'running')
      || phases.find((phase) => phase.status === 'pending')
      || phases[phases.length - 1]
    mark(failedPhase, 'failed', 'Execution ended before this phase completed')
  }

  let previousComplete = true
  for (const phase of phases) {
    if (phase.status === 'pending' && previousComplete && status === 'running') {
      mark(phase, 'running')
      previousComplete = false
    } else if (phase.status !== 'complete') {
      previousComplete = false
    }
  }

  phases.forEach((phase, index) => {
    phase.percent = phasePercent(index, phase.status)
    if (phase.events.length === 0) {
      phase.events.push(
        phase.status === 'pending'
          ? 'Waiting for previous phase to complete'
          : phase.status === 'running'
            ? 'Phase is in progress'
            : phase.status === 'complete'
              ? 'Phase completed'
              : 'Phase failed',
      )
    }
  })

  const completedCount = phases.filter((phase) => phase.status === 'complete').length
  const failedCount = phases.filter((phase) => phase.status === 'failed').length
  const activePhase = phases.find((phase) => phase.status === 'running')
    || phases.find((phase) => phase.status === 'failed')
  const computedPercent = Math.round((completedCount / phases.length) * 100)
  const percent = Math.max(
    computedPercent,
    Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
  )

  return {
    percent,
    statusLabel: failedCount > 0
      ? 'Action required'
      : completedCount === phases.length
        ? 'Complete'
        : activePhase?.label || progress?.phase || 'Preparing deployment',
    detail: activePhase?.description || progress?.detail || 'Native Foundation deployment phases are being updated from live execution logs.',
    phases,
    completedCount,
    failedCount,
    activePhase,
  }
}
