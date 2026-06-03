import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import Dashboard     from './pages/Dashboard'
import Setup         from './pages/Setup'
import GlobalConfig  from './pages/GlobalConfig'
import Workflows     from './pages/Workflows'
import WorkflowDetail from './pages/WorkflowDetail'
import Scripts       from './pages/Scripts'
import Executions    from './pages/Executions'
import Jobs          from './pages/Jobs'
import Settings      from './pages/Settings'
import ConfigFiles   from './pages/ConfigFiles'
import UserRoles     from './pages/UserRoles'
import Pipelines     from './pages/Pipelines'
import AuditLog      from './pages/AuditLog'
import DriftDetection    from './pages/DriftDetection'
import Schedules         from './pages/Schedules'
import ParallelExecution from './pages/ParallelExecution'
import Approvals         from './pages/Approvals'
import Login             from './pages/Login'
import Layout            from './components/Layout'

type Role = 'admin' | 'operator' | 'viewer'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const sessionToken = useStore(s => s.sessionToken)
  if (!sessionToken) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AccessDenied() {
  return (
    <Layout title="Access Denied" subtitle="Your current role does not allow access to this area">
      <div className="card max-w-xl">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Permission Required</h2>
        <p className="text-sm text-gray-400">
          This page is restricted by role. Contact an administrator if you need additional access.
        </p>
      </div>
    </Layout>
  )
}

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const sessionToken = useStore(s => s.sessionToken)
  const user = useStore(s => s.user)
  if (!sessionToken) return <Navigate to="/login" replace />
  if (!user || !roles.includes(user.role)) return <AccessDenied />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route path="/" element={
          <RequireAuth><Dashboard /></RequireAuth>
        } />
        <Route path="/setup" element={
          <RequireRole roles={['admin', 'operator']}><Setup /></RequireRole>
        } />
        <Route path="/global-config" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><GlobalConfig /></RequireRole>
        } />
        <Route path="/workflows" element={
          <RequireRole roles={['admin', 'operator']}><Workflows /></RequireRole>
        } />
        <Route path="/workflows/:id" element={
          <RequireRole roles={['admin', 'operator']}><WorkflowDetail /></RequireRole>
        } />
        <Route path="/scripts" element={
          <RequireRole roles={['admin', 'operator']}><Scripts /></RequireRole>
        } />
        <Route path="/configs" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><ConfigFiles /></RequireRole>
        } />
        <Route path="/executions" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><Executions /></RequireRole>
        } />
        <Route path="/jobs" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><Jobs /></RequireRole>
        } />
        <Route path="/settings" element={
          <RequireRole roles={['admin', 'operator']}><Settings /></RequireRole>
        } />
        <Route path="/users" element={
          <RequireRole roles={['admin']}><UserRoles /></RequireRole>
        } />
        <Route path="/pipelines" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><Pipelines /></RequireRole>
        } />
        <Route path="/drift" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><DriftDetection /></RequireRole>
        } />
        <Route path="/audit-log" element={
          <RequireRole roles={['admin']}><AuditLog /></RequireRole>
        } />
        <Route path="/schedules" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><Schedules /></RequireRole>
        } />
        <Route path="/parallel" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><ParallelExecution /></RequireRole>
        } />
        <Route path="/approvals" element={
          <RequireRole roles={['admin', 'operator', 'viewer']}><Approvals /></RequireRole>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
