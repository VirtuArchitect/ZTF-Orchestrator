import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
  ArrowLeft, Play, Download, Save
} from 'lucide-react'
import Layout from '../components/Layout'
import YamlPreview from '../components/YamlPreview'
import ExecutionModal from '../components/ExecutionModal'
import { WORKFLOWS } from '../data'
import {
  buildClusterCreateYaml, buildImagingOnlyYaml, buildSiteDeployYaml,
  buildPCDeployYaml, buildClusterConfigYaml, buildCalmWorkloadsYaml,
  buildNDBYaml
} from '../utils/yaml'
import ClusterCreateForm from '../components/forms/ClusterCreateForm'
import ImagingOnlyForm from '../components/forms/ImagingOnlyForm'
import SiteDeployForm from '../components/forms/SiteDeployForm'
import PCDeployForm from '../components/forms/PCDeployForm'
import ClusterConfigForm from '../components/forms/ClusterConfigForm'
import CalmWorkloadsForm from '../components/forms/CalmWorkloadsForm'
import NDBForm from '../components/forms/NDBForm'
import GenericWorkflowForm from '../components/forms/GenericWorkflowForm'
import clsx from 'clsx'

const ICON_MAP: Record<string, React.ComponentType<{ size?: string | number; className?: string }>> = {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
}

const TABS = ['Configure', 'YAML Preview'] as const

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>()
  const workflow = WORKFLOWS.find(w => w.id === id)

  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Configure')
  const [yamlContent, setYamlContent] = useState('')
  const [showExecution, setShowExecution] = useState(false)

  if (!workflow) {
    return (
      <Layout title="Workflow Not Found">
        <div className="text-center py-16">
          <p className="text-gray-500">Workflow "{id}" not found.</p>
          <Link to="/workflows" className="btn-primary mt-4 inline-flex">← Back to Workflows</Link>
        </div>
      </Layout>
    )
  }

  const Icon = ICON_MAP[workflow.icon] || Server

  const handleYamlGenerated = (yaml: string) => {
    setYamlContent(yaml)
  }

  const download = () => {
    if (!yamlContent) return
    const blob = new Blob([yamlContent], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = workflow.configFile; a.click()
    URL.revokeObjectURL(url)
  }

  const renderForm = () => {
    const props = { onYamlChange: handleYamlGenerated }
    switch (workflow.id) {
      case 'cluster-create': return <ClusterCreateForm {...props} />
      case 'imaging-only': return <ImagingOnlyForm {...props} />
      case 'site-deploy': return <SiteDeployForm {...props} />
      case 'deploy-pc': return <PCDeployForm {...props} />
      case 'config-cluster': return <ClusterConfigForm {...props} />
      case 'calm-vm-workloads': return <CalmWorkloadsForm {...props} />
      case 'ndb': return <NDBForm {...props} />
      default: return <GenericWorkflowForm workflow={workflow} {...props} />
    }
  }

  return (
    <Layout
      title={workflow.name}
      subtitle={workflow.description}
      actions={
        <div className="flex gap-2">
          {yamlContent && (
            <button onClick={download} className="btn-secondary gap-1.5">
              <Download size={14} />
              Download Config
            </button>
          )}
          <button
            onClick={() => yamlContent && setShowExecution(true)}
            disabled={!yamlContent}
            className="btn-success gap-1.5"
            title={!yamlContent ? 'Fill out the form first' : undefined}
          >
            <Play size={14} />
            Run Workflow
          </button>
        </div>
      }
    >
      {/* Back + Info */}
      <div className="flex items-start gap-4 mb-6">
        <Link to="/workflows" className="btn-ghost p-2 -ml-2 mt-0.5">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-nutanix-cyan" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-100">{workflow.name}</h2>
              <span className="text-xs font-mono text-gray-500">--workflow {workflow.id} -f {workflow.configFile}</span>
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed max-w-3xl">{workflow.details}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border w-fit">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              activeTab === tab
                ? 'bg-nutanix-blue text-white shadow'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Configure' && renderForm()}
      {activeTab === 'YAML Preview' && (
        yamlContent
          ? <YamlPreview content={yamlContent} filename={workflow.configFile} />
          : (
            <div className="card text-center py-12 text-gray-500">
              <p>Fill out the Configuration form to see the generated YAML</p>
            </div>
          )
      )}

      {showExecution && yamlContent && (
        <ExecutionModal
          onClose={() => setShowExecution(false)}
          workflow={workflow.id}
          configContent={yamlContent}
          configFile={workflow.configFile}
        />
      )}
    </Layout>
  )
}
