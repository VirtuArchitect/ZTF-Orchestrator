import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Download, Settings, Workflow, Terminal,
  History, FileCode, Wrench, ChevronRight, Activity
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
  { path: '/executions', icon: History, label: 'Executions' },
  { path: '/settings', icon: Wrench, label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarOpen, ztfInstalled } = useStore()
  const location = useLocation()

  return (
    <aside className={clsx(
      'fixed top-0 left-0 h-full bg-gray-950 border-r border-border flex flex-col transition-all duration-300 z-40',
      sidebarOpen ? 'w-64' : 'w-16'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border flex-shrink-0 gap-3">
        <div className="w-8 h-8 rounded-lg bg-nutanix-blue flex items-center justify-center flex-shrink-0">
          <Activity size={16} className="text-white" />
        </div>
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-100 truncate">ZeroTouch</div>
            <div className="text-xs text-gray-500 truncate">Framework UI</div>
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
          <p className="text-xs text-gray-600">ZTF UI v1.0.0</p>
        </div>
      )}
    </aside>
  )
}
