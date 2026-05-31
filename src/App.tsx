import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useStore } from './store'
import Dashboard     from './pages/Dashboard'
import Setup         from './pages/Setup'
import GlobalConfig  from './pages/GlobalConfig'
import Workflows     from './pages/Workflows'
import WorkflowDetail from './pages/WorkflowDetail'
import Scripts       from './pages/Scripts'
import Executions    from './pages/Executions'
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const sessionToken = useStore(s => s.sessionToken)
  if (!sessionToken) return <Navigate to="/login" replace />
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
          <RequireAuth><Setup /></RequireAuth>
        } />
        <Route path="/global-config" element={
          <RequireAuth><GlobalConfig /></RequireAuth>
        } />
        <Route path="/workflows" element={
          <RequireAuth><Workflows /></RequireAuth>
        } />
        <Route path="/workflows/:id" element={
          <RequireAuth><WorkflowDetail /></RequireAuth>
        } />
        <Route path="/scripts" element={
          <RequireAuth><Scripts /></RequireAuth>
        } />
        <Route path="/configs" element={
          <RequireAuth><ConfigFiles /></RequireAuth>
        } />
        <Route path="/executions" element={
          <RequireAuth><Executions /></RequireAuth>
        } />
        <Route path="/settings" element={
          <RequireAuth><Settings /></RequireAuth>
        } />
        <Route path="/users" element={
          <RequireAuth><UserRoles /></RequireAuth>
        } />
        <Route path="/pipelines" element={
          <RequireAuth><Pipelines /></RequireAuth>
        } />
        <Route path="/drift" element={
          <RequireAuth><DriftDetection /></RequireAuth>
        } />
        <Route path="/audit-log" element={
          <RequireAuth><AuditLog /></RequireAuth>
        } />
        <Route path="/schedules" element={
          <RequireAuth><Schedules /></RequireAuth>
        } />
        <Route path="/parallel" element={
          <RequireAuth><ParallelExecution /></RequireAuth>
        } />
        <Route path="/approvals" element={
          <RequireAuth><Approvals /></RequireAuth>
        } />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
