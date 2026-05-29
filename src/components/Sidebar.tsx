import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Download, Settings, Workflow, Terminal,
  History, FileCode, Wrench, ChevronRight, Users, GitBranch, ScrollText
} from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/setup', icon: Download, label: 'Setup & Install' },
  { path: '/global-config', icon: Settings, label: 'Global Config' },
  { path: '/workflows', icon: Workflow, label: 'Workflows' },
  { path: '/scripts', icon: Terminal, label: 'Scripts' },
  { path: '/configs', icon: FileCode, label: 'Config Files' },
  { path: '/executions', icon: History,    label: 'Executions' },
  { path: '/pipelines',  icon: GitBranch,  label: 'Pipelines' },
  { path: '/audit-log',  icon: ScrollText, label: 'Audit Log' },
  { path: '/users',      icon: Users,      label: 'Users' },
  { path: '/settings',  icon: Wrench, label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarOpen, ztfInstalled, toggleSidebar } = useStore()
  const location = useLocation()

  return (
    <aside className={clsx(
      'fixed top-0 left-0 h-full bg-gray-950 border-r border-border flex flex-col transition-all duration-300 z-40 shadow-2xl shadow-black/20 md:shadow-none',
      sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-16'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border flex-shrink-0 gap-3">
        <img
          src="/veridian-mark.svg"
          alt="ZeroTouch"
          className="w-8 h-8 rounded-lg flex-shrink-0"
        />
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-100 truncate">ZeroTouch</div>
            <div className="text-xs text-gray-500 truncate">Enterprise Orchestrator</div>
          </div>
        )}
      </div>

      {/* Status indicator */}
      {sidebarOpen && (
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-lg bg-surface border border-border">
          <div className="flex items-center gap-2">
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', ztfInstalled ? 'bg-nutanix-teal' : 'bg-yellow-500')} />
            <span className="text-xs text-gray-400 truncate">
              {ztfInstalled ? 'Framework installed' : 'Framework not found'}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="space-y-0.5 px-2">
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path))
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => {
                  if (window.innerWidth < 768 && sidebarOpen) toggleSidebar()
                }}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm group',
                  active
                    ? 'bg-nutanix-blue text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface'
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate font-medium">{item.label}</span>
                    {active && <ChevronRight size={14} className="flex-shrink-0 opacity-60" />}
                  </>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Version */}
      {sidebarOpen && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-gray-600">ZeroTouch Enterprise Orchestrator v1.2.4</p>
          <p className="text-xs text-gray-700 mt-1">Developed by John Goulden</p>
        </div>
      )}
    </aside>
  )
}
