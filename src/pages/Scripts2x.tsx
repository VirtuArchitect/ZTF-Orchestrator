import { useCallback, useMemo, useState } from 'react'
import {
  Boxes, Cpu, GitBranch, HardDrive, Layers, Network, Play,
  Search, ShieldCheck, Terminal,
} from 'lucide-react'
import type { ComponentType } from 'react'
import Layout from '../components/Layout'
import YamlPreview from '../components/YamlPreview'
import Ztf2WorkflowForm from '../components/forms/Ztf2WorkflowForm'
import type { Ztf2WorkflowArtifacts } from '../components/forms/Ztf2WorkflowForm'
import { ZTF2_SCRIPT_CATEGORIES, ZTF2_SCRIPTS } from '../data'
import { useStore } from '../store'
import type { Ztf2ScriptDef } from '../types'
import clsx from 'clsx'
import { Ztf2WorkflowPlanModal } from './WorkflowDetail'

const ICON_MAP: Record<string, ComponentType<{ size?: string | number; className?: string }>> = {
  Boxes,
  Cpu,
  GitBranch,
  HardDrive,
  Layers,
  Network,
  ShieldCheck,
}

const CATEGORY_COLORS: Record<string, string> = {
  'Prism Central': 'badge-blue',
  Configuration: 'badge-yellow',
  Workloads: 'badge-green',
  Security: 'badge-red',
  'Data Protection': 'badge-purple',
}

function ScriptCard({
  action,
  active,
  onSelect,
}: {
  action: Ztf2ScriptDef
  active: boolean
  onSelect: () => void
}) {
  const Icon = ICON_MAP[action.icon] || Boxes
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'w-full text-left rounded-lg border p-3 transition-all',
        active
          ? 'border-nutanix-blue bg-nutanix-blue/15'
          : 'border-border bg-surface hover:border-border-light hover:bg-surface-elevated'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-nutanix-cyan" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-100 truncate">{action.name}</p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">{action.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={clsx('badge text-xs', CATEGORY_COLORS[action.category] || 'badge-gray')}>
              {action.category}
            </span>
            <span className="badge badge-yellow text-xs">ZTF 2.x</span>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function Scripts2x() {
  const settings = useStore(s => s.settings)
  const activeProfile = settings.connectionProfiles?.find(p => p.id === settings.activeProfileId)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState(ZTF2_SCRIPTS[0]?.id || '')
  const [yamlContent, setYamlContent] = useState('')
  const [artifacts, setArtifacts] = useState<Ztf2WorkflowArtifacts | null>(null)
  const [showPlan, setShowPlan] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return ZTF2_SCRIPTS.filter(action => {
      const matchesSearch = !query ||
        `${action.name} ${action.id} ${action.description} ${action.legacyScriptIds.join(' ')}`.toLowerCase().includes(query)
      const matchesCategory = category === 'All' || action.category === category
      return matchesSearch && matchesCategory
    })
  }, [category, search])

  const selected = ZTF2_SCRIPTS.find(action => action.id === selectedId) || ZTF2_SCRIPTS[0]

  const handleYamlChange = useCallback((yaml: string) => {
    setYamlContent(yaml)
  }, [])

  const handleArtifactsChange = useCallback((next: Ztf2WorkflowArtifacts) => {
    setArtifacts(next)
  }, [])

  return (
    <Layout
      title="Scripts 2.x"
      subtitle="ZTF 2.x IaC actions converted from safe declarative script patterns"
      actions={
        <button
          type="button"
          onClick={() => setShowPlan(true)}
          disabled={!artifacts}
          className="btn-success gap-1.5"
          title={!artifacts ? 'Select an action first' : 'Submit a governed ZTF 2.x plan job'}
        >
          <Play size={14} />
          Run Plan
        </button>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <div className="space-y-3 min-w-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              className="input pl-9"
              placeholder="Search actions..."
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {['All', ...ZTF2_SCRIPT_CATEGORIES].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={clsx(
                  'px-2 py-1 rounded text-xs font-medium transition-all',
                  category === cat
                    ? 'bg-nutanix-blue text-white'
                    : 'bg-surface border border-border text-gray-500 hover:text-gray-300'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-gray-950/40 p-2">
            <p className="text-xs text-gray-600 px-1">{filtered.length} actions</p>
            {filtered.map(action => (
              <ScriptCard
                key={action.id}
                action={action}
                active={action.id === selected?.id}
                onSelect={() => {
                  setSelectedId(action.id)
                  setShowPlan(false)
                }}
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          {selected ? (
            <>
              <div className="card">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0">
                    <Terminal size={17} className="text-nutanix-cyan" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">{selected.name}</h2>
                    <p className="mt-1 text-sm text-gray-400 leading-relaxed">{selected.details}</p>
                    {selected.legacyScriptIds.length > 0 && (
                      <p className="mt-3 text-xs text-gray-500">
                        Legacy mapping:{' '}
                        <span className="font-mono text-gray-300">{selected.legacyScriptIds.join(', ')}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)] gap-4">
                <Ztf2WorkflowForm
                  workflow={selected}
                  profile={activeProfile}
                  onYamlChange={handleYamlChange}
                  onArtifactsChange={handleArtifactsChange}
                />
                <div className="min-w-0">
                  {yamlContent ? (
                    <YamlPreview content={yamlContent} filename="input.yml" />
                  ) : (
                    <div className="card text-center py-12 text-gray-500">
                      <p>Select an action to generate ZTF 2.x input.yml</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card text-center py-12 text-gray-500">
              <p>No ZTF 2.x actions match the current filters.</p>
            </div>
          )}
        </div>
      </div>

      {showPlan && selected && artifacts && (
        <Ztf2WorkflowPlanModal
          onClose={() => setShowPlan(false)}
          workflowId={selected.id}
          artifacts={artifacts}
        />
      )}
    </Layout>
  )
}
