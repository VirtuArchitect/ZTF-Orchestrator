import { Link, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import type { ElementType } from 'react'
import {
  LayoutDashboard, Download, Settings, Workflow, Terminal,
  History, FileCode, Wrench, ChevronRight, Users, GitBranch, ScrollText,
  FileSearch, Clock, Layers, ShieldCheck, ListChecks, Boxes, FileArchive, Archive
} from 'lucide-react'
import { useStore } from '../store'
import { APP_VERSION } from '../version'
import clsx from 'clsx'

type Role = 'admin' | 'operator' | 'viewer'
type NavItem = { path: string; icon: ElementType; label: string; roles: Role[] }
type NavGroup = { label: string; items: NavItem[] }

const ALL_ROLES: Role[] = ['admin', 'operator', 'viewer']
const OPERATORS: Role[] = ['admin', 'operator']
const ADMINS: Role[] = ['admin']

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ALL_ROLES },
      { path: '/setup', icon: Download, label: 'Setup & Install', roles: OPERATORS },
    ],
  },
  {
    label: 'Configure',
    items: [
      { path: '/global-config', icon: Settings, label: 'Global Config', roles: ALL_ROLES },
      { path: '/configs', icon: FileCode, label: 'Config Files', roles: ALL_ROLES },
      { path: '/workflows', icon: Workflow, label: 'Workflows', roles: OPERATORS },
      { path: '/scripts', icon: Terminal, label: 'Scripts', roles: OPERATORS },
    ],
  },
  {
    label: 'Execute',
    items: [
      { path: '/executions', icon: History, label: 'Executions', roles: ALL_ROLES },
      { path: '/jobs', icon: ListChecks, label: 'Jobs / Queue', roles: ALL_ROLES },
      { path: '/pipelines', icon: GitBranch, label: 'Pipelines', roles: ALL_ROLES },
      { path: '/schedules', icon: Clock, label: 'Schedules', roles: ALL_ROLES },
      { path: '/parallel', icon: Layers, label: 'Parallel Exec', roles: ALL_ROLES },
      { path: '/nkp', icon: Boxes, label: 'NKP Framework', roles: ALL_ROLES },
    ],
  },
  {
    label: 'Govern',
    items: [
      { path: '/approvals', icon: ShieldCheck, label: 'Approvals', roles: ALL_ROLES },
      { path: '/appliance', icon: Archive, label: 'Appliance Ops', roles: ALL_ROLES },
      { path: '/validation-evidence', icon: FileArchive, label: 'Validation Evidence', roles: ALL_ROLES },
      { path: '/drift', icon: FileSearch, label: 'Drift Detection', roles: ALL_ROLES },
      { path: '/audit-log', icon: ScrollText, label: 'Audit Log', roles: ADMINS },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/users', icon: Users, label: 'Users', roles: ADMINS },
      { path: '/settings', icon: Wrench, label: 'Settings', roles: OPERATORS },
    ],
  },
]

export default function Sidebar() {
  const {
    sidebarOpen,
    sidebarPreferenceInitialized,
    ztfInstalled,
    toggleSidebar,
    setSidebarOpen,
    markSidebarPreferenceInitialized,
    user,
  } = useStore()
  const location = useLocation()
  const role = user?.role
  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => role && item.roles.includes(role)),
  })).filter(group => group.items.length > 0)

  useEffect(() => {
    if (!sidebarPreferenceInitialized) {
      setSidebarOpen(true)
      markSidebarPreferenceInitialized()
    }
  }, [markSidebarPreferenceInitialized, setSidebarOpen, sidebarPreferenceInitialized])

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
            <div className="text-xs text-gray-500 truncate">Orchestrator</div>
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
        <div className="space-y-4 px-2">
          {visibleGroups.map(group => (
            <div key={group.label}>
              {sidebarOpen ? (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  {group.label}
                </div>
              ) : (
                <div className="mx-3 mb-1 border-t border-border/70" />
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
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
            </div>
          ))}
        </div>
      </nav>

      {/* Navigation mode */}
      <div className={clsx('border-t border-border p-3', sidebarOpen ? 'space-y-3' : 'flex justify-center')}>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Use compact navigation' : 'Use labeled navigation'}
          title={sidebarOpen ? 'Use compact navigation' : 'Use labeled navigation'}
          className={clsx(
            'flex items-center rounded-lg border border-border bg-surface text-gray-400 transition-colors hover:text-gray-200 hover:border-border-light',
            sidebarOpen ? 'w-full justify-between px-3 py-2 text-xs' : 'h-10 w-10 justify-center'
          )}
        >
          {sidebarOpen && <span>Navigation labels</span>}
          <ChevronRight size={16} className={clsx('transition-transform', sidebarOpen ? 'rotate-180' : '')} />
        </button>
        {sidebarOpen && (
          <div>
            <p className="text-xs text-gray-600">ZeroTouch Orchestrator v{APP_VERSION}</p>
            <p className="text-xs text-gray-700 mt-1">Developed by John Goulden</p>
          </div>
        )}
      </div>
    </aside>
  )
}
