import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, Building2, CheckCircle, Clock, GitBranch, Info, RotateCcw, Server, Settings, ShieldCheck } from 'lucide-react'
import { Link } from '../router'
import { apiFetch } from '../utils/api'
import { WORKFLOWS, SCRIPTS } from '../data'
import type { DriftRun, ExecutionJob } from '../types'

export interface RecoverySummary {
  datacenters: { id: string; name: string }[]
  profiles: { id: string; name: string; datacenterId: string; reviewed: boolean; drifted: boolean; lastRehearsal?: string }[]
  runs: { id: string; profileId: string; clusterName: string; status: string; mode: string; deploymentJobId?: string; currentJobId?: string; updatedAt: string; steps?: { jobId: string }[] }[]
}

/** Read recorded recovery metadata only; never probe or mutate infrastructure. */
export function useRecoverySummary() {
  const [data, setData] = useState<RecoverySummary | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function load() {
      let delay = 30_000
      try {
        const response = await apiFetch('/api/recovery', { signal: controller.signal })
        if (!response.ok) {
          if (response.status === 429) delay = 60_000
          throw new Error(`Recovery records unavailable (HTTP ${response.status}).`)
        }
        const value = await response.json()
        if (!value || !Array.isArray(value.datacenters) || !Array.isArray(value.profiles) || !Array.isArray(value.runs)) throw new Error('Recovery records could not be read.')
        if (active) { setData(value); setError('') }
      } catch {
        if (active) setError('Recovery records unavailable. Previously collected records, if shown, may be stale. Open Disaster Recovery to review.')
      } finally {
        if (active) timer = setTimeout(load, delay)
      }
    }
    void load()
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [])
  return { data, error }
}

const actions = [
  { title: 'Deploy a Cluster', description: 'Create an AHV cluster using your deployment service.', cta: 'Start deployment', to: '/start/deploy', icon: Server },
  { title: 'Configure a Cluster', description: 'Apply your approved post-deployment baseline.', cta: 'Choose configuration', to: '/start/configure', icon: Settings },
  { title: 'Recover Infrastructure', description: 'Rebuild from a reviewed recovery profile.', cta: 'Open recovery', to: '/recovery', icon: RotateCcw },
  { title: 'Monitor & Verify', description: 'Review drift, inventory and readiness evidence.', cta: 'Review status', to: '/start/monitor', icon: Activity },
]

function displayDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString()
}

export default function OperationsOverview({ jobs, driftRuns, pendingApprovals, runningJobs, loading, unavailable, healthIssues }: {
  jobs: ExecutionJob[]; driftRuns: DriftRun[]; pendingApprovals: number; runningJobs: number; loading: boolean; unavailable: boolean; healthIssues: number
}) {
  const { data, error } = useRecoverySummary()
  // A newer matched check supersedes an older finding for the same configuration/workflow.
  const latest = new Map<string, DriftRun>()
  for (const run of [...driftRuns].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))) {
    const key = `${run.configFile}:${run.workflow || ''}`
    if (!latest.has(key)) latest.set(key, run)
  }
  const drift = [...latest.values()].find(run => run.status !== 'matched')
  const needsReview = data?.profiles.filter(p => !p.reviewed || p.drifted).length
  const reviewed = data?.profiles.filter(p => p.reviewed && !p.drifted).length
  const rehearsed = data?.profiles.filter(p => p.lastRehearsal).length
  const recent = [...jobs].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)).slice(0, 5)
  const failed = recent.find(job => job.status === 'failed' || job.status === 'interrupted')
  const attention = [
    ...(healthIssues ? [{ title: 'Platform checks need attention', text: `${healthIssues} reported check(s) require review.`, to: '#platform-details', action: 'Review details' }] : []),
    ...(drift ? [{ title: drift.status === 'drifted' ? 'Drift detected' : 'Drift evidence unavailable', text: `${drift.configFile} · ${drift.status}`, to: '/drift', action: 'Review drift' }] : []),
    ...(needsReview ? [{ title: 'Recovery profiles need review', text: `${needsReview} saved baseline(s) require review.`, to: '/recovery', action: 'Review profiles' }] : []),
    ...(pendingApprovals ? [{ title: 'Approvals awaiting a decision', text: `${pendingApprovals} pending request(s).`, to: '/approvals', action: 'Review approvals' }] : []),
    ...(failed ? [{ title: 'Recent job needs review', text: `${failed.workflow} · ${failed.status}`, to: '/jobs', action: 'View job' }] : []),
  ].slice(0, 4)
  const metrics = [
    { title: 'Cluster profiles', value: error ? null : data?.profiles.length, icon: Server, to: '/clusters' },
    { title: 'Datacenters', value: error ? null : data?.datacenters.length, icon: Building2, to: '/recovery' },
    { title: 'Running jobs', value: loading || unavailable ? null : runningJobs, icon: Activity, to: '/jobs' },
    { title: 'Awaiting approval', value: loading || unavailable ? null : pendingApprovals, icon: ShieldCheck, to: '/approvals' },
  ]
  return <div className="space-y-5 mb-6" data-testid="operations-overview">
    <section aria-labelledby="operations-heading">
      <h2 id="operations-heading" className="text-2xl font-semibold text-gray-100 mb-5">What would you like to do?</h2>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {actions.map(item => <Link key={item.to} to={item.to} className="card flex items-start gap-4 hover:border-nutanix-blue focus-visible:ring-2 focus-visible:ring-nutanix-blue transition-colors">
          <item.icon size={30} className="text-nutanix-cyan shrink-0 mt-1" />
          <div className="min-w-0"><h3 className="font-semibold text-gray-100">{item.title}</h3>
          <p className="text-sm text-gray-400 mt-2 min-h-[3rem]">{item.description}</p>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-nutanix-cyan mt-4">{item.cta}<ArrowRight size={16} /></span></div>
        </Link>)}
      </div>
    </section>
    <div className="card grid grid-cols-2 xl:grid-cols-4 gap-5" aria-label="Recorded operations summary">
      {metrics.map(item => <Link key={item.title} to={item.to} className="flex items-center gap-4 rounded-md focus-visible:ring-2 focus-visible:ring-nutanix-blue">
        <item.icon size={25} className="text-gray-400 shrink-0" /><div><p className="text-2xl font-semibold text-gray-100">{item.value ?? '—'}</p><p className="text-sm text-gray-400">{item.title}</p></div>
      </Link>)}
    </div>
    {error && <p role="status" className="text-sm text-yellow-400">{error}</p>}
    <div className="grid lg:grid-cols-3 gap-4">
      <section className="card lg:col-span-2" aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="section-title">Needs attention</h2>
        {loading ? <p className="text-sm text-gray-400">Collecting recorded operations…</p> : attention.length ? <ul className="divide-y divide-border">{attention.map(item => <li key={item.title} className="py-4 flex gap-3 items-start">
          <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-200">{item.title}</p><p className="text-sm text-gray-400 mt-1 break-words">{item.text}</p></div>
          {item.to.startsWith('#') ? <a href={item.to} onClick={() => { const panel = document.getElementById('platform-details'); if (panel instanceof HTMLDetailsElement) panel.open = true }} className="text-sm text-nutanix-cyan shrink-0">{item.action}</a> : <Link to={item.to} className="text-sm text-nutanix-cyan shrink-0">{item.action}</Link>}
        </li>)}</ul> : <p className="text-sm text-gray-400 py-4">{unavailable ? 'Attention records are unavailable; review the source pages.' : 'No attention items in the collected records. This is not a live cluster health assessment.'}</p>}
      </section>
      <section className="card" aria-labelledby="recovery-preparation-heading">
        <h2 id="recovery-preparation-heading" className="section-title">Recovery preparation</h2>
        <p className="text-sm text-gray-400 mb-5">Review dates and evidence before recovery.</p>
        <dl className="space-y-4 text-sm">{[['Reviewed profiles', reviewed], ['Profiles with rehearsal recorded', rehearsed], ['Profiles needing review', needsReview]].map(([label, value]) => <div key={label} className="flex gap-3 justify-between"><dt className="text-gray-400">{label}</dt><dd className="font-semibold text-gray-100">{error ? '—' : value ?? '—'}</dd></div>)}</dl>
        <Link to="/recovery" className="inline-flex items-center gap-2 mt-6 text-sm text-nutanix-cyan">View datacenters<ArrowRight size={16} /></Link>
      </section>
    </div>
    <section className="card" aria-labelledby="recent-jobs-heading">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 id="recent-jobs-heading" className="section-title mb-0">Recent activity</h2><Link to="/jobs" className="text-sm text-nutanix-cyan">View all jobs</Link></div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-surface-elevated text-gray-400"><tr>{['Cluster', 'Operation', 'Outcome', 'Updated', 'Action'].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">
        {recent.map(job => {
          const run = data?.runs.find(r => r.deploymentJobId === job.id || r.currentJobId === job.id || r.steps?.some(s => s.jobId === job.id))
          const operationName = (job.type === 'script' ? SCRIPTS : WORKFLOWS).find(item => item.id === job.workflow)?.name || job.workflow
          const success = job.status === 'success'
          return <tr key={job.id}><td className="px-3 py-3 text-gray-300">{run?.clusterName || 'Not linked'}</td><td className="px-3 py-3 text-gray-300">{operationName}</td><td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 ${success ? 'text-nutanix-teal' : job.status === 'failed' ? 'text-red-400' : 'text-gray-300'}`}>{success ? <CheckCircle size={14} /> : <Clock size={14} />}{success ? 'Job succeeded' : job.status}</span>{job.status === 'running' && job.progress && <p className="text-xs text-gray-500 mt-1">{job.progress.estimated ? 'Estimated ' : ''}{job.progress.percent}%</p>}</td><td className="px-3 py-3 text-gray-400 whitespace-nowrap">{displayDate(job.updatedAt || job.createdAt)}</td><td className="px-3 py-3"><Link to={`/jobs?job=${encodeURIComponent(job.id)}`} className="text-nutanix-cyan whitespace-nowrap" aria-label={`View job ${job.id}`}>View job<ArrowRight size={13} className="inline ml-1" /></Link></td></tr>
        })}
      </tbody></table></div>
      {!recent.length && <p className="py-6 text-sm text-gray-400">{loading ? 'Loading jobs…' : 'No recorded jobs. Start with a guided task above.'}</p>}
      <p className="mt-4 text-xs text-gray-500">Job success does not establish verified readiness. Review target settings and retain independent acceptance evidence.</p>
    </section>
    <p className="flex items-start gap-2 text-xs text-gray-500"><Info size={15} className="shrink-0" />Recovery rebuilds infrastructure. VM restoration remains with your backup platform. Cluster profiles are saved recovery records, not discovered live inventory.</p>
    <Link to="/pipelines" className="inline-flex items-center gap-2 text-sm text-nutanix-cyan"><GitBranch size={16} />Run saved automation</Link>
  </div>
}
