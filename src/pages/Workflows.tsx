import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
  ChevronRight, Search
} from 'lucide-react'
import Layout from '../components/Layout'
import { WORKFLOWS } from '../data'
import type { WorkflowDef } from '../types'
import clsx from 'clsx'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Server, HardDrive, Layers, Globe, Settings, Cloud,
  Sliders, GitBranch, Monitor, Wrench, Cpu, Zap, Database,
}

const CATEGORY_COLORS: Record<string, string> = {
  'Infrastructure': 'badge-blue',
  'Prism Central': 'badge-purple',
  'Configuration': 'badge-yellow',
  'Pod Operations': 'badge-green',
  'Workloads': 'badge-blue',
  'Services': 'badge-red',
}

const CATEGORIES = ['All', 'Infrastructure', 'Prism Central', 'Configuration', 'Pod Operations', 'Workloads', 'Services']

function WorkflowCard({ workflow }: { workflow: WorkflowDef }) {
  const Icon = ICON_MAP[workflow.icon] || Server

  return (
    <Link
      to={`/workflows/${workflow.id}`}
      className="card hover:border-border-light hover:bg-surface-elevated transition-all group cursor-pointer flex flex-col"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-nutanix-blue/10 border border-nutanix-blue/20 flex items-center justify-center flex-shrink-0 group-hover:bg-nutanix-blue/20 transition-colors">
          <Icon size={18} className="text-nutanix-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-100 group-hover:text-white transition-colors">{workflow.name}</h3>
          <span className={clsx('badge mt-1', CATEGORY_COLORS[workflow.category] || 'badge-gray')}>
            {workflow.category}
          </span>
        </div>
        <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors mt-1" />
      </div>
      <p className="text-sm text-gray-400 leading-relaxed flex-1">{workflow.description}</p>
      <div className="mt-3 pt-3 border-t border-border/50">
        <span className="text-xs font-mono text-gray-600">{workflow.configFile}</span>
      </div>
    </Link>
  )
}

export default function Workflows() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')

  const filtered = WORKFLOWS.filter(w => {
    const matchSearch = !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || w.category === category
    return matchSearch && matchCat
  })

  const grouped = CATEGORIES.slice(1).reduce<Record<string, WorkflowDef[]>>((acc, cat) => {
    const items = filtered.filter(w => w.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <Layout title="Workflows" subtitle="Pre-built automation workflows for Nutanix deployments">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9 w-64"
            placeholder="Search workflows..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                category === cat
                  ? 'bg-nutanix-blue text-white'
                  : 'bg-surface border border-border text-gray-400 hover:text-gray-200 hover:border-border-light'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow Grid */}
      {category === 'All' ? (
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, workflows]) => (
            <section key={cat}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{cat}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {workflows.map(w => <WorkflowCard key={w.id} workflow={w} />)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(w => <WorkflowCard key={w.id} workflow={w} />)}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p>No workflows match your search</p>
        </div>
      )}
    </Layout>
  )
}
