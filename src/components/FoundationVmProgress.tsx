import { useEffect, useState } from 'react'
import { CheckCircle, ChevronDown, Circle, Download, ExternalLink, Loader, XCircle } from 'lucide-react'
import type { FoundationDeploymentStatus, FoundationMetric, FoundationNodeProgress } from '../types'

const phases = ['Workflow validation', 'Image preparation', 'Hardware configuration', 'AHV installation', 'AOS installation', 'Cluster formation']
const labels = { unknown: 'Not reported', pending: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' }

function Metric({ value }: { value: FoundationMetric }) {
  const Icon = value.status === 'completed' ? CheckCircle : value.status === 'failed' ? XCircle : value.status === 'running' ? Loader : Circle
  const color = value.status === 'completed' ? 'text-green-600' : value.status === 'failed' ? 'text-red-600' : 'text-gray-500'
  return <span className={`inline-flex flex-col gap-1 text-xs ${color}`}>
    <span className="inline-flex items-center gap-2"><Icon size={15} aria-hidden="true" />{labels[value.status]}{value.percent !== null && ` · ${value.percent}%`}</span>
    {value.percent !== null && <span role="progressbar" aria-label="Foundation reported progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent} className="block h-1 w-28 overflow-hidden rounded bg-gray-800"><span className={`block h-full ${value.status === 'failed' ? 'bg-red-500' : 'bg-nutanix-teal'}`} style={{ width: `${value.percent}%` }} /></span>}
  </span>
}

function Nodes({ nodes }: { nodes: FoundationNodeProgress[] }) {
  if (!nodes.length) return <p className="p-3 text-sm text-gray-500">Node telemetry not reported.</p>
  return <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs">
    <thead className="text-gray-500"><tr>{['Node serial', 'AHV IP', 'CVM IP', 'Activity', 'Progress'].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
    <tbody>{nodes.map((node, index) => <tr key={`${node.serial}-${index}`} className="border-t border-border">
      <td className="p-3">{node.serial || 'Not reported'}</td><td className="p-3">{node.hostIp || 'Not reported'}</td><td className="p-3">{node.cvmIp || 'Not reported'}</td><td className="p-3">{node.activity}</td><td className="p-3"><Metric value={node} /></td>
    </tr>)}</tbody>
  </table></div>
}

export default function FoundationVmProgress({ snapshot, active, logs = [] }: {
  snapshot?: FoundationDeploymentStatus
  active: boolean
  logs?: Array<{ type: string; data: unknown }>
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const last = snapshot?.lastSuccessfulAt ? Date.parse(snapshot.lastSuccessfulAt) : NaN
  const stale = active && Number.isFinite(last) && now - last > 30000
  const elapsedEnd = !active && snapshot?.updatedAt ? Date.parse(snapshot.updatedAt) : now
  const elapsed = snapshot?.startedAt ? Math.max(0, Math.floor((elapsedEnd - Date.parse(snapshot.startedAt)) / 1000)) : null
  const entries = snapshot?.phases || phases.map((label, index) => ({ id: String(index), label, status: 'unknown' as const, percent: null, nodes: [] }))
  const download = () => {
    const blob = new Blob([logs.map(log => `[${log.type}] ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}`).join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'foundation-vm-execution.log'
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const foundationUrl = snapshot?.foundationUrl && /^https?:\/\//i.test(snapshot.foundationUrl) ? snapshot.foundationUrl : null
  return <section aria-label="Foundation VM deployment status" className="mb-4 overflow-hidden rounded-lg border border-border bg-gray-900/40">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
      <div><h4 className="font-semibold">Foundation VM Deployment Status</h4>
        <p className="mt-1 text-xs text-gray-500">{snapshot ? labels[snapshot.status] : 'Waiting for telemetry'}{snapshot?.percent != null && ` · Foundation ${snapshot.percent}%`}{elapsed !== null && ` · Elapsed ${elapsed}s`}</p>
        <p className="mt-1 text-xs text-gray-500">Last successful update: {Number.isFinite(last) ? new Date(last).toLocaleString() : 'Not reported'}</p>
      </div>
      <div className="flex gap-2">
        {foundationUrl && <a className="btn-secondary text-xs" href={foundationUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open Foundation</a>}
        <button className="btn-secondary p-2" title="Download sanitized execution logs" aria-label="Download sanitized execution logs" onClick={download}><Download size={16} /></button>
      </div>
    </div>
    {(snapshot?.connection === 'lost' || stale) && <p role="status" className="border-b border-border p-3 text-sm text-yellow-600">{snapshot?.connection === 'lost' ? 'Connection lost' : 'Telemetry stale'}; showing the last reported state.</p>}
    {entries.map(phase => <details key={phase.id} open={phase.status === 'running' || phase.status === 'failed'} className="group border-b border-border">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4"><span className="inline-flex items-center gap-2 text-sm font-medium"><ChevronDown size={14} className="shrink-0 group-open:rotate-180" aria-hidden="true" />{phase.label}</span><Metric value={phase} /></summary>
      <Nodes nodes={phase.nodes} />
      {phase.status === 'failed' && <p className="p-3 text-sm text-red-600">Review the execution log for the reported failure. Later phases are not assumed to have run.</p>}
    </details>)}
    <details open><summary className="cursor-pointer p-4 text-sm font-medium">Node Overview</summary><Nodes nodes={snapshot?.nodes || []} /></details>
  </section>
}
