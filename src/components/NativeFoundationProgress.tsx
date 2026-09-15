import { CheckCircle, Circle, Loader, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { buildNativeFoundationDeploymentProgress } from '../utils/nativeFoundationProgress'
import type { ExecutionProgress } from '../types'

interface NativeFoundationProgressProps {
  logs: Array<{ type: string; data: unknown; ts?: number | string }>
  status: 'running' | 'done' | 'error'
  progress?: ExecutionProgress
}

export default function NativeFoundationProgress({ logs, status, progress }: NativeFoundationProgressProps) {
  const deployment = buildNativeFoundationDeploymentProgress(logs, status, progress)

  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Native Foundation Deployment Details</p>
            <h4 className="mt-1 text-base font-semibold text-slate-950">{deployment.statusLabel}</h4>
            <p className="mt-1 text-sm text-slate-600">{deployment.detail}</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-lg font-semibold text-slate-950">{deployment.completedCount}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">complete</p>
            </div>
            <div>
              <p className={clsx('text-lg font-semibold', deployment.failedCount > 0 ? 'text-red-700' : 'text-slate-950')}>
                {deployment.failedCount}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">failed</p>
            </div>
          </div>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={deployment.percent}
          aria-label="Native Foundation deployment progress"
        >
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              deployment.failedCount > 0 ? 'bg-red-500' : 'bg-nutanix-teal',
            )}
            style={{ width: `${deployment.percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{progress?.phase || 'Live execution stream'}</span>
          <span>{deployment.percent}%</span>
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {deployment.phases.map((phase, index) => (
          <details key={phase.id} className="group" open={phase.status === 'running' || phase.status === 'failed'}>
            <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
              <PhaseIcon status={phase.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Phase {index + 1}:</span>
                  <span className="font-semibold text-slate-950">{phase.label}</span>
                  <StatusBadge status={phase.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{phase.description}</p>
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <span>{phase.percent}%</span>
                <span className="text-slate-400 transition-transform group-open:rotate-90">&gt;</span>
              </div>
            </summary>
            <div className="px-14 pb-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Event Details</p>
                <ul className="space-y-1.5">
                  {phase.events.map((event, eventIndex) => (
                    <li key={`${phase.id}-${eventIndex}`} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                      <span className="break-words">{event}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function PhaseIcon({ status }: { status: 'pending' | 'running' | 'complete' | 'failed' }) {
  if (status === 'complete') return <CheckCircle size={19} className="flex-shrink-0 text-emerald-600" />
  if (status === 'failed') return <XCircle size={19} className="flex-shrink-0 text-red-600" />
  if (status === 'running') return <Loader size={19} className="flex-shrink-0 animate-spin text-blue-600" />
  return <Circle size={19} className="flex-shrink-0 text-slate-300" />
}

function StatusBadge({ status }: { status: 'pending' | 'running' | 'complete' | 'failed' }) {
  const label = status === 'pending'
    ? 'Pending'
    : status === 'running'
      ? 'Running'
      : status === 'complete'
        ? 'Complete'
        : 'Failed'
  return (
    <span className={clsx(
      'rounded px-2 py-0.5 text-xs font-semibold',
      status === 'pending' && 'bg-slate-100 text-slate-600',
      status === 'running' && 'bg-blue-50 text-blue-700',
      status === 'complete' && 'bg-emerald-50 text-emerald-700',
      status === 'failed' && 'bg-red-50 text-red-700',
    )}>
      {label}
    </span>
  )
}
