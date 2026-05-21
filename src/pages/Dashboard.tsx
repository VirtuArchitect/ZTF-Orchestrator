import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Server, CheckCircle, XCircle, Clock,
  Activity, AlertTriangle, Zap, Settings, Download,
  TrendingUp, Database, Cloud, RefreshCw
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

  const stats = [
    { label: 'Total Runs', value: executions.length, icon: Activity, color: 'text-nutanix-cyan' },
    { label: 'Successful', value: successCount, icon: CheckCircle, color: 'text-nutanix-teal' },
    { label: 'Failed', value: failCount, icon: XCircle, color: 'text-red-400' },
    { label: 'Last Run', value: executions[0] ? new Date(executions[0].timestamp).toLocaleDateString() : 'Never', icon: Clock, color: 'text-yellow-400' },
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
      {/* Welcome Banner */}
      {!ztfInstalled && (
        <div className="mb-6 p-5 rounded-xl border border-yellow-700/40 bg-yellow-900/10 flex items-start gap-4">
          <AlertTriangle size={20} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-yellow-300">ZeroTouch Framework Not Installed</p>
            <p className="text-sm text-yellow-400/70 mt-0.5">
              The ZTF Python framework is not detected. Run the setup wizard to install it and start automating Nutanix deployments.
            </p>
            <Link to="/setup" className="btn-secondary mt-3 text-yellow-300 border-yellow-700/40 hover:border-yellow-600">
              Open Setup Wizard →
            </Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map(stat => (
          <div key={stat.label} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-100 mt-1">{loading ? '—' : stat.value}</p>
              </div>
              <div className={clsx('p-2 rounded-lg bg-gray-800', stat.color)}>
                <stat.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Status */}
        <div className="card lg:col-span-1">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-nutanix-cyan" />
            System Status
          </h2>
          <div className="space-y-2.5">
            {systemChecks.length === 0 && !loading && (
              <p className="text-sm text-gray-500">No status data. <Link to="/setup" className="text-nutanix-cyan hover:underline">Run check</Link></p>
            )}
            {systemChecks.map(check => (
              <div key={check.name} className="flex items-center gap-3">
                {check.ok
                  ? <CheckCircle size={14} className="text-nutanix-teal flex-shrink-0" />
                  : <XCircle size={14} className="text-red-400 flex-shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-300">{check.name}</span>
                  {check.value && (
                    <span className="text-xs text-gray-500 ml-2 font-mono truncate">{check.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
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
                className="flex flex-col items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border hover:border-border-light transition-all group"
              >
                <action.icon size={20} className={clsx(action.color, 'group-hover:scale-110 transition-transform')} />
                <span className="text-xs text-gray-400 text-center leading-tight">{action.label}</span>
              </Link>
            ))}
          </div>
          <Link to="/workflows" className="mt-3 flex items-center justify-center text-xs text-gray-500 hover:text-nutanix-cyan transition-colors">
            View all workflows →
          </Link>
        </div>

        {/* Recent Executions */}
        <div className="card">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Activity size={16} className="text-nutanix-cyan" />
            Recent Executions
          </h2>
          <div className="space-y-2">
            {executions.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No executions yet</p>
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
              View all executions →
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
