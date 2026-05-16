import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Setup from './pages/Setup'
import GlobalConfig from './pages/GlobalConfig'
import Workflows from './pages/Workflows'
import WorkflowDetail from './pages/WorkflowDetail'
import Scripts from './pages/Scripts'
import Executions from './pages/Executions'
import Settings from './pages/Settings'
import ConfigFiles from './pages/ConfigFiles'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/global-config" element={<GlobalConfig />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/workflows/:id" element={<WorkflowDetail />} />
        <Route path="/scripts" element={<Scripts />} />
        <Route path="/configs" element={<ConfigFiles />} />
        <Route path="/executions" element={<Executions />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}
