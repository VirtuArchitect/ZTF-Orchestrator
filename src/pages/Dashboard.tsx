import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Server, CheckCircle, XCircle, Clock,
  Activity, AlertTriangle, Zap, Settings, Download,
  TrendingUp, Database, Cloud, RefreshCw, ShieldCheck
} from 'lucide-react'
import Layout from '../components/Layout'
import { useStore } from '../store'
import type { Execution, SystemCheck } from '../types'
import { apiFetch } from '../utils/api'
import clsx from 'clsx'

interface SystemStatus {
  checks: SystemCheck[]
  ztfInstalled: boolean
}

const QUICK_ACTIONS = [
  { label: 'Deploy Prism Central', icon: Cloud, path: '/workflows/deploy-pc', color: 'text-blue-400' },
  { label: 'Cluster Create', icon: Server, path: '/workflows/cluster-create', color: 'text-emerald-400' },
  { label: 'Configure Cluster', icon: Settings, path: '/workflows/config-cluster', color: 'text-yellow-400' },
  { label: 'NDB Deploy', icon: Database, path: '/workflows/ndb', color: 'text-purple-400' },
]

export default function Dashboard() {
  const { setSystemChecks, ztfInstalled, systemChecks } = useStore()
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    try {
      const [sysResp, execResp] = await Promise.all([
        apiFetch('/api/system/check'),
        apiFetch('/api/executions'),
      ])
      if (sysResp.ok) {
        const data: SystemStatus = await sysResp.json()
        setSystemChecks(data.checks, data.ztfInstalled)
      }
      if (execResp.ok) {
        setExecutions(await execResp.json())
      }
    } finally {
      setLoading(false)
      if (showSpinner) setRefreshing(false)
    }
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(() => refresh(), 30_000)
    return () => clearInterval(interval)
  }, [setSystemChecks])

  const successCount = executions.filter(e => e.status === 'success').length
  const failCount = executions.filter(e => e.status === 'failed').length
  const healthFailures = systemChecks.filter(check => !check.ok)
  const lastRun = executions[0]

  const stats = [
    { label: 'Total Runs', value: executions.length, hint: 'Recorded executions', icon: Activity, color: 'text-nutanix-cyan', path: '/executions' },
    { label: 'Successful', value: successCount, hint: 'Completed without error', icon: CheckCircle, color: 'text-nutanix-teal', path: '/executions?status=success' },
    { label: 'Failed', value: failCount, hint: 'Needs operator review', icon: XCircle, color: failCount ? 'text-red-400' : 'text-gray-500', path: '/executions?status=failed' },
    { label: 'Last Run', value: lastRun ? new Date(lastRun.timestamp).toLocaleDateString() : 'Never', hint: lastRun?.workflow ?? 'No execution history', icon: Clock, color: 'text-yellow-400' },
  ]

  return (
    <Layout
      title="Dashboard"
      subtitle="ZeroTouch Framework Control Center"
      actions={
        <div className="flex gap-2">
          <button onClick={() => refresh(true)} disabled={refreshing} className="btn-secondary gap-1.5">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          {!ztfInstalled && (
            <Link to="/setup" className="btn-primary gap-2">
              <Download size={14} />
              Install ZTF
            </Link>
          )}
        </div>
      }
    >
      <div className={clsx(
        'mb-6 rounded-lg border p-4 sm:p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
        ztfInstalled
          ? 'border-nutanix-teal/30 bg-nutanix-teal/5'
          : 'border-yellow-700/40 bg-yellow-900/10'
      )}>
        <div className="flex items-start gap-3">
          {ztfInstalled
            ? <ShieldCheck size={20} className="text-nutanix-teal mt-0.5 flex-shrink-0" />
            : <AlertTriangle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          }
          <div>
            <p className={clsx('font-semibold', ztfInstalled ? 'text-gray-100' : 'text-yellow-300')}>
              {ztfInstalled ? 'Framework ready for orchestration' : 'ZeroTouch Framework not installed'}
            </p>
            <p className={clsx('text-sm mt-0.5', ztfInstalled ? 'text-gray-400' : 'text-yellow-400/70')}>
              {ztfInstalled
                ? 'System checks refresh every 30 seconds. Review failures before launching workflows.'
                : 'Run the setup wizard before automating Nutanix deployments.'}
            </p>
          </div>
        </div>
        <Link to={ztfInstalled ? '/executions' : '/setup'} className={ztfInstalled ? 'btn-secondary' : 'btn-secondary text-yellow-300 border-yellow-700/40 hover:border-yellow-600'}>
          {ztfInstalled ? 'View Execution History' : 'Open Setup Wizard'}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats.map(stat => {
          const isClickable = Boolean(stat.path && typeof stat.value === 'number' && stat.value > 0 && !loading)
          const content = (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={clsx('text-xs font-medium', isClickable ? 'text-gray-400' : 'text-gray-500')}>{stat.label}</p>
                <p className="text-2xl font-bold text-gray-100 mt-1">{loading ? '-' : stat.value}</p>
                <p className="text-xs text-gray-600 mt-1 truncate">{stat.hint}</p>
              </div>
              <div className={clsx('p-2 rounded-md bg-gray-800', stat.color)}>
                <stat.icon size={18} />
              </div>
            </div>
          )

          return isClickable ? (
            <Link
              key={stat.label}
              to={stat.path!}
              aria-label={`View ${stat.label.toLowerCase()} in execution history`}
              className="card block transition-all hover:-translate-y-0.5 hover:border-nutanix-cyan/40 hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-nutanix-cyan/40"
            >
              {content}
            </Link>
          ) : (
            <div key={stat.label} className="card">
              {content}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card xl:col-span-1">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 className="section-title flex items-center gap-2 mb-0">
              <TrendingUp size={16} className="text-nutanix-cyan" />
              System Status
            </h2>
            <span className={healthFailures.length ? 'badge-red' : 'badge-green'}>
              {healthFailures.length ? `${healthFailures.length} issue${healthFailures.length === 1 ? '' : 's'}` : 'Healthy'}
            </span>
          </div>
          <div className="space-y-2.5">
            {systemChecks.length === 0 && !loading && (
              <p className="text-sm text-gray-500">No status data. <Link to="/setup" className="text-nutanix-cyan hover:underline">Run check</Link></p>
            )}
            {systemChecks.map(check => (
              <div key={check.name} className="flex items-start gap-3 rounded-md bg-gray-900/40 px-3 py-2">
                {check.ok
                  ? <CheckCircle size={14} className="text-nutanix-teal flex-shrink-0 mt-0.5" />
                  : <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                }
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-300">{check.name}</div>
                  {check.value && (
                    <div className="text-xs text-gray-500 font-mono truncate" title={check.value}>{check.value}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Zap size={16} className="text-nutanix-cyan" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map(action => (
              <Link
                key={action.path}
                to={action.path}
                className="flex flex-col items-center gap-2 p-3 rounded-md bg-surface-elevated border border-border hover:border-border-light transition-all group"
              >
                <action.icon size={20} className={clsx(action.color, 'group-hover:scale-110 transition-transform')} />
                <span className="text-xs text-gray-400 text-center leading-tight">{action.label}</span>
              </Link>
            ))}
          </div>
          <Link to="/workflows" className="mt-3 flex items-center justify-center text-xs text-gray-500 hover:text-nutanix-cyan transition-colors">
            View all workflows
          </Link>
        </div>

        <div className="card">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Activity size={16} className="text-nutanix-cyan" />
            Recent Executions
          </h2>
          <div className="space-y-2">
            {executions.length === 0 && (
              <div className="empty-state py-8">
                <Activity size={28} className="mx-auto mb-3 text-gray-700" />
                <p className="text-sm font-medium text-gray-400">No executions yet</p>
                <p className="text-xs text-gray-600 mt-1">Launch a workflow or script to populate this feed.</p>
              </div>
            )}
            {executions.slice(0, 6).map(exec => (
              <div key={exec.id} className="flex items-center gap-2.5 py-1.5">
                <StatusDot status={exec.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate font-medium">{exec.workflow}</p>
                  <p className="text-xs text-gray-500">{new Date(exec.timestamp).toLocaleString()}</p>
                </div>
                {exec.duration && (
                  <span className="text-xs text-gray-600 flex-shrink-0">{(exec.duration / 1000).toFixed(1)}s</span>
                )}
              </div>
            ))}
          </div>
          {executions.length > 0 && (
            <Link to="/executions" className="mt-3 flex items-center justify-center text-xs text-gray-500 hover:text-nutanix-cyan transition-colors">
              View all executions
            </Link>
          )}
        </div>
      </div>
    </Layout>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <div className={clsx(
      'w-2 h-2 rounded-full flex-shrink-0',
      status === 'success' ? 'bg-nutanix-teal' :
      status === 'failed' ? 'bg-red-400' :
      status === 'running' ? 'bg-yellow-400 animate-pulse' :
      'bg-gray-600'
    )} />
  )
}
