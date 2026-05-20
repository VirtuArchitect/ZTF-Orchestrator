import Layout from '../components/Layout'
import { ShieldCheck } from 'lucide-react'
import { useStore } from '../store'

export default function Governance() {
  const user = useStore(s => s.user)

  return (
    <Layout title="Governance" subtitle="Access controls and compliance">
      <div className="max-w-2xl space-y-6">

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={18} className="text-nutanix-cyan" />
            <h3 className="font-semibold text-gray-100">Current Session</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="text-gray-500">Signed in as</div>
            <div className="text-gray-200 font-medium">{user?.username ?? '—'}</div>
            <div className="text-gray-500">Role</div>
            <div className="text-gray-200">{user?.role ?? '—'}</div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-100 mb-3">Role Permissions</h3>
          <div className="space-y-3 text-sm">
            {[
              { role: 'admin',    perms: 'Full access — settings, global config, user management, all workflows' },
              { role: 'operator', perms: 'Execute workflows and scripts, manage config files, view executions' },
              { role: 'viewer',   perms: 'Read-only — view configs, execution history, and system status' },
            ].map(r => (
              <div key={r.role}
                className={`p-3 rounded-lg border ${user?.role === r.role
                  ? 'border-nutanix-blue/50 bg-nutanix-blue/5'
                  : 'border-border bg-gray-900/50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-200 capitalize">{r.role}</span>
                  {user?.role === r.role && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-nutanix-blue/20 text-nutanix-cyan border border-nutanix-blue/30">
                      your role
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-xs">{r.perms}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card bg-amber-900/5 border-amber-700/30">
          <h3 className="font-semibold text-gray-100 mb-2">User Management</h3>
          <p className="text-sm text-gray-400">
            Create, edit, and delete user accounts in{' '}
            <span className="text-nutanix-cyan">Settings → Users</span>.
            Only administrators can manage accounts.
          </p>
        </div>

      </div>
    </Layout>
  )
}
